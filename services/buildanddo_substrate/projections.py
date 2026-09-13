from __future__ import annotations
from typing import Any

def project(graph: dict[str,Any], profile: str) -> dict[str,Any]:
    nodes=graph.get('nodes',[]); edges=graph.get('edges',[])
    if profile=='user':
        allowed={'product','substrate','user_collection','capability'}
    elif profile=='developer':
        allowed={'product','substrate','capability','requirement','repository','branch','external_projection'}
    else:
        allowed={n.get('type') for n in nodes}
    kept=[n for n in nodes if n.get('type') in allowed]
    ids={n['id'] for n in kept}
    return {'schema_version':1,'generated_at':graph.get('generated_at'),'profile':profile,
            'nodes':kept,'edges':[e for e in edges if e.get('source') in ids and e.get('target') in ids],
            'rules':graph.get('rules',{})}
