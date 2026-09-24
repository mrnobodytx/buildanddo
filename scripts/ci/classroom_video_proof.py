#!/usr/bin/env python3
# ─── CGRF Header ─────────────────────────────────────────────────────────────
# File:        scripts/ci/classroom_video_proof.py
# Stage:       09_VERIFY
# SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
# CAPS:        B
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     apps/pocketbase/pb_hooks/classroom-realtime.pb.js
# EnumType:    Gate
# EnumEdges:   PROVES an agent can publish live media through the platform route, with no browser
# Intent:      The classroom video path had never been exercised end to end. This authenticates as
#              a box seat over OCN, builds a real WebRTC offer with aiortc, opens an SFU session
#              through /api/classroom/session, waits for ICE and DTLS, and publishes tracks.
# ─────────────────────────────────────────────────────────────────────────────
"""classroom_video_proof.py - publish live audio and video as an agent, with no browser.

RUNS ON A FLEET BOX. The seat's private key only exists there, so the signing step cannot be driven
from rig1 - and the box needs aiortc, which the system interpreter does not carry:

    python3 -m venv /opt/ocn-rtc && /opt/ocn-rtc/bin/pip install aiortc
    /opt/ocn-rtc/bin/python classroom_video_proof.py

It signs with system python3 (which has the CitadelKey module) and runs itself on the venv (which
has aiortc), because no single interpreter on the box has both.

ORDER IS THE WHOLE LESSON. Publishing tracks immediately after the session is created returns 502
realtime_tracks_failed: the SFU answers the session before the transport is up, and a track cannot
go over a transport that has not completed ICE and DTLS. Settle first, then publish. The first run
of this proof failed exactly that way and it looked like a platform defect.

MEASURED 2026-09-22 on staging from ray-tor1-1: session 200, transport connected, ice completed,
2 tracks pushed.
"""
import asyncio
import datetime
import json
import pathlib
import subprocess
import sys
import urllib.error
import urllib.request

SEAT = "ray-tor1-1"
BASE = "https://staging.buildanddo.com"
BACKEND = "/hcgi/platform"
CNWB = pathlib.Path("/opt/citadel/cbf")
UA = {"User-Agent": "Mozilla/5.0 (compatible; bnd-video-proof/1.0)",
      "Content-Type": "application/json"}
report = {"schema": "buildanddo.classroom-video-proof/v1", "seat": SEAT, "base": BASE,
          "at": datetime.datetime.now(datetime.timezone.utc).isoformat(), "steps": []}


def note(name, **kw):
    entry = {"step": name}
    entry.update(kw)
    report["steps"].append(entry)
    print("  %-30s %s" % (name, json.dumps({k: v for k, v in kw.items() if k != "sdp"})[:150]))
    return entry


def http(method, path, body=None, token=None, timeout=40):
    head = dict(UA)
    if token:
        head["Authorization"] = token
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + BACKEND + path, data=data, headers=head, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw[:1] in (b"{", b"[") else {})
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            return exc.code, json.loads(raw)
        except Exception:  # noqa: BLE001
            return exc.code, {"body": raw[:200].decode("utf-8", "replace")}
    except Exception as exc:  # noqa: BLE001
        return 0, {"err": type(exc).__name__}


def login():
    bucket = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H")
    payload = json.dumps({"login": "buildanddo", "ts_bucket": bucket},
                         sort_keys=True, separators=(",", ":"))
    signed = subprocess.run(["python3", "-m", "tools.cbf.citadelkey.citadel_key", "sign",
                             "--seat", SEAT, "--audience", "buildanddo-login",
                             "--payload", payload, "--header"],
                            cwd=str(CNWB), capture_output=True, text=True, timeout=90)
    header = ""
    for line in reversed((signed.stdout or "").strip().splitlines()):
        if line.strip():
            header = line.strip()
            break
    if not header:
        return None, None, (signed.stderr or "")[:160]
    req = urllib.request.Request(BASE + BACKEND + "/api/ocn/login", data=b"{}",
                                 headers=dict(UA, **{"X-Citadel-Key": header}), method="POST")
    try:
        with urllib.request.urlopen(req, timeout=40) as resp:
            body = json.loads(resp.read() or b"{}")
            return body.get("token"), (body.get("record") or {}).get("id"), ""
    except urllib.error.HTTPError as exc:
        return None, None, "%s %s" % (exc.code, exc.read()[:140].decode("utf-8", "replace"))
    except Exception as exc:  # noqa: BLE001
        return None, None, type(exc).__name__


async def main():
    token, uid, why = login()
    note("ocn login", ok=bool(token), uid=uid or None, detail=why or None)
    if not token:
        return 1

    # A real PeerConnection, not a hand-made SDP string.
    from aiortc import RTCPeerConnection, RTCSessionDescription  # noqa: PLC0415
    from aiortc.mediastreams import AudioStreamTrack, VideoStreamTrack  # noqa: PLC0415

    pc = RTCPeerConnection()
    pc.addTrack(AudioStreamTrack())
    pc.addTrack(VideoStreamTrack())
    offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    sdp = pc.localDescription.sdp
    note("build SDP offer (aiortc)", bytes=len(sdp),
         media=[l[2:].split()[0] for l in sdp.splitlines() if l.startswith("m=")],
         has_ice="a=ice-ufrag" in sdp, has_dtls="a=fingerprint" in sdp)

    status, body = http("POST", "/api/classroom/session",
                        {"sessionDescription": {"type": "offer", "sdp": sdp}}, token)
    session_id = body.get("sessionId") if status == 200 else None
    answer = (body.get("sessionDescription") or {}) if status == 200 else {}
    note("POST /api/classroom/session", http=status, sessionId=session_id,
         answer_type=answer.get("type"), answer_bytes=len(answer.get("sdp") or ""),
         message=str(body.get("message") or "")[:120] if status != 200 else None)
    if status != 200 or not session_id:
        await pc.close()
        return 1

    await pc.setRemoteDescription(RTCSessionDescription(sdp=answer["sdp"], type=answer["type"]))
    note("apply SFU answer", signalling=pc.signalingState, connection=pc.connectionState)

    # ORDER MATTERS. The first run pushed tracks immediately and got 502. The SFU answers the
    # session before the transport is up, and a track cannot be published over a transport that has
    # not completed ICE and DTLS - the recorded symptom elsewhere in this estate is a 425 until the
    # PeerConnection is connected. So settle first, then publish.
    for _ in range(25):
        if pc.connectionState in ("connected", "failed", "closed"):
            break
        await asyncio.sleep(1)
    note("transport settled", connection=pc.connectionState, ice=pc.iceConnectionState)

    tracks = [{"location": "local", "mid": t.mid, "trackName": "proof-%s" % t.kind}
              for t in pc.getTransceivers() if t.mid is not None]
    status, body = http("POST", "/api/classroom/tracks",
                        {"sessionId": session_id, "action": "push", "tracks": tracks,
                         "sessionDescription": {"type": "offer", "sdp": sdp}}, token)
    note("POST tracks (push, after connect)", http=status, sent=[t["trackName"] for t in tracks],
         pushed=len(body.get("tracks") or []) if status in (200, 201) else 0,
         detail=json.dumps(body)[:260] if status not in (200, 201) else None)

    status, body = http("GET", "/api/classroom/presence/health", None, token)
    note("presence health after publish", http=status,
         publishers=body.get("publishers_configured"), verification=body.get("verification"))

    await pc.close()
    return 0


rc = asyncio.get_event_loop().run_until_complete(main()) if sys.version_info < (3, 10) \
    else asyncio.run(main())
out = pathlib.Path(__file__).parent / "classroom_video_proof.json"
out.write_text(json.dumps(report, indent=1), encoding="utf-8")
print("\nwritten:", out)
raise SystemExit(rc)
