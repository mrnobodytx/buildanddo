#!/usr/bin/env python3
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/ci/agent_context.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-AGENTCTX-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     AGENTS.md, .bits/context.md, .bits/srs_registry.yml
# EnumType:    Service
# EnumEdges:   CONSUMES .bits/srs_registry.yml; PRODUCES .bits/context.lock.json;
#              GATES bits/SRS-* branches; VALIDATES .github/workflows
# Intent:      Give every agent turn the same measured view of the repo instead of a
#              hand-written brief that silently goes stale.
# ───────────────────────────────────────────────────────────────
"""Rehydrate agent working context from the repository itself.

An agent starting a turn runs this and gets ground truth: which pipelines exist,
which check scripts are actually wired into them, what the test surface really
is, which governance files are present, and which SRS specs are open. Findings
are derived, never hand-maintained, so the brief cannot drift from the repo.

    python scripts/ci/agent_context.py            # briefing for a human or agent
    python scripts/ci/agent_context.py --json     # same inventory, machine-readable
    python scripts/ci/agent_context.py --write    # refresh .bits/context.lock.json
    python scripts/ci/agent_context.py --check    # CI gate: lock must match reality

Standard library only, matching the rest of scripts/ci.
"""
from __future__ import annotations
import argparse, datetime as dt, json, re, subprocess, sys
from pathlib import Path

LOCK_PATH = ".bits/context.lock.json"
REGISTRY_PATH = ".bits/srs_registry.yml"
GOVERNANCE_FILES = [
    "AGENTS.md",
    "CLAUDE.md",
    "CONTRIBUTING.md",
    "README.md",
    ".github/CODEOWNERS",
    ".github/PULL_REQUEST_TEMPLATE.md",
    ".buildanddo/public/path-policy.json",
    ".bits/context.md",
    ".bits/srs_registry.yml",
]
SCRIPT_RE = re.compile(r"(?:scripts|services)/[A-Za-z0-9_./-]+\.py")
NPM_RUN_RE = re.compile(r"npm run ([A-Za-z0-9:_-]+)")
USES_LOCAL_RE = re.compile(r"uses:\s*\./(\.github/actions/[A-Za-z0-9_-]+)")
TRIGGERS = ["pull_request", "push", "workflow_run", "workflow_dispatch", "schedule", "release"]
TEST_RUNNERS = ["vitest", "jest", "playwright", "cypress", "mocha", "ava", "node --test"]


def git_files(root: Path) -> list[str]:
    p = subprocess.run(["git", "-C", str(root), "ls-files"], text=True, capture_output=True)
    if p.returncode != 0:
        return []
    return [x.replace("\\", "/") for x in p.stdout.splitlines() if x.strip()]


def read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def parse_registry(path: Path) -> tuple[list[dict], str | None]:
    """Parse the strict SRS registry subset: a top-level `srs:` list of flat mappings.

    A deliberately small reader keeps scripts/ci dependency-free; the format is
    documented in .bits/srs_registry.yml itself and validated here.
    """
    if not path.is_file():
        return [], "registry missing"
    entries: list[dict] = []
    current: dict | None = None
    in_list = False
    for raw in read(path).splitlines():
        line = raw.split(" #")[0].rstrip()
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if re.match(r"^srs:\s*$", line):
            in_list = True
            continue
        if not in_list:
            continue
        item = re.match(r"^\s*-\s*([A-Za-z_]+):\s*(.*)$", line)
        if item:
            if current:
                entries.append(current)
            current = {item.group(1): item.group(2).strip().strip('"')}
            continue
        field = re.match(r"^\s+([A-Za-z_]+):\s*(.*)$", line)
        if field and current is not None:
            current[field.group(1)] = field.group(2).strip().strip('"')
    if current:
        entries.append(current)
    return entries, None


def collect_pipelines(root: Path) -> list[dict]:
    pipelines = []
    paths = sorted(root.glob(".github/workflows/*.yml")) + sorted(root.glob(".github/actions/*/action.yml"))
    for path in paths:
        text = read(path)
        name = ""
        for line in text.splitlines():
            m = re.match(r"^name:\s*(.+)$", line)
            if m:
                name = m.group(1).strip().strip("'\"")
                break
        pipelines.append({
            "file": path.relative_to(root).as_posix(),
            "name": name or path.stem,
            "kind": "action" if path.name == "action.yml" else "workflow",
            "triggers": sorted({t for t in TRIGGERS if re.search(rf"^\s+{t}:", text, re.M)}),
            "scripts": sorted(set(SCRIPT_RE.findall(text))),
            "npm_scripts": sorted(set(NPM_RUN_RE.findall(text))),
            "local_actions": sorted(set(USES_LOCAL_RE.findall(text))),
        })
    return pipelines


def collect_gates(root: Path, files: list[str], pipelines: list[dict]) -> list[dict]:
    """A gate is a check script. Wired means a workflow or composite action runs it."""
    candidates = [f for f in files if f.startswith("scripts/ci/") and f.endswith(".py")]
    candidates += [f for f in files if f.endswith("run_all_tests.py")]

    workflow_refs: set[str] = set()
    action_refs: set[str] = set()
    for p in pipelines:
        (action_refs if p["kind"] == "action" else workflow_refs).update(p["scripts"])

    # A composite action only runs when a workflow calls it.
    reachable_actions = {a for p in pipelines if p["kind"] == "workflow" for a in p["local_actions"]}
    for p in pipelines:
        if p["kind"] == "action" and any(p["file"].startswith(a) for a in reachable_actions):
            workflow_refs.update(p["scripts"])

    other_sources = {f: read(root / f) for f in files if f.endswith(".py") and f not in candidates}

    gates = []
    for gate in sorted(set(candidates)):
        used_by = sorted(src for src, text in other_sources.items() if Path(gate).name in text)
        gates.append({
            "path": gate,
            "wired_into_ci": gate in workflow_refs,
            "referenced_by": used_by,
        })
    return gates


def collect_tests(root: Path, files: list[str]) -> dict:
    runners: list[str] = []
    scripts: dict[str, str] = {}
    for manifest in [f for f in files if f.endswith("package.json")]:
        data = read(root / manifest)
        try:
            parsed = json.loads(data)
        except json.JSONDecodeError:
            continue
        for name, command in (parsed.get("scripts") or {}).items():
            scripts[f"{manifest}:{name}"] = command
            runners += [r for r in TEST_RUNNERS if r in command]
        for dep in list((parsed.get("devDependencies") or {})) + list((parsed.get("dependencies") or {})):
            runners += [r for r in TEST_RUNNERS if r == dep]
    test_files = [f for f in files if re.search(r"\.(test|spec)\.[jt]sx?$", f)]
    python_suites = sorted(f for f in files if re.search(r"/selftest[^/]*\.py$|/run_all_tests\.py$", f))
    return {
        "js_runners": sorted(set(runners)),
        "js_test_files": len(test_files),
        "js_test_script": any(k.endswith(":test") for k in scripts),
        "python_suites": len(python_suites),
        "python_suite_entrypoints": [f for f in python_suites if f.endswith("run_all_tests.py")],
        "junit_configured": any("junit" in c.lower() for c in scripts.values()),
    }


def collect_findings(root: Path, inventory: dict, registry: list[dict]) -> list[dict]:
    findings: list[dict] = []

    def add(severity: str, area: str, statement: str, evidence: str, srs: str = "") -> None:
        findings.append({"severity": severity, "area": area, "statement": statement, "evidence": evidence, "srs": srs})

    for name, present in inventory["governance"]["files"].items():
        if not present:
            srs = "SRS-BUILDANDDO-AGENTCTX-001" if name.startswith(".bits/") else ""
            add("medium", "governance", f"{name} is declared by repo convention but absent",
                "AGENTS.md and .bits/context.md name it as required reading", srs)

    for gate in inventory["gates"]:
        if gate["wired_into_ci"]:
            continue
        where = ", ".join(gate["referenced_by"]) or "nothing in this repo"
        srs = "SRS-BUILDANDDO-EVIDENCE-CI-001" if gate["path"].endswith("run_all_tests.py") else ""
        add("high", "ci", f"{gate['path']} is never executed by GitHub Actions",
            f"referenced by: {where}", srs)

    tests = inventory["tests"]
    if not tests["js_runners"]:
        add("high", "tests", "the web app has no JavaScript test runner",
            f"{inventory['repo']['web_source_files']} source files under apps/web/src, 0 test files",
            "SRS-BUILDANDDO-TEST-001")
    if not tests["junit_configured"]:
        add("medium", "observability", "no JUnit output is produced, so Datadog test visibility stays empty",
            "the CI report action uploads reports/junit/*.xml; nothing writes there",
            "SRS-BUILDANDDO-TEST-001")

    env_example = read(root / ".env.example")
    declared_rum = sorted(set(re.findall(r"^(VITE_DD_[A-Z_]+)=", env_example, re.M)))
    if declared_rum:
        build_text = {f: read(root / f) for f in inventory["repo"]["build_scripts"]}
        unset = [v for v in declared_rum if not any(v in text for text in build_text.values())]
        if unset:
            add("medium", "observability",
                f"RUM variables {', '.join(unset)} are documented but no tracked build path sets them",
                ".env.example declares them; no build or deploy script writes them, so RUM reports them empty",
                "SRS-BUILDANDDO-RELEASE-TAG-001")

    registered = {e.get("code", "") for e in registry}
    for entry in registry:
        spec = entry.get("spec", "")
        if spec and not (root / spec).is_file():
            add("high", "governance", f"{entry.get('code')} is registered without a spec file",
                f"{spec} does not exist", entry.get("code", ""))
    for spec_file in sorted(root.glob(".bits/srs/*.md")):
        code = spec_file.stem
        if code not in registered:
            add("high", "governance", f"{code} has a spec but is not in the registry",
                f"{spec_file.relative_to(root).as_posix()} is unregistered, so no branch may claim it")

    queued = [p for p in sorted((root / ".bits/queue").glob("*.md")) if p.stem != "TEMPLATE"]
    if not queued:
        add("info", "governance", "no dispatch is queued",
            ".bits/queue holds only templates; agents must ask for a dispatch ID before coding")

    order = {"high": 0, "medium": 1, "info": 2}
    return sorted(findings, key=lambda f: (order.get(f["severity"], 3), f["area"], f["statement"]))


def build_inventory(root: Path) -> dict:
    files = git_files(root)
    pipelines = collect_pipelines(root)
    registry, _ = parse_registry(root / REGISTRY_PATH)

    build_scripts = [f for f in files if f.startswith("scripts/deploy/") or f.startswith("apps/web/tools/")]
    build_scripts += [f for f in files if f.endswith("vite.config.js")]

    inventory = {
        "schema_version": 1,
        "repo": {
            "tracked_files": len(files),
            "apps": sorted({f.split("/")[1] for f in files if f.startswith("apps/") and "/" in f[5:]}),
            "services": sorted({f.split("/")[1] for f in files if f.startswith("services/") and "/" in f[9:]}),
            "web_source_files": len([f for f in files if f.startswith("apps/web/src/")]),
            "python_files": len([f for f in files if f.endswith(".py")]),
            "migrations": len([f for f in files if "/pb_migrations/" in f]),
            "build_scripts": sorted(set(build_scripts)),
        },
        "governance": {
            "files": {name: (root / name).is_file() for name in GOVERNANCE_FILES},
            "srs": [
                {k: entry.get(k, "") for k in ("code", "title", "status", "risk", "spec")}
                for entry in sorted(registry, key=lambda e: e.get("code", ""))
            ],
        },
        "pipelines": pipelines,
        "gates": collect_gates(root, files, pipelines),
        "tests": collect_tests(root, files),
    }
    inventory["findings"] = collect_findings(root, inventory, registry)
    open_srs = [s for s in inventory["governance"]["srs"] if s.get("status") not in {"delivered", "withdrawn"}]
    inventory["summary"] = {
        "findings": len(inventory["findings"]),
        "findings_high": len([f for f in inventory["findings"] if f["severity"] == "high"]),
        "unwired_gates": len([g for g in inventory["gates"] if not g["wired_into_ci"]]),
        "srs_total": len(inventory["governance"]["srs"]),
        "srs_open": len(open_srs),
        "pipelines": len(inventory["pipelines"]),
    }
    return inventory


def briefing(inventory: dict) -> str:
    s = inventory["summary"]
    lines = [
        "# BuildAndDo agent context",
        "",
        f"{s['pipelines']} pipelines, {s['unwired_gates']} unwired gates, "
        f"{s['srs_open']}/{s['srs_total']} SRS open, {s['findings']} findings "
        f"({s['findings_high']} high).",
        "",
        "Read .bits/context.md for the durable brief and AGENTS.md for the rules.",
        "A dispatch ID and a registered SRS code are required before any code change.",
        "",
        "## Pipelines",
    ]
    for p in inventory["pipelines"]:
        detail = ",".join(p["triggers"]) or p["kind"]
        lines.append(f"- `{p['file']}` ({detail})")

    lines += ["", "## Gates"]
    for g in inventory["gates"]:
        state = "wired into CI" if g["wired_into_ci"] else "NOT run by CI"
        extra = f" (used by {', '.join(g['referenced_by'])})" if g["referenced_by"] and not g["wired_into_ci"] else ""
        lines.append(f"- `{g['path']}` - {state}{extra}")

    t = inventory["tests"]
    lines += [
        "",
        "## Test surface",
        f"- JavaScript runners: {', '.join(t['js_runners']) or 'none'} ({t['js_test_files']} test files)",
        f"- Python suites: {t['python_suites']} (entrypoints: {', '.join(t['python_suite_entrypoints']) or 'none'})",
        f"- JUnit output configured: {'yes' if t['junit_configured'] else 'no'}",
        "",
        "## Open SRS",
    ]
    for entry in inventory["governance"]["srs"]:
        lines.append(f"- {entry['code']} [{entry.get('status','?')}, {entry.get('risk','?')}] {entry.get('title','')}")
    if not inventory["governance"]["srs"]:
        lines.append("- none registered")

    lines += ["", "## Findings"]
    for f in inventory["findings"]:
        srs = f" -> {f['srs']}" if f["srs"] else ""
        lines.append(f"- [{f['severity']}] {f['area']}: {f['statement']} ({f['evidence']}){srs}")
    if not inventory["findings"]:
        lines.append("- none")
    lines.append("")
    return "\n".join(lines)


def comparable(lock: dict) -> dict:
    return {k: v for k, v in lock.items() if k != "generated_at"}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--root", default=".")
    ap.add_argument("--json", action="store_true", help="print the inventory instead of the briefing")
    ap.add_argument("--write", action="store_true", help="refresh the committed context lock")
    ap.add_argument("--check", action="store_true", help="fail when the committed lock is stale")
    args = ap.parse_args()

    root = Path(args.root).resolve()
    inventory = build_inventory(root)
    lock_path = root / LOCK_PATH

    if args.check:
        if not lock_path.is_file():
            print(f"FAIL: {LOCK_PATH} is missing. Run: python scripts/ci/agent_context.py --write")
            return 1
        try:
            committed = json.loads(lock_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            print(f"FAIL: {LOCK_PATH} is not valid JSON ({exc})")
            return 1
        if comparable(committed) != comparable(inventory):
            print(f"FAIL: {LOCK_PATH} no longer matches the repository.")
            print("Run: python scripts/ci/agent_context.py --write, then commit the result.")
            before, after = comparable(committed), comparable(inventory)
            for key in sorted(set(before) | set(after)):
                if before.get(key) != after.get(key):
                    print(f"  changed section: {key}")
            return 1
        print(f"PASS: {LOCK_PATH} matches the repository "
              f"({inventory['summary']['findings']} findings, {inventory['summary']['unwired_gates']} unwired gates).")
        return 0

    if args.write:
        payload = {"generated_at": dt.datetime.now(dt.timezone.utc).isoformat(), **inventory}
        lock_path.parent.mkdir(parents=True, exist_ok=True)
        lock_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(f"wrote {LOCK_PATH}: {inventory['summary']['findings']} findings, "
              f"{inventory['summary']['unwired_gates']} unwired gates", file=sys.stderr)

    print(json.dumps(inventory, indent=2, sort_keys=True) if args.json else briefing(inventory))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
