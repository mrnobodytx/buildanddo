#!/usr/bin/env python3
# ─── CGRF Header ─────────────────────────────────────────────────────────────
# File:        scripts/ci/ocn_guild_forum.py
# Stage:       09_VERIFY
# SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
# CAPS:        B
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-20
# Depends:     apps/pocketbase/pb_hooks/workspace-community.js,
#              apps/pocketbase/pb_hooks/workspace-administration.js,
#              apps/pocketbase/pb_hooks/workspace-access.js
# EnumType:    Verifier
# EnumEdges:   EXERCISES the community command surface as one guildmaster from one machine
# Intent:      Let a guildmaster contribute to a shared guild hall as itself - signed on its own
#              box, with its own key - so a forum thread is genuinely many seats rather than one
#              process talking to itself.
# ─────────────────────────────────────────────────────────────────────────────
"""ocn_guild_forum.py - ONE community command, issued as this guildmaster, from its own box.

    ocn_guild_forum.py <seat> <workspace> <action> [options] [--env staging]

    hall.enable   --name NAME [--description TEXT]   turn the forum and wiki on (owner/admin)
    hall.member   --user UID --role editor|admin|viewer
    forum.create  --title T --body B
    forum.reply   --topic ID --body B --revision N
    wiki.save     --slug S --title T --body B
    wiki.publish  --id ID --revision N
    list          |  topic --topic ID

ONE COMMAND PER INVOCATION, because a shared hall is only shared if the commands come from
different machines. Running them from one process would prove that one process can talk to itself.

THE CONTRACT IS READ OUT OF THE HOOKS, NOT GUESSED:
  * every envelope carries EXACTLY {action, revision, request_key, payload} - an extra or missing
    key is refused, not ignored, and request_key must match [A-Za-z0-9_-]{16,80}
  * payload keys are checked EXACTLY per action (access.exact), so "which fields does this take"
    is answered by the server
  * revision is optimistic concurrency, not decoration: a new topic or page starts at zero, a
    reply must name the revision of the topic it is answering, and settings.save must name the
    revision of the workspace controls it is changing
  * posting needs owner/admin/editor. A VIEWER is refused - which is the correct answer, and is
    reported as such rather than retried until something passes.

OWNERSHIP IS NOT MEMBERSHIP. workspaces.owner grants the owner role with no membership row at all
(workspace-access.js role()), so a seat can act in the workspace it owns while being a viewer, or
nothing, in somebody else's. Both are reported.

THE FORUM AND WIKI ARE OFF UNTIL SOMEONE TURNS THEM ON. The access DEFAULTS are
wiki_enabled:false, forum_enabled:false - so an absent controls record means disabled, and the
refusal a seat gets is a real policy answer rather than a missing feature.

WHAT THIS SCRIPT DOES NOT CLAIM. It posts text it is given. The box proves WHO posted, FROM WHERE
and WHEN, and appends what it measured at post time. It does not make the seat the author of the
argument, and the provenance footer says so inside the post itself.
"""
from __future__ import annotations
import argparse
import datetime
import hashlib
import json
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

ENVS = {"staging": "https://staging.buildanddo.com", "production": "https://buildanddo.com"}
BACKEND = "/hcgi/platform"
CBF = "/opt/citadel/cbf"
UA = {"User-Agent": "Mozilla/5.0 (compatible; bnd-ocn-guild/1.0)", "Content-Type": "application/json"}


def http(url, data=None, headers=None, method=None, timeout=30):
    head = dict(UA)
    head.update(headers or {})
    req = urllib.request.Request(url, data=data, headers=head,
                                 method=method or ("POST" if data is not None else "GET"))
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw[:1] in (b"{", b"[") else {})
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        return exc.code, (json.loads(raw) if raw[:1] in (b"{", b"[") else {})
    except Exception as exc:  # noqa: BLE001
        return 0, {"err": type(exc).__name__}


def login(seat, base):
    """Sign in with the CitadelKey only this box holds. The private never leaves the machine."""
    bucket = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H")
    payload = json.dumps({"login": "buildanddo", "ts_bucket": bucket},
                         sort_keys=True, separators=(",", ":"))
    signed = subprocess.run([sys.executable, "-m", "tools.cbf.citadelkey.citadel_key", "sign",
                             "--seat", seat, "--audience", "buildanddo-login",
                             "--payload", payload, "--header"],
                            cwd=CBF, capture_output=True, text=True, timeout=60)
    header = (signed.stdout or "").strip().splitlines()[-1] if signed.stdout.strip() else ""
    if not header:
        return None, None
    status, body = http(base + BACKEND + "/api/ocn/login", data=b"{}",
                        headers={"X-Citadel-Key": header})
    if status != 200:
        return None, None
    return body.get("token"), (body.get("record") or {}).get("id")


def request_key(seat, action, subject):
    """Deterministic, so a retry is the SAME command rather than a second one.

    The server writes request_key into its audit row and returns the original receipt on a
    replay, which is only worth anything if the key is a function of the intent instead of a
    fresh random value on every attempt.
    """
    day = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d")
    raw = "|".join([seat, action, subject, day])
    return "gm" + hashlib.sha256(raw.encode("utf-8")).hexdigest()[:40]


def provenance(seat, uid, root, auth):
    """What this box could see at post time - appended to the body, not asserted separately."""
    counts = {}
    for name in ("tutorials", "signals", "missions", "evidence"):
        status, body = http("%s/api/collections/%s/records?perPage=1" % (root, name), headers=auth)
        counts[name] = body.get("totalItems") if status == 200 else "unreadable(%s)" % status
    stamp = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    return ("\n\n---\nPosted by the %s seat from its own machine at %s, signed with the CitadelKey "
            "held only on that box; account %s. Visible to this seat at post time: %s. The seat "
            "proves who posted, from where and when. The argument above was drafted for it by the "
            "C-ONE seat and published under the guildmaster name - it was not reasoned out by the "
            "box itself."
            % (seat, stamp, uid, ", ".join("%s=%s" % (k, v) for k, v in sorted(counts.items()))))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("seat")
    ap.add_argument("workspace")
    ap.add_argument("action")
    ap.add_argument("--title", default="")
    ap.add_argument("--title-file", default="")
    ap.add_argument("--body", default="")
    ap.add_argument("--body-file", default="")
    ap.add_argument("--topic", default="")
    ap.add_argument("--user", default="")
    ap.add_argument("--role", default="editor")
    ap.add_argument("--slug", default="")
    ap.add_argument("--id", default="")
    ap.add_argument("--name", default="")
    ap.add_argument("--description", default="")
    ap.add_argument("--revision", type=int, default=0)
    ap.add_argument("--no-provenance", action="store_true")
    ap.add_argument("--env", default="staging", choices=sorted(ENVS))
    args = ap.parse_args()

    base = ENVS[args.env]
    root = base + BACKEND
    out = {"schema": "buildanddo.ocn-guild-forum/v1", "seat": args.seat, "action": args.action,
           "workspace": args.workspace, "env": args.env,
           "at": datetime.datetime.now(datetime.timezone.utc).isoformat()}

    token, uid = login(args.seat, base)
    if not token:
        out["login"] = "FAILED"
        print(json.dumps(out))
        return 1
    out["login"] = "OK"
    out["uid"] = uid
    auth = {"Authorization": token}

    if args.action == "list":
        status, body = http("%s/api/buildanddo/workspaces/%s/forums" % (root, args.workspace),
                            headers=auth)
        items = body.get("items") or body.get("topics") or []
        out["result"] = {"http": status, "count": len(items) if isinstance(items, list) else None,
                         "topics": [{"id": t.get("id"), "title": t.get("title"),
                                     "status": t.get("status"), "revision": t.get("revision"),
                                     "owner": t.get("owner")}
                                    for t in items] if isinstance(items, list) else body}
        print(json.dumps(out))
        return 0 if status == 200 else 1

    if args.action == "wiki.list":
        # A publish that returned 200 is a claim about the past; this is the state now.
        status, body = http("%s/api/buildanddo/workspaces/%s/wiki" % (root, args.workspace),
                            headers=auth)
        items = body.get("items") or body.get("pages") or []
        out["result"] = {"http": status,
                         "count": len(items) if isinstance(items, list) else None,
                         "pages": [{"id": p.get("id"), "slug": p.get("slug"),
                                    "title": str(p.get("title") or "")[:60],
                                    "status": p.get("status"), "revision": p.get("revision"),
                                    "published_at": p.get("published_at"),
                                    "body_chars": len(str(p.get("body") or ""))}
                                   for p in items] if isinstance(items, list) else body}
        print(json.dumps(out))
        return 0 if status == 200 else 1

    if args.action == "topic":
        status, body = http("%s/api/buildanddo/workspaces/%s/forums/%s"
                            % (root, args.workspace, args.topic), headers=auth)
        if status == 200:
            topic = body.get("topic") or {}
            replies = body.get("replies") or body.get("items") or []
            out["result"] = {"http": status,
                             "topic": {k: topic.get(k) for k in ("id", "title", "status", "revision")},
                             "reply_count": len(replies),
                             "replies": [{"id": r.get("id"), "owner": r.get("owner"),
                                          "status": r.get("status"),
                                          "body": str(r.get("body") or "")[:160]} for r in replies]}
        else:
            out["result"] = {"http": status, "body": body}
        print(json.dumps(out))
        return 0 if status == 200 else 1

    # ---- command-shaped actions -------------------------------------------------
    # Long prose travels to the box as a FILE, never as a shell argument. A recommendation with an
    # apostrophe in it is otherwise at the mercy of three layers of quoting between here and there.
    body_text = args.body
    if args.body_file:
        with open(args.body_file, "r", encoding="utf-8") as handle:
            body_text = handle.read()
    if args.title_file:
        with open(args.title_file, "r", encoding="utf-8") as handle:
            args.title = handle.read().strip()
    if body_text and not args.no_provenance:
        body_text = body_text + provenance(args.seat, uid, root, auth)

    if args.action == "hall.enable":
        endpoint = "%s/api/buildanddo/workspaces/%s/admin" % (root, args.workspace)
        envelope = {"action": "settings.save", "revision": args.revision,
                    "request_key": request_key(args.seat, "settings.save", args.name),
                    "payload": {"name": args.name or ("Guild hall %s" % args.workspace),
                                "description": args.description,
                                "wiki_enabled": True, "forum_enabled": True,
                                "forum_moderation": False}}
    elif args.action == "hall.member":
        endpoint = "%s/api/buildanddo/workspaces/%s/admin" % (root, args.workspace)
        envelope = {"action": "member.set", "revision": args.revision,
                    "request_key": request_key(args.seat, "member.set", args.user + args.role),
                    "payload": {"user": args.user, "role": args.role}}
    elif args.action == "forum.create":
        endpoint = "%s/api/buildanddo/workspaces/%s/community" % (root, args.workspace)
        envelope = {"action": "forum.create", "revision": 0,
                    "request_key": request_key(args.seat, "forum.create", args.title),
                    "payload": {"title": args.title, "body": body_text}}
    elif args.action == "forum.reply":
        endpoint = "%s/api/buildanddo/workspaces/%s/community" % (root, args.workspace)
        envelope = {"action": "forum.reply", "revision": args.revision,
                    "request_key": request_key(args.seat, "forum.reply", args.topic + args.title),
                    "payload": {"topic": args.topic, "body": body_text}}
    elif args.action == "wiki.save":
        endpoint = "%s/api/buildanddo/workspaces/%s/community" % (root, args.workspace)
        envelope = {"action": "wiki.save", "revision": args.revision,
                    "request_key": request_key(args.seat, "wiki.save", args.slug),
                    "payload": {"id": args.id, "title": args.title, "slug": args.slug,
                                "body": body_text}}
    elif args.action == "wiki.publish":
        endpoint = "%s/api/buildanddo/workspaces/%s/community" % (root, args.workspace)
        envelope = {"action": "wiki.transition", "revision": args.revision,
                    "request_key": request_key(args.seat, "wiki.transition", args.id),
                    "payload": {"id": args.id, "status": "published"}}
    else:
        out["result"] = {"http": 0, "message": "unsupported action"}
        print(json.dumps(out))
        return 2

    status, body = http(endpoint, data=json.dumps(envelope).encode("utf-8"), headers=auth)
    result = {"http": status, "sent_action": envelope["action"],
              "sent_revision": envelope["revision"], "request_key": envelope["request_key"]}
    if status in (200, 201):
        record = body.get("record") or body.get("result") or body
        if isinstance(record, dict):
            for key in ("id", "revision", "status", "workspace", "action"):
                if key in record:
                    result[key] = record[key]
    else:
        # The server's own words. A refusal is an answer about policy, not something to retry away.
        result["message"] = str(body.get("message") or body.get("err") or "")[:200]
        data = body.get("data") or {}
        if data:
            result["fields"] = {k: str((v or {}).get("message"))[:80] for k, v in list(data.items())[:6]}
    out["result"] = result
    print(json.dumps(out))
    return 0 if status in (200, 201) else 1


if __name__ == "__main__":
    raise SystemExit(main())
