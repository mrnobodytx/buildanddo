# SignalMeter

Measured receive state: four bars, a word and, when known, the inbound packet count.

Intentional addition built from `inboundAudioStats()` in `lib/classroomRealtime.js`. **Consumer provides:** `state` (`not-configured` · `not-connected` · `measuring` · `silent` · `weak` · `receiving` · `interrupted`), optional `packets` (SFU: `inbound-rtp packetsReceived`; MoQ: objects received, with `unit: 'objects'`), `label` override, `onStage`.

- **Receiving requires measured packets.** An HTTP 200, a resolved promise or an open peer connection is `measuring`; zero packets after that is `silent` (*Connected · no frames*).
- A 503 `realtime_not_configured` is `not-configured`, shown as a fact, never as an error.
- The word is always shown; bars alone never carry the state.
