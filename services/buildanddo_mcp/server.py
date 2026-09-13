#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, os, sys
from pathlib import Path

HERE=Path(__file__).resolve(); REPO_DEFAULT=HERE.parents[2]
if str(REPO_DEFAULT) not in sys.path: sys.path.insert(0,str(REPO_DEFAULT))
from services.buildanddo_substrate.graph import build_graph
from services.buildanddo_substrate.projections import project

SERVER_INFO={'name':'buildanddo-substrate','version':'1.0.0'}
TOOLSETS={
 'user':['capability.list','capability.inspect','user.substrate'],
 'developer':['capability.list','capability.inspect','dev.repo_state','dev.requirements','dev.substrate'],
 'guildmaster':['capability.list','capability.inspect','organization.inspect','curriculum.inspect','dev.substrate','user.substrate'],
}

def _tools(profile):
    desc={
      'capability.list':'List capabilities visible to this profile.',
      'capability.inspect':'Inspect one capability by id.',
      'user.substrate':'Return the user-state projection (PocketBase-backed entities only).',
      'dev.substrate':'Return the development-state projection.',
      'dev.repo_state':'Return repository and branch nodes.',
      'dev.requirements':'Return SRS requirement nodes.',
      'organization.inspect':'Return capability ownership/organization projection. Ownership may be UNMEASURED.',
      'curriculum.inspect':'Return capability-to-learning relationships. Missing relationships stay UNMEASURED.',
    }
    out=[]
    for name in TOOLSETS[profile]:
        schema={'type':'object','properties':{}}
        if name=='capability.inspect': schema={'type':'object','properties':{'capability_id':{'type':'string'}},'required':['capability_id']}
        out.append({'name':name,'description':desc[name],'inputSchema':schema})
    return out

def execute(profile, name, args, repo, citadel_root):
    graph=build_graph(repo,citadel_root)
    if name not in TOOLSETS[profile]: return {'error':'TOOL_NOT_AVAILABLE_FOR_PROFILE'}
    if name=='capability.list': return [n for n in graph['nodes'] if n['type']=='capability']
    if name=='capability.inspect':
        cid=str((args or {}).get('capability_id','')); return next((n for n in graph['nodes'] if n['id']==cid and n['type']=='capability'), {'state':'UNMEASURED','capability_id':cid})
    if name=='user.substrate': return project(graph,'user')
    if name=='dev.substrate': return project(graph,'developer')
    if name=='dev.repo_state': return [n for n in graph['nodes'] if n['type'] in {'repository','branch'}]
    if name=='dev.requirements': return [n for n in graph['nodes'] if n['type']=='requirement']
    if name=='organization.inspect':
        caps=[n for n in graph['nodes'] if n['type']=='capability']; return {'state':'UNMEASURED','reason':'OWNERSHIP_EDGES_NOT_YET_EVIDENCED','capabilities':[{'id':c['id'],'owner':'UNMEASURED'} for c in caps]}
    if name=='curriculum.inspect':
        return {'state':'UNMEASURED','reason':'CAPABILITY_TO_TUTORIAL_EDGES_NOT_YET_EVIDENCED'}
    return {'state':'UNMEASURED'}

def response(i,result=None,error=None):
    out={'jsonrpc':'2.0','id':i}
    if error is not None: out['error']={'code':-32000,'message':str(error)}
    else: out['result']=result
    return out

def handle(msg, profile, repo, citadel_root):
    method=msg.get('method'); i=msg.get('id')
    if method=='notifications/initialized': return None
    if method=='initialize':
        requested=((msg.get('params') or {}).get('protocolVersion')) or '2025-06-18'
        return response(i,{'protocolVersion':requested,'capabilities':{'tools':{}},'serverInfo':SERVER_INFO})
    if method=='ping': return response(i,{})
    if method=='tools/list': return response(i,{'tools':_tools(profile)})
    if method=='tools/call':
        p=msg.get('params') or {}; name=p.get('name'); args=p.get('arguments') or {}
        try: value=execute(profile,name,args,repo,citadel_root); return response(i,{'content':[{'type':'text','text':json.dumps(value,ensure_ascii=False,sort_keys=True)}],'isError':False})
        except Exception as exc: return response(i,error=f'{type(exc).__name__}: {exc}')
    return response(i,error='METHOD_NOT_SUPPORTED') if i is not None else None

def selftest(repo, citadel_root):
    graph=build_graph(repo,citadel_root); checks=[]
    checks.append(('graph_nonempty',len(graph['nodes'])>0 and len(graph['edges'])>0))
    for profile in TOOLSETS:
        tools=_tools(profile); checks.append((profile+'_tools',len(tools)>=3))
        proj=project(graph,'user' if profile=='user' else ('developer' if profile=='developer' else 'guildmaster'))
        checks.append((profile+'_projection',proj.get('schema_version')==1))
    checks.append(('no_mutation_tools',all(not any(tok in t['name'] for tok in ('deploy','merge','push','delete','write')) for p in TOOLSETS for t in _tools(p))))
    out={'state':'PASS' if all(v for _,v in checks) else 'FAIL','checks':[{'name':n,'state':'PASS' if v else 'FAIL'} for n,v in checks],'nodes':len(graph['nodes']),'edges':len(graph['edges'])}
    print(json.dumps(out,indent=2)); return 0 if out['state']=='PASS' else 1

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--profile',choices=sorted(TOOLSETS),default=os.getenv('BUILDANDDO_MCP_PROFILE','developer')); ap.add_argument('--repo',default=os.getenv('BUILDANDDO_REPO',str(REPO_DEFAULT))); ap.add_argument('--citadel-root',default=os.getenv('CITADEL_ROOT','')); ap.add_argument('--selftest',action='store_true'); a=ap.parse_args()
    repo=Path(a.repo).resolve(); citadel=Path(a.citadel_root).resolve() if a.citadel_root else None
    if a.selftest: return selftest(repo,citadel)
    for line in sys.stdin:
        line=line.strip()
        if not line: continue
        try: msg=json.loads(line); out=handle(msg,a.profile,repo,citadel)
        except Exception as exc: out=response(None,error=f'{type(exc).__name__}: {exc}')
        if out is not None: print(json.dumps(out,separators=(',',':'),ensure_ascii=False),flush=True)
    return 0
if __name__=='__main__': raise SystemExit(main())
