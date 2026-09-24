#!/usr/bin/env python3
# ─── CGRF Header ─────────────────────────────────────────────────────────────
# File:        scripts/ci/classroom_media_roundtrip.py
# Stage:       09_VERIFY
# SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
# CAPS:        B
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     apps/pocketbase/pb_hooks/classroom-realtime.pb.js
# EnumType:    Gate
# EnumEdges:   PROVES media ARRIVES, which publishing a track does not
# Intent:      classroom_video_proof.py shows the SFU accepting two tracks. That is not the same
#              claim as a student seeing anything. This publishes a tone from one session, pulls it
#              into a SECOND session through the platform route, and counts decoded frames. Frames
#              greater than zero is the only evidence that media crossed.
# ─────────────────────────────────────────────────────────────────────────────
"""classroom_media_roundtrip.py - publish a tone, pull it back, count what arrives.

RUNS ON A FLEET BOX, on the venv that carries aiortc:

    /opt/ocn-rtc/bin/python classroom_media_roundtrip.py [seat] [base_url]

WHY THE ANSWER LEG IS NOT OPTIONAL. When a session pulls a remote track the SFU replies
`requiresImmediateRenegotiation` with an offer of its own. The puller must answer it through
PUT /api/classroom/renegotiate. Without that leg the pull returns a perfectly good 200 and the
subscriber receives ZERO frames - a green call and silence, which is exactly the shape of result
this gate exists to refuse.

THE CONTROL. A second pull is attempted for a track name that was never published. It must come
back with an error or produce no frames. Without it, "frames arrived" could not be distinguished
from a subscriber that decodes something for any request at all.
"""
from __future__ import annotations

import asyncio
import datetime
import fractions
import json
import math
import pathlib
import subprocess
import sys
import urllib.error
import urllib.request

SEAT = sys.argv[1] if len(sys.argv) > 1 else "ray-tor1-1"
BASE = sys.argv[2] if len(sys.argv) > 2 else "https://staging.buildanddo.com"
BACKEND = "/hcgi/platform"
CBF = pathlib.Path("/opt/citadel/cbf")
UA = {"User-Agent": "Mozilla/5.0 (compatible; bnd-media-roundtrip/1.0)",
      "Content-Type": "application/json"}
TRACK = "roundtrip/tone"
ABSENT_TRACK = "roundtrip/never-published"
LISTEN_SECONDS = 10

report = {"schema": "buildanddo.classroom-media-roundtrip/v1", "seat": SEAT, "base": BASE,
          "at": datetime.datetime.now(datetime.timezone.utc).isoformat(), "steps": []}


def note(name, **kw):
    report["steps"].append(dict(step=name, **kw))
    print("  %-34s %s" % (name, json.dumps(kw)[:160]))


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
                            cwd=str(CBF), capture_output=True, text=True, timeout=90)
    header = ""
    for line in reversed((signed.stdout or "").strip().splitlines()):
        if line.strip():
            header = line.strip()
            break
    if not header:
        return None, (signed.stderr or "")[:160]
    req = urllib.request.Request(BASE + BACKEND + "/api/ocn/login", data=b"{}",
                                 headers=dict(UA, **{"X-Citadel-Key": header}), method="POST")
    try:
        with urllib.request.urlopen(req, timeout=40) as resp:
            return json.loads(resp.read() or b"{}").get("token"), ""
    except urllib.error.HTTPError as exc:
        return None, "%s %s" % (exc.code, exc.read()[:140].decode("utf-8", "replace"))
    except Exception as exc:  # noqa: BLE001
        return None, type(exc).__name__


def tone_track():
    """A real 440Hz tone, not silence. Silence would still decode, but a tone lets the subscriber
    report non-zero audio energy - the difference between 'frames arrived' and 'sound arrived'."""
    import numpy  # noqa: PLC0415
    from av import AudioFrame  # noqa: PLC0415
    from aiortc.mediastreams import MediaStreamTrack  # noqa: PLC0415

    class Tone(MediaStreamTrack):
        kind = "audio"

        def __init__(self):
            super().__init__()
            self.rate = 48000
            self.samples = 960          # 20ms
            self.n = 0

        async def recv(self):
            await asyncio.sleep(self.samples / self.rate)
            t = (numpy.arange(self.n, self.n + self.samples) / self.rate).astype(numpy.float32)
            self.n += self.samples
            data = (numpy.sin(2 * math.pi * 440 * t) * 12000).astype(numpy.int16).reshape(1, -1)
            frame = AudioFrame.from_ndarray(data, format="s16", layout="mono")
            frame.sample_rate = self.rate
            frame.pts = self.n
            frame.time_base = fractions.Fraction(1, self.rate)
            return frame

    return Tone()


async def settle(pc, seconds=25):
    for _ in range(seconds):
        if pc.connectionState in ("connected", "failed", "closed"):
            break
        await asyncio.sleep(1)
    return pc.connectionState


async def main():  # noqa: PLR0915
    from aiortc import RTCPeerConnection, RTCSessionDescription  # noqa: PLC0415

    token, why = login()
    note("ocn login", ok=bool(token), detail=why or None)
    if not token:
        return 1

    # ---- publisher ---------------------------------------------------------
    pub = RTCPeerConnection()
    tx = pub.addTransceiver(tone_track(), direction="sendonly")
    await pub.setLocalDescription(await pub.createOffer())
    status, body = http("POST", "/api/classroom/session",
                        {"sessionDescription": {"type": "offer", "sdp": pub.localDescription.sdp}},
                        token)
    pub_sid = body.get("sessionId") if status == 200 else None
    note("publisher session", http=status, sessionId=pub_sid)
    if not pub_sid:
        return 1
    await pub.setRemoteDescription(RTCSessionDescription(**body["sessionDescription"]))
    note("publisher transport", state=await settle(pub))

    status, body = http("POST", "/api/classroom/tracks",
                        {"sessionId": pub_sid, "action": "push",
                         "tracks": [{"location": "local", "mid": tx.mid, "trackName": TRACK}],
                         "sessionDescription": {"type": "offer", "sdp": pub.localDescription.sdp}},
                        token)
    errs = [t for t in (body.get("tracks") or []) if t.get("errorCode")]
    note("publish tone", http=status, track=TRACK, track_errors=errs or None,
         detail=json.dumps(body)[:160] if status not in (200, 201) else None)
    if status not in (200, 201):
        return 1

    # ---- subscriber --------------------------------------------------------
    async def pull(track_name, label):
        sub = RTCPeerConnection()
        sub.addTransceiver("audio", direction="recvonly")
        stats = {"frames": 0, "energy": 0.0}

        @sub.on("track")
        def _(track):
            async def drain():
                import numpy  # noqa: PLC0415
                while True:
                    try:
                        frame = await track.recv()
                    except Exception:  # noqa: BLE001
                        return
                    stats["frames"] += 1
                    try:
                        arr = frame.to_ndarray().astype("float64")
                        stats["energy"] += float(numpy.abs(arr).mean())
                    except Exception:  # noqa: BLE001
                        pass
            asyncio.ensure_future(drain())

        await sub.setLocalDescription(await sub.createOffer())
        st, bd = http("POST", "/api/classroom/session",
                      {"sessionDescription": {"type": "offer", "sdp": sub.localDescription.sdp}},
                      token)
        sid = bd.get("sessionId") if st == 200 else None
        if not sid:
            note("%s session" % label, http=st)
            return stats, sid
        await sub.setRemoteDescription(RTCSessionDescription(**bd["sessionDescription"]))
        # SETTLE BEFORE PULLING. Exactly the same ordering the push leg needs, and I got it wrong
        # here after having already learned it there: a pull issued before the subscriber's own
        # transport has completed ICE and DTLS comes back 502 realtime_tracks_failed.
        note("%s transport (pre-pull)" % label, state=await settle(sub))

        st, bd = http("POST", "/api/classroom/tracks",
                      {"sessionId": sid, "action": "pull",
                       "tracks": [{"location": "remote", "sessionId": pub_sid,
                                   "trackName": track_name}]}, token)
        errs = [t for t in (bd.get("tracks") or []) if t.get("errorCode")]
        reneg = bool(bd.get("requiresImmediateRenegotiation"))
        note("%s pull" % label, http=st, track=track_name, renegotiation_requested=reneg,
             track_errors=errs or None,
             detail=json.dumps(bd)[:200] if st not in (200, 201) else None)

        # THE ANSWER LEG. Skipping it yields a 200 and zero frames.
        if reneg and bd.get("sessionDescription"):
            await sub.setRemoteDescription(RTCSessionDescription(**bd["sessionDescription"]))
            await sub.setLocalDescription(await sub.createAnswer())
            st2, _bd2 = http("PUT", "/api/classroom/renegotiate",
                             {"sessionId": sid,
                              "sessionDescription": {"type": "answer",
                                                     "sdp": sub.localDescription.sdp}}, token)
            note("%s renegotiate" % label, http=st2)

        note("%s transport" % label, state=await settle(sub))
        await asyncio.sleep(LISTEN_SECONDS)
        await sub.close()
        return stats, sid

    real, _ = await pull(TRACK, "subscriber")
    note("MEDIA ARRIVED", frames=real["frames"], mean_energy=round(real["energy"], 1),
         seconds=LISTEN_SECONDS)

    # THE CONTROL: a track nobody published must not produce frames.
    control, _ = await pull(ABSENT_TRACK, "CONTROL absent-track")
    note("CONTROL result", frames=control["frames"],
         expectation="zero frames; anything else means the subscriber decodes regardless")

    await pub.close()
    passed = real["frames"] > 0 and control["frames"] == 0
    report["verdict"] = "PASS" if passed else "FAIL"
    report["reason"] = ("media crossed the SFU and the unpublished control stayed silent" if passed
                        else "frames=%d control=%d" % (real["frames"], control["frames"]))
    note("VERDICT", verdict=report["verdict"], reason=report["reason"])
    return 0 if passed else 1


rc = asyncio.run(main())
out = pathlib.Path("/tmp/classroom_media_roundtrip.json")
try:
    out.write_text(json.dumps(report, indent=1), encoding="utf-8")
    print("\nwritten:", out)
except Exception:  # noqa: BLE001
    pass
raise SystemExit(rc)
