# WorldAudience

Where people are watching from: one bar per region, largest first, value at the tip; a table view one click away.

Intentional addition. **Consumer provides:** `regions` `[{name, value}]` (people, not sessions), `total`, `unknown` (people whose region isn't shared), `minCount` (default 5: smaller regions fold into *Region not shared*), `period`, optional `title`, `note`.

- One series, so no legend: the title names it. Bars are `chart-human`, 14px, square at the baseline with a 4px data end.
- Hover or focus a bar for its exact value; *Show table* gives every value without hovering.
- People who don't share a region are counted in words, never spread across the chart. Agents are not counted as audience here.
