# SessionStatus

The room's status in the source's words: *Scheduled*, *Live lesson*, *Ended*; red with a dot only when live.

Intentional addition built from `statusLabel` in `ClassroomsPage.jsx`. **Consumer provides:** `status` (`scheduled` · `live` · `ended`), `label` to override the word (*On air* for a channel), `onStage` when it sits on the dark stage (switches to the filled `stage-live` plate).

- A room is *Live lesson* because the host started the session, never because a media connection opened.
