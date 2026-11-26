"""Tiled regional road derivatives; original way identities span tile borders."""
import collections
import gzip
import hashlib
import heapq
import json
import math
from pathlib import Path

SIZE = 4000
EXTENT = 30000
INNER = 6000


def number(value, fallback):
    try:
        return float(value.split(';')[0])
    except (ValueError, AttributeError):
        return fallback


def clip_segment(a, b, bounds):
    lo, hi = 0., 1.
    for v, dv, lower, upper in [(a[0], b[0]-a[0], bounds[0], bounds[2]), (a[1], b[1]-a[1], bounds[1], bounds[3])]:
        if abs(dv) < 1e-12:
            if v < lower or v > upper:
                return None
        else:
            x, y = (lower-v)/dv, (upper-v)/dv
            lo, hi = max(lo, min(x, y)), min(hi, max(x, y))
            if hi <= lo:
                return None
    return lo, hi


def outside_core(a, b, center, interval):
    lo, hi = interval
    dx, dz, x, z = b[0]-a[0], b[1]-a[1], a[0]-center[0], a[1]-center[1]
    aa, bb, cc = dx*dx+dz*dz, 2*(x*dx+z*dz), x*x+z*z-INNER*INNER
    dd = bb*bb-4*aa*cc
    if dd <= 0:
        return [(lo, hi)]
    u, v = (-bb-math.sqrt(dd))/(2*aa), (-bb+math.sqrt(dd))/(2*aa)
    return [(s,t) for s,t in [(lo,min(hi,u)),(max(lo,v),hi)] if t-s > 1e-8]


def export_regional(args, airport, ways, project, center, side, provenance, snapshot, source_sha, threshold, heading):
    root = Path(__file__).resolve().parents[1] / f'public/assets/cities/{args.airport}'
    output = root / 'traffic-region-v1'
    output.mkdir(parents=True, exist_ok=True)
    routes, coords, neighbors, lifts, heap = [], {}, collections.defaultdict(list), {}, []
    counts = collections.Counter()
    for oid, tags, ns in ways:
        if tags.get('tunnel','no') not in ['no','false','0']:
            continue
        pts = [(round(n[1],7),round(n[2],7)) for n in ns]
        local = [project(*p) for p in pts]
        if not any(-EXTENT-2000 < x < EXTENT+2000 and -EXTENT-2000 < z < EXTENT+2000 for x,z in local):
            continue
        kind = tags['highway']
        default_oneway = kind in ['motorway','motorway_link'] or tags.get('junction') in ['roundabout','circular']
        one = -1 if tags.get('oneway') == '-1' else 1 if tags.get('oneway','yes' if default_oneway else 'no') in ['yes','true','1'] else 0
        lanes = max(1,min(8,int(number(tags.get('lanes'),3 if kind in ['motorway','trunk'] else 1 if one else 2))))
        forward = max(1,min(5,int(number(tags.get('lanes:forward'),lanes if one else math.ceil(lanes/2)))))
        backward = 0 if one else max(1,min(5,int(number(tags.get('lanes:backward'),max(1,lanes//2)))))
        width = max((forward+backward)*2.9+.3,min(32,number(tags.get('width'),(forward+backward)*3.25+(.5 if kind not in ['motorway','trunk'] else 1.5))))
        speed = tags.get('maxspeed','')
        speed = number(speed.replace('mph','').replace('km/h','').strip(),0)*(.44704 if 'mph' in speed else 1/3.6)
        bridge = tags.get('bridge','no') not in ['no','false','0']
        layer = int(number(tags.get('layer'),1 if bridge else 0))
        r = {'id':f'way/{oid}','kind':kind,'oneway':one,'forward':forward,'backward':backward,'width':round(width,2),'speed':round(speed,3),'bridge':bridge,'tunnel':False,'layer':layer}
        routes.append((r, ns, pts, local))
        for n,p in zip(ns,local):
            coords[n[0]] = p
        for a,b in zip(ns,ns[1:]):
            d = math.dist(coords[a[0]],coords[b[0]])
            neighbors[a[0]].append((b[0],d)); neighbors[b[0]].append((a[0],d))
        if bridge:
            for n in ns:
                h = min(18,(8 if args.airport=='kansai' else 6)*max(1,layer))
                if h > lifts.get(n[0],0):
                    lifts[n[0]]=h;heapq.heappush(heap,(-h,n[0]))
    while heap:
        minus, n = heapq.heappop(heap)
        if -minus < lifts[n]-.001:
            continue
        for other,d in neighbors[n]:
            h=-minus-d*.065
            if h>lifts.get(other,0)+.001:
                lifts[other]=h;heapq.heappush(heap,(-h,other))
    del neighbors
    tiles = {}
    for r,ns,pts,local in routes:
        pieces = collections.defaultdict(list)
        distance=0
        for a,b in zip(local,local[1:]):
            length=math.dist(a,b)
            if length<.01:
                continue
            for tx in range(max(-8,math.floor(min(a[0],b[0])/SIZE)),min(7,math.floor(max(a[0],b[0])/SIZE))+1):
                for tz in range(max(-8,math.floor(min(a[1],b[1])/SIZE)),min(7,math.floor(max(a[1],b[1])/SIZE))+1):
                    bounds=[max(-EXTENT,tx*SIZE),max(-EXTENT,tz*SIZE),min(EXTENT,(tx+1)*SIZE),min(EXTENT,(tz+1)*SIZE)]
                    interval=clip_segment(a,b,bounds)
                    if interval:
                        for u,v in outside_core(a,b,center,interval):
                            start,end=distance+u*length,distance+v*length
                            part=pieces[(tx,tz)]
                            if part and abs(part[-1][1]-start)<.015:
                                part[-1][1]=end
                            else:
                                part.append([start,end])
            distance+=length
        if distance<15 or not pieces:
            continue
        record={**r,'points':[[p[0],p[1],round(lifts.get(n[0],0),3)] for n,p in zip(ns,pts)]}
        counted = False
        for (tx,tz),intervals in pieces.items():
            intervals=[[round(a,3),round(b,3)] for a,b in intervals if b-a>.5]
            if not intervals:
                continue
            if not counted:
                counts[r['kind']]+=1; counted=True
            tile=tiles.setdefault((tx,tz),{'schema':1,'airportId':args.airport,'id':f'{tx}:{tz}','bounds':[max(-EXTENT,tx*SIZE),max(-EXTENT,tz*SIZE),min(EXTENT,(tx+1)*SIZE),min(EXTENT,(tz+1)*SIZE)],'routes':[],'pieces':[]})
            i=len(tile['routes']);tile['routes'].append(record);tile['pieces'].extend([[i,a,b] for a,b in intervals])
    records=[]
    for (tx,tz),tile in sorted(tiles.items()):
        raw=(json.dumps(tile,ensure_ascii=False,separators=(',',':'))+'\n').encode();packed=gzip.compress(raw,compresslevel=9,mtime=0)
        sha=hashlib.sha256(packed).hexdigest();name=f'{tx}_{tz}-{sha[:12]}.json.gz';(output/name).write_bytes(packed)
        records.append({'id':tile['id'],'bounds':tile['bounds'],'path':f'assets/cities/{args.airport}/traffic-region-v1/{name}','bytes':len(packed),'decodedBytes':len(raw),'sha256':sha,'decodedSha256':hashlib.sha256(raw).hexdigest(),'routes':len(tile['routes']),'pieces':len(tile['pieces'])})
    manifest={'schema':1,'airportId':args.airport,'bounds':[-EXTENT,-EXTENT,EXTENT,EXTENT],'tileSize':SIZE,'innerRadiusM':INNER,'center':list(center),'frame':{'threshold':threshold,'heading':heading},'drivingSide':side,'bridgeDeckReference':'airport' if args.airport=='kansai' else 'terrain','tiles':records,'counts':dict(counts),'provenance':{'source':provenance['url'],'sha256':source_sha,'snapshot':snapshot+' cached extract','license':'ODbL-1.0','attribution':'© OpenStreetMap contributors','estimates':'Source motor roads; missing lanes/speeds/widths and bridge clearances use the airport traffic defaults. Regional flow is estimated visual traffic, not measured demand. Original full way identities and distance intervals avoid resetting routes at tile seams.'}}
    if 'regionalSources' in provenance:
        manifest['provenance']['sources'] = provenance['regionalSources']
    manifest['identity']=hashlib.sha256(json.dumps(manifest,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    path=root/'traffic-region-v1.json';tmp=path.with_suffix('.next');tmp.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n');tmp.replace(path)
    print(json.dumps({'airport':args.airport,'regionalTiles':len(records),'routes':sum(counts.values()),'bytes':sum(r['bytes'] for r in records),'counts':dict(counts)}),flush=True)
