"""Sample existing local NAIP photography for the offline NYC tree derivative."""
import json,sys
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1];output=Path(sys.argv[1]);manifest=json.loads((root/'public/assets/cities/new-york/imagery-v1.json').read_text());records=[]
for i,record in enumerate([manifest['regional'],manifest['overview']]):
 image=Image.open(root/'public'/record['path']).convert('RGBA');scale=min(1,1024/max(image.size));image=image.resize((max(1,round(image.width*scale)),max(1,round(image.height*scale))),Image.Resampling.BILINEAR);path=output/f'{i}.rgba';path.write_bytes(image.tobytes());records.append({'bounds':record['bounds'],'width':image.width,'height':image.height,'path':str(path)})
(output/'colors.json').write_text(json.dumps(records))
