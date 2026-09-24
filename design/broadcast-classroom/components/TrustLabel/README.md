# TrustLabel

A Kestrel source label on a claim: VERIFIED, SOURCED, RECALLED, INFERRED, UNVERIFIED, DISPUTED, REFUTED or UNKNOWN.

Intentional addition. **Consumer provides:** `label`, `evidence` (a tool-call id, URL or memory id). VERIFIED and SOURCED without `evidence` render as UNVERIFIED: the component refuses the upgrade.
