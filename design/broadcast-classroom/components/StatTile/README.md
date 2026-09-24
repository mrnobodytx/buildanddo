# StatTile

One headline number: label, value, change against a named period and an optional 12-point trend; *Unmeasured* when there is no value.

Intentional addition. **Consumer provides:** `label` (sentence case), `value` (a number, auto-compacted: 1,284 · 12.9K · 4.2M), optional `unit`, `delta {value, period, percent, goodWhenUp}`, `trend` (12 numbers), `series` (`human` · `agent` puts the series key before the label), `icon`, `note`.

- The value is set in `sans` semibold, never the display serif. One hero number per view.
- Delta colour is direction × whether up is good, and always says the period: *+18% vs last week*.
- No measurement means *Unmeasured*, never 0. Use it in a `bc-kpis` grid for a KPI row.
