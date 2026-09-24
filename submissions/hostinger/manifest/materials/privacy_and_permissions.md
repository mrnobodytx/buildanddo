# Privacy and permissions

## What the platform stores

Member accounts (email and authentication material), the workspaces they belong to, and the work
they produce: missions, workflows, signals, evidence, classroom membership, presence and messages.

Agent seats store a public key and a seat identifier. **No private key is ever held by the
platform.** Signing happens on the machine that owns the seat, and the platform verifies an envelope
it could not itself have produced.

## How access is enforced

Access is enforced by backend collection rules, not by the interface. The governing rule is
ownership: `@request.auth.id = owner`. A member lists only their own records because the database
refuses to return anyone else's, and a foreign-workspace write is rejected by the backend even when
the request is well formed.

This is checked rather than asserted, and the checking has earned its keep. Two defects of exactly
this kind were found and fixed during the build:

- Two migrations whose guards compared a rule object against a string literal. The comparison could
  never be true, so neither migration ever applied, and a workspace-membership bypass stayed open
  for days while the migration log said it had been closed.
- Five classroom collections whose API rules were `null` — meaning superuser-only, so no member
  could use them at all. The feature looked built and was unreachable.

Both were found by probing the live rules, not by reading the code. Neither would have been caught
by a test that trusted the migration record.

## Fail-closed by default

Where a capability could expose members to each other, the default is off, and it says so rather
than failing quietly.

Classroom publishing is the clearest case: `publishers_configured: 0` on an unconfigured environment
is a **deliberate** fail-closed default, not a fault. The allowlist takes explicit member addresses;
nobody broadcasts into a room because a flag was left on somewhere.

## Secrets

No credential value is written into application state, receipts, telemetry or content. Secrets are
referenced by name and loaded into the process that needs them. The tooling prints names and
booleans — `configured; value hidden` — never values.

Two credentials are currently disclosed to anyone with shell access on the staging host, and we are
listing them rather than waiting to be asked:

- The Cloudflare Realtime application secret sits as a plaintext `Environment=` line in a systemd
  unit, so a routine `systemctl show` prints it to the terminal.
- `gitlab-runner list` prints the runner authentication token the same way, meaning an ordinary
  "is the runner alive?" check discloses a credential.

Both are scheduled for rotation and relocation to `0600` environment files. Production classroom
realtime is deliberately **not** configured until that rotation happens — enabling it first would
mean deploying a secret we already know is readable.

## What we publish

The public site is scanned for disclosure as a build gate, across two separate surfaces: the built
files the site actually serves (201) and every tracked file the public mirror publishes (540). Zero
BLOCK findings on both. They are scanned separately on purpose — scrubbing a working tree does not
scrub what a built bundle already contains, nor what published history still holds.

A live disclosure was found by that scan during this build and fixed: a public status document was
naming our private control-plane hosts in its evidence fields, returning 200 to anyone who asked. It
now reads "private control plane (not published)".

The scanner ships a selftest proving it can still catch a real bearer token and that an empty scan
reports UNMEASURED rather than PASS. A scanner that had quietly stopped matching would otherwise
report the same clean result as a genuinely clean site.

## Member data and third parties

Analytics are not enabled in the shipped bundle. Cloudflare terminates TLS and carries classroom
media as transport; the durable record of who was in a room and what was said stays in the
platform's own database, not the transport provider's.
