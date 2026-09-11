<!-- CGRF: SRS=SRS-BUILDANDDO-LIVE-UTILIZATION-001 | CAPS=B | Seat=C-ONE -->
# BuildAndDo visual substrate — Living Rooms sidecar

This package is the BuildAndDo **backend boundary** for Living Rooms. It is the
only process on the BuildAndDo side that holds the tenant's CitadelKey private
seed. The browser renders projections; it never signs, never holds a key, and
never talks to Citadel Nexus directly.

## Custody topology

```
browser (React SPA)
   │  GET /api/rooms/projection/{kind}      same origin, no credentials
   ▼
nginx  location /api/rooms/  ──►  this sidecar  (127.0.0.1:8092)
                                    │ owns the PRIVATE Ed25519 seed
                                    │ signs ONE fresh X-Citadel-Key envelope per request
                                    │ refuses `systems` locally, never forwards it
                                    ▼
                       Citadel Nexus  GET /api/platform/rooms/projection/{kind}
                                    │ holds only the PUBLIC key
                                    │ verifies signature, payload hash, audience,
                                    │ single-use nonce; applies tenant policy;
                                    │ cleanses + leak-verifies; receipts
                                    ▼
                              this sidecar  re-runs leakcheck on the body
                                    │ 502 projection_leak_check_failed on any hit
                                    ▼
                                 browser  renders; absence is UNMEASURED
```

Status codes cross the boundary unchanged: **401** = the key was not believed
(`X-Citadel-Key header required`, `malformed`, `citadelkey_rejected:<reason>`),
**403** = believed and still refused (`tenant_not_provisioned`,
`projection_not_granted`, `projection_never_exportable`,
`projection_not_implemented`), **502** = this sidecar withheld a body that failed
its own leak check, or the upstream was unreachable.

## Routes served to the SPA

| Route | Behaviour |
|---|---|
| `GET /api/rooms/projection/{kind}` | `organization`, `capability`, `development`, `mission`, `learning`, `evidence`, `community`, `replay` are signed and proxied. `systems` answers `403 {"detail":"projection_never_exportable"}` here and is never forwarded. Anything else is `404 unknown_room`. |
| `GET /api/rooms/policy` | Signed and proxied; the upstream answers for the calling tenant only. |
| `GET /api/rooms/health` | `{state: READY\|HOLD, custody: {custody: PASS\|HOLD\|UNMEASURED, reason, pubkey_fp, expected_pubkey_fp}, upstream: {state, last_status, last_detail, last_projection}}`. Never contains key material. |

## Operator steps — placing the key

The seed never travels through an environment VALUE, a React/Vite env file, the
PocketBase config, `localStorage`, a receipt, or a log line. Only its file path is
configured.

1. Obtain the 32-byte Ed25519 seed for the `buildanddo` seat as a 64-character
   hex file from the Citadel Nexus operator (it is issued there; this package
   never generates keys).
2. Place it where only the sidecar's service user can read it, e.g.
   `/etc/buildanddo/rooms/buildanddo.key`, then `chmod 0600` and `chown` to that
   user. On POSIX a group- or world-readable file is refused at load (`HOLD`).
3. Set, in the sidecar's service environment only:

   | Variable | Meaning | Default |
   |---|---|---|
   | `BUILDANDDO_CK_PRIVATE_KEY_FILE` | Path to the hex seed file. **Required** to sign. | unset → custody `HOLD` |
   | `BUILDANDDO_CK_EXPECTED_PUBKEY_FP` | Public fingerprint the loaded key must match. Set to empty to report `UNMEASURED` instead of comparing. | `2e1bad8142642379` (as registered in Citadel Nexus, 2026-09-11) |
   | `BUILDANDDO_ROOMS_BIND` | `host:port` the sidecar listens on. | `127.0.0.1:8092` |
   | `BUILDANDDO_ROOMS_UPSTREAM` | Citadel Nexus origin. | `https://citadel-nexus.com` |

4. Start: `python -m services.buildanddo_visual_substrate --serve`
5. Verify custody without touching the key:
   `python -m services.buildanddo_visual_substrate --health` → `custody: PASS`.
6. Front it with `infra/nginx/buildanddo-rooms-api.location.conf` (production /
   staging) or the Vite dev proxy (`/api/rooms` → `127.0.0.1:8092`).

## Selftest (offline, simulated)

`python -m services.buildanddo_visual_substrate --selftest` starts the sidecar on
a loopback port and replaces Citadel Nexus with an in-process verifier that
rebuilds the signed object, checks the Ed25519 signature, payload hash, audience
and single-use nonce in the same order the real bridge does. Keys are ephemeral
and live only for the run. Controls: no key → 401; bad key → 401; replayed nonce →
401; wrong payload binding → 401; ungranted projection → 403; wrong seat → 403;
`systems` → 403 locally with zero upstream calls; valid `organization` → 200
`cleansed:true`; a body carrying `10.0.0.5` → 502 with the body withheld.

Selftest output is labelled `"selftest": "simulated"`. It proves the contract
and the fail-closed paths; it is not evidence that the live Citadel Nexus bridge
accepted a request.

## Dependencies

Standard library plus `cryptography` (Ed25519). No Citadel Nexus code is imported
at runtime; the canonical envelope form is vendored in `citadelkey.py` and was
cross-checked against the real verifier on 2026-09-11.
