"""Export airport public motor roads from pinned local OSM snapshots, offline only.

Keeps original OSM node identities, directions, lane/speed/bridge tags and
node-via turn restrictions. Estimated widths and bridge clearances are marked.
Dependencies: osmium, shapely. Runtime uses only the checked-in derivative.
"""
import argparse
import collections
import hashlib
import heapq
import gzip
import json
import math
from pathlib import Path

import osmium
from shapely.geometry import LineString, Polygon, Point
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
CLASSES = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'service',
           'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link', 'living_street'}
TAGS = ['highway', 'name', 'ref', 'oneway', 'lanes', 'lanes:forward', 'lanes:backward', 'maxspeed', 'width',
        'bridge', 'tunnel', 'layer', 'access', 'motor_vehicle', 'vehicle', 'junction', 'service']


CONFIG = {
 'lax': ('25R', '/tmp/pilot-sim-lax-data/LosAngeles-2026-11-14.osm.pbf', 'right', '2026-11-14'),
 'xiaoshan': ('07', '/tmp/pilot-sim-xiaoshan-data/zhejiang-latest.osm.pbf', 'right', '2026-11-19'),
 'changi': ('02L', '/tmp/pilot-sim-changi-data/malaysia-singapore-brunei-261120.osm.pbf', 'left', '2026-11-20'),
 'jfk': ('22R', '/tmp/pilot-sim-jfk-data/new-york-261120.osm.pbf', 'right', '2026-11-20'),
 'kansai': ('06R', '/tmp/pilot-sim-kansai-data/kansai-261120.osm.pbf', 'left', '2026-11-20'),
 'daxing': ('17L', '/tmp/daxing-hebei.osm.pbf', 'right', '2026-11-20'),
}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--airport', choices=CONFIG, default='lax')
    parser.add_argument('--pbf', type=Path)
    parser.add_argument('--supplemental-pbf', type=Path, help='Optional pinned New Jersey PBF for the JFK regional network')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--radius', type=float, default=6000)
    parser.add_argument('--regional', action='store_true', help='Export spatially tiled roads across the full city terrain')
    parser.add_argument('--extent', type=float, default=30000, help='Regional half extent in the shared source frame')
    parser.add_argument('--reuse-regional-manifest', type=Path, help='Reuse identical immutable source tiles instead of copying them')
    args = parser.parse_args()
    runway_id, default_pbf, driving_side, snapshot = CONFIG[args.airport]
    args.pbf = args.pbf or Path(default_pbf)
    args.output = args.output or ROOT / f'public/assets/cities/{args.airport}/traffic-v1.json'
    radius = 50000 if args.regional else args.radius
    airport = json.loads((ROOT / f'game/src/airports/data/{args.airport}.json').read_text())
    provenance = next(s for s in airport['sources'] if s.get('sha256') and 'OpenStreetMap' in s['name'])
    source_sha = hashlib.file_digest(args.pbf.open('rb'), 'sha256').hexdigest()
    if source_sha != provenance['sha256']:
        raise ValueError('Pinned OSM source checksum mismatch')
    runway = next(r for r in airport['runways'] if any(e['id'] == runway_id for e in r['ends']))
    threshold = next(e for e in runway['ends'] if e['id'] == runway_id)
    opposite = next(e for e in runway['ends'] if e['id'] != runway_id)
    rad = math.pi / 180
    lon_scale, lat_scale = 6378137 * rad * math.cos(threshold['latitude'] * rad), 6378137 * rad
    angle = math.atan2((opposite['longitude'] - threshold['longitude']) * lon_scale,
                       (opposite['latitude'] - threshold['latitude']) * lat_scale)
    co, si = math.cos(angle), math.sin(angle)

    def project(lon, lat):
        e, n = (lon - threshold['longitude']) * lon_scale, (lat - threshold['latitude']) * lat_scale
        return (e * co - n * si, -(e * si + n * co))

    center = project(airport['airport']['longitude'], airport['airport']['latitude'])
    coverage = Point(*center).buffer(radius, quad_segs=64)
    reserved = []
    for r in airport['runways']:
        a, b = [project(e['longitude'], e['latitude']) for e in r['ends']]
        reserved.append(LineString([a, b]).buffer(r['widthM'] / 2 + 25, cap_style=3))
    for f in airport['osm']['features']:
        t = f.get('tags', {})
        if t.get('aeroway') not in ['taxiway', 'taxilane', 'apron']:
            continue
        points = [project(*p) for p in f['geometry']]
        if t['aeroway'] == 'apron' and len(points) > 3:
            p = Polygon(points).buffer(0)
            if not p.is_empty:
                reserved.append(p.buffer(3))
        elif len(points) > 1:
            reserved.append(LineString(points).buffer(24 if t['aeroway'] == 'taxiway' else 14))
    protected = unary_union(reserved)
    ways, controls, restrictions = [], {}, []

    class Extract(osmium.SimpleHandler):
        def node(self, n):
            h = n.tags.get('highway')
            if h in ['traffic_signals', 'stop', 'give_way', 'turning_circle', 'turning_loop']:
                p = project(n.location.lon, n.location.lat)
                if math.dist(p, center) < radius + 500:
                    controls[n.id] = h

        def way(self, w):
            t = dict(w.tags)
            if t.get('highway') not in CLASSES or t.get('area') == 'yes':
                return
            if any(t.get(k) in ['no', 'private', 'agricultural', 'forestry'] for k in ['access', 'motor_vehicle', 'vehicle']):
                return
            if t.get('service') in ['parking_aisle', 'driveway', 'emergency_access']:
                return
            if t.get('oneway') in ['reversible', 'alternating']:
                return
            try:
                nodes = [(n.ref, n.lon, n.lat) for n in w.nodes]
            except osmium.InvalidLocationError:
                return
            inside = [i for i, (_, lon, lat) in enumerate(nodes) if math.dist(project(lon, lat), center) < radius]
            if not inside or len(nodes) < 2:
                return
            nodes = nodes[max(0, inside[0] - 1):min(len(nodes), inside[-1] + 2)]
            ways.append((w.id, {k: t[k] for k in TAGS if k in t}, nodes))

        def relation(self, r):
            if r.tags.get('type') != 'restriction':
                return
            members = {m.role: (m.type, m.ref) for m in r.members if m.role in ['from', 'to', 'via']}
            if all(k in members for k in ['from', 'to', 'via']) and members['via'][0] == 'n':
                restrictions.append((members['from'][1], members['to'][1], members['via'][1], r.tags.get('restriction', '')))

    # The location handler precedes these C++ tag filters, so untagged nodes
    # still supply way coordinates without a Python callback for every node.
    Extract().apply_file(str(args.pbf), locations=True, filters=[osmium.filter.KeyFilter('highway', 'type')])
    if args.regional and args.airport == 'jfk':
        building = json.loads((ROOT / 'public/assets/cities/jfk/buildings-v1.json').read_text())
        sources = building['provenance']['osm']['sources']
        for source in sources:
            if source['sha256'] == source_sha:
                continue
            path = args.supplemental_pbf or Path(source['file'])
            if hashlib.file_digest(path.open('rb'), 'sha256').hexdigest() != source['sha256']:
                raise ValueError('Pinned supplementary OSM checksum mismatch')
            Extract().apply_file(str(path), locations=True, filters=[osmium.filter.KeyFilter('highway', 'type')])
        provenance = {**provenance, 'regionalSources': [{k:s[k] for k in ['region','source','snapshot','sha256','license']} for s in sources]}
        unique = {}
        for way in ways:
            if way[0] not in unique or len(way[2]) > len(unique[way[0]][2]):
                unique[way[0]] = way
        ways = list(unique.values())
    ways.sort(key=lambda w: w[0])
    if args.regional:
        from regional_traffic_export import export_regional
        export_regional(args, airport, ways, project, center, driving_side, provenance, snapshot, source_sha,
                        [threshold['longitude'], threshold['latitude']], angle / rad)
        return
    uses = collections.Counter(n[0] for _, _, ns in ways for n in ns)
    nodes, node_index, edges = [], {}, []

    def number(value, fallback):
        try:
            return float(value.split(';')[0])
        except (ValueError, AttributeError):
            return fallback

    def node_index_for(n):
        if n[0] not in node_index:
            node_index[n[0]] = len(nodes)
            nodes.append([n[0], round(n[1], 7), round(n[2], 7), 0, controls.get(n[0], '')])
        return node_index[n[0]]

    for oid, tags, ns in ways:
        kind = tags['highway']
        default_oneway = kind in ['motorway', 'motorway_link'] or tags.get('junction') in ['roundabout', 'circular']
        direction = -1 if tags.get('oneway') == '-1' else 1 if tags.get('oneway', 'yes' if default_oneway else 'no') in ['yes', 'true', '1'] else 0
        default_lanes = 3 if kind in ['motorway', 'trunk'] else 1 if direction else 2
        lanes = max(1, min(8, int(number(tags.get('lanes'), default_lanes))))
        forward = max(1, min(5, int(number(tags.get('lanes:forward'), lanes if direction else math.ceil(lanes / 2)))))
        backward = 0 if direction else max(1, min(5, int(number(tags.get('lanes:backward'), max(1, lanes // 2)))))
        width = max(3.2, min(32, number(tags.get('width'), (forward + backward) * 3.25 + (1.5 if kind in ['motorway', 'trunk'] else .5))))
        max_speed = tags.get('maxspeed', '')
        speed = number(max_speed.replace('mph', '').replace('km/h', '').strip(), 0) * (.44704 if 'mph' in max_speed else 1 / 3.6)
        bridge = tags.get('bridge', 'no') not in ['no', 'false', '0']
        tunnel = tags.get('tunnel', 'no') not in ['no', 'false', '0']
        layer = int(number(tags.get('layer'), 1 if bridge else -1 if tunnel else 0))
        cuts = [0] + [i for i in range(1, len(ns) - 1) if uses[ns[i][0]] > 1 or ns[i][0] in controls] + [len(ns) - 1]
        for start, end in zip(cuts, cuts[1:]):
            segment = ns[start:end + 1]
            points = [project(lon, lat) for _, lon, lat in segment]
            line = LineString(points)
            if line.length < 3 or not line.intersects(coverage):
                continue
            if not tunnel and line.distance(protected) < width / 2 + 2:
                continue
            if line.distance(Point(*center)) > radius + 200:
                continue
            ids = [node_index_for(n) for n in segment]
            edges.append({'id': f'way/{oid}/{start}', 'way': oid, 'nodes': ids, 'kind': kind, 'oneway': direction,
                          'forward': forward, 'backward': backward, 'width': round(width, 2), 'speed': round(speed, 3),
                          'bridge': bridge, 'tunnel': tunnel, 'layer': layer, 'tags': tags})

    # Layer is an ordering, not a measured height. Estimate deck clearance and
    # propagate approach ramps over connected nodes, never over 2-D crossings.
    neighbors = collections.defaultdict(list)
    lifted = []
    for e in edges:
        for a, b in zip(e['nodes'], e['nodes'][1:]):
            length = math.dist(project(nodes[a][1], nodes[a][2]), project(nodes[b][1], nodes[b][2]))
            neighbors[a].append((b, length))
            neighbors[b].append((a, length))
        if e['bridge'] and not e['tunnel']:
            for n in e['nodes']:
                h = min(18, (8 if args.airport == 'kansai' else 6) * max(1, e['layer']))
                if h > nodes[n][3]:
                    nodes[n][3] = h
                    heapq.heappush(lifted, (-h, n))
    while lifted:
        negative, n = heapq.heappop(lifted)
        if -negative < nodes[n][3] - .001:
            continue
        for other, distance in neighbors[n]:
            h = -negative - distance * .065
            if h > nodes[other][3] + .001:
                nodes[other][3] = h
                heapq.heappush(lifted, (-h, other))
    for n in nodes:
        n[3] = round(n[3], 3)

    # One unioned ground surface eliminates overlapping road strips at junctions.
    footprints = []
    for e in edges:
        if e['tunnel'] or any(nodes[i][3] > .05 for i in e['nodes']):
            continue
        line = LineString([project(nodes[i][1], nodes[i][2]) for i in e['nodes']])
        footprints.append(line.buffer(e['width'] / 2, cap_style=1, join_style=2, quad_segs=2))
    ground = unary_union(footprints).intersection(coverage).difference(protected.buffer(1)).simplify(.12, preserve_topology=True)
    polygons = list(ground.geoms) if ground.geom_type == 'MultiPolygon' else [ground]
    ground_rings = [[[ [round(x, 2), round(z, 2)] for x, z in p.exterior.coords],
                     *[[[round(x, 2), round(z, 2)] for x, z in h.coords] for h in p.interiors]]
                    for p in polygons if p.geom_type == 'Polygon' and p.area > 2]
    source_ways = {e['way'] for e in edges}
    restrictions = [r for r in restrictions if r[0] in source_ways and r[1] in source_ways and r[2] in node_index]
    counts = dict(collections.Counter(e['kind'] for e in edges))
    value = {'schema': 1, 'airportId': args.airport, 'drivingSide': driving_side, 'center': list(center), 'radius': radius,
             'frame': {'threshold': [threshold['longitude'], threshold['latitude']], 'heading': angle / rad},
             'nodes': nodes, 'edges': edges, 'restrictions': restrictions, 'ground': ground_rings,
             'provenance': {'source': provenance['url'],
                            'snapshot': snapshot + ' cached extract', 'sha256': source_sha,
                            'license': 'ODbL-1.0', 'attribution': '© OpenStreetMap contributors',
                            'estimates': 'Missing direction/lane/speed/width values use road-class defaults. Bridge clearance is 6m per positive layer (max18m), with connected 6.5% approach ramps; not measured elevations. Traffic volumes are game estimates.',
                            'protection': 'Surface public motor roads only; runway, taxiway and apron reservations excluded. Source tunnels retain connectivity but have no above-ground vehicles or pavement.'},
             'counts': counts}
    if args.airport == 'kansai':
        value['bridgeDeckReference'] = 'airport'
        value['provenance']['estimates'] = value['provenance']['estimates'].replace('6m per positive layer', '8m per positive layer above airport datum for the coastal connector')
    payload = json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()
    value['fingerprint'] = hashlib.sha256(payload).hexdigest()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    raw = (json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
    packed = gzip.compress(raw, compresslevel=9, mtime=0)
    source_path = args.output.with_suffix('.source.json.gz')
    source_path.write_bytes(packed)
    manifest = {'schema': 1, 'airportId': args.airport, 'drivingSide': driving_side, 'path': f'assets/cities/{args.airport}/' + source_path.name, 'bytes': len(packed), 'decodedBytes': len(raw), 'decodedSha256': hashlib.sha256(raw).hexdigest(), 'sha256': hashlib.sha256(packed).hexdigest(), 'fingerprint': value['fingerprint'], 'counts': counts, 'provenance': value['provenance']}
    args.output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'airport': args.airport, 'nodes': len(nodes), 'edges': len(edges), 'restrictions': len(restrictions), 'groundPolygons': len(ground_rings),
                      'bytes': len(packed), 'decodedBytes': len(raw), 'decodedSha256': hashlib.sha256(raw).hexdigest(), 'counts': counts}))


if __name__ == '__main__':
    main()
