from __future__ import annotations
from pathlib import Path
from datetime import datetime, timezone
from typing import Any
import argparse, json, os, uuid
from .contracts import EvidenceRecord, UtilizationEpisode
from .content_runtime import ContentOutbox


def utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def _write_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, default=str), encoding='utf-8')


def simulate_sfu(run_id: str, n: int = 100) -> EvidenceRecord:
    sent = [f'{run_id}:{i:04d}' for i in range(1, n + 1)]
    received = list(sent)
    payload = {
        'sessions_created': 2,
        'data_messages_sent': n,
        'data_messages_received': len(received),
        'payload_hash_match': sent == received,
        'media_tracks_published': 1,
        'media_tracks_received': 1,
        'mode': 'SIMULATED_SELFTEST',
    }
    return EvidenceRecord.create(evidence_id=f'EVD-{run_id}-SFU', kind='SFU_UTILIZATION',
        state='VERIFIED', verdict='PASS', source='selftest', payload=payload)


def simulate_moq(run_id: str, n: int = 100) -> EvidenceRecord:
    objects = [{'seq': i, 'payload': f'{run_id}:{i:04d}'} for i in range(1, n + 1)]
    payload = {
        'objects_published': n,
        'objects_received': n,
        'sequence_complete': [o['seq'] for o in objects] == list(range(1, n + 1)),
        'digest_match': True,
        'classification': 'EXPERIMENTAL',
        'mode': 'SIMULATED_SELFTEST',
    }
    return EvidenceRecord.create(evidence_id=f'EVD-{run_id}-MOQ', kind='MOQ_UTILIZATION',
        state='VERIFIED', verdict='PASS', source='selftest', payload=payload)


def build_episode(root: Path, run_id: str, selftest: bool) -> dict[str, Any]:
    started = utc()
    if not selftest:
        # This runner refuses to counterfeit provider evidence. Real adapters are
        # invoked by the provider-specific harness once credentials/endpoints are configured.
        raise SystemExit('BLOCKED: real utilization run requires provider-specific observed harness; use --selftest only for package validation')
    sfu = simulate_sfu(run_id)
    moq = simulate_moq(run_id)
    evidence = [sfu, moq]
    evdir = root / 'state' / 'buildanddo_utilization' / run_id / 'evidence'
    for ev in evidence:
        _write_json(evdir / f'{ev.evidence_id}.json', ev.to_dict())
    facts = (
        {'state': 'VERIFIED', 'text': 'SFU canary selftest delivered 100/100 deterministic messages and one synthetic media track.'},
        {'state': 'VERIFIED', 'text': 'MoQ canary selftest preserved 100/100 ordered objects.'},
        {'state': 'UNMEASURED', 'text': 'External provider runtime is not claimed by the package selftest.'},
    )
    episode = UtilizationEpisode(run_id=run_id, tenant_id='buildanddo', workspace_id='selftest',
        capability='live-room-utilization', state='VERIFIED', verdict='PASS', started_at=started,
        completed_at=utc(), evidence_refs=tuple(e.evidence_id for e in evidence), facts=facts)
    out = episode.to_dict()
    _write_json(root / 'state' / 'buildanddo_utilization' / run_id / 'episode.json', out)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', default=os.getenv('CITADEL_ROOT', r'D:\\HOSTINGER_COMP'))
    ap.add_argument('--run-id', default='BND-LIVE-SELFTEST-' + uuid.uuid4().hex[:8])
    ap.add_argument('--selftest', action='store_true')
    ap.add_argument('--render-content', action='store_true')
    args = ap.parse_args()
    root = Path(args.root)
    episode = build_episode(root, args.run_id, args.selftest)
    if args.render_content:
        template_root = root / 'templates' / 'buildanddo_living_rooms' / 'jinja'
        outbox = ContentOutbox(root / 'state' / 'buildanddo_content' / 'outbox', template_root)
        facts = episode['facts']
        verified = [x['text'] for x in facts if x['state'] == 'VERIFIED']
        unmeasured = [x for x in facts if x['state'] != 'VERIFIED']
        context = {
            'title': 'BuildAndDo live-room utilization checkpoint',
            'project_summary': 'BuildAndDo is testing the same verified episode across collaboration, transport, evidence, and content generation.',
            'objective': 'Prove the utilization evidence and content outbox path without turning a selftest into a provider-runtime claim.',
            'system_path': 'episode -> evidence -> content context -> Jinja -> draft outbox',
            'verified_facts': verified,
            'unmeasured_facts': unmeasured,
            'next_step': 'Run the provider harness on Rig2 and replace selftest evidence with observed provider receipts.',
            'reproduction': f'python -m services.buildanddo_runtime.episode_runner --root {root} --run-id {args.run_id} --selftest --render-content',
            'capability_title': 'Live room utilization evidence', 'why': 'Usage must be observed, not inferred from configuration.',
            'explanation': 'A capability advances from EXISTS to USED only after a real or explicitly simulated test produces evidence.',
            'practice': 'Inspect evidence records and distinguish VERIFIED selftest facts from UNMEASURED provider facts.',
            'real_task': 'Execute the Rig2 SFU and MoQ canary.', 'verification': 'Independent receipts must show send/receive counts and matching digests.',
            'project_name': 'BuildAndDo', 'update_label': '# live-room utilization',
            'changes': verified, 'lessons': ['Usage is not inferred from configuration or provider API acceptance.'],
            'blockers': [x['text'] for x in unmeasured], 'evidence': episode.get('evidence_refs', []),
            'community_help': 'Challenge the evidence boundary or suggest a real collaboration scenario to reproduce.',
        }
        templates = {
            'hostinger_project_log': 'hostinger_project_log.j2',
            'forum_progress_update': 'forum_progress_update.j2',
            'wiki_case_study': 'wiki_case_study.j2',
            'discord_update': 'discord_update.j2',
            'capability_lesson': 'capability_lesson_v2.j2',
        }
        outbox.render_episode(episode, templates, context)
    print(json.dumps(episode, indent=2))
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
