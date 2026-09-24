# RelayPath

The broadcast path from publisher through relays to subscribers, one box per hop with its measured added latency.

Intentional addition for MoQ relay chains (also fits an SFU cascade). **Consumer provides:** `hops` `[{role, name, state, latencyMs, count}]` in path order: `publisher`, one or more `relay`, then `subscribers`.

- Measured links are solid 2px rules; unmeasured links are dashed; an unreachable hop is dotted red with the word *Unreachable*.
- Never draw a hop the system has not reported.
