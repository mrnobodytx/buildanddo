# Evaluator journey

Everything below can be run by a reviewer with nothing but a browser and `curl`. None of our
credentials are required, and no step changes anything.

## 1. The product is actually served — 30 seconds

```
curl -s https://buildanddo.com/_version
```

Returns the build identity: commit, campaign and build time. The same command against
`https://staging.buildanddo.com/_version` returns the same build — the two environments are at
parity, which is the point of having two.

Open `https://buildanddo.com` and you get the platform, not a placeholder.

> Note for anyone probing further: the backend is served under `/hcgi/platform`. A request to
> `/api/...` returns the single-page app's HTML fallback with a 200, which reads convincingly like
> "no backend deployed". It isn't.

## 2. The agent identity plane is live — 30 seconds

```
curl -s https://buildanddo.com/hcgi/platform/api/ocn/health
```

```json
{"registry_seats": 37, "sidecar_reachable": true}
```

Thirty-seven software seats are registered and the signing sidecar answers. These seats log in with
Ed25519 envelopes; there is no password on them to guess.

## 3. The platform reports what it cannot do — 30 seconds

```
curl -s https://staging.buildanddo.com/hcgi/platform/api/classroom/health
curl -s https://buildanddo.com/hcgi/platform/api/classroom/health
```

Staging answers `ok: true` with `publishers_configured: 6`. Production answers `ok: false` with
`"reason": "CLOUDFLARE_REALTIME_APP_ID absent"` and `publishers_configured: 0`.

This is the most useful thirty seconds in this document. The production endpoint does not degrade
quietly, return an empty list, or pretend. It names the missing configuration. A reviewer can tell
*not built* from *broken* from *deliberately not enabled here* without reading any of our code.

## 4. Progress cannot be asserted, only earned — 2 minutes

```
python scripts/ci/sprint_replay.py
```

The 21-day build is twelve milestones, each citing commits and files. The replay re-reads every
citation, decides whether it still holds, and prints the difference between the claimed percentage
and the replayed one:

```
claimed 82.0%   replayed 82.0%   overstatement 0.0%
10 hold, 0 rotted, 0 unchecked, 2 not yet verified
```

To confirm it is not flattering us, replace the ledger's evidence strings with junk and run it
again: it scores zero. Two milestones are recorded unverified because their evidence does not
support a claim — day 5 and day 13.

## 5. A gate that cannot fail is not a gate — 2 minutes

```
python scripts/ci/migration_preflight.py --dir <a pocketbase tree> --selftest
```

This copies the live database, plants a deliberately broken migration, and requires the preflight to
**refuse** it while still accepting the clean set:

```
clean_set:                        PASS
with_a_planted_broken_migration:  FAIL
verdict: PASS — the gate passes a good set and REFUSES a broken one
```

The same pattern appears in the disclosure scanner (`--selftest` proves it still catches a real
bearer token) and in the submission policy checker. An earlier version of this preflight passed its
own planted control; that was treated as a defect and fixed, not explained away.

## 6. What the site serves is scanned, not just what we commit — 1 minute

```
python scripts/ci/verify_public_disclosure.py          # the 201 built files the site serves
python scripts/ci/verify_public_disclosure.py --repo   # the 540 tracked files the mirror publishes
```

Zero BLOCK findings on both surfaces. Remaining warnings are listed rather than suppressed. These
are separate surfaces on purpose: scrubbing the working tree does not scrub what a built bundle
already contains.

## 7. The failures are put in front of you — 1 minute

```
python scripts/ci/hostinger_readiness.py --check
```

Fourteen acceptance checks: eight pass, six fail, none blocked. Every receipt in
`state/hostinger/acceptance/` carries a `twin_state` field saying what its numbers mean. Compare a
blocked receipt with a passing lint receipt — identical counts, opposite meanings, stated explicitly
rather than left to be inferred:

```
native_classroom  BLOCKED  {tests: 0, failures: 0}  ->  NOT_TESTED      / UNMEASURED
web_lint          PASS     {tests: 0, failures: 0}  ->  NOT_APPLICABLE  / OBSERVED
```
