# Licence and attribution

## Ownership

BuildAndDo is the work of **Citadel Nexus Inc.** Every source file carries a governance header
naming the owner, the requirement it implements, and the seat that wrote it.

## Licence status — please read

**The repository does not currently carry a `LICENSE` file, and `package.json` declares no `license`
field.** We are stating that plainly rather than implying a grant we have not made.

Absent an explicit grant, the work is proprietary to Citadel Nexus Inc. and all rights are reserved.
Choosing and applying an open-source licence, if one is to be applied, is the owner's decision and
had not been made at the time of this submission. A reviewer should treat the source as available
for evaluation only.

This is listed here rather than in the known gaps because it is a decision outstanding, not a defect.

## Third-party components

The web application depends on 55 runtime packages, all installed from the public npm registry under
their own licences, with an exact-version lockfile committed. The principal ones:

| Component | Version | Role |
|---|---|---|
| React / React DOM | 18.3.1 | user interface |
| React Router | 7.18.2 | routing |
| Vite | 7.3.6 | build |
| Vitest | 3.2.4 | test runner |
| Tailwind CSS | 3.4.17 | styling |
| PocketBase JS SDK | 0.28.0 | backend client |

The backend is **PocketBase 0.39.8**, an MIT-licensed Go application, run unmodified. Our behaviour
is added through its JavaScript hook and migration interfaces rather than by forking it — which also
means a reviewer can reason about the backend from its public documentation.

A `dependency_lock` acceptance check runs against every build and currently passes, so the versions
above are the versions that shipped.

## Infrastructure

Hosted on Hostinger KVM VPS instances. Cloudflare provides the edge, and Cloudflare Realtime
provides the classroom SFU. These are consumed as services under their own terms; no vendor code is
redistributed here.

## Attribution of authorship

Parts of this codebase were written by software agents operating under named seats, with each commit
attributed in its message and each file stamped with the seat that authored it.

We consider that worth stating rather than obscuring. The platform's whole subject is evidence-backed
work, and it would be incoherent to hold a learner's claims to a standard we would not apply to our
own authorship record.
