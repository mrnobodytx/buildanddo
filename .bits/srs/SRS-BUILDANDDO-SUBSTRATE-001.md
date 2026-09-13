# SRS-BUILDANDDO-SUBSTRATE-001 — Dual substrate and capability graph foundation

**Dispatch:** VCC-20260911-BND-SUBSTRATE-001  
**Risk:** A1  
**Actor:** mixed / agent-assisted

## Objective

Give BuildAndDo one machine-readable capability model that can be projected into two separately-authorized contexts:

- **user substrate** — workspaces, signals, missions, workflows, evidence, tutorials and progress;
- **development substrate** — repository, branch, SRS, tests, pipelines, evidence and release state;
- **meta substrate** — capability identity, organization ownership, curriculum relationships and provenance.

The MCP surface is read-only in this SRS. It grants no mutation authority.

## Acceptance

1. `python services/buildanddo_mcp/server.py --selftest` returns PASS.
2. User, developer and guildmaster profiles expose different tool sets from one server implementation.
3. Every returned state is derived from repository/PocketBase schema evidence or explicitly `UNMEASURED`.
4. No Citadel private hostnames, credentials or internal fleet topology are emitted by the public repo service.
5. Existing CI/public-boundary checks remain authoritative.
