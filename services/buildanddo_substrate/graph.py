from __future__ import annotations
import json, re, subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SEED_CAPABILITIES = [
    ("CAP-BND-SIGNALS", "Observe workspace signals", "signals", "SignalsPage"),
    ("CAP-BND-MISSIONS", "Compile and track bounded missions", "missions", "MissionsPage"),
    ("CAP-BND-WORKFLOWS", "Coordinate workflows", "workflows", "WorkflowsPage"),
    ("CAP-BND-EVIDENCE", "Inspect evidence and replay", "evidence", "EvidencePage"),
    ("CAP-BND-LEARNING", "Track learn-by-doing progression", "tutorial_progress", "TutorialsPage"),
    ("CAP-BND-COLLAB", "Coordinate human and AI seats", "seat_events", "seatComms"),
    ("CAP-BND-PASSPORT", "Present capability provenance", "evidence_epochs", "CapabilityPassport"),
    ("CAP-BND-ROADMAP", "Track evidence-backed roadmap state", "roadmap_items", "RoadmapPage"),
]

def now(): return datetime.now(timezone.utc).isoformat()
def run(repo: Path, *args):
    try:
        p=subprocess.run(['git','-C',str(repo),*args],text=True,capture_output=True,encoding='utf-8',errors='replace',timeout=20,check=False)
        return p.stdout.strip() if p.returncode==0 else None
    except Exception: return None

def _collections(repo: Path) -> set[str]:
    names=set()
    for p in (repo/'apps/pocketbase/pb_migrations').glob('*.js') if (repo/'apps/pocketbase/pb_migrations').is_dir() else []:
        text=p.read_text(encoding='utf-8',errors='replace')
        names.update(re.findall(r'name:\s*["\']([a-zA-Z0-9_]+)["\']',text))
    return names

def _srs(repo: Path) -> list[dict]:
    p=repo/'.bits/srs_registry.yml'
    if not p.is_file(): return []
    rows=[]; cur=None
    for raw in p.read_text(encoding='utf-8',errors='replace').splitlines():
        m=re.match(r'^\s*-\s+code:\s*(\S+)',raw)
        if m:
            if cur: rows.append(cur)
            cur={'code':m.group(1)}; continue
        m=re.match(r'^\s+(title|status|risk|spec):\s*(.*)$',raw)
        if m and cur is not None: cur[m.group(1)]=m.group(2).strip().strip('"')
    if cur: rows.append(cur)
    return rows

def build_graph(repo: str|Path, citadel_root: str|Path|None=None) -> dict[str,Any]:
    repo=Path(repo).resolve(); collections=_collections(repo); nodes=[]; edges=[]
    def node(i,t,**x): nodes.append({'id':i,'type':t,**x})
    def edge(a,r,b,**x): edges.append({'source':a,'relation':r,'target':b,**x})
    node('BND:PRODUCT','product',title='BuildAndDo')
    node('BND:USER','substrate',title='User substrate',authority='A1',store='PocketBase')
    node('BND:DEV','substrate',title='Development substrate',authority='A1',store='Git/CI/SRS')
    node('BND:META','substrate',title='Meta capability graph',authority='A1',store='derived')
    for sub in ('BND:USER','BND:DEV','BND:META'): edge('BND:PRODUCT','HAS_SUBSTRATE',sub)
    for name in sorted(collections):
        nid='PB:'+name; node(nid,'user_collection',name=name,state='OBSERVED'); edge('BND:USER','OBSERVES',nid)
    for cap_id,title,collection,surface in SEED_CAPABILITIES:
        evidence=[]
        if collection in collections: evidence.append('collection:'+collection)
        state='IMPLEMENTED' if evidence else 'UNMEASURED'
        node(cap_id,'capability',title=title,state=state,evidence=evidence)
        edge('BND:META','DESCRIBES',cap_id); edge(cap_id,'EXPOSED_THROUGH','BND:USER')
        if collection in collections: edge(cap_id,'USES','PB:'+collection)
        edge(cap_id,'IMPLEMENTED_IN','BND:DEV',surface=surface)
    for row in _srs(repo):
        sid='SRS:'+row['code']; node(sid,'requirement',**row); edge('BND:DEV','TRACKS',sid)
        if row['code']=='SRS-BUILDANDDO-SUBSTRATE-001': edge(sid,'IMPLEMENTS','BND:META')
    branch=run(repo,'branch','--show-current'); head=run(repo,'rev-parse','HEAD')
    node('GIT:REPO','repository',path=str(repo),branch=branch,state='OBSERVED' if head else 'UNMEASURED',head=head)
    edge('BND:DEV','READS','GIT:REPO')
    if branch:
        node('GIT:BRANCH:'+branch,'branch',name=branch,state='OBSERVED'); edge('GIT:REPO','HAS_BRANCH','GIT:BRANCH:'+branch)
    if citadel_root:
        root=Path(citadel_root); bridge=root/'state/bridge'
        node('CITADEL:BRIDGE','external_projection',path=str(bridge),state='OBSERVED' if bridge.exists() else 'UNMEASURED')
        edge('BND:DEV','CORRELATED_WITH','CITADEL:BRIDGE')
    return {'schema_version':1,'generated_at':now(),'nodes':nodes,'edges':edges,
            'rules':{'read_only':True,'missing_is_unmeasured':True,'capability_graph_grants_authority':False}}
