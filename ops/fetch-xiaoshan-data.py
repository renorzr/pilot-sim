#!/usr/bin/env python3
"""Build the local Xiaoshan geography pack from public source data.

Requires Python 3, Pillow and osmium (build-time only). No online APIs are
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
OSM_URL = "https://download.geofabrik.de/asia/china/zhejiang/zhejiang-261119.osm.pbf"
AIRPORT_URL = "https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/"
DEM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
OSM_BOUNDS = [30.10, 120.28, 30.35, 120.57]
DEM_BOUNDS = [29.80, 119.95, 30.65, 120.95]


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
    a = next(row for row in airports if row["ident"] == "ZSHC")
    airport = {
        "ident": "ZSHC",
        "iata": "HGH",
        "name": a["name"],
        "latitude": float(a["latitude_deg"]),
        "longitude": float(a["longitude_deg"]),
        "elevationM": round(float(a["elevation_ft"]) * 0.3048, 3),
    }
    strips = []
    for row in runways:
        if row["airport_ident"] != "ZSHC" or row["closed"] == "1":
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
    ax, ay = points[0][0] * 0.864, points[0][1]
    bx, by = points[-1][0] * 0.864, points[-1][1]
    dx, dy = bx - ax, by - ay
    denom = dx * dx + dy * dy
    best, index = 0, 0
    for i, point in enumerate(points[1:-1], 1):
        px, py = point[0] * 0.864, point[1]
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
    }
    airport_bounds = [30.195, 120.365, 30.275, 120.485]
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
            water = tags.get("natural") == "water" or tags.get("waterway") in {
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
            points = simplify(points, 0.00002 if airport or building else 0.00009)
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
    """Curate stand 251 to A1 from the source network; no invented taxi shortcuts."""
    features = pack["osm"]["features"]
    runway = next(r for r in pack["runways"] if r["id"] == "07/25")
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

    ways = [f for f in features if f["tags"].get("aeroway") == "taxiway"]
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
    node = next(
        f
        for f in features
        if f["tags"].get("aeroway") == "parking_position"
        and f["tags"].get("ref") == "251"
    )
    nose = project(node["geometry"][0])
    standways = [
        f
        for f in features
        if f["tags"].get("aeroway") == "parking_position" and len(f["geometry"]) >= 2
    ]
    standway = min(
        standways,
        key=lambda f: min(
            dst(nose, project(f["geometry"][0])), dst(nose, project(f["geometry"][-1]))
        ),
    )
    standpoints = list(map(project, standway["geometry"]))
    if dst(nose, standpoints[0]) < dst(nose, standpoints[-1]):
        standpoints.reverse()
    start = standpoints[0]
    # Holding reference is a stationary game CG point on actual A1, behind the
    # source holding-position node and safely outside the active runway.
    a1 = [S for S in segments if S["f"]["tags"].get("ref") == "A1"]
    near = min(a1, key=lambda S: project_seg((-110, -10), S["a"], S["b"])[0])
    _, u, hold = project_seg((-110, -10), near["a"], near["b"])
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
                if not entry and positions[j][0] > -80:
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
    connector = {
        "way/858383477": "Z11 / B",
        "way/858378129": "B / B3",
        "way/858378128": "B3 / A",
        "way/1452924167": "A / A1",
    }

    def point(p, source, name, kind="source-vertex"):
        return {
            "x": round(p[0], 3),
            "z": round(p[1], 3),
            "sourceId": source,
            "name": name,
            "kind": kind,
        }

    route = [point(pos[indices[0]], w["standWay"]["id"], "251")] + [
        point(
            pos[i],
            f["id"],
            f["tags"].get("ref") or connector.get(f["id"], "TAXI"),
            "source-network-point",
        )
        for i, f in zip(indices[1:], fs)
    ]
    route[-1]["kind"] = "game-holding-point"
    route[-1]["name"] = "07 HOLD"
    hold = w["hold"]
    a1 = next(f for f in features if f["id"] == w["holdSourceId"])
    a1pts = list(map(project, a1["geometry"]))
    j = min(
        range(len(a1pts) - 1),
        key=lambda j: project_seg(hold, a1pts[j], a1pts[j + 1])[0],
    )
    entry = (
        [point(hold, a1["id"], "07 HOLD", "game-holding-point")]
        + [point(v, a1["id"], "A1") for v in a1pts[j + 1 :]]
        + [point((0, -175), "OurAirports:07/25", "07", "runway-centerline")]
    )
    holdYaw = math.atan2(entry[1]["x"] - hold[0], -(entry[1]["z"] - hold[1]))
    start = pos[indices[0]]
    nextp = pos[indices[1]]
    startYaw = math.atan2(nextp[0] - start[0], -(nextp[1] - start[1]))
    distance = lambda ps: sum(
        math.hypot(b["x"] - a["x"], b["z"] - a["z"]) for a, b in zip(ps, ps[1:])
    )
    notes = [
        "This curated game taxi route selects actual stand 251 and source Z11 / B / B3 / A / A1 geometry from the bundled OSM snapshot; it is not a current published taxi clearance.",
        "OSM parking point node/9425630483 provides the actual 251 ref. Its position exactly matches the end of parking lead-in way/1021965129.",
        "All turns follow source taxiway curves. Intersections are split on the source segments, with only sub-metre endpoint joins for source rounding / simplification.",
        "The game holding CG point lies on A1 about 20 m behind source holding-position node/8621929706. A CG 15 m behind the nose preserves a visual stop before the marker; no operational holding-position accuracy is claimed.",
        "The optional long-taxi skip must stop outside runway 07. Manual runway entry, alignment and separate takeoff clearance remain mandatory.",
    ]
    result = {
        "schemaVersion": 1,
        "airportId": "xiaoshan",
        "runwayId": "07",
        "coordinateFrame": "Metres in the active 07 local tangent plane: x runway-right, z approach side, y above threshold; yaw 0 follows 07 forward (-z).",
        "stand": {
            "ref": "251",
            "sourceId": w["standWay"]["id"],
            "sourceNodeId": w["standNode"]["id"],
            "longitude": w["standNode"]["geometry"][0][0],
            "latitude": w["standNode"]["geometry"][0][1],
            "x": round(cg[0], 3),
            "z": round(cg[1], 3),
            "yaw": yaw,
            "headingDegLocal": round(yaw / rad, 3),
            "headingDegTrue": round((heading / rad + yaw / rad) % 360, 3),
            "nose": {"x": round(nose[0], 3), "z": round(nose[1], 3)},
            "cgSetbackM": 15,
            "note": "Source parking-position node anchors actual stand 251. The game CG is set back 15 m along the source lead-in final segment; this is a visual airframe offset, not a surveyed stand-stop reference.",
        },
        "handoff": {
            "x": round(start[0], 3),
            "z": round(start[1], 3),
            "yaw": startYaw,
            "sourceId": w["standWay"]["id"],
            "note": "Apron-side beginning of the actual stand 251 lead-in, on source taxiway Z11. The automatic departure preparation abstracts pushback/reposition; control starts stationary facing the cleared taxi route.",
        },
        "taxiPoints": route,
        "hold": {
            "x": round(hold[0], 3),
            "z": round(hold[1], 3),
            "yaw": holdYaw,
            "sourceId": a1["id"],
            "sourceHoldingNodeId": "node/8621929706",
            "isPublishedHoldingPosition": False,
            "note": "Game CG stop on A1 outside runway 07, about 20 m before the source holding-position node, retaining nose clearance. It does not claim a current published stop position or live clearance.",
        },
        "entryPoints": entry,
        "lineup": {
            "x": 0,
            "z": -175,
            "yaw": 0,
            "sourceId": "OurAirports:07/25",
            "remainingRunwayM": round(math.hypot(E, N) - 175, 3),
            "note": "Gameplay lineup target on the threshold-based runway centerline. Entry to this point remains manual.",
        },
        "taxiDistanceM": round(distance(route), 3),
        "entryDistanceM": round(distance(entry), 3),
        "routeReferences": ["251", "Z11", "B", "B3", "A", "A1", "07"],
        "sourceFeatureIds": list(
            dict.fromkeys(
                [w["standNode"]["id"], w["standWay"]["id"]]
                + [p["sourceId"] for p in route[1:]]
                + [a1["id"], "node/8621929706"]
            )
        ),
        "sources": [
            {
                "name": "OpenStreetMap contributors",
                "license": "ODbL-1.0",
                "licenseUrl": "https://opendatacommons.org/licenses/odbl/1-0/",
                "dataFile": "xiaoshan.json",
                "dataFetchedAt": pack["fetchedAt"],
            },
            {
                "name": "OurAirports",
                "license": "Unlicense / public domain",
                "dataFile": "xiaoshan.json",
            },
        ],
        "notes": notes,
    }
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--cache",
        type=pathlib.Path,
        default=pathlib.Path("/tmp/pilot-sim-xiaoshan-data"),
    )
    parser.add_argument(
        "--pbf", type=pathlib.Path, help="Use an existing Geofabrik Zhejiang PBF"
    )
    parser.add_argument(
        "--output",
        type=pathlib.Path,
        default=ROOT / "game/src/airports/data/xiaoshan.json",
    )
    parser.add_argument(
        "--departure-only",
        action="store_true",
        help="Rebuild the curated taxi derivative from an existing pack",
    )
    args = parser.parse_args()
    if args.departure_only:
        pack = json.loads(args.output.read_text())
        target = args.output.with_name(args.output.stem + "-departure.json")
        target.write_text(
            json.dumps(departure_data(pack), ensure_ascii=False, indent=2) + "\n"
        )
        print(target)
        return
    cache = args.cache
    pbf = args.pbf or cache / "zhejiang-latest.osm.pbf"
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        airport_future = pool.submit(airport_data, cache)
        terrain_future = pool.submit(terrain_data, cache)
        if not pbf.exists():
            print("Downloading OSM regional extract", flush=True)
            download(OSM_URL, pbf)
        print("Extracting OSM geometry", flush=True)
        osm = osm_data(pbf)
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
            },
            {
                "name": "OpenStreetMap contributors / Geofabrik",
                "url": OSM_URL,
                "license": "ODbL-1.0",
                "sha256": hashlib.sha256(pbf.read_bytes()).hexdigest(),
            },
            {
                "name": "Mapzen Terrain Tiles / USGS",
                "url": "https://registry.opendata.aws/terrain-tiles/",
                "licenseUrl": "https://github.com/tilezen/joerd/blob/master/docs/attribution.md",
            },
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(pack, ensure_ascii=False, separators=(",", ":")) + "\n"
    )
    target = args.output.with_name(args.output.stem + "-departure.json")
    target.write_text(
        json.dumps(departure_data(pack), ensure_ascii=False, indent=2) + "\n"
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
