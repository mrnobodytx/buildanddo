from __future__ import annotations
from pathlib import Path
from datetime import datetime, timezone
from typing import Any
import json

try:
    from jinja2 import Environment, FileSystemLoader, StrictUndefined
except Exception:  # pragma: no cover
    Environment = None


def _utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def _fallback_render(template_text: str, context: dict[str, Any]) -> str:
    # Deliberately limited fallback for environments without Jinja2. Operational
    # runs should install Jinja2; selftests can still prove outbox mechanics.
    out = template_text
    for k, v in context.items():
        if isinstance(v, (str, int, float)):
            out = out.replace('{{ ' + k + ' }}', str(v))
    return out


class ContentOutbox:
    def __init__(self, root: Path, templates: Path):
        self.root = root
        self.templates = templates

    def render_episode(self, episode: dict[str, Any], template_map: dict[str, str], context: dict[str, Any]) -> dict[str, Any]:
        run_id = episode['run_id']
        out = self.root / run_id
        out.mkdir(parents=True, exist_ok=True)
        merged = dict(context)
        merged.setdefault('run_id', run_id)
        merged.setdefault('generated_at', _utc())
        merged.setdefault('evidence_count', len(episode.get('evidence_refs', [])))
        merged.setdefault('evidence_refs', episode.get('evidence_refs', []))
        generated = []
        env = Environment(loader=FileSystemLoader(str(self.templates)), undefined=StrictUndefined, autoescape=False) if Environment else None
        for name, filename in template_map.items():
            target = out / f'{name}.md'
            if env:
                text = env.get_template(filename).render(**merged)
            else:
                text = _fallback_render((self.templates / filename).read_text(encoding='utf-8'), merged)
            target.write_text(text.rstrip() + '\n', encoding='utf-8')
            generated.append(str(target))
        (out / 'context.json').write_text(json.dumps(merged, indent=2, default=str), encoding='utf-8')
        (out / 'episode.json').write_text(json.dumps(episode, indent=2, default=str), encoding='utf-8')
        receipt = {
            'run_id': run_id,
            'state': 'DRAFT',
            'published': False,
            'generated_at': _utc(),
            'files': generated,
            'evidence_refs': episode.get('evidence_refs', []),
        }
        (out / 'generation_receipt.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
        return receipt
