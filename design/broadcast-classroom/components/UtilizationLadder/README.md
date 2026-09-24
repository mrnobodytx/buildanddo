# UtilizationLadder

The capability ladder as a table: which rungs each capability has reached, and the evidence reference or `UNMEASURED`.

Ported from `components/rooms/UtilizationPanel.jsx`, same levels and heading copy. **Consumer provides:** `items` `[{id, title, levels[], evidence}]`, optional `title`.

- Rungs are reached, not inferred: a capability that is `CONFIGURED` is not shown as `CONNECTED` because it looks ready.
- Every dot has a screen-reader word (*reached* / *not reached*).
