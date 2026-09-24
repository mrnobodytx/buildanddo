# Real-account RBAC acceptance — staging, 2026-09-20

Evidence for criteria **D03-2**, **D03-3** and **D05-2**, which are open not because the feature is
unbuilt but because acceptance was never measured. Their own wording sets the bar: *"a fresh
real-user creation-and-reopen journey"*, *"a deployment-matched four-account acceptance run"*, and
*"a current real-account cross-workspace allow/deny matrix"*.

Reproduce: `scripts/ci/ocn_rbac_probe.py` (runs on a fleet box, one attempt per invocation) driven
per seat over `tools.cbf.node_drive`. Six real accounts, six machines, six public IPs — not six
sessions from one host, because one host cannot demonstrate that it is excluded from anything.

## What the run found first

Before any fix, with the same instrument:

| actor | role | `create_mission` in another account's workspace |
|---|---|---|
| ray-tor1-4 | **no membership at all** | **200 — record created** |
| ray-tor1-1 | member of a *different* workspace | **200 — record created** |
| ray-tor1-3 | viewer | 200 — record created |

Any authenticated user could write into any workspace by supplying its id. The `createRule` in force
was

```
@request.auth.id != '' && @request.auth.id = @request.body.owner
```

which asks only *did you name yourself as the owner*, never *are you a member of this workspace*.
Granted admins, editors and viewers meanwhile could **not read** the workspace they belonged to.

`1789900000_secure_workspace_rbac.js` exists to remove exactly this bypass and had been unappliable
since 2026-09-15 — not because of schema drift, but because its own preflight compared a JSVM-bound
`*string` against a string literal and therefore refused on every database. Same defect in
`1789800000` (member reads) and, in a different shape, `1790500000`. Fixed in `059e0b7` and
`9968d51`; role enforcement lives in `workspace-record-policy.js`, which was absent from staging and
was deployed with `administration.pb.js`.

## The matrix after the fix

> Egress addresses are held in the private GitLab mirror and deliberately not published here.
> The matrix depends only on the six sources being DISTINCT, which the labels preserve;
> the addresses themselves were never part of the proof.

Target workspace `56o8prujj51dmu2`, owned by `mesh-control`. Roles granted by its owner.

| actor | role | box / egress | `read_ws` | `create_mission` | expected |
|---|---|---|---|---|---|
| mesh-control | owner | egress A | 200 | 200 | allow / allow |
| ray-tor1-1 | admin | egress B | 200 | 200 | allow / allow |
| ray-tor1-2 | editor | egress C | 200 | 200 | allow / allow |
| ray-tor1-3 | **viewer** | egress D | 200 | **403** *"Your current workspace role does not allow this action."* | allow / **deny** |
| ray-tor1-4 | **outsider** | egress E | **404** | **400** — not created | **deny / deny** |
| mesh-memory | **outsider** | egress F | **404** | **400** — not created | **deny / deny** |

Cross-workspace, each actor reaching for a workspace it does not belong to: `read_ws` **404** and
`create_mission` **400** in every measured pair.

**Read the codes exactly.** `403` is the role hook refusing a member who lacks the role. `404` is
PocketBase declining to confirm an id exists to someone not allowed to see it — a denial that
deliberately leaks nothing. `400` is the create failing relation validation because the actor cannot
see the workspace it named; the record is not created. They are different mechanisms and the
distinction is kept rather than flattened into "denied".

**The allows are the control.** Owner, admin and editor still return 200. A change that denied
everyone would score better on refusals and be a worse system; without those three cells this table
would not distinguish working access control from a broken write path.

## Honest remainder

- Four cross-workspace cells came back `UNMEASURED` on the multi-hop SSH transport. Unmeasured is
  recorded as unmeasured; it is not counted as a denial.
- `workspace_members` write rules are now `null` (superuser-only) by design — "close native
  administration writes" — so membership is granted through the administration hook, not the public
  API. The grants in this run predate that change.
- This is **staging**. Production still runs a thinner hook set and has not been touched.
