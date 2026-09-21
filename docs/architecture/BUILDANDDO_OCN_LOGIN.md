<!-- CGRF: SRS=SRS-BUILDANDDO-LIVE-UTILIZATION-001 | CAPS=B | Seat=C-ONE -->
# BuildAndDo OCN login — Citadel seats sign in with a CitadelKey

"OCN login" lets a Citadel Nexus seat (the Operator on Citadel Network at rig1,
a guildmaster, a fleet agent) log into BuildAndDo with its **CitadelKey** instead
of a human password, and lets the estate **test login without ever typing a
password**. It reuses the envelope contract and the vendored Ed25519 signer the
Living Rooms sidecar already ships; the only new cryptographic surface is the
public-key **verify** path, and it runs in that same sidecar, on loopback.

## Topology

```
seat runtime (rig1 / guildmaster box)
   │ holds the seat PRIVATE seed (file named by BUILDANDDO_CK_PRIVATE_KEY_FILE)
   │ signs ONE envelope: audience "buildanddo-login",
   │   payload {"login":"buildanddo","ts_bucket":"<UTC YYYY-MM-DDTHH>"}
   │ hands the X-Citadel-Key value to the SPA (window.__BND_OCN_HEADER__)
   │   or POSTs it straight to the API (estate probe)
   ▼
SPA  /login?ocn=1  →  POST /hcgi/platform/api/ocn/login   (header only, no body)
   │ never signs, never holds a key, stores nothing unless 200 + token
   ▼
nginx  /hcgi/platform/  →  PocketBase  pb_hooks/ocn-login.pb.js  (routerAdd)
   │ cannot verify Ed25519 in the JSVM, so it asks the loopback sidecar:
   │ POST http://127.0.0.1:8092/api/rooms/verify
   │      {"header": <X-Citadel-Key>, "payload": {...}, "audience": "buildanddo-login"}
   ▼
rooms sidecar  services/buildanddo_visual_substrate  (127.0.0.1 only)
   │ PUBLIC registry COPY (BUILDANDDO_CK_PEER_REGISTRY_FILE; rows seat_id, agent_id,
   │   rig, pubkey_fp, env, revoked_at + raw public key)
   │ checks, in order: registry row, revoked_at, pubkey_fp vs registry, Ed25519
   │   signature over sorted compact JSON of the 9 signed fields, payload sha256,
   │   audience, timestamp window (24h), single-use nonce (state/rooms/seen_nonces.jsonl)
   │ 200 {ok:true, seat_id, agent_id, rig, pubkey_fp} | 401 {ok:false, reason}
   │ 503 {ok:false, reason:"peer_registry_unmeasured"} when no registry copy
   ▼
PocketBase  finds users record <seat_id>@ocn.buildanddo.invalid (verified, ocn_seat)
   │ 403 seat_not_provisioned if absent
   │ 200 {token: record.newAuthToken(), record:{id,email,name,ocn_seat,seat_id,agent_id,rig}}
   ▼
SPA  pb.authStore.save(token, record)  →  /app
```

Status semantics are the same as Living Rooms: **401** = the key was not
believed, **403** = believed and refused, **503** = the verifier could not be
consulted (fail-closed; nothing is ever signed in on a 503).

## Files

| Layer | File | Role |
|---|---|---|
| Sidecar | `services/buildanddo_visual_substrate/citadelkey.py` | `PeerRegistry`, `NonceStore`, `verify_envelope`, `verify_header` — public-key verify alongside the signer |
| Sidecar | `services/buildanddo_visual_substrate/server.py` | `POST /api/rooms/verify`; `verifier` block in `/api/rooms/health` |
| Sidecar | `services/buildanddo_visual_substrate/__main__.py` | `--selftest` controls: valid seat 200, replay 401, unknown seat 401, wrong audience 401, revoked 401, wrong key 401, other bucket 401, malformed 401, foreign audience 400, no registry 503, ledger reload replay 401 |
| PocketBase | `apps/pocketbase/pb_hooks/ocn-login.pb.js` | `routerAdd` convention: `POST /api/ocn/login`, `GET /api/ocn/health` |
| PocketBase | `apps/pocketbase/pb_migrations/1789100000_ocn_seat_users.js` | seat users + `users.ocn_seat` bool; reversible |
| SPA | `apps/web/src/lib/ocnLogin.js` | fetch + `authStore.save`; readable errors; nothing saved unless 200 + token |
| SPA | `apps/web/src/pages/LoginPage.jsx` | "Citadel seat sign-in" affordance, only on `?ocn=1` or `window.__BND_OCN_HEADER__` |
| Tests | `apps/web/src/lib/__tests__/ocnLogin.test.js`, `apps/web/src/components/auth/__tests__/LoginPage.ocn.test.jsx` | vitest, mocked fetch |
| Estate | `D:\HOSTINGER_COMP\tools\citadel_staging_error_corpus.py` (+ `tests/error_corpus`) | `LOGIN_CONTRACT`, `LOGIN_OCN_ROUTE`, `LOGIN_OCN_ROUTE_MISSING`, `LOGIN_OCN_E2E` |

## Envelope contract (unchanged from Living Rooms)

`X-Citadel-Key` = unpadded base64url of the compact envelope JSON. Signed fields:
`seat_id, rig, agent_id, env, audience, payload_sha256, nonce, ts, ver` (sorted,
compact, Ed25519). For login: `audience = "buildanddo-login"`, payload =
`{"login":"buildanddo","ts_bucket":"YYYY-MM-DDTHH"}` (UTC hour). PocketBase
computes the bucket itself and, when the sidecar answers `payload hash mismatch`,
retries once with the previous hour; the sidecar checks the payload hash **before**
it records the nonce, so that retry can never be refused as a replay.

## Custody

- The seat's **private** seed lives only on the seat's own host, in the file named
  by `BUILDANDDO_CK_PRIVATE_KEY_FILE`. BuildAndDo never receives it. The estate
  probe reads it through the same loader (`load_private_key`) and never copies it.
- BuildAndDo holds only a **copy of the public registry**
  (`BUILDANDDO_CK_PEER_REGISTRY_FILE`). It contains public keys and fingerprints;
  a leaked copy lets nobody sign anything.
- The browser holds nothing: `window.__BND_OCN_HEADER__` is a single-use envelope
  the runtime injects for one sign-in; the page never writes it to storage
  (asserted by the page test), never logs it, and never signs.
- The sidecar's `/api/rooms/verify` is a POST on loopback that nginx does not
  expose; the browser cannot reach it. `/api/rooms/health` reports registry counts,
  seat ids and nonce counts, never key bytes.
- Seat users have a 48-character random password generated by
  `$security.randomString` at migration time and **discarded**. The domain
  `ocn.buildanddo.invalid` is reserved-invalid (RFC 2606): no mailbox, so no
  password reset, OTP or verification mail can ever be delivered. Password login
  for a seat is impossible by construction; `/api/ocn/login` is the only door.

## Negative controls

| Control | Where refused | Status | `message` / `reason` |
|---|---|---|---|
| No header | PocketBase | 401 | `X-Citadel-Key header required` |
| Undecodable header | sidecar → PocketBase | 401 | `citadelkey_rejected:malformed X-Citadel-Key header` |
| Seat not in registry copy | sidecar → PocketBase | 401 | `citadelkey_rejected:unknown seat '…' (no registered public key)` |
| `revoked_at` set | sidecar → PocketBase | 401 | `citadelkey_rejected:seat '…' revoked` |
| Right seat, wrong private key | sidecar → PocketBase | 401 | `citadelkey_rejected:bad signature` or `…pubkey_fp mismatch (key rotated?)` |
| Envelope reused | sidecar → PocketBase | 401 | `citadelkey_rejected:replay (nonce already seen)` — survives a sidecar restart (file ledger) |
| Signed for `citadel-nexus-rooms` | sidecar → PocketBase | 401 | `citadelkey_rejected:audience mismatch (for citadel-nexus-rooms)` |
| Envelope older than 24h | sidecar → PocketBase | 401 | `citadelkey_rejected:timestamp outside the replay window` |
| Key believed, no seat user | PocketBase | 403 | `seat_not_provisioned` |
| Human account on the reserved domain | PocketBase | 403 | `seat_not_provisioned` (`ocn_seat` must be true) |
| Sidecar down / no registry copy | PocketBase | 503 | `ocn_verifier_unavailable` |
| Hook not deployed | PocketBase | 404 | JSON `Not Found.` → estate class `LOGIN_OCN_ROUTE_MISSING` |

All sidecar controls are exercised offline by
`python -m services.buildanddo_visual_substrate --selftest` (28 controls on
2026-09-11, ephemeral keys, loopback only).

## How a guildmaster logs in

1. Its runtime loads the seat seed from `BUILDANDDO_CK_PRIVATE_KEY_FILE` and signs
   one envelope with `Signer(...).header({"login":"buildanddo","ts_bucket":<UTC hour>}, "buildanddo-login")`
   (identity = its `seat_id`, `rig`, `agent_id` as registered in Citadel Nexus).
2. Headless: `POST https://buildanddo.com/hcgi/platform/api/ocn/login` with header
   `X-Citadel-Key: <value>`; keep `token` and `record` from the 200 and use the
   PocketBase SDK (`pb.authStore.save(token, record)`) or `Authorization: <token>`.
3. In a browser: open `/login?ocn=1` with `window.__BND_OCN_HEADER__` set by the
   desktop runtime, press **Sign in with CitadelKey**; the SPA does the POST and
   lands on `/app`.

## How rig1 tests login without a password

`py -3.13 tools/citadel_staging_error_corpus.py harvest --env production --network`
on the rig that holds `BUILDANDDO_CK_PRIVATE_KEY_FILE`:

- `LOGIN_CONTRACT` — `auth-methods` must be 200 JSON; a POST to
  `auth-with-password` with the obviously-fake identity
  `corpus-probe-never-a-user@invalid.buildanddo.invalid` and a password string that
  is visibly not a credential must be **400 JSON `Failed to authenticate.`**
  (never HTML/405). No real identity or password is ever used.
- `LOGIN_OCN_ROUTE` / `LOGIN_OCN_ROUTE_MISSING` — `GET /hcgi/platform/api/ocn/health`
  must be JSON; a JSON 404 is "hook not deployed yet", HTML/405 is "proxy missing".
- `LOGIN_OCN_E2E` — signs one real envelope with the vendored signer and POSTs it;
  200 with a token is PASS (only `token_len` is recorded), 403
  `seat_not_provisioned` is DEGRADED, anything else is an error. Without the key
  path the row is **UNMEASURED**, never PASS.

## What remains UNMEASURED until VCC delivers

| Item | Why UNMEASURED today | Becomes measured when |
|---|---|---|
| Sidecar `verifier.state` on staging/production | `BUILDANDDO_CK_PEER_REGISTRY_FILE` not placed on the hosts; no public registry copy exists on the BuildAndDo side | VCC exports `data/runtime/citadelkey/seat_keypairs.json` (public rows only, with the raw public key per seat) and the operator places it for the sidecar |
| `/api/ocn/health`, `/api/ocn/login` live | hook + migration not deployed; both envs answer `LOGIN_OCN_ROUTE_MISSING` (production JSON 404) or `LOGIN_OCN_ROUTE` (staging HTML, proxy missing) | next PocketBase release with `pb_hooks/ocn-login.pb.js` and `1789100000_ocn_seat_users.js`; staging proxy fix lands |
| `LOGIN_OCN_E2E` from rig1 | rig1 has no seat seed at `BUILDANDDO_CK_PRIVATE_KEY_FILE`; this repository generates no keys | VCC issues the rig1 seat seed and registers its public key in Citadel Nexus |
| Seat rows in `1789100000_ocn_seat_users.js` match real Citadel Nexus seat ids | `rig1, forge, c-one, bits-codegen, datadog-bits` were declared, not read from the registry | registry copy arrives; any seat absent from it stays `seat_not_provisioned` (403) at login, which is DEGRADED, not a security failure |
| Registry row shape | assumed `seat_id, agent_id, rig, pubkey_fp, env, revoked_at` **plus** `pubkey_hex` (or `pubkey`/`public_key`/`pubkey_b64u`); a row without a raw public key is loaded as `usable:false` and refused with `registry row … is unusable` | the delivered file is inspected; the loader accepts list, `{seats:[…]}`, `{seat_keypairs:[…]}` and `{seat_id: row}` shapes |
