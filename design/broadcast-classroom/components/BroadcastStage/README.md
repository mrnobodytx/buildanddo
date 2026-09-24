# BroadcastStage

The host's broadcast: a 16:9 dark stage holding the host video, the session status and signal overlay, and a name plate; or an honest empty state.

Intentional addition. **Consumer provides:** `status` (room status), `children` (a `<video autoplay playsinline>` bound to the pulled track), `hostName`, `section` (e.g. *Section 2 of 6*), `signal` + `packets` (as `SignalMeter`), `empty` (`camera-off` · `silent` · `not-configured` · `agents`) to override the picture with a stated reason, and `agents` (a count) with `empty: 'agents'` when no one is on air but agents are working on the channel's content.

- The stage stays dark in both themes; nothing on it uses paper tokens.
- Without video, say why in one sentence (*Waiting for the host to start.*, *Connected, but no frames are arriving.*); never show a spinner indefinitely or a blank black box.
- Place it above the shared lesson; the lesson remains the record, the broadcast is the room.
