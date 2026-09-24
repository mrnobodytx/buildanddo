#!/usr/bin/env python3
# ─── CGRF Header ─────────────────────────────────────────────────────────────
# File:        scripts/ci/migration_preflight.py
# Stage:       09_VERIFY
# SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
# CAPS:        B
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     apps/pocketbase/pb_migrations/*.js
# EnumType:    Gate
# EnumEdges:   REFUSES a migration set that cannot start a service, before it reaches a live one
# Intent:      Apply pending migrations to a THROWAWAY COPY of the live database and refuse the
#              deploy if the service will not come up - because on 0.39.8 a single bad migration
#              does not fail the migration, it aborts startup, and the whole backend is gone.
# ─────────────────────────────────────────────────────────────────────────────
"""migration_preflight.py - find out on a copy, not on the live service.

RUNS ON THE POCKETBASE HOST (the migrations, the binary and the database all live there).

    python3 migration_preflight.py --dir /opt/buildanddo-pocketbase-staging [--json]
    python3 migration_preflight.py --dir ... --selftest   # prove this gate can FAIL

WHAT IT ACTUALLY TESTS. Not "does the JS parse" - whether a PocketBase built from the CURRENT
database plus the PENDING migrations will START. That is the failure that matters: on 0.39.8 one
bad migration aborts the whole service at boot, so the blast radius of a typo is the backend, not
the migration.

MEASURED, and the reason this exists: pushing twelve migrations at once took staging down on
2026-09-20. It came back quickly only because a copy of data.db had been taken by hand first. This
makes that copy the point rather than the luck.

HOW IT WORKS.
  1. Read the applied set from _migrations in the live database (never write to it).
  2. Diff against the .js files on disk - PocketBase applies by SET DIFFERENCE ON FILENAME, so a
     lower-numbered file added later is still pending and will run out of order. That is why the
     diff is by name and not by comparing the highest number.
  3. Copy the database to a scratch directory. Nothing after this point touches live data.
  4. Start the real binary against the copy with a short deadline and read its exit.
  5. Report which migrations were pending and whether the service came up.

IT REFUSES ON UNKNOWNS. If the binary is missing, the database cannot be copied, or the applied set
cannot be read, the answer is UNMEASURED and the exit code is non-zero. A preflight that passes
because it could not look is worse than no preflight - it issues a receipt.

--selftest PLANTS A BROKEN MIGRATION in the scratch copy and requires this gate to catch it. A gate
that has only ever been seen to pass has not been tested.
"""
from __future__ import annotations
import argparse
import json
import os
import pathlib
import shutil
import sqlite3
import subprocess
import tempfile
import threading
import time

BROKEN = """/// preflight selftest - deliberately invalid, MUST abort startup.
migrate((app) => {
    throw new Error("preflight selftest: this migration is supposed to fail");
}, (app) => {});
"""


def applied_set(db_path):
    """Which migrations does the live database already consider applied? Read only."""
    try:
        con = sqlite3.connect("file:%s?mode=ro" % db_path, uri=True, timeout=10)
        try:
            rows = con.execute("SELECT file FROM _migrations").fetchall()
        finally:
            con.close()
        return sorted(r[0] for r in rows), None
    except Exception as exc:  # noqa: BLE001
        return None, "%s: %s" % (type(exc).__name__, str(exc)[:120])


SERVING = "Server started at"


def start_once(binary, data_dir, hooks, migrations, seconds=25):
    """Start PocketBase against a scratch data dir and see whether it REACHES SERVING.

    MEASURED 2026-09-21, and the reason this no longer reports mere survival. Preflighting the
    promotion of staging to production meant 33 pending migrations instead of one. They were still
    applying when the deadline expired, and the old check - has the process exited yet - called
    that STAYED_UP and returned PASS. It returned PASS on the SELFTEST too, where a deliberately
    broken migration sits at 9999999999 and the run had simply not got that far.

    A gate that passes its own negative control is measuring nothing, and this one would have
    cleared a production deploy on the strength of it. Startup now means the serving line appeared;
    running out of time before that is TIMEOUT, which is not a pass.
    """
    port = 8099
    cmd = [binary, "serve", "--http", "127.0.0.1:%d" % port, "--dir", data_dir]
    if hooks:
        cmd += ["--hooksDir", hooks]
    if migrations:
        cmd += ["--migrationsDir", migrations]
    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    except Exception as exc:  # noqa: BLE001
        return {"state": "UNMEASURED", "reason": "could not exec: %s" % type(exc).__name__}

    # Drain the pipe on a thread. A long migration batch writes more than the pipe buffer holds,
    # and a full pipe would block the very process we are timing.
    lines = []
    pump = threading.Thread(target=lambda: lines.extend(iter(proc.stdout.readline, "")),
                            daemon=True)
    pump.start()

    def stop():
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except Exception:  # noqa: BLE001
            proc.kill()
        pump.join(timeout=5)

    deadline = time.time() + seconds
    while time.time() < deadline:
        if any(SERVING in line for line in list(lines)):
            stop()
            return {"state": "STARTED", "output": "".join(lines)[-900:]}
        if proc.poll() is not None:
            pump.join(timeout=5)
            return {"state": "DIED", "exit_code": proc.returncode,
                    "output": "".join(lines)[-1200:]}
        time.sleep(0.5)
    stop()
    return {"state": "TIMEOUT", "seconds": seconds,
            "reason": "still running after %ds and never reached %r - it may still be applying "
                      "migrations, which is NOT a pass" % (seconds, SERVING),
            "output": "".join(lines)[-900:]}


def _twin_state(state, pending):
    """Name this preflight's outcome on the twin's own axes, or say the vocabulary is absent.

    The three states here were already the right distinctions - PASS, FAIL and UNMEASURED for a run
    that never reached a serving backend. What they did not do is say WHICH axis each one is on, so
    a reader had to infer it. On the twin's axes a timeout is NOT_TESTED and UNMEASURED, which is a
    different thing from NOT_APPLICABLE, and a detector that reads the field no longer has to guess.

    VERIFIED is never written. The preflight runs the pending set against a COPY of live data; that
    is strong evidence and it is still not a verification receipt for the real deployment.
    """
    try:
        import sys as _sys  # noqa: PLC0415
        root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        if root not in _sys.path:
            _sys.path.insert(0, root)
        from libs.semantic_twin import EvidenceState, TevvState  # noqa: PLC0415
    except Exception as exc:  # noqa: BLE001
        return {"vocabulary": "ABSENT:%s" % type(exc).__name__}

    if state == "PASS":
        tevv, evidence = TevvState.PASS, EvidenceState.OBSERVED
    elif state == "FAIL":
        tevv, evidence = TevvState.FAIL, EvidenceState.OBSERVED
    else:
        # It was meant to run and did not reach a conclusion. Not a pass, and not a failure either.
        tevv, evidence = TevvState.NOT_TESTED, EvidenceState.UNMEASURED
    return {"vocabulary": "semantic_twin",
            "tevv_state": tevv.value,
            "evidence_state": evidence.value,
            "counts_describe_this_run": state in ("PASS", "FAIL"),
            "pending_tested": len(pending or []) if state in ("PASS", "FAIL") else 0,
            "note": ("evidence is a serving run against a COPY of live data, not a verification "
                     "receipt for the deployment itself")}


def preflight(root, plant_broken=False, seconds=25):
    root = pathlib.Path(root)
    out = {"schema": "buildanddo.migration-preflight/v1", "root": str(root),
           "selftest": plant_broken}
    # The deploy target is Linux and the binary is "pocketbase" there. On Windows it carries .exe,
    # and looking only for the bare name made this gate permanently UNMEASURED on the one machine
    # an operator can run it from before touching staging - honest, and useless.
    binary = next((c for c in (root / "pocketbase", root / "pocketbase.exe") if c.exists()),
                  root / "pocketbase")
    live_db = root / "pb_data" / "data.db"
    mig_dir = root / "pb_migrations"
    hooks = root / "pb_hooks"
    for label, path in (("binary", binary), ("database", live_db), ("migrations", mig_dir)):
        if not path.exists():
            out["state"] = "UNMEASURED"
            out["reason"] = "%s not found at %s" % (label, path)
            out["twin_state"] = _twin_state(out["state"], [])
            return out

    applied, err = applied_set(live_db)
    if applied is None:
        out["state"] = "UNMEASURED"
        out["reason"] = "cannot read the applied set: %s" % err
        out["twin_state"] = _twin_state(out["state"], [])
        return out
    on_disk = sorted(p.name for p in mig_dir.glob("*.js"))
    # SET DIFFERENCE ON FILENAME - a lower-numbered file added later is still pending.
    pending = [name for name in on_disk if name not in set(applied)]
    out["applied"] = len(applied)
    out["on_disk"] = len(on_disk)
    out["pending"] = pending

    scratch = tempfile.mkdtemp(prefix="pb_preflight_")
    try:
        data_dir = pathlib.Path(scratch) / "pb_data"
        data_dir.mkdir(parents=True)
        shutil.copy2(str(live_db), str(data_dir / "data.db"))
        for extra in ("auxiliary.db", "data.db-wal", "data.db-shm"):
            src = live_db.parent / extra
            if src.exists():
                shutil.copy2(str(src), str(data_dir / extra))
        mig_copy = pathlib.Path(scratch) / "pb_migrations"
        shutil.copytree(str(mig_dir), str(mig_copy))
        if plant_broken:
            planted = mig_copy / "9999999999_preflight_selftest_broken.js"
            planted.write_text(BROKEN, encoding="utf-8")
            out["planted"] = planted.name
        result = start_once(str(binary), str(data_dir),
                            str(hooks) if hooks.exists() else "", str(mig_copy), seconds)
        out["startup"] = result
        if result["state"] == "STARTED":
            out["state"] = "PASS"
            out["verdict"] = "the pending set reaches a serving backend on a copy of live data"
        elif result["state"] == "DIED":
            out["state"] = "FAIL"
            out["verdict"] = "the pending set ABORTS startup - do not deploy it"
        elif result["state"] == "TIMEOUT":
            out["state"] = "UNMEASURED"
            out["verdict"] = ("the run never reached a serving backend inside the window - raise "
                              "--seconds until it either serves or dies, but do NOT read this as "
                              "a pass")
        else:
            out["state"] = "UNMEASURED"
            out["verdict"] = result.get("reason", "could not run the binary")
    finally:
        shutil.rmtree(scratch, ignore_errors=True)
    out["twin_state"] = _twin_state(out.get("state"), out.get("pending"))
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dir", default="/opt/buildanddo-pocketbase-staging")
    ap.add_argument("--seconds", type=int, default=25)
    ap.add_argument("--selftest", action="store_true",
                    help="plant a broken migration in the COPY and require this gate to catch it")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    if args.selftest:
        # The control: a gate that cannot show its own failure mode must not be trusted.
        clean = preflight(args.dir, plant_broken=False, seconds=args.seconds)
        broken = preflight(args.dir, plant_broken=True, seconds=args.seconds)
        ok = clean.get("state") == "PASS" and broken.get("state") == "FAIL"
        print(json.dumps({"schema": "buildanddo.migration-preflight-selftest/v1",
                          "clean_set": clean.get("state"),
                          "with_a_planted_broken_migration": broken.get("state"),
                          "verdict": "PASS" if ok else "FAIL",
                          "means": ("the gate passes a good set and REFUSES a broken one"
                                    if ok else
                                    "the gate cannot tell them apart and must not be trusted"),
                          "planted": broken.get("planted"),
                          "died_with": (broken.get("startup") or {}).get("output", "")[-400:]},
                         indent=1))
        return 0 if ok else 1

    out = preflight(args.dir, seconds=args.seconds)
    print(json.dumps(out, indent=1) if args.json else
          "%s  pending=%d  %s" % (out.get("state"), len(out.get("pending") or []),
                                  out.get("verdict") or out.get("reason") or ""))
    return {"PASS": 0}.get(out.get("state"), 1)


if __name__ == "__main__":
    raise SystemExit(main())
