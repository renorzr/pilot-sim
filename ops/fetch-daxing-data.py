#!/usr/bin/env python3
"""Build the local Daxing geography pack from public source data.

Requires Python 3, Pillow and osmium (build-time only). No online APIs are
called by the game. Download caches live outside the checkout by default.
"""
import argparse
import concurrent.futures
import csv
import datetime
import hashlib
import io
import json
import math
import pathlib
import urllib.request

from PIL import Image
import osmium

ROOT = pathlib.Path(__file__).resolve().parents[1]
OSM_URL = "https://download.geofabrik.de/asia/china/hebei/hebei-latest.osm.pbf"
AIRPORT_URL = "https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/"
DEM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
OSM_BOUNDS = [39.30, 116.13, 39.72, 116.73]
DEM_BOUNDS = [39.10, 115.90, 39.95, 116.95]


def download(url, path):
    if path.exists():
        return path.read_bytes()
    path.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": "pilot-sim-geography-builder/1.0"})
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
    a = next(row for row in airports if row["ident"] == "ZBAD")
    airport = {"ident": "ZBAD", "iata": "PKX", "name": a["name"],
               "latitude": float(a["latitude_deg"]), "longitude": float(a["longitude_deg"]),
               "elevationM": round(float(a["elevation_ft"]) * .3048, 3)}
    strips = []
    for row in runways:
        if row["airport_ident"] != "ZBAD" or row["closed"] == "1":
            continue
        ends = []
        for prefix in ["le", "he"]:
            ends.append({"id": row[prefix + "_ident"],
                         "latitude": float(row[prefix + "_latitude_deg"]),
                         "longitude": float(row[prefix + "_longitude_deg"]),
                         "elevationM": round(float(row[prefix + "_elevation_ft"]) * .3048, 3),
                         "trueHeadingDeg": float(row[prefix + "_heading_degT"]),
                         "displacedThresholdM": round(float(row[prefix + "_displaced_threshold_ft"] or 0) * .3048, 3)})
        strips.append({"id": "/".join(end["id"] for end in ends),
                       "lengthM": round(float(row["length_ft"]) * .3048, 3),
                       "widthM": round(float(row["width_ft"]) * .3048, 3),
                       "surface": row["surface"], "lighted": row["lighted"] == "1", "ends": ends})
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
        return simplify(points[:split + 1], epsilon)[:-1] + simplify(points[split:] + [points[0]], epsilon)
    ax, ay = points[0][0] * .772, points[0][1]
    bx, by = points[-1][0] * .772, points[-1][1]
    dx, dy = bx - ax, by - ay
    denom = dx * dx + dy * dy
    best, index = 0, 0
    for i, point in enumerate(points[1:-1], 1):
        px, py = point[0] * .772, point[1]
        t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / denom)) if denom else 0
        distance = math.hypot(px - ax - t * dx, py - ay - t * dy)
        if distance > best:
            best, index = distance, i
    if best <= epsilon:
        return [points[0], points[-1]]
    return simplify(points[:index + 1], epsilon)[:-1] + simplify(points[index:], epsilon)


def osm_data(path):
    allowed = {"aeroway", "building", "building:levels", "height", "min_height", "name", "name:en", "ref", "highway", "waterway", "water", "natural", "landuse", "surface", "width", "man_made", "service"}
    airport_bounds = [39.46, 116.36, 39.54, 116.49]
    features = []

    class Handler(osmium.SimpleHandler):
        def area(self, area):
            if area.from_way():
                return
            tags = dict(area.tags)
            airport = "aeroway" in tags
            water = tags.get("natural") == "water"
            land = tags.get("landuse") in {"residential", "industrial", "commercial", "forest", "farmland", "orchard"} or tags.get("natural") in {"wood", "scrub"}
            if not (airport or water or land):
                return
            for index, ring in enumerate(area.outer_rings()):
                points = [[round(n.lon, 7), round(n.lat, 7)] for n in ring]
                if len(points) < 4 or not any(contains(p, OSM_BOUNDS) for p in points):
                    continue
                holes = [[[round(n.lon, 7), round(n.lat, 7)] for n in inner] for inner in area.inner_rings(ring)]
                feature = {"id": "relation/" + str(area.orig_id()) + ("/" + str(index) if index else ""),
                           "tags": {k: v for k, v in tags.items() if k in allowed},
                           "geometry": simplify(points, .00002 if airport else .00009)}
                if holes:
                    feature["holes"] = [simplify(hole, .00002 if airport else .00009) for hole in holes]
                features.append(feature)

        def node(self, node):
            tags = dict(node.tags)
            if tags.get("aeroway") not in {"control_tower", "navigationaid"} and tags.get("man_made") != "tower":
                return
            point = [round(node.location.lon, 7), round(node.location.lat, 7)]
            if contains(point, airport_bounds):
                features.append({"id": "node/" + str(node.id), "tags": {k: v for k, v in tags.items() if k in allowed}, "geometry": [point]})

        def way(self, way):
            tags = dict(way.tags)
            airport = "aeroway" in tags
            road = tags.get("highway") in {"motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link", "tertiary"}
            water = tags.get("natural") == "water" or tags.get("waterway") in {"river", "canal"}
            land = tags.get("landuse") in {"residential", "industrial", "commercial", "forest", "farmland", "orchard"} or tags.get("natural") in {"wood", "scrub"}
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
            if building and not (airport or any(contains(p, airport_bounds) for p in points)):
                return
            points = simplify(points, .00002 if airport or building else .00009)
            if land and len(points) < 4:
                return
            features.append({"id": "way/" + str(way.id), "tags": {k: v for k, v in tags.items() if k in allowed}, "geometry": points})

    # Keep the millions of untagged point callbacks in C++; only selected
    # features cross into Python. Area assembly still sees every required way.
    processor = (osmium.FileProcessor(str(path)).with_locations("flex_mem")
                 .with_areas()
                 .with_filter(osmium.filter.KeyFilter("aeroway", "building", "highway", "landuse", "natural", "waterway", "man_made"))
                 .with_filter(Handler()))
    for _ in processor:
        pass
    return {"bounds": OSM_BOUNDS, "airportBounds": airport_bounds,
            "coordinates": "WGS84 longitude, latitude", "source": OSM_URL,
            "license": "ODbL-1.0", "licenseUrl": "https://opendatacommons.org/licenses/odbl/1-0/",
            "attribution": "© OpenStreetMap contributors", "features": features}


def terrain_data(cache):
    bounds, columns, rows, zoom = DEM_BOUNDS, 129, 129, 10
    south, west, north, east = bounds

    def pixels(lon, lat):
        scale = 2 ** zoom * 256
        r = math.radians(lat)
        return (lon + 180) / 360 * scale, (1 - math.asinh(math.tan(r)) / math.pi) / 2 * scale

    left, top = pixels(west, north)
    right, bottom = pixels(east, south)
    keys = [(x, y) for y in range(int(top // 256), int(bottom // 256) + 1)
            for x in range(int(left // 256), int(right // 256) + 1)]

    def tile(key):
        x, y = key
        data = download(DEM_URL.format(z=zoom, x=x, y=y), cache / "terrarium" / str(zoom) / str(x) / (str(y) + ".png"))
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
            a, b, c, d = at(px, py), at(math.floor(px) + 1, py), at(px, math.floor(py) + 1), at(math.floor(px) + 1, math.floor(py) + 1)
            heights.append(round((a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v, 1))
    return {"bounds": bounds, "columns": columns, "rows": rows,
            "heights": heights, "units": "m", "rowOrder": "south-to-north",
            "columnOrder": "west-to-east", "verticalDatum": "source terrain elevations; approximate MSL, not survey-grade",
            "source": "https://registry.opendata.aws/terrain-tiles/", "sourceZoom": zoom,
            "encoding": "Terrarium: R*256 + G + B/256 - 32768",
            "attribution": "Terrain data courtesy of the U.S. Geological Survey; Mapzen/Tilezen terrain tiles",
            "licenseUrl": "https://github.com/tilezen/joerd/blob/master/docs/attribution.md"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=pathlib.Path, default=pathlib.Path("/tmp/pilot-sim-daxing-data"))
    parser.add_argument("--pbf", type=pathlib.Path, help="Use an existing Geofabrik Hebei PBF")
    parser.add_argument("--output", type=pathlib.Path, default=ROOT / "game/src/airports/data/daxing.json")
    args = parser.parse_args()
    cache = args.cache
    pbf = args.pbf or cache / "hebei-latest.osm.pbf"
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
    pack = {"schemaVersion": 1, "fetchedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "airport": airport, "runways": runways, "osm": osm, "dem": dem,
            "sources": [{"name": "OurAirports", "url": "https://github.com/davidmegginson/ourairports-data", "license": "Unlicense / public domain"},
                        {"name": "OpenStreetMap contributors / Geofabrik", "url": OSM_URL, "license": "ODbL-1.0", "sha256": hashlib.sha256(pbf.read_bytes()).hexdigest()},
                        {"name": "Mapzen Terrain Tiles / USGS", "url": "https://registry.opendata.aws/terrain-tiles/", "licenseUrl": "https://github.com/tilezen/joerd/blob/master/docs/attribution.md"}]}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(pack, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(json.dumps({"path": str(args.output), "bytes": args.output.stat().st_size,
                      "features": len(osm["features"]), "demSamples": len(dem["heights"]),
                      "terminals": [f["id"] for f in osm["features"] if f["tags"].get("aeroway") == "terminal"]}))


if __name__ == "__main__":
    main()
