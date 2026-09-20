#!/usr/bin/env python3
# ─── CGRF Header ─────────────────────────────────────────────────────────────
# File:        scripts/ci/ocn_box_exercise.py
# Stage:       09_VERIFY
# SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
# CAPS:        B
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-20
# Depends:     apps/pocketbase/pb_hooks/ocn-login.pb.js;
#              apps/pocketbase/pb_migrations/1790700000_ocn_seat_users_fleet_boxes.js
# EnumType:    Verifier
# EnumEdges:   VERIFIES /api/ocn/login, /api/buildanddo/workflow-runs and the workspace
#              collections FROM a fleet box, using that box's own CitadelKey
# Intent:      Exercise BuildAndDo as a real user from a machine that is not rig1, because a
#              single-origin test cannot show tenant isolation and rig1 cannot sign for a seat.
# ─────────────────────────────────────────────────────────────────────────────
"""ocn_box_exercise.py - use BuildAndDo staging AS THIS BOX, over this box's own CitadelKey.

THIS RUNS ON A FLEET BOX, NOT ON rig1. Enrolment issues every seat keypair on its own box and
registers only the public half - "private key STAYS on the box" - so rig1 cannot produce a seat
envelope and never could. Drive it from rig1 with CNWB's node_drive:

    cd D:\\citadel_seat_worktrees\\<cnwb-checkout>
    B64=$(python -c "import base64,pathlib;print(base64.b64encode(pathlib.Path('ocn_box_exercise.py').read_bytes()).decode())")
    py -3.13 -m tools.cbf.node_drive drive --node ray-tor1-1 \\
        --cmd "echo $B64 | base64 -d > /tmp/ocn.py && python3 /tmp/ocn.py ray-tor1-1 probe"

    <seat> probe                          log in, read the authenticated surface, report counts
    <seat> workspace                      create this seat's own workspace
    <seat> exercise <workspace> <lane>    drive one subsystem end to end
                                          lane: missions|signals|workflows|evidence|research|members

WHY EVERY READ IS AUTHENTICATED. An anonymous PocketBase list request whose list rule filters
everything returns {"totalItems":0}, NOT 403, so "empty" and "not allowed" look identical from
outside. Every read here carries the seat token, and a collection that must NOT exist is probed
first, so a 200 anywhere else actually means something.

WHY REFUSALS ARE RESULTS. A 400 naming a required field, or a 409 refusing a stale revision, is the
system working. The failure this guards against is reporting green because nothing was really
asked. Measured 2026-09-20 by running it: missions.status is
["proposed","approved","running","needs_attention","verified","failed"] and NOT "draft";
signals.type is required ["fact","inference","user"]; research_uploads needs a real multipart asset
(asset/kind/origin/original_name), so a JSON create cannot satisfy it and should not be "fixed" by
loosening the rule.

Never prints the token.
"""
from __future__ import annotations
import datetime
import json
import secrets
import string
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://staging.buildanddo.com/hcgi/platform"
UA = {"User-Agent": "Mozilla/5.0 (compatible; bnd-ocn-exercise/1.0)",
      "Content-Type": "application/json"}
CBF = "/opt/citadel/cbf"          # the box's CNWB install, which owns the signer and the seed
COLLECTIONS = ["users", "workspaces", "workspace_members", "missions", "signals", "evidence",
               "workflows", "workflow_runs", "tutorials", "research_uploads", "early_access",
               "roadmap_items", "services", "daily_editions", "knowledge_claims"]
ABSENT = "definitely_not_a_collection_9f3"   # the control: this must always 404
steps: list[dict] = []


def http(method: str, path: str, body=None, token: str | None = None, timeout: int = 25):
    """Call the backend, returning (status, parsed_body). A transport fault is status 0, never a raise."""
    headers = dict(UA)
    if token:
        headers["Authorization"] = token
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw[:1] in b"{[" else {})
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        return exc.code, (json.loads(raw) if raw[:1] in b"{[" else {})
    except Exception as exc:  # noqa: BLE001 - a dead hop must not look like a verdict
        return 0, {"err": type(exc).__name__}


def step(label: str, method: str, path: str, body=None, token=None):
    """Record one call, keeping the server's own message when it refuses."""
    status, parsed = http(method, path, body, token)
    entry = {"step": label, "http": status}
    if status in (200, 201):
        entry["id"] = parsed.get("id") or (parsed.get("record") or {}).get("id")
    else:
        entry["message"] = str(parsed.get("message") or parsed.get("err") or "")[:110]
        fields = parsed.get("data") or {}
        if fields:
            entry["fields"] = {k: str((v or {}).get("message"))[:48]
                               for k, v in list(fields.items())[:4]}
    steps.append(entry)
    return status, parsed


def login(seat: str):
    """Sign one envelope with this box's seed and exchange it for a session. Returns (token, record_id)."""
    bucket = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H")
    payload = json.dumps({"login": "buildanddo", "ts_bucket": bucket},
                         sort_keys=True, separators=(",", ":"))
    signed = subprocess.run([sys.executable, "-m", "tools.cbf.citadelkey.citadel_key", "sign",
                             "--seat", seat, "--audience", "buildanddo-login",
                             "--payload", payload, "--header"],
                            cwd=CBF, capture_output=True, text=True, timeout=60)
    header = (signed.stdout or "").strip().splitlines()[-1] if signed.stdout.strip() else ""
    if not header:
        return None, {"state": "SIGN_FAILED", "stderr": (signed.stderr or "")[-120:]}
    headers = dict(UA)
    headers["X-Citadel-Key"] = header
    req = urllib.request.Request(BASE + "/api/ocn/login", data=b"{}", headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            body = json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        try:
            message = json.loads(exc.read()).get("message")
        except Exception:  # noqa: BLE001
            message = None
        # 401 citadelkey_rejected = the crypto was judged and failed.
        # 403 seat_not_provisioned = the key is BELIEVED and only the account is missing.
        return None, {"state": "LOGIN_%d" % exc.code, "message": str(message)[:90]}
    except Exception as exc:  # noqa: BLE001
        return None, {"state": "LOGIN_ERR", "message": type(exc).__name__}
    record = body.get("record") or {}
    return body.get("token"), {"state": "LOGIN_OK", "record_id": record.get("id"),
                               "name": record.get("name")}


def rk() -> str:
    """A request key in the shape workflow-runs.js accepts: 16-80 of [A-Za-z0-9_-]."""
    return "".join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(24))


def exercise(lane: str, seat: str, workspace: str, token: str, uid: str) -> None:
    """Drive one subsystem end to end inside this seat's own workspace."""
    if lane == "missions":
        status, body = step("create mission", "POST", "/api/collections/missions/records",
                            {"title": "OCN mission from %s" % seat, "workspace": workspace,
                             "owner": uid, "status": "proposed",
                             "description": "Filed by box %s over its own CitadelKey." % seat}, token)
        if status in (200, 201):
            step("approve mission", "PATCH",
                 "/api/collections/missions/records/%s" % body["id"], {"status": "approved"}, token)
            step("run mission", "PATCH",
                 "/api/collections/missions/records/%s" % body["id"], {"status": "running"}, token)

    elif lane == "signals":
        step("create signal", "POST", "/api/collections/signals/records",
             {"title": "OCN signal from %s" % seat, "workspace": workspace, "owner": uid,
              "type": "inference", "source": "ocn_box_exercise.py", "confidence": 0.8,
              "description": "Authenticated signal raised from box %s." % seat}, token)
        step("list own signals", "GET",
             "/api/collections/signals/records?perPage=5&filter="
             + urllib.parse.quote('owner="%s"' % uid), None, token)

    elif lane == "workflows":
        status, body = step(
            "create workflow (draft)", "POST", "/api/collections/workflows/records",
            {"name": "OCN check from %s" % seat, "description": "Box-driven governed run.",
             "workspace": workspace, "owner": uid, "status": "draft",
             "steps": [{"id": "probe", "name": "Probe the surface", "kind": "read",
                        "detail": "Read the authenticated collection surface from this box."},
                       {"id": "signoff", "name": "Sign off", "kind": "approval",
                        "detail": "Approve the observation."}]}, token)
        if status not in (200, 201):
            return
        workflow = body["id"]
        step("activate workflow", "PATCH",
             "/api/collections/workflows/records/%s" % workflow, {"status": "active"}, token)
        status, body = step("START governed run", "POST", "/api/buildanddo/workflow-runs",
                            {"workspace": workspace, "workflow": workflow, "mission": "",
                             "request_key": rk()}, token)
        if status not in (200, 201):
            return
        run_id = (body.get("record") or {}).get("id")
        step("record step 1", "POST", "/api/buildanddo/workflow-runs/%s/decisions" % run_id,
             {"workspace": workspace, "request_key": rk(), "revision": 1, "action": "step",
              "step_id": "probe", "outcome": "passed",
              "observation": "Authenticated surface probed from %s." % seat,
              "source": "ocn_box_exercise.py on %s" % seat}, token)
        # The control: revision 1 was just consumed, so replaying it MUST be refused 409.
        # Without this, a run of all-200s would not distinguish a governed ledger from a log.
        step("CONTROL stale revision (409 wanted)", "POST",
             "/api/buildanddo/workflow-runs/%s/decisions" % run_id,
             {"workspace": workspace, "request_key": rk(), "revision": 1, "action": "step",
              "step_id": "probe", "outcome": "passed",
              "observation": "Stale revision must be refused.", "source": "negative control"}, token)
        step("approve and finish", "POST", "/api/buildanddo/workflow-runs/%s/decisions" % run_id,
             {"workspace": workspace, "request_key": rk(), "revision": 2, "action": "step",
              "step_id": "signoff", "outcome": "approved",
              "observation": "Approved from box %s." % seat}, token)

    elif lane == "evidence":
        step("create evidence", "POST", "/api/collections/evidence/records",
             {"content": "Observation recorded from box %s." % seat,
              "source": "ocn_box_exercise.py", "type": "observed", "workspace": workspace,
              "owner": uid, "title": "OCN evidence from %s" % seat,
              "category": "ocn_probe", "tags": "ocn"}, token)

    elif lane == "research":
        # Expected to be REFUSED 400: this collection wants a real multipart asset. Kept so the
        # requirement stays visible instead of being quietly dropped from the matrix.
        step("create research_upload (expects 400: needs a real asset)", "POST",
             "/api/collections/research_uploads/records",
             {"workspace": workspace, "owner": uid,
              "title": "OCN research note from %s" % seat}, token)

    elif lane == "members":
        step("read own membership", "GET",
             "/api/collections/workspace_members/records?perPage=5&filter="
             + urllib.parse.quote('workspace="%s"' % workspace), None, token)
        step("add a member", "POST", "/api/collections/workspace_members/records",
             {"workspace": workspace, "user": uid, "role": "editor"}, token)


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    seat, mode = sys.argv[1], sys.argv[2]
    out = {"seat": seat, "mode": mode,
           "at": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    token, info = login(seat)
    out["login"] = info
    if not token:
        print(json.dumps(out))
        return 1
    uid = info.get("record_id")

    if mode == "probe":
        control, _ = http("GET", "/api/collections/%s/records?perPage=1" % ABSENT, token=token)
        out["control_absent_collection"] = control     # must be 404, or nothing below is meaningful
        reads = {}
        for name in COLLECTIONS:
            status, body = http("GET", "/api/collections/%s/records?perPage=1" % name, token=token)
            reads[name] = {"http": status, "items": body.get("totalItems") if status == 200 else None}
        out["authenticated_reads"] = reads
    elif mode == "workspace":
        step("create workspace", "POST", "/api/collections/workspaces/records",
             {"name": "OCN box workspace (%s)" % seat, "owner": uid}, token)
        out["steps"] = steps
    elif mode == "exercise":
        if len(sys.argv) < 5:
            out["error"] = "exercise needs <workspace_id> <lane>"
            print(json.dumps(out))
            return 2
        exercise(sys.argv[4], seat, sys.argv[3], token, uid)
        out["steps"] = steps
    else:
        out["error"] = "unknown mode %r" % mode
        print(json.dumps(out))
        return 2

    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
