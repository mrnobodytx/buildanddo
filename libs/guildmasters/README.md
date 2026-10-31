# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/guildmasters/README.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-GUILDMASTER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-GUILDMASTER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-31
# Depends:     libs/guildmasters/__init__.py, apps/pocketbase/pb_hooks/guildmasters.js
# EnumType:    Doc
# EnumEdges:   CONSUMES libs/guildmasters/__init__.py; CONSUMES apps/pocketbase/pb_hooks/guildmasters.js
# DAG Node:    none
# Intent:      Tell script authors where the guildmaster roster comes from and what this mirror will not do.
# ───────────────────────────────────────────────────────────────

# libs.guildmasters

A Python mirror of the server's guildmaster registry,
`apps/pocketbase/pb_hooks/guildmasters.js`. The server copy is canonical. Use this one from
scripts and verifiers, and do not keep a fourth list of names.

Python 3.11+, standard library only, no I/O, no environment.

```python
from libs.guildmasters import GUILDMASTERS, ORDER, by_seat, resolve, persona_id

ORDER                      # ('forge', 'scholar', 'oracle', 'alex', 'sterling', 'muse', 'quill', 'director')
resolve("gm-ent-director") # Guildmaster(seat='director', slug='director-nexus', name='Director Nexus', ...)
persona_id(by_seat("forge"))  # 'gm-forge'
```

| Name | What it is |
|------|------------|
| `Guildmaster` | Frozen dataclass: `seat`, `slug`, `name`, `guild`, `aliases` (a tuple). |
| `GUILDMASTERS`, `ORDER` | The eight entries and their seat ids, in rota order. |
| `SEAT_DOMAIN` | `@ocn.buildanddo.invalid`, the reserved domain of seat accounts. |
| `by_seat`, `by_slug` | Exact lookup, or `None`. |
| `resolve` | Seat, slug, alias, display name or presence id to an entry, or `None`. Same rules as the server. |
| `persona_id` | `gm-<slug>`. |
| `seat_email` | The reserved email of a registered seat, or `None`. |
| `as_json` | The roster in exactly the server's entry shape, `aliases` as a list. |

`tests/upgrade/guildmaster-registry.test.mjs` compares `as_json()` and `resolve` with the server
registry. `tests/upgrade/test_guildmasters.py` covers the mirror on its own.

This mirror cannot tell you whether an account is a guildmaster. Only the server decides that,
from the stored account (`seatOf`, see `docs/guildmasters.md`). It also never holds which machine
runs which seat.
