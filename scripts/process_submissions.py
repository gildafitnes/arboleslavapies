#!/usr/bin/env python3
"""Consolidador local para Lavapiés Riega.

Lee solicitudes JSON de `submissions/`, procesa primero las altas de identidad
y después las acciones. Esto permite que una identidad creada y una acción
realizada el mismo día entren en la misma actualización.

Los códigos secretos recibidos se usan sólo para validar y NO se escriben en
los JSON públicos. Los ficheros de entrada se eliminan tras procesarse.
"""
import argparse, hashlib, json, re, uuid
from datetime import datetime, timezone
from pathlib import Path

ALIAS_RE = re.compile(r'^[A-Za-zÀ-ÿ0-9._-]{3,28}$')
PUBLIC_EVENT_TYPES = {'watering','commitment','comment','issue'}

def norm(s): return str(s).strip().casefold()
def digest(code): return hashlib.sha256(str(code).strip().upper().encode()).hexdigest()
def now(): return datetime.now(timezone.utc).isoformat()

def load(path, default):
    p=Path(path)
    return json.loads(p.read_text(encoding='utf-8')) if p.exists() else default

def write(path, value):
    p=Path(path); p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')

def safe_unlink(path):
    try: Path(path).unlink()
    except FileNotFoundError: pass

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--inbox',default='submissions')
    ap.add_argument('--site',default='docs')
    ap.add_argument('--pending',default='pending')
    args=ap.parse_args()

    site=Path(args.site); inbox=Path(args.inbox); pending=Path(args.pending)
    inbox.mkdir(parents=True,exist_ok=True); pending.mkdir(parents=True,exist_ok=True)
    users=load(site/'data/users.json',[])
    events=load(site/'data/events.json',[])
    aliases={norm(u['alias']):u for u in users}
    event_submission_ids={e.get('submission_id') for e in events if e.get('submission_id')}

    items=[]
    for f in sorted(inbox.glob('*.json')):
        try:
            d=json.loads(f.read_text(encoding='utf-8'))
            items.append((f,d))
        except Exception as e:
            print('JSON INVÁLIDO',f,e)
            safe_unlink(f)

    changed_users=False; changed_events=False
    handled=set()

    # 1) Altas de identidad primero.
    for f,d in items:
        if d.get('type')!='identity_registration': continue
        handled.add(f)
        alias=str(d.get('alias','')).strip()
        h=str(d.get('secret_hash','')).lower()
        if not ALIAS_RE.fullmatch(alias) or not re.fullmatch(r'[0-9a-f]{64}',h):
            print('REGISTRO RECHAZADO (formato)',alias or f.name)
            safe_unlink(f); continue
        existing=aliases.get(norm(alias))
        if existing:
            if existing.get('secret_hash')==h:
                print('REGISTRO YA EXISTENTE',alias)
            else:
                print('REGISTRO RECHAZADO (alias ocupado)',alias)
            safe_unlink(f); continue
        u={
            'id':'u_'+uuid.uuid4().hex[:10],
            'alias':alias,
            'secret_hash':h,
            'created_at':d.get('created_at') or now()
        }
        users.append(u); aliases[norm(alias)]=u; changed_users=True
        print('USUARIO',alias)
        safe_unlink(f)

    # 2) Acciones y altas de lugares.
    for f,d in items:
        if f in handled: continue
        typ=d.get('type')
        submission_id=str(d.get('submission_id') or '') or None

        if submission_id and submission_id in event_submission_ids:
            print('DUPLICADO',submission_id)
            safe_unlink(f); continue

        alias=str(d.get('alias','Anónimo')).strip() or 'Anónimo'
        code=d.get('identity_code')
        uid=None
        if alias!='Anónimo':
            u=aliases.get(norm(alias))
            if not u or not code or digest(code)!=u.get('secret_hash'):
                print('IDENTIDAD INVÁLIDA',f.name,alias)
                safe_unlink(f); continue
            uid=u['id']

        if typ in PUBLIC_EVENT_TYPES:
            e={
                'id':'e_'+uuid.uuid4().hex[:12],
                'submission_id':submission_id,
                'type':typ,
                'place_id':d.get('place_id'),
                'date':d.get('date') or now(),
                'note':str(d.get('note',''))[:1200],
                'alias':alias,
                'user_id':uid
            }
            events.append(e); changed_events=True
            if submission_id: event_submission_ids.add(submission_id)
            print('EVENTO',typ,d.get('place_id'))
            safe_unlink(f); continue

        if typ=='new_place':
            clean={
                'submission_id':submission_id,
                'type':'new_place',
                'place_type':d.get('place_type','other'),
                'lat':d.get('lat'), 'lon':d.get('lon'),
                'date':d.get('date') or now(),
                'note':str(d.get('note',''))[:1800],
                'alias':alias,
                'user_id':uid,
                'status':'pending'
            }
            dest=pending/(f.stem+'-pending.json')
            write(dest,clean)
            print('PENDIENTE',dest)
            safe_unlink(f); continue

        print('TIPO DESCONOCIDO',f.name,typ)
        safe_unlink(f)

    if changed_users: write(site/'data/users.json',users)
    if changed_events: write(site/'data/events.json',events)
    if changed_users or changed_events:
        print('Datos consolidados.')
    else:
        print('Sin cambios públicos.')

if __name__=='__main__': main()
