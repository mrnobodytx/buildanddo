from __future__ import annotations
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from hashlib import sha256
from typing import Any, Literal
import json

TruthState = Literal['OBSERVED','DECLARED','INFERRED','HYPOTHESIS','VERIFIED','DISPUTED','UNMEASURED']
Verdict = Literal['PASS','FAIL','DEGRADED','BLOCKED','FALSE_SUCCESS','UNMEASURED']


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def canonical_digest(obj: Any) -> str:
    raw = json.dumps(obj, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()
    return sha256(raw).hexdigest()


@dataclass(frozen=True)
class EvidenceRecord:
    evidence_id: str
    kind: str
    state: TruthState
    verdict: Verdict
    observed_at: str
    source: str
    payload: dict[str, Any]
    digest: str

    @classmethod
    def create(cls, *, evidence_id: str, kind: str, state: TruthState, verdict: Verdict,
               source: str, payload: dict[str, Any]) -> 'EvidenceRecord':
        base = {
            'evidence_id': evidence_id, 'kind': kind, 'state': state,
            'verdict': verdict, 'source': source, 'payload': payload,
        }
        return cls(evidence_id, kind, state, verdict, utcnow(), source, payload, canonical_digest(base))

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class UtilizationEpisode:
    run_id: str
    tenant_id: str
    workspace_id: str
    capability: str
    state: TruthState
    verdict: Verdict
    started_at: str
    completed_at: str | None
    evidence_refs: tuple[str, ...]
    facts: tuple[dict[str, Any], ...]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
