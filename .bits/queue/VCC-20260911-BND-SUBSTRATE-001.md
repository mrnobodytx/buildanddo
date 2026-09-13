# Dispatch VCC-20260911-BND-SUBSTRATE-001

**SRS:** SRS-BUILDANDDO-SUBSTRATE-001 **Risk:** A1 **Seat:** ZES / VCC **Status:** ready

## Objective

Create the shared BuildAndDo capability graph and read-only MCP profiles without duplicating PocketBase, the evidence fabric, or Citadel authority.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Repair known merged P0 source collisions when still present | `npm run build` | todo |
| 2 | Add user/dev/meta substrate projections | `python services/buildanddo_mcp/server.py --selftest` | todo |
| 3 | Add profile-scoped MCP tools | `python services/buildanddo_mcp/server.py --selftest` | todo |
| 4 | Refresh measured agent context | `python scripts/ci/agent_context.py --check` | todo |

## Constraints

- No production mutation.
- No secrets or private Citadel topology in this repository.
- MCP remains A1/read-only.
- PocketBase remains the user-state store; Praxis remains evidence substrate.
- Git/repository state remains the development-state source, not a second database.
