#!/usr/bin/env python3
"""Build self-hosted LAX imagery levels from genuine NAIP 2022 COGs.

Optional build-only tooling is shared with build-lax-city-data.py. Normal
install/build/play uses the checked-in outputs and never contacts a map API.
"""
import concurrent.futures
import hashlib
import importlib.util
import json
import pathlib
import urllib.parse
import urllib.request

import numpy as np
from PIL import Image

spec = importlib.util.spec_from_file_location('city_source', pathlib.Path(__file__).with_name('build-lax-city-data.py'))
source = importlib.util.module_from_spec(spec)
spec.loader.exec_module(source)
ROOT = source.ROOT
CACHE = pathlib.Path('/tmp/pilot-sim-lax-city-data/lod-v1')
BOUNDS = [33.63, -118.76, 34.25, -118.0]


def catalog():
    path = CACHE / 'naip-stac-2022.json'
    if not path.exists():
        south, west, north, east = BOUNDS
        query = urllib.parse.urlencode({'collections': 'naip', 'bbox': f'{west},{south},{east},{north}',
                                       'datetime': '2022-01-01T00:00:00Z/2022-12-31T23:59:59Z', 'limit': '500'})
        with urllib.request.urlopen('https://planetarycomputer.microsoft.com/api/stac/v1/search?' + query, timeout=45) as response:
            data = json.load(response)
        assert not any(link['rel'] == 'next' for link in data.get('links', [])), 'catalog pagination required'
        assert len(data['features']) > 50
        source.dump(path, data)
    return json.loads(path.read_text())


def build_image(record, items):
    destination = ROOT / 'public' / record['path']
    if not destination.exists():
        result = np.zeros((record['height'], record['width'], 4), dtype='uint8')
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            for piece in pool.map(lambda item: source.warp_piece(item, record, CACHE), items):
                if piece is None:
                    continue
                x, y, image = piece
                height, width = image.shape[:2]
                valid = image[:, :, 3] > 0
                result[y:y + height, x:x + width][valid] = image[valid]
        Image.fromarray(result).save(destination, 'WEBP', quality=90, method=6, exact=True)
    output = {key: value for key, value in record.items() if key != 'sourceOverviewLevel'}
    output.update(sha256=source.sha(destination), bytes=destination.stat().st_size)
    print(record['id'], output['bytes'], flush=True)
    return output


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    data = catalog()
    items = sorted(data['features'], key=lambda item: item['id'])
    overview = build_image({'id': 'region-v1', 'path': 'assets/cities/lax/region-v1.webp',
                            'bounds': BOUNDS, 'width': 2048, 'height': 2048, 'sourceOverviewLevel': 4}, items)
    tiles = []
    for row in range(2):
        for column in range(9):
            tiles.append({'id': f'hires-v1-{row}-{column}',
                          'path': f'assets/cities/lax/hires-v1-{row}-{column}.webp',
                          'bounds': [round(33.91 + row * .04, 7), round(-118.46 + column * .0375, 7),
                                     round(33.95 + row * .04, 7), round(-118.4225 + column * .0375, 7)],
                          'width': 2048, 'height': 2048, 'sourceOverviewLevel': 0})
    tiles.append({'id': 'hires-v1-downtown', 'path': 'assets/cities/lax/hires-v1-downtown.webp',
                  'bounds': [34.035, -118.28, 34.075, -118.2425],
                  'width': 2048, 'height': 2048, 'sourceOverviewLevel': 0})
    outputs = [build_image(tile, items) for tile in tiles]
    previous = json.loads((ROOT / 'public/assets/cities/lax/imagery.json').read_text())
    # Reuse the authoritative sea polygons without rewriting the old source pack.
    mask = source.sea_mask(overview, 'assets/cities/lax/region-sea-mask-v1.png')
    metadata = {
        'version': 1, 'kind': 'NAIP orthophotography', 'overview': overview,
        'regional': previous['overview'], 'tiles': outputs, 'seaMask': mask, 'coastMask': previous['seaMask'],
        'captureDates': sorted({item['properties']['datetime'] for item in items}),
        'copyright': previous['copyright'], 'license': previous['license'], 'licenseUrl': previous['licenseUrl'],
        'catalog': previous['catalog'], 'catalogSha256': source.sha(CACHE / 'naip-stac-2022.json'),
        'processing': 'NAIP 2022 RGB bands 1/2/3; bilinear EPSG:4326 north-up reprojection. '
                      'Region uses source pyramid32x, 2048px detail tiles use source pyramid2x. '
                      'WebP quality90. Alpha0 denotes missing coverage. No synthetic replacement imagery.',
        'sourceItems': [{'id': item['id'], 'datetime': item['properties']['datetime'],
                         'bbox': item['bbox'], 'gsdM': item['properties'].get('gsd'),
                         'href': item['assets']['image']['href'],
                         'stacSha256': hashlib.sha256(json.dumps(item, sort_keys=True, separators=(',', ':')).encode()).hexdigest()}
                        for item in items],
    }
    source.dump(ROOT / 'public/assets/cities/lax/imagery-lod.json', metadata)
    print('Wrote attributed imagery levels:', len(outputs), 'detail tiles;', len(items), 'source COGs', flush=True)


if __name__ == '__main__':
    main()
