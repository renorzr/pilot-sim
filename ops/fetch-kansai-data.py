#!/usr/bin/env python3
"""Build the local Kansai geography pack from public source data.

Requires Python 3, Pillow, osmium and Shapely (build-time only). No online APIs are
called by the game. Download caches live outside the checkout by default.
"""

import argparse
import concurrent.futures
import csv
import datetime
import hashlib
import heapq
import collections
import io
import json
import math
import pathlib
import urllib.request

from PIL import Image
import osmium

ROOT = pathlib.Path(__file__).resolve().parents[1]
OSM_URL = "https://download.geofabrik.de/asia/japan/kansai/kansai-261120.osm.pbf"
AIRPORT_URL = "https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/"
DEM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
OSM_BOUNDS = [34.08, 134.80, 34.78, 135.65]
DEM_BOUNDS = [34.08, 134.80, 34.78, 135.65]


def download(url, path):
    if path.exists():
        return path.read_bytes()
    path.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(
        url, headers={"User-Agent": "pilot-sim-geography-builder/1.0"}
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        data = response.read()
    temporary = path.with_name(path.name + ".part")
    temporary.write_bytes(data)
    temporary.replace(path)
    return data


def airport_data(cache):
    def csv_rows(name):
        data = download(AIRPORT_URL + name, cache / name)
        return list(csv.DictReader(io.StringIO(data.decode("utf-8-sig"))))

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        airports, runways = pool.map(csv_rows, ["airports.csv", "runways.csv"])
    a = next(row for row in airports if row["ident"] == "RJBB")
    airport = {
        "ident": "RJBB",
        "iata": "KIX",
        "name": a["name"],
        "latitude": float(a["latitude_deg"]),
        "longitude": float(a["longitude_deg"]),
        "elevationM": round(float(a["elevation_ft"]) * 0.3048, 3),
    }
    strips = []
    for row in runways:
        if row["airport_ident"] != "RJBB" or row["closed"] == "1":
            continue
        ends = []
        for prefix in ["le", "he"]:
            ends.append(
                {
                    "id": row[prefix + "_ident"],
                    "latitude": float(row[prefix + "_latitude_deg"]),
                    "longitude": float(row[prefix + "_longitude_deg"]),
                    "elevationM": round(
                        float(row[prefix + "_elevation_ft"]) * 0.3048, 3
                    ),
                    "trueHeadingDeg": float(row[prefix + "_heading_degT"]),
                    "displacedThresholdM": round(
                        float(row[prefix + "_displaced_threshold_ft"] or 0) * 0.3048, 3
                    ),
                }
            )
        strips.append(
            {
                "id": "/".join(end["id"] for end in ends),
                "lengthM": round(float(row["length_ft"]) * 0.3048, 3),
                "widthM": round(float(row["width_ft"]) * 0.3048, 3),
                "surface": row["surface"],
                "lighted": row["lighted"] == "1",
                "ends": ends,
            }
        )
    return airport, strips


def contains(point, bounds):
    lon, lat = point
    south, west, north, east = bounds
    return south <= lat <= north and west <= lon <= east


def simplify(points, epsilon=0.000035):
    """RDP in local equirectangular coordinates, approximately 3-4 metres."""
    if len(points) < 4:
        return points
    # Ring endpoints must not collapse onto each other.
    if points[0] == points[-1]:
        split = len(points) // 2
        return simplify(points[: split + 1], epsilon)[:-1] + simplify(
            points[split:] + [points[0]], epsilon
        )
    ax, ay = points[0][0] * 0.825, points[0][1]
    bx, by = points[-1][0] * 0.825, points[-1][1]
    dx, dy = bx - ax, by - ay
    denom = dx * dx + dy * dy
    best, index = 0, 0
    for i, point in enumerate(points[1:-1], 1):
        px, py = point[0] * 0.825, point[1]
        t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / denom)) if denom else 0
        distance = math.hypot(px - ax - t * dx, py - ay - t * dy)
        if distance > best:
            best, index = distance, i
    if best <= epsilon:
        return [points[0], points[-1]]
    return simplify(points[: index + 1], epsilon)[:-1] + simplify(
        points[index:], epsilon
    )


def osm_data(path):
    allowed = {
        "aeroway",
        "building",
        "building:levels",
        "height",
        "min_height",
        "name",
        "name:en",
        "ref",
        "highway",
        "waterway",
        "water",
        "natural",
        "landuse",
        "surface",
        "width",
        "man_made",
        "service",
        "shop",
        "tourism",
        "bridge",
        "layer",
    }
    airport_bounds = [34.395, 135.175, 34.475, 135.285]
    features = []

    class Handler(osmium.SimpleHandler):
        def area(self, area):
            if area.from_way():
                return
            tags = dict(area.tags)
            airport = "aeroway" in tags
            water = tags.get("natural") == "water"
            land = tags.get("landuse") in {
                "residential",
                "industrial",
                "commercial",
                "forest",
                "farmland",
                "orchard",
            } or tags.get("natural") in {"wood", "scrub"}
            # Airport/water/land multipolygons are assembled here. Ordinary
            # building detail uses source ways to avoid duplicate hotel/fire
            # structures over the terminal roofs in this curated snapshot.
            if not (airport or water or land):
                return
            for index, ring in enumerate(area.outer_rings()):
                points = [[round(n.lon, 7), round(n.lat, 7)] for n in ring]
                if len(points) < 4 or not any(contains(p, OSM_BOUNDS) for p in points):
                    continue
                holes = [
                    [[round(n.lon, 7), round(n.lat, 7)] for n in inner]
                    for inner in area.inner_rings(ring)
                ]
                feature = {
                    "id": "relation/"
                    + str(area.orig_id())
                    + ("/" + str(index) if index else ""),
                    "tags": {k: v for k, v in tags.items() if k in allowed},
                    "geometry": simplify(points, 0.00002 if airport else 0.00009),
                }
                if holes:
                    feature["holes"] = [
                        simplify(hole, 0.00002 if airport else 0.00009)
                        for hole in holes
                    ]
                features.append(feature)

        def node(self, node):
            tags = dict(node.tags)
            if (
                tags.get("aeroway")
                not in {
                    "control_tower",
                    "navigationaid",
                    "gate",
                    "parking_position",
                    "holding_position",
                }
                and tags.get("man_made") != "tower"
            ):
                return
            point = [round(node.location.lon, 7), round(node.location.lat, 7)]
            if contains(point, airport_bounds):
                features.append(
                    {
                        "id": "node/" + str(node.id),
                        "tags": {k: v for k, v in tags.items() if k in allowed},
                        "geometry": [point],
                    }
                )

        def way(self, way):
            tags = dict(way.tags)
            airport = "aeroway" in tags
            road = tags.get("highway") in {
                "motorway",
                "motorway_link",
                "trunk",
                "trunk_link",
                "primary",
                "primary_link",
                "secondary",
                "secondary_link",
                "tertiary",
            }
            water = tags.get("natural") in {"water", "coastline"} or tags.get("waterway") in {
                "river",
                "canal",
            }
            land = tags.get("landuse") in {
                "residential",
                "industrial",
                "commercial",
                "forest",
                "farmland",
                "orchard",
            } or tags.get("natural") in {"wood", "scrub"}
            building = "building" in tags
            if not (airport or road or water or land or building):
                return
            try:
                south, west, north, east = OSM_BOUNDS
                if not any(south <= n.lat <= north and west <= n.lon <= east for n in way.nodes):
                    return
                points = [[round(n.lon, 7), round(n.lat, 7)] for n in way.nodes]
            except osmium.InvalidLocationError:
                return
            if len(points) < 2 or not any(contains(p, OSM_BOUNDS) for p in points):
                return
            # Only airport buildings are included; broader residential areas
            # remain land-use polygons to keep the pack compact.
            if building and not (
                airport or any(contains(p, airport_bounds) for p in points)
            ):
                return
            points = simplify(points, 0.000003 if airport or building else 0.00003)
            if land and len(points) < 4:
                return
            features.append(
                {
                    "id": "way/" + str(way.id),
                    "tags": {k: v for k, v in tags.items() if k in allowed},
                    "geometry": points,
                }
            )

    # Keep the millions of untagged point callbacks in C++; only selected
    # features cross into Python. Area assembly still sees every required way.
    processor = (
        osmium.FileProcessor(str(path))
        .with_locations("flex_mem")
        .with_areas()
        .with_filter(
            osmium.filter.KeyFilter(
                "aeroway",
                "building",
                "highway",
                "landuse",
                "natural",
                "waterway",
                "man_made",
            )
        )
        .with_filter(Handler())
    )
    for _ in processor:
        pass
    return {
        "bounds": OSM_BOUNDS,
        "airportBounds": airport_bounds,
        "coordinates": "WGS84 longitude, latitude",
        "source": OSM_URL,
        "license": "ODbL-1.0",
        "licenseUrl": "https://opendatacommons.org/licenses/odbl/1-0/",
        "attribution": "© OpenStreetMap contributors",
        "features": features,
    }


def compact_scenery(osm):
    from shapely.geometry import Polygon, Point
    kept=[]
    local_bounds=[34.35,135.10,34.55,135.45]
    for f in osm['features']:
        t,p=f['tags'],f['geometry'];near=any(contains(q,local_bounds) for q in p)
        area=abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(p,p[1:]))/2) if p[0]==p[-1] else 0
        airport='aeroway' in t and any(contains(q,osm['airportBounds']) for q in p)
        building='building' in t and any(contains(q,osm['airportBounds']) for q in p)
        coast=t.get('natural')=='coastline'
        water=t.get('natural')=='water' and area>.000003 or t.get('waterway')=='river'
        road=near and t.get('highway') in {'motorway','motorway_link','trunk','trunk_link','primary','primary_link'}
        land=near and area>.00001 and ('landuse' in t or t.get('natural') in {'wood','scrub'})
        if airport or building or coast or water or road or land:kept.append(f)
    osm['features']=kept
    osm['scenerySelection']={'nearbyDetailBounds':local_bounds,'note':'Airport aeroways/buildings, bounded coastal geometry, nearby primary roads and large land use.'}


def sea_polygons(osm):
    """Classify real coastline faces by oriented, length-weighted side votes.

    Coastline chains are polygonized with a bounded display rectangle. Source
    right/sea and left/land samples are compared, so an isolated corner or
    simplification sliver cannot turn an entire mainland face into sea.
    """
    from shapely.geometry import LineString,Point,box
    from shapely.ops import polygonize,unary_union
    from shapely.strtree import STRtree
    south,west,north,east=osm['bounds'];clip=box(west,south,east,north)
    coasts=[f for f in osm['features']if f['tags'].get('natural')=='coastline']
    lines=[];samples=[];weights=[]
    for f in coasts:
        ps=f['geometry'];line=LineString(ps).intersection(clip)
        if not line.is_empty:lines.append(line)
        for a,b in zip(ps,ps[1:]):
            dx,dy=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dy)
            if length<.000001:continue
            weight=math.hypot(dx*math.cos(math.radians((a[1]+b[1])/2)),dy)
            for side in [1,-1]:
                samples.append(Point((a[0]+b[0])/2+side*dy/length*.00001,(a[1]+b[1])/2-side*dx/length*.00001));weights.append(side*weight)
    faces=list(polygonize(unary_union([clip.boundary]+lines)));tree=STRtree(samples)
    selected=[];votes=[]
    for poly in faces:
        indices=tree.query(poly,predicate='contains');right=sum(weights[i]for i in indices if weights[i]>0);left=-sum(weights[i]for i in indices if weights[i]<0)
        votes.append({'area':poly.area,'seaWeight':right,'landWeight':left})
        if right>left:selected.append(poly)
    merged=unary_union(selected)
    if merged.is_empty:raise ValueError('No sea faces from source coastlines')
    polygons=[merged]if merged.geom_type=='Polygon'else list(merged.geoms)
    for i,poly in enumerate(polygons):
        osm['features'].append({'id':f'derived/sea/{i}','tags':{'natural':'water','water':'sea','name':'Osaka Bay'},'geometry':[[round(x,7),round(y,7)]for x,y in poly.exterior.coords],'holes':[[[round(x,7),round(y,7)]for x,y in r.coords]for r in poly.interiors],'sourceFeatureIds':[f['id']for f in coasts if LineString(f['geometry']).intersects(poly.boundary)],'derivation':'Real oriented OSM coastlines polygonized with island holes and bounded display clipping; length-weighted right/sea vs left/land samples classify each face. No guessed shoreline.'})
    osm['seaDerivation']={'method':'OSM coastline face polygonization, island holes, length-weighted oriented side classification and bounded display clipping','sourceCoastlineCount':len(coasts),'polygonCount':len(polygons),'faceCount':len(faces),'license':'ODbL-1.0'}


def clip_scenery(osm):
    """Clip selected source geometry to the actual DEM/display rectangle."""
    from shapely.geometry import LineString, Polygon, Point, box
    south, west, north, east = osm["bounds"]
    extent = box(west, south, east, north)
    result = []
    for f in osm["features"]:
        ps = f["geometry"]
        if all(contains(p, osm["bounds"]) for p in ps):
            result.append(f)
            continue
        polygon = len(ps) >= 4 and ps[0] == ps[-1]
        geom = Polygon(ps, f.get("holes", [])) if polygon else LineString(ps) if len(ps) > 1 else Point(ps[0])
        if not geom.is_valid:
            geom = geom.buffer(0) if polygon else geom
        clipped = geom.intersection(extent)
        parts = list(clipped.geoms) if hasattr(clipped, "geoms") else [clipped]
        j = 0
        for part in parts:
            if part.is_empty or part.geom_type not in {"Polygon", "LineString", "Point"}:
                continue
            out = dict(f)
            out["id"] = f["id"] + (f"/clip{j}" if j else "")
            out["sourceId"] = f["id"]
            out["geometryClipping"] = "Clipped to the DEM/scenery bounds; source object identity retained."
            if part.geom_type == "Polygon":
                out["geometry"] = [[round(x,7),round(y,7)] for x,y in part.exterior.coords]
                out["holes"] = [[[round(x,7),round(y,7)] for x,y in r.coords] for r in part.interiors]
            else:
                out["geometry"] = [[round(x,7),round(y,7)] for x,y in part.coords]
                out.pop("holes", None)
            result.append(out)
            j += 1
    osm["features"] = result
    osm["geometryClipping"] = "Every feature is clipped to the DEM/scenery selection rectangle; coast-derived sea retains island holes."


def terrain_data(cache):
    bounds, columns, rows, zoom = DEM_BOUNDS, 129, 129, 10
    south, west, north, east = bounds

    def pixels(lon, lat):
        scale = 2**zoom * 256
        r = math.radians(lat)
        return (lon + 180) / 360 * scale, (
            1 - math.asinh(math.tan(r)) / math.pi
        ) / 2 * scale

    left, top = pixels(west, north)
    right, bottom = pixels(east, south)
    keys = [
        (x, y)
        for y in range(int(top // 256), int(bottom // 256) + 1)
        for x in range(int(left // 256), int(right // 256) + 1)
    ]

    def tile(key):
        x, y = key
        data = download(
            DEM_URL.format(z=zoom, x=x, y=y),
            cache / "terrarium" / str(zoom) / str(x) / (str(y) + ".png"),
        )
        return key, Image.open(io.BytesIO(data)).convert("RGB")

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        tiles = dict(pool.map(tile, keys))

    def at(px, py):
        x, y = int(px), int(py)
        red, green, blue = tiles[(x // 256, y // 256)].getpixel((x % 256, y % 256))
        return red * 256 + green + blue / 256 - 32768

    heights = []
    for j in range(rows):
        lat = south + (north - south) * j / (rows - 1)
        for i in range(columns):
            lon = west + (east - west) * i / (columns - 1)
            px, py = pixels(lon, lat)
            u, v = px % 1, py % 1
            a, b, c, d = (
                at(px, py),
                at(math.floor(px) + 1, py),
                at(px, math.floor(py) + 1),
                at(math.floor(px) + 1, math.floor(py) + 1),
            )
            heights.append(
                round((a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v, 1)
            )
    return {
        "bounds": bounds,
        "columns": columns,
        "rows": rows,
        "heights": heights,
        "units": "m",
        "rowOrder": "south-to-north",
        "columnOrder": "west-to-east",
        "verticalDatum": "source terrain elevations; approximate MSL, not survey-grade",
        "source": "https://registry.opendata.aws/terrain-tiles/",
        "sourceZoom": zoom,
        "encoding": "Terrarium: R*256 + G + B/256 - 32768",
        "attribution": "Terrain data courtesy of the U.S. Geological Survey; Mapzen/Tilezen terrain tiles",
        "licenseUrl": "https://github.com/tilezen/joerd/blob/master/docs/attribution.md",
    }


def departure_data(pack):
    """Curate stand 33 to A13 from the source network; no invented taxi shortcuts."""
    features = pack["osm"]["features"]
    runway = next(r for r in pack["runways"] if r["id"] == "06R/24L")
    a, b = runway["ends"]
    rad = math.pi / 180
    R = 6378137
    lx = R * rad * math.cos(a["latitude"] * rad)
    lz = R * rad
    E = (b["longitude"] - a["longitude"]) * lx
    N = (b["latitude"] - a["latitude"]) * lz
    heading = math.atan2(E, N)
    c = math.cos(heading)
    s = math.sin(heading)

    def project(p):
        e = (p[0] - a["longitude"]) * lx
        n = (p[1] - a["latitude"]) * lz
        return (e * c - n * s, -e * s - n * c)

    def inv(p):
        x, z = p
        e = x * c - z * s
        n = -x * s - z * c
        return (a["longitude"] + e / lx, a["latitude"] + n / lz)

    def dst(a, b):
        return math.hypot(a[0] - b[0], a[1] - b[1])

    def lerp(a, b, t):
        return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)

    def project_seg(p, a, b):
        dx = b[0] - a[0]
        dz = b[1] - a[1]
        u = max(
            0,
            min(
                1,
                ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz)
                / max(1e-8, dx * dx + dz * dz),
            ),
        )
        q = lerp(a, b, u)
        return dst(p, q), u, q

    # The published derivative uses only the source network around stand33 / R / E9 / L / P / A13.
    # Limiting graph construction to this apron corridor avoids quadratic work
    # over unrelated cargo/remote-runway taxiways, without altering source ways.
    ways = [f for f in features if f["tags"].get("aeroway") == "taxiway"
            and any(-1100 <= q[0] <= 50 and -1800 <= q[1] <= 200
                    for q in map(project, f["geometry"]))]
    segments = []
    for f in ways:
        ps = list(map(project, f["geometry"]))
        for A, B in zip(ps, ps[1:]):
            if dst(A, B) > 0.05:
                segments.append({"a": A, "b": B, "f": f, "u": [0, 1]})
    # A curated source network: connect actual same-level taxiway intersections and
    # split source segments, preserving the originals and their feature identifiers.
    for i, A in enumerate(segments):
        ax, az = A["a"]
        dx, dz = A["b"][0] - ax, A["b"][1] - az
        for B in segments[i + 1 :]:
            if (
                max(A["a"][0], A["b"][0]) + 1 < min(B["a"][0], B["b"][0])
                or max(B["a"][0], B["b"][0]) + 1 < min(A["a"][0], A["b"][0])
                or max(A["a"][1], A["b"][1]) + 1 < min(B["a"][1], B["b"][1])
                or max(B["a"][1], B["b"][1]) + 1 < min(A["a"][1], A["b"][1])
            ):
                continue
            bx, bz = B["a"]
            ex, ez = B["b"][0] - bx, B["b"][1] - bz
            den = dx * ez - dz * ex
            if abs(den) > 1e-8:
                u = ((bx - ax) * ez - (bz - az) * ex) / den
                v = ((bx - ax) * dz - (bz - az) * dx) / den
                if 0 <= u <= 1 and 0 <= v <= 1:
                    A["u"].append(u)
                    B["u"].append(v)
            for p, uA in [(A["a"], 0), (A["b"], 1)]:
                distance, u, q = project_seg(p, B["a"], B["b"])
                if distance < 0.9:
                    B["u"].append(u)
            for p, uB in [(B["a"], 0), (B["b"], 1)]:
                distance, u, q = project_seg(p, A["a"], A["b"])
                if distance < 0.9:
                    A["u"].append(u)
    standway = next(f for f in features if f["id"] == "way/506332718")
    # The source lead-in runs from the nose position toward taxiway V.
    standpoints = list(reversed(list(map(project, standway["geometry"]))))
    nose = standpoints[-1]
    node = next(f for f in features if f["id"] == "node/4961036074")
    start = standpoints[0]
    apron = next(f for f in features if f['id']=='way/506247477')
    apronpoints=list(map(project,apron['geometry']))
    _,_,start=min((project_seg(start,A,B) for A,B in zip(apronpoints,apronpoints[1:])),key=lambda x:x[0])
    source = next(f for f in features if f["id"] == "way/506247592")
    selected = [S for S in segments if S["f"]["id"] == source["id"]]
    near = min(selected, key=lambda S: project_seg((-110, -132.0), S["a"], S["b"])[0])
    _, u, hold = project_seg((-110, -132.0), near["a"], near["b"])
    near["u"].append(u)
    for p in [start, hold]:
        S = min(segments, key=lambda S: project_seg(p, S["a"], S["b"])[0])
        d, u, q = project_seg(p, S["a"], S["b"])
        assert d < 1, (p, d)
        S["u"].append(u)
    # Snap sub-metre joins introduced only by source rounding / simplification.
    positions = []
    buckets = collections.defaultdict(list)

    def node_id(p):
        ix, iz = math.floor(p[0]), math.floor(p[1])
        for x in range(ix - 1, ix + 2):
            for z in range(iz - 1, iz + 2):
                for n in buckets[(x, z)]:
                    if dst(p, positions[n]) < 0.9:
                        return n
        n = len(positions)
        positions.append(p)
        buckets[(ix, iz)].append(n)
        return n

    adj = collections.defaultdict(list)
    for S in segments:
        us = sorted(set(round(u, 9) for u in S["u"]))
        ps = [lerp(S["a"], S["b"], u) for u in us]
        for A, B in zip(ps, ps[1:]):
            i, j = node_id(A), node_id(B)
            if i != j:
                adj[i].append((j, dst(A, B), S["f"]))
                adj[j].append((i, dst(A, B), S["f"]))
    start_id = node_id(start)
    hold_id = node_id(hold)

    def path_to(start_id, end_id, entry=False):
        heap = [(0, start_id)]
        best = {start_id: 0}
        prev = {}
        while heap:
            d, i = heapq.heappop(heap)
            if d > best[i]:
                continue
            if i == end_id:
                break
            for j, w, f in adj[i]:
                if not entry and positions[j][0] > -90:
                    continue
                nd = d + w
                if nd < best.get(j, float("inf")):
                    best[j] = nd
                    prev[j] = (i, f)
                    heapq.heappush(heap, (nd, j))
        assert end_id in best, (
            "No source route",
            positions[start_id],
            positions[end_id],
        )
        indices = [end_id]
        fs = []
        i = end_id
        while i != start_id:
            i, f = prev[i]
            indices.append(i)
            fs.append(f)
        indices.reverse()
        fs.reverse()
        return indices, fs, best[end_id]

    indices, fs, total = path_to(start_id, hold_id)
    w = {
        "standNode": node,
        "standWay": standway,
        "standPoints": standpoints,
        "positions": positions,
        "indices": indices,
        "fs": fs,
        "hold": hold,
        "holdSourceId": near["f"]["id"],
        "taxiDistance": total,
    }
    pos = w["positions"]
    indices = w["indices"]
    fs = w["fs"]
    standpoints = w["standPoints"]
    nose = standpoints[-1]
    before = standpoints[-2]
    d = dst(before, nose)
    fx = (nose[0] - before[0]) / d
    fz = (nose[1] - before[1]) / d
    yaw = math.atan2(fx, -fz)
    cg = (nose[0] - 15 * fx, nose[1] - 15 * fz)
    def point(p, source, name, kind="source-vertex"):
        return {"x":round(p[0],3),"z":round(p[1],3),"sourceId":source,"name":name,"kind":kind}
    route=[point(pos[indices[0]],'way/506247477','R')]+[point(pos[i],f['id'],f['tags'].get('ref','TAXI'),'source-network-point') for i,f in zip(indices[1:],fs)]
    route[-1]['kind']='game-holding-point';route[-1]['name']='06R HOLD'
    hold=w['hold'];entryway=next(f for f in features if f['id']=='way/506247592')
    entrysource=list(reversed(list(map(project,entryway['geometry']))))
    _,_,arc_start=min((project_seg((-50,-132.4),A,B) for A,B in zip(entrysource,entrysource[1:])),key=lambda x:x[0])
    entry=[point(hold,entryway['id'],'06R HOLD','game-holding-point')]
    for q in entrysource:
        if hold[0]<q[0]<arc_start[0]:entry.append(point(q,entryway['id'],'A13'))
    entry.append(point(arc_start,entryway['id'],'A13'))
    radius=abs(arc_start[0]);target_z=arc_start[1]-radius
    for i in range(1,9):
        t=i*math.pi/16;q=(arc_start[0]+radius*math.sin(t),arc_start[1]-radius*(1-math.cos(t)))
        entry.append(point(q,'OurAirports:06R/24L','06R','game-lineup-arc'))
    entry[-1]=point((0,target_z),'OurAirports:06R/24L','06R','game-lineup-arc')
    lineup=(0,target_z-50);entry.append(point(lineup,'OurAirports:06R/24L','06R','runway-centerline'))
    start=pos[indices[0]];nextp=pos[indices[1]]
    startyaw=math.atan2(nextp[0]-start[0],-(nextp[1]-start[1]));holdyaw=math.atan2(entry[1]['x']-hold[0],-(entry[1]['z']-hold[1]))
    length=lambda ps:sum(math.hypot(b['x']-a['x'],b['z']-a['z'])for a,b in zip(ps,ps[1:]))
    result={
      'schemaVersion':1,'airportId':'kansai','runwayId':'06R',
      'coordinateFrame':'Metres in the active 06R threshold tangent plane: x runway-right, z approach side, y above threshold; yaw0 follows06R(-z).',
      'stand':{'ref':'33','sourceId':'node/4961036074','sourceLeadInId':'way/506332718','longitude':inv(nose)[0],'latitude':inv(nose)[1],'x':round(cg[0],3),'z':round(cg[1],3),'yaw':yaw,'headingDegLocal':round(yaw/rad,3),'headingDegTrue':round((heading+yaw)/rad%360,3),'nose':{'x':round(nose[0],3),'z':round(nose[1],3)},'cgSetbackM':15,'note':'Real source parking node33 anchors the nose. CG is a15m visual setback along the mapped lead-in, not a published stand-stop reference.'},
      'handoff':{'x':round(start[0],3),'z':round(start[1],3),'yaw':startyaw,'sourceId':'way/506247477','note':'Automatic push/start/reposition ends stationary on actual taxiwayR, about35m beyond the apron-side end of source stand33 lead-in. Unmapped apron movement is explicitly abstracted; no tug is simulated.'},
      'taxiPoints':route,
      'hold':{'x':round(hold[0],3),'z':round(hold[1],3),'yaw':holdyaw,'sourceId':entryway['id'],'isPublishedHoldingPosition':False,'note':'Game CG stop on actual A13 outside the runway protected strip. Neither a current charted stop reference nor live clearance is claimed.'},
      'entryPoints':entry,
      'lineup':{'x':0,'z':round(lineup[1],3),'yaw':0,'sourceId':'OurAirports:06R/24L','remainingRunwayM':round(math.hypot(E,N)+lineup[1],3),'note':'Manual game alignment target on the threshold-derived centerline; source A13 is followed then a synthetic50m-radiusalignment arc and50m straight allow steering to settle.'},
      'taxiDistanceM':round(length(route),3),'entryDistanceM':round(length(entry),3),
      'routeReferences':list(dict.fromkeys(['33']+[p['name']for p in route if p['name']!='TAXI']+['A13','06R'])),
      'sourceFeatureIds':list(dict.fromkeys(['node/4961036074','way/506332718','way/506247477']+[p['sourceId']for p in route]+[entryway['id']])),
      'sources':[{'name':'OpenStreetMap contributors','license':'ODbL-1.0','licenseUrl':'https://opendatacommons.org/licenses/odbl/1-0/','dataFile':'kansai.json','dataFetchedAt':pack['fetchedAt']},{'name':'OurAirports','license':'Unlicense / public domain','dataFile':'kansai.json'}],
      'notes':['Stand33 at Terminal1 is a real parking_position node; the mapped lead-in is preserved as provenance.','Automatic crew preparation abstracts pushback/start and the35m unmarked-apron continuation to sourceR. Manual taxi uses only connected source taxiways.','The OurAirports active runway axis is about13m offset from the local OSM runway centerline. A13 is followed to x=-50 then an explicit synthetic alignment arc joins the game runway.','Ground routing, external holding and separate entry/takeoff clearances are game choices, not current published taxi or instrument procedures.','Optionaltaxi skip stops stationary outside the runway; lineup and takeoff remain manual and separately cleared.']}
    return result


def validate_data(pack, departure=None):
    """Fail rebuilds with invalid source/route geometry before writing outputs."""
    from shapely.geometry import Polygon
    def finite(value):
        if isinstance(value, dict):
            return all(finite(v) for v in value.values())
        if isinstance(value, list):
            return all(finite(v) for v in value)
        return not isinstance(value, (int, float)) or math.isfinite(value)
    assert finite(pack), "Non-finite geography value"
    assert pack["dem"]["columns"] == pack["dem"]["rows"] == 129
    assert len(pack["dem"]["heights"]) == 129 * 129
    fs = {f["id"]: f for f in pack["osm"]["features"]}
    assert len(fs) == len(pack["osm"]["features"]), "Duplicate source feature ID"
    for f in fs.values():
        assert f["geometry"], ("Empty source geometry", f["id"])
        assert all(contains(p, pack["osm"]["bounds"]) for p in f["geometry"]), f["id"]
        if f["tags"].get("water") == "sea":
            assert Polygon(f["geometry"], f.get("holes", [])).is_valid, f["id"]
            assert all(i in fs for i in f["sourceFeatureIds"]), f["id"]
    if departure is None:
        return
    assert finite(departure), "Non-finite departure value"
    assert all(i in fs for i in departure["sourceFeatureIds"])
    assert departure["runwayId"] == "06R"
    assert departure["stand"]["ref"] == "33"
    assert departure["hold"]["x"] < -(30.1 + 50 + 15)
    assert departure["lineup"]["x"] == 0 and -400 < departure["lineup"]["z"] < -150
    length = lambda points: sum(math.hypot(b["x"]-a["x"], b["z"]-a["z"]) for a,b in zip(points, points[1:]))
    assert abs(length(departure["taxiPoints"])-departure["taxiDistanceM"]) < .01
    assert abs(length(departure["entryPoints"])-departure["entryDistanceM"]) < .01
    assert departure["taxiDistanceM"] < 3000
    st = departure["stand"]
    assert abs(math.hypot(st["x"]-st["nose"]["x"], st["z"]-st["nose"]["z"])-15) < .001


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--cache",
        type=pathlib.Path,
        default=pathlib.Path("/tmp/pilot-sim-kansai-data"),
    )
    parser.add_argument(
        "--pbf", type=pathlib.Path, help="Use an existing Geofabrik Kansai regional PBF"
    )
    parser.add_argument(
        "--output",
        type=pathlib.Path,
        default=ROOT / "game/src/airports/data/kansai.json",
    )
    parser.add_argument(
        "--departure-only",
        action="store_true",
        help="Rebuild the curated taxi derivative from an existing pack",
    )
    parser.add_argument("--geography-only", action="store_true", help="Rebuild source geography without the departure derivative")
    args = parser.parse_args()
    if args.departure_only:
        pack = json.loads(args.output.read_text())
        target = args.output.with_name(args.output.stem + "-departure.json")
        departure = departure_data(pack)
        validate_data(pack, departure)
        target.write_text(
            json.dumps(departure, ensure_ascii=False, indent=2) + "\n"
        )
        print(target)
        return
    cache = args.cache
    pbf = args.pbf or cache / "kansai-261120.osm.pbf"
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        airport_future = pool.submit(airport_data, cache)
        terrain_future = pool.submit(terrain_data, cache)
        if not pbf.exists():
            print("Downloading OSM regional extract", flush=True)
            download(OSM_URL, pbf)
        print("Extracting OSM geometry", flush=True)
        raw_cache=cache / "kansai-raw-local.json"
        if raw_cache.exists():
            osm=json.loads(raw_cache.read_text())
        else:
            osm = osm_data(pbf)
            raw_cache.write_text(json.dumps(osm,ensure_ascii=False,separators=(",",":")))
        print(f"Extracted {len(osm['features'])} source features; selecting local scenery", flush=True)
        compact_scenery(osm)
        sea_polygons(osm)
        clip_scenery(osm)
        print(f"Selected {len(osm['features'])} scenery features including source-derived sea", flush=True)
        airport, runways = airport_future.result()
        dem = terrain_future.result()
    pack = {
        "schemaVersion": 1,
        "fetchedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "airport": airport,
        "runways": runways,
        "osm": osm,
        "dem": dem,
        "sources": [
            {
                "name": "OurAirports",
                "url": "https://github.com/davidmegginson/ourairports-data",
                "license": "Unlicense / public domain",
                "snapshots": [{"filename": n, "sha256": hashlib.sha256((cache/n).read_bytes()).hexdigest()} for n in ["airports.csv", "runways.csv"]],
            },
            {
                "name": "OpenStreetMap contributors / Geofabrik",
                "url": OSM_URL,
                "license": "ODbL-1.0",
                "sha256": hashlib.sha256(pbf.read_bytes()).hexdigest(),
            },
            {
                "name": "Mapzen Terrain Tiles / USGS",
                "snapshots": [{"filename": str(p.relative_to(cache)), "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted((cache/"terrarium").rglob("*.png"))],
                "url": "https://registry.opendata.aws/terrain-tiles/",
                "licenseUrl": "https://github.com/tilezen/joerd/blob/master/docs/attribution.md",
            },
        ],
    }
    print("Validating source geometry and curated departure", flush=True)
    departure = None if args.geography_only else departure_data(pack)
    validate_data(pack, departure)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(pack, ensure_ascii=False, separators=(",", ":")) + "\n"
    )
    target = args.output.with_name(args.output.stem + "-departure.json")
    if not args.geography_only:
        target.write_text(
            json.dumps(departure, ensure_ascii=False, indent=2) + "\n"
        )
    print(
        json.dumps(
            {
                "path": str(args.output),
                "bytes": args.output.stat().st_size,
                "features": len(osm["features"]),
                "demSamples": len(dem["heights"]),
                "terminals": [
                    f["id"]
                    for f in osm["features"]
                    if f["tags"].get("aeroway") == "terminal"
                ],
            }
        )
    )


if __name__ == "__main__":
    main()
