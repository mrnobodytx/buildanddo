# LatencyReadout

A measured latency value in mono, with its target and source; *Unmeasured* when there is no measurement.

Intentional addition. **Consumer provides:** `ms` (measured, e.g. glass-to-glass or MoQ object delivery), optional `targetMs`, `label`, `source` (where the number came from), `onStage`.

- A missing value is *Unmeasured*, never `0 ms`.
- Over target turns the value red **and** says *over N ms target*.
