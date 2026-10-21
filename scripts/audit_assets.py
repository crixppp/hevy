#!/usr/bin/env python3
"""Scan production output; optional local source stays on this Mac."""
import argparse,json,re
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--source',type=Path);args=p.parse_args()
root=Path(__file__).resolve().parents[1];dist=root/'dist'
if not (dist/'index.html').exists(): raise SystemExit('Build dist first.')
ids=[]
if args.source:
    d=json.loads(args.source.read_text()); ids=[w['id'] for w in d['workouts']]
failures=[]
for file in dist.rglob('*'):
    if not file.is_file(): continue
    text=file.read_text(errors='ignore')
    if any(x in text for x in ['HEVY_API_KEY','SUPABASE_SERVICE_ROLE_KEY','SYNC_SCHEDULE_SECRET']):failures.append(str(file.relative_to(root))+': server secret identifier in client assets')
    if any(i in text for i in ids):failures.append(str(file.relative_to(root))+': private source ID detected')
    if re.search(r'sb_secret_[A-Za-z0-9_-]{10,}',text):failures.append(str(file.relative_to(root))+': privileged credential pattern')
if failures:raise SystemExit('\n'.join(failures))
print('PASS: no server credential identifiers, privileged key patterns or supplied private source IDs in production assets.')
print('This scan does not establish full security or inspect hosted configuration.')
