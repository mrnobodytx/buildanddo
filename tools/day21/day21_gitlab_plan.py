#!/usr/bin/env python3
# # --- CGRF Header ------------------------------------------------
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-DAY21-CLOSURE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-DAY21-CLOSURE-001
# Seat:        CLA-INSTALLER
# Owner:       Citadel Nexus Inc.
# Intent:      Close Hostinger Day-21 runtime evidence and submission packaging gaps without granting deployment authority.
# ----------------------------------------------------------------
"""Render or explicitly apply the Day-21 GitLab milestone/issue plan.

Default operation is local/read-only. `--apply` is a remote GitLab mutation and
requires A3+, an AAXP reference, a human approval reference, and the explicit
CITADEL_ALLOW_REMOTE_WRITES=1 opt-in. The installer never calls --apply.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

AUTHORITY = {f"A{i}": i for i in range(6)}


def load(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if value.get("schema") != "buildanddo.day21-gitlab-plan/v1":
        raise ValueError("unsupported GitLab work-item plan")
    if not isinstance(value.get("issues"), list) or not value["issues"]:
        raise ValueError("GitLab work-item plan has no issues")
    return value


def request(method: str, url: str, token: str, body: dict[str, Any] | None = None) -> Any:
    data = None if body is None else urllib.parse.urlencode(body, doseq=True).encode()
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={"PRIVATE-TOKEN": token, "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        raw = response.read().decode("utf-8")
        return json.loads(raw) if raw.strip() else None


def render(plan: dict[str, Any]) -> str:
    milestone = plan["milestone"]
    lines = [
        f"MILESTONE  {milestone['title']}",
        f"DUE        {milestone['due_date']}",
        "",
        "ISSUES",
    ]
    for item in plan["issues"]:
        deps = ",".join(item.get("depends_on") or []) or "-"
        lines.append(f"  {item['key']:20} deps={deps:40} {item['title']}")
    lines.extend([
        "",
        "REMOTE     0 writes in render mode",
        "APPLY      requires A3 + AAXP + human approval + CITADEL_ALLOW_REMOTE_WRITES=1",
    ])
    return "\n".join(lines)


def apply(plan: dict[str, Any], *, base: str, project_id: str, token: str) -> dict[str, Any]:
    api = base.rstrip("/") + "/api/v4"
    project = urllib.parse.quote(str(project_id), safe="")
    milestone_spec = plan["milestone"]
    existing = request("GET", f"{api}/projects/{project}/milestones?state=active&per_page=100", token)
    milestone = next((m for m in existing if m.get("title") == milestone_spec["title"]), None)
    if milestone is None:
        milestone = request(
            "POST",
            f"{api}/projects/{project}/milestones",
            token,
            {
                "title": milestone_spec["title"],
                "description": milestone_spec["description"],
                "due_date": milestone_spec["due_date"],
            },
        )
    created, reused = [], []
    for item in plan["issues"]:
        marker = f"Day21-Key: {item['key']}"
        query = urllib.parse.quote(marker)
        matches = request("GET", f"{api}/projects/{project}/issues?search={query}&in=description&scope=all&per_page=100", token)
        found = next((issue for issue in matches if marker in (issue.get("description") or "")), None)
        if found:
            reused.append({"key": item["key"], "iid": found.get("iid")})
            continue
        description = [
            marker,
            "",
            f"Owner role: {item['owner_role']}",
            f"Depends on: {', '.join(item.get('depends_on') or []) or 'none'}",
            "",
            "Acceptance:",
            *[f"- [ ] {value}" for value in item["acceptance"]],
            "",
            "CGRF/TEVV rule: evidence, not assertion. A completed issue is not deployment or submission authority.",
        ]
        issue = request(
            "POST",
            f"{api}/projects/{project}/issues",
            token,
            {
                "title": item["title"],
                "description": "\n".join(description),
                "labels": ",".join(item["labels"]),
                "milestone_id": milestone["id"],
            },
        )
        created.append({"key": item["key"], "iid": issue.get("iid")})
    return {
        "schema": "buildanddo.day21-gitlab-apply/v1",
        "milestone": {"id": milestone.get("id"), "title": milestone.get("title")},
        "created": created,
        "reused": reused,
    }


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--plan", type=Path, default=Path("config/day21/gitlab_work_items.json"))
    p.add_argument("--json", action="store_true")
    p.add_argument("--apply", action="store_true")
    p.add_argument("--gitlab-base", default=os.environ.get("GITLAB_BASE_URL", "https://gitlab.citadel-nexus.com"))
    p.add_argument("--project-id", default=os.environ.get("GITLAB_PROJECT_ID", ""))
    p.add_argument("--token-env", default="GITLAB_ADMIN_TOKEN")
    p.add_argument("--authority", default="A0", choices=sorted(AUTHORITY))
    p.add_argument("--aaxp-ref")
    p.add_argument("--human-approval-ref")
    args = p.parse_args(argv)
    try:
        plan = load(args.plan)
        if not args.apply:
            print(json.dumps(plan, indent=2, sort_keys=True) if args.json else render(plan))
            return 0
        if os.environ.get("CITADEL_ALLOW_REMOTE_WRITES") != "1":
            raise PermissionError("remote writes require CITADEL_ALLOW_REMOTE_WRITES=1")
        if AUTHORITY[args.authority] < AUTHORITY["A3"]:
            raise PermissionError("GitLab mutation requires A3 or higher")
        if not args.aaxp_ref:
            raise PermissionError("GitLab mutation requires --aaxp-ref")
        if not args.human_approval_ref:
            raise PermissionError("Day-21 work-item mutation requires --human-approval-ref")
        if not args.project_id:
            raise PermissionError("BuildAndDo GitLab project ID must be supplied explicitly")
        token = os.environ.get(args.token_env)
        if not token:
            raise PermissionError(f"missing token env: {args.token_env}")
        result = apply(plan, base=args.gitlab_base, project_id=args.project_id, token=token)
        result.update({
            "authority": args.authority,
            "aaxp_ref": args.aaxp_ref,
            "human_approval_ref": args.human_approval_ref,
            "remote_writes": len(result["created"]) + (1 if result["milestone"] else 0),
        })
        print(json.dumps(result, indent=2, sort_keys=True))
        return 0
    except (OSError, ValueError, PermissionError, urllib.error.URLError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
