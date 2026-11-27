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
# Depends:     libs/guildmasters/__init__.py, apps/pocketbase/pb_hooks/guildmasters.js, libs/guildmasters/rota.py, libs/guildmasters/__main__.py
# EnumType:    Doc
# EnumEdges:   CONSUMES libs/guildmasters/__init__.py; CONSUMES apps/pocketbase/pb_hooks/guildmasters.js; CONSUMES libs/guildmasters/rota.py; CONSUMES libs/guildmasters/__main__.py
# DAG Node:    none
# Intent:      Tell script authors where the guildmaster roster comes from and what this mirror will not do.
# ───────────────────────────────────────────────────────────────

# libs.guildmasters

A Python mirror of the server's guildmaster registry,
`apps/pocketbase/pb_hooks/guildmasters.js`. The server copy is canonical. Use this one from
scripts and verifiers, and do not keep a fourth list of names.

Python 3.11+, standard library only, no I/O, no environment. The CLI below reads only its
arguments and, when no instant is given, the clock.

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

## The weekly class rota

`libs.guildmasters.rota` mirrors `apps/pocketbase/pb_hooks/guild-rota.js`: who hosts, attends and
audits each weekly guild class, from the date alone (`docs/guildmasters.md` states the rule). It is
pure too, and refuses naive datetimes rather than guessing a zone.

```python
from datetime import datetime, timezone
from libs.guildmasters import rota

rota.week(datetime(2026, 11, 4, tzinfo=timezone.utc))["week"]   # '2026-W45'
rota.parse_week("2026-W53")                                      # Monday 2026-12-28 00:00 UTC
rota.current(datetime.now(timezone.utc))["host"]                 # the seat hosting now or next
```

The same answers on the command line, offline (`--json` for machine-readable output):

```bash
python -m libs.guildmasters list
python -m libs.guildmasters week --week 2026-W45
python -m libs.guildmasters current --at 2026-11-02T15:00:00Z
```

`tests/upgrade/guild-rota.test.mjs` requires this module and the server's to agree on every field for
176 weeks; `tests/upgrade/test_guild_rota.py` covers the module and the CLI.

This mirror cannot tell you whether an account is a guildmaster. Only the server decides that,
from the stored account (`seatOf`, see `docs/guildmasters.md`). It also never holds which machine
runs which seat.
