<!-- CGRF: SRS=SRS-BUILDANDDO-LIVE-UTILIZATION-001 | CAPS=B | Seat=C-ONE -->
# BuildAndDo Living Rooms

Living Rooms are curated projections over the shared BuildAndDo capability graph. Organization answers who owns what; Capability answers what the system can do and why it believes that; Development preserves SRS/branch/test/deployment evolution, including failed branches that are useful for teaching. Mission, Learning, Evidence, Community and Replay are declared rooms that render as "not yet published" until Citadel Nexus grants and serves them.

Room modes (`operate`, `inspect`, `teach`, `replay`) change presentation and permitted interactions, never the underlying truth or authority. All graphical elements correspond to a node, edge, measured aggregation, or explicit absence.

## Source of truth: the live Citadel Nexus contract

The UI does **not** read static artifacts. Every room is a live, cleansed projection served by Citadel Nexus over a signed platform boundary. On the BuildAndDo side a small sidecar (`services/buildanddo_visual_substrate`) is the only holder of the tenant's private key; the browser talks to it same-origin and never signs anything.

```
browser ──GET /api/rooms/projection/{kind}──► nginx ──► rooms sidecar (127.0.0.1:8092)
                                                          │ PRIVATE Ed25519 seed (file only)
                                                          │ one fresh X-Citadel-Key per request
                                                          │ `systems` refused here, never forwarded
                                                          ▼
                                   Citadel Nexus  GET /api/platform/rooms/projection/{kind}
                                                          │ PUBLIC key only
                                                          │ verify sig + payload hash + audience + nonce
                                                          │ tenant policy, cleanse, leak-verify, receipt
                                                          ▼
                                                  rooms sidecar re-runs leak check
                                                          │ 502 on any hit, body withheld
                                                          ▼
                                                       browser renders; absence = UNMEASURED
```

Upstream routes: `GET https://citadel-nexus.com/api/platform/rooms/projection/{name}` and `/api/platform/rooms/policy`, single header `X-Citadel-Key` = unpadded base64url of the compact envelope JSON. The envelope's signed fields are `seat_id, rig, agent_id, env, audience, payload_sha256, nonce, ts, ver` (compact, sorted JSON, Ed25519); the payload bound is `{"projection": name}`, the audience is `citadel-nexus-rooms`, and the BuildAndDo identity is `seat_id=buildanddo, rig=buildanddo, agent_id=buildanddo-platform, env=null`.

Served shape: `{srs, projection, generated_at, nodes[], edges[], layout{algorithm,direction,version}, evidence{state,sources_ok,sources_total}, tenant_id, served_by, cleansed:true}`.

Policy for `buildanddo` as measured 2026-09-11: `rooms`, `organization`, `capability`, `development` granted; `systems` never exportable; every other room refused by policy until published.

### Negative controls (real status codes)

| Control | Where refused | Status | `detail` |
|---|---|---|---|
| No `X-Citadel-Key` header | Citadel Nexus | 401 | `X-Citadel-Key header required` |
| Undecodable / non-object header | Citadel Nexus | 401 | `malformed X-Citadel-Key header` |
| Wrong private key for the claimed seat | Citadel Nexus | 401 | `citadelkey_rejected:pubkey_fp mismatch (key rotated?)` or `citadelkey_rejected:bad signature` |
| Envelope reused (same nonce) | Citadel Nexus | 401 | `citadelkey_rejected:replay (nonce already seen)` |
| Envelope signed for a different projection | Citadel Nexus | 401 | `citadelkey_rejected:payload hash mismatch (tampered)` |
| Envelope signed for another audience | Citadel Nexus | 401 | `citadelkey_rejected:audience mismatch (for …)` |
| Seat not provisioned as a tenant | Citadel Nexus | 403 | `tenant_not_provisioned` |
| Verified seat differs from claimed tenant | Citadel Nexus | 403 | `tenant_mismatch` |
| Room outside the tenant grant (e.g. `mission` today) | Citadel Nexus | 403 | `projection_not_granted` |
| Room granted but not compiled yet | Citadel Nexus | 403 | `projection_not_implemented` |
| `systems` | **rooms sidecar, locally** | 403 | `projection_never_exportable` (never forwarded; Citadel Nexus would answer the same) |
| Body carrying a mesh IP, `nats://`, an internal host or an absolute path | **rooms sidecar, locally** | 502 | `projection_leak_check_failed` (body withheld) |
| Unknown room name | rooms sidecar | 404 | `unknown_room` |

401 means "we do not believe you"; 403 means "we believe you and still refuse". The sidecar passes upstream codes through unchanged so the UI can tell the two apart. The frontend hook (`useRoomProjection`) renders `projection_not_granted` / `projection_not_implemented` as "not yet published by Citadel Nexus" and everything else as UNMEASURED with the verbatim reason. It never falls back to sample JSON; the files under `apps/web/public/room-projections/samples/` are shape samples for stories and tests and are referenced by no runtime code.

### Custody rules

- The private seed exists in exactly one place: a mode-0600 file on the host running the sidecar, named by `BUILDANDDO_CK_PRIVATE_KEY_FILE`. It is never an environment VALUE.
- It is never placed in React or Vite source or env files (`VITE_*`), PocketBase configuration or collections, `localStorage`/`sessionStorage`, receipts, logs, or CI variables.
- The browser never signs. It has no key, no envelope, and no route to Citadel Nexus; it only sees `/api/rooms/*` on its own origin.
- The sidecar reports only the public fingerprint (`pubkey_fp`, expected `2e1bad8142642379`) in `/api/rooms/health`; a mismatch or a missing file is a custody `HOLD` and the health route says so.
- No key is generated by this repository. Issuance stays with the Citadel Nexus operator.

## Readiness signal emitted by C-ONE

When the live path is measured, C-ONE emits `C-ONE_READY_FOR_BND_LIVE_001` with these fields. Each is `PASS`, `FAIL`, `HOLD` or `UNMEASURED`; a signal with any `UNMEASURED` field is a report, not a go.

| Field | Meaning | Evidence |
|---|---|---|
| `frontend_tests` | `npm test` green including the hook tests | vitest summary line |
| `frontend_build` | `npm run build` green | Vite build summary |
| `frontend_lint` | `npm run lint` exit 0 | lint exit code |
| `staging_proxy` | `infra/nginx/buildanddo-rooms-api.location.conf` installed and `/api/rooms/health` answers through nginx | curl through the public host |
| `citadelkey_backend_custody` | sidecar `custody: PASS` with the expected fingerprint | `--health` output |
| `organization_room_http` | live `GET /api/rooms/projection/organization` → 200 `cleansed:true` from the real Citadel Nexus | HTTP probe |
| `projection_leak_check` | selftest leak control passes and the live body passes the same gate | selftest + probe |
| `production_writes` | none performed | statement + `git status` |
