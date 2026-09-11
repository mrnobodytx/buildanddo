<!-- CGRF: SRS=SRS-BUILDANDDO-LIVE-UTILIZATION-001 | CAPS=B | Seat=C-ONE -->
# Room projection samples — NON-AUTHORITATIVE

These JSON files are shape samples for stories and tests only. No runtime code
reads them: the Living Rooms UI fetches `/api/rooms/projection/{kind}` from the
rooms sidecar, which signs a CitadelKey envelope and relays the live, cleansed
projection from Citadel Nexus. A missing or refused projection renders as
UNMEASURED; it is never replaced by one of these files.

`systems.json` was removed on purpose: the systems projection is internal
topology and is never exportable across the platform boundary.
