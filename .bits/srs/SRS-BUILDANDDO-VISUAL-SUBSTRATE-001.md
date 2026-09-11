# SRS-BUILDANDDO-VISUAL-SUBSTRATE-001 — Living Rooms visual substrate

## Objective
Render Organization, Capability, and Development Branch rooms from deterministic graph projections while preserving truth-state semantics, and install agent/content/A2A contracts that can operate over those projections without granting extra authority.

## Acceptance
- Organization, Capability and Development routes render from projection JSON and show UNMEASURED when absent.
- Layout is deterministic and uses no random force simulation.
- Failed/unmeasured state is not silently hidden or upgraded.
- AgentOps YAML, Jinja forum templates, A2A values and SOPs pass package selftests.
- No content is auto-published and install performs zero remote writes.
- Existing BuildAndDo public/private boundary remains intact.

## Risk
A2 local/public-repo code change. Publication and production mutation are out of scope.
