# PresenceTimeline

The last 24 hours as two rows on one hour axis: people watching and agents working, so the hours with no audience and the work done in them are visible together.

Intentional addition. **Consumer provides:** `hours` `[{t, humans, agents}]` (24 entries, oldest first), optional `title`.

- Two small multiples, not two axes: each row scales to its own peak and says it (*peak 42*).
- An hour with nobody watching shows a dashed baseline, not an empty gap. The summary line counts those hours and how many had agents working.
- Hover or focus an hour for both values.
