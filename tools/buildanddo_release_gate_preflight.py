#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, os, shutil, subprocess, sys
from datetime import datetime, timezone
from pathlib import Path


def utcnow(): return datetime.now(timezone.utc).isoformat()


def run(argv, cwd, timeout=1200):
    try:
        cp = subprocess.run(argv, cwd=str(cwd), text=True, capture_output=True, encoding="utf-8", errors="replace", timeout=timeout, check=False, shell=False)
        return {"state":"PASS" if cp.returncode == 0 else "FAIL", "returncode":cp.returncode, "argv":argv, "stdout_tail":cp.stdout[-10000:], "stderr_tail":cp.stderr[-10000:]}
    except Exception as exc:
        return {"state":"FAIL", "returncode":-1, "argv":argv, "stdout_tail":"", "stderr_tail":f"{type(exc).__name__}: {exc}"}


def command_path(*names):
    for name in names:
        found = shutil.which(name)
        if found:
            return found
    return None


def windows_batch_argv(executable, *args):
    if os.name == "nt" and executable and executable.lower().endswith((".cmd", ".bat")):
        comspec = os.environ.get("COMSPEC") or command_path("cmd.exe", "cmd") or "cmd.exe"
        return [comspec, "/d", "/c", executable, *args]
    return [executable, *args]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=".")
    ap.add_argument("--receipt")
    args = ap.parse_args()
    repo = Path(args.repo).resolve()
    py = sys.executable
    gates = []

    def gate(name, argv):
        result = run(argv, repo)
        result["name"] = name
        gates.append(result)
        print(f"{name:<34} {result['state']}")
        if result["state"] != "PASS":
            tail = (result["stderr_tail"] or result["stdout_tail"])[-3000:]
            if tail:
                print(tail)
        return result

    # tests/upgrade is not a Python package. Discovery runs the checked-in unittest
    # file without inventing package import semantics.
    gate("policy_python_tests", [
        py, "-m", "unittest", "discover",
        "-s", "tests/upgrade", "-p", "test_policy_intelligence.py", "-v",
    ])
    gate("policy_python_checker", [py, "tests/upgrade/check_policy_intelligence.py"])

    node = command_path("node.exe", "node")
    if node:
        gate("policy_node_cross_runtime", [node, "--test", "tests/upgrade/policy-intelligence.test.mjs"])
    else:
        gates.append({"name":"policy_node_cross_runtime", "state":"FAIL", "returncode":-1, "argv":[], "stdout_tail":"", "stderr_tail":"node executable not found on PATH"})
        print(f"{'policy_node_cross_runtime':<34} FAIL")

    # The previous helper supplied both apps/research/policy and apps. Those overlap,
    # so mypy discovers apps.research.policy.__main__ twice. Scan the policy root once.
    policy_root = repo / "apps/research/policy"
    if policy_root.exists():
        gate("mypy_strict", [
            py, "-m", "mypy", "--strict", "--follow-imports=silent",
            "--explicit-package-bases", "apps/research/policy",
        ])
    else:
        gates.append({"name":"mypy_strict", "state":"FAIL", "returncode":-1, "argv":[], "stdout_tail":"", "stderr_tail":"expected apps/research/policy tree missing"})
        print(f"{'mypy_strict':<34} FAIL")

    ruff_targets = [p for p in [
        "apps/research/policy",
        "tests/upgrade/test_policy_intelligence.py",
        "tests/upgrade/check_policy_intelligence.py",
    ] if (repo / p).exists()]
    if ruff_targets:
        gate("ruff", [py, "-m", "ruff", "check", *ruff_targets])
    else:
        gates.append({"name":"ruff", "state":"FAIL", "returncode":-1, "argv":[], "stdout_tail":"", "stderr_tail":"expected ruff targets missing"})
        print(f"{'ruff':<34} FAIL")

    npm = command_path("npm.cmd", "npm.exe", "npm")
    if npm:
        gate("policy_page_vitest", windows_batch_argv(
            npm, "--prefix", "apps/web", "test", "--", "--run",
            "src/pages/workspace/__tests__/PolicyPage.test.jsx",
        ))
    else:
        gates.append({"name":"policy_page_vitest", "state":"FAIL", "returncode":-1, "argv":[], "stdout_tail":"", "stderr_tail":"npm executable not found on PATH"})
        print(f"{'policy_page_vitest':<34} FAIL")

    state = "PASS" if all(g["state"] == "PASS" for g in gates) else "HOLD"
    receipt = {
        "schema":"buildanddo.release-gate-preflight/v1.1",
        "state":state,
        "repo":str(repo),
        "python":py,
        "node":node,
        "npm":npm,
        "verified_at":utcnow(),
        "gates":gates,
        "external_writes":0,
    }
    out = Path(args.receipt).resolve() if args.receipt else repo / "reports" / "release_gate_preflight.latest.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print("RECEIPT", out)
    print("STATE", state)
    return 0 if state == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
