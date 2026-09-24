# Audience and agents

How a broadcaster sees who is watching, where from, who uses their content, and what agents do with it while no one is watching.

## The two kinds of presence

- People and agents are counted separately and never added into one number. *214 people watching* and *3 agents working* are two stats, two tiles, two series.
- People are `chart-human` (blue), agents `chart-agent` (ochre). The pair is validated for colour-blind separation and at least 3:1 on `card` in both themes. They colour marks only: bars, keys, sparkline dots. Text stays `foreground` and `muted-foreground`, and every mark sits beside the word *People* or *Agents* or a legend.
- Agents are never audience. They don't appear in watcher counts, the world chart or follower numbers.

## Stats

- Use `StatTile` for any headline number, in a `bc-kpis` row. Value in `sans` semibold, compacted (12.9K); change always names its period (*+18% vs last week*); a 12-point trend in `border` grey with the current point in the series colour.
- A number nobody measured reads *Unmeasured*. A real zero is a zero: *0 people watching* after a broadcast ends is true and useful.
- One hero number per view at most. The broadcaster page leads with *People watching now*.

## Charts

- **Where people watch from:** `WorldAudience`, one bar per region, largest first, the value at the tip. People who don't share a region are counted in words below the bars. A *Show table* toggle gives every value without hovering.
- **When:** `PresenceTimeline`, the last 24 hours as two rows on one hour axis, people above and agents below, each scaled to its own peak. Hours with no audience show a dashed baseline, and the summary says how many there were and how many had agents working. Never put people and agents on two y-axes of one chart.
- **Who uses the content:** `ContentUse`, one stacked bar per item (people, then agents, with a 2px gap), total as text at the end, and the breakdown in `evidence` mono (*12 classes · 31 embeds · 141 citations*). Count uses, not views.
- Every chart has hover **and** keyboard focus on its marks, with the value in bold first and the label after it. Nothing is only in a tooltip.

## When no one is watching

- The stage shows `BroadcastStage` with `empty: 'agents'`: *No one is on air. 3 agents are working on this channel's content. Their changes wait for review.*
- `AgentActivity` shows the unattended note while nobody is watching, then each task: its kind (*Research*, *Improve*, *Verify*), the agent, status, target, result, Kestrel label and evidence.
- **Agents propose; people publish.** Finished agent work reads *Proposed · awaiting review* until a person accepts it, then *Accepted by a person*. No agent result goes live on its own.
- Trust is labelled, not implied. `TrustLabel` shows the Kestrel label; VERIFIED and SOURCED require an evidence reference and fall back to UNVERIFIED without one.
- A blocked task says what a person has to decide: *The cited page no longer resolves. Needs a person to choose a replacement source.*

## Privacy

Audience stats are aggregates. Never show an individual viewer's location, and hide a region with fewer than 5 people, counting it under *Region not shared*. Names appear only in attendance, and only for members of the workspace.
