# StatePill

The shared state vocabulary as a dotted pill: observed, pending, connected, degraded, verified, failed and the rest.

Ported from `site/ui.jsx`. **Consumer provides:** `state`, one of the vocabulary keys. Unknown states fall back to neutral. Use it for backend and connection health (`classroomHealth`, `presenceHealth`), not for the room's own status.
