"""Extract source woodland polygons from the pinned local LAX OSM PBF.

Offline build-time tool (osmium required); the game never contacts OSM services.
Coordinates and multipolygon holes are retained. Tree placement is a separate
programmatic visual estimate, not a survey of individual trees.
"""
import argparse
import hashlib
import json
from pathlib import Path

import osmium

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--pbf', type=Path, default=Path('/tmp/pilot-sim-lax-data/LosAngeles-2026-11-14.osm.pbf'))
    parser.add_argument('--output', type=Path, default=ROOT / 'public/assets/cities/lax/woodlands-v1.json')
    args = parser.parse_args()
    factory = osmium.geom.GeoJSONFactory()
    features = []
    stream = osmium.FileProcessor(str(args.pbf)).with_locations().with_areas().with_filter(osmium.filter.EntityFilter(osmium.osm.AREA)).with_filter(osmium.filter.KeyFilter('landuse', 'natural'))
    for area in stream:
        tags = dict(area.tags)
        if tags.get('natural') != 'wood' and tags.get('landuse') != 'forest':
            continue
        shape = json.loads(factory.create_multipolygon(area))
        polygons = shape['coordinates'] if shape['type'] == 'MultiPolygon' else [shape['coordinates']]
        for index, rings in enumerate(polygons):
            if len(rings[0]) < 4:
                continue
            west, east = min(p[0] for p in rings[0]), max(p[0] for p in rings[0])
            south, north = min(p[1] for p in rings[0]), max(p[1] for p in rings[0])
            if east < -118.85 or west > -117.98 or north < 33.58 or south > 34.31:
                continue
            features.append({'id': ('way/' if area.from_way() else 'relation/') + str(area.orig_id()) + '/' + str(index),
                             'tags': {k: v for k, v in tags.items() if k in ['natural', 'landuse', 'leaf_type', 'leaf_cycle', 'height', 'name']},
                             'geometry': rings[0], 'holes': rings[1:]})
    features.sort(key=lambda f: f['id'])
    value = {'version': 1, 'airportId': 'lax', 'features': features,
             'provenance': {'source': 'https://download.bbbike.org/osm/bbbike/LosAngeles/LosAngeles.osm.pbf',
                            'snapshot': '2026-11-14 cached extract', 'sha256': hashlib.file_digest(args.pbf.open('rb'), 'sha256').hexdigest(),
                            'license': 'ODbL-1.0', 'attribution': '© OpenStreetMap contributors',
                            'derivation': 'Source woodland polygon coordinates and holes; individual trees are estimated deterministically at runtime.'}}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n')
    print('LAX woodland polygons:', len(features), 'bytes:', args.output.stat().st_size)


if __name__ == '__main__':
    main()
