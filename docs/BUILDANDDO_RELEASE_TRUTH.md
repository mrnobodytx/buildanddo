# BuildAndDo verified release truth

This release lane preserves the sprint rule:

`candidate -> GitLab pipeline/runner -> immutable artifact -> staging -> external readback -> production -> external SHA readback -> evidence -> DORA`

Production is not VERIFIED until the production `/_version` document reports the exact candidate SHA and the external health checks pass. DORA is emitted only after that verification.

The GitLab jobs are intentionally manual and require explicit A3 operator promotion. Missing URLs, webroots, credentials, artifact state, or readback cause HOLD rather than inferred success.
