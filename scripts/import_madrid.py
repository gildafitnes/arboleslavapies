import argparse, json, time
from pathlib import Path
import requests
from pyproj import Transformer

API='https://datos.madrid.es/api/3/action/datastore_search'
RESOURCE='300761-8-arbolado-especies'
TRANSFORMER=Transformer.from_crs('EPSG:25830','EPSG:4326',always_xy=True)

def fetch_barrio(barrio, page_size=1000):
    offset=0; out=[]
    filters=json.dumps({'NBRE_BARRIO': barrio.upper()}, ensure_ascii=False)
    while True:
        r=requests.get(API,params={'resource_id':RESOURCE,'limit':page_size,'offset':offset,'filters':filters},timeout=60)
        r.raise_for_status(); payload=r.json(); result=payload['result']; rows=result['records']; out.extend(rows)
        total=result['total']
        print(f'  {len(out)}/{total}', flush=True)
        if len(out)>=total or not rows: break
        offset += len(rows); time.sleep(.15)
    return out

def feature(row):
    x=float(str(row['X']).replace(',','.')); y=float(str(row['Y']).replace(',','.'))
    lon,lat=TRANSFORMER.transform(x,y)
    def num(v):
        if v in (None,''): return None
        try:return float(str(v).replace(',','.'))
        except:return v
    p={
      'source':'madrid','assetnum':row.get('ASSETNUM'),'district':row.get('NBRE_DISTRITO'),
      'barrio':row.get('NBRE_BARRIO'),'species_code':row.get('CODIGO_ESPECIE'),
      'species':row.get('ESPECIE'),'perimeter_cm':num(row.get('PERIMETRO')),
      'height':num(row.get('ALTURA_TOTAL')),'municipal_x':x,'municipal_y':y
    }
    return {'type':'Feature','id':f"MAD-{row.get('ASSETNUM')}",'geometry':{'type':'Point','coordinates':[round(lon,7),round(lat,7)]},'properties':p}

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--barrio',default='EMBAJADORES'); ap.add_argument('--out',default='docs/data/trees.geojson'); args=ap.parse_args()
    print(f'Descargando árboles de {args.barrio}…')
    rows=fetch_barrio(args.barrio)
    fc={'type':'FeatureCollection','meta':{'source':'Ayuntamiento de Madrid','resource':RESOURCE,'barrio':args.barrio.upper(),'updated_dataset':'2026-07-27'},'features':[feature(r) for r in rows]}
    out=Path(args.out); out.parent.mkdir(parents=True,exist_ok=True); out.write_text(json.dumps(fc,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(f'Escritos {len(rows)} árboles en {out}')
if __name__=='__main__': main()
