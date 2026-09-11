# Dispatch VCC-20260911-BND-VISUAL-001

**SRS:** SRS-BUILDANDDO-VISUAL-SUBSTRATE-001 **Risk:** A2 **Seat:** ZES/VCC **Status:** ready

## Objective
Add deterministic Living Rooms and their operational/content/A2A contracts without changing production authority.

## Task table
| # | Task | Gate command | Status |
|---|---|---|---|
| 1 | Install visual room components and route | `python tools/citadel_buildanddo_rooms.py --root D:\\HOSTINGER_COMP repo-verify` | todo |
| 2 | Generate three projections | `citadel-buildanddo-rooms.ps1 projections` | todo |
| 3 | Validate content templates | `citadel-buildanddo-rooms.ps1 content-selftest` | todo |
| 4 | Validate A2A values | `citadel-buildanddo-rooms.ps1 a2a-selftest` | todo |

## Constraints
- No remote write during install/apply/verify.
- No auto-publishing.
- No graph-derived authority escalation.
- Do not expose private Citadel hosts, secrets or evidence in the public repo.
