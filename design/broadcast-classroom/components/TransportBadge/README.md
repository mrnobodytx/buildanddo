# TransportBadge

Names the media transport and its measured utilization rung: `SFU` (primary) or `MoQ` (always marked *Experimental*).

Built from `docs/architecture/BUILDANDDO_LIVE_UTILIZATION.md`: *SFU is the primary real-time collaboration transport. MoQ is experimental and non-critical.* **Consumer provides:** `transport` (`sfu` · `moq`), `level` (the highest rung reached on `EXISTS → CONFIGURED → CONNECTED → USED → VERIFIED → REPEATED`), `onStage` over video.

- No `level` renders `UNMEASURED`. Never infer a rung from a configuration flag.
- MoQ gets a dashed border and the word *Experimental*; a room must still work when the MoQ path fails.
