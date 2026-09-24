# AgentActivity

What agents are doing with the content, especially when nobody is watching: research, improve and verify tasks with their status, result, trust label and evidence.

Intentional addition. **Consumer provides:** `tasks` `[{id, kind, agent, status, target, result, label, evidence, evidenceRef, time}]`, `unattended` (no people watching now), `working` (agents active now, from the agent runtime; defaults to the running tasks listed), `awaiting` (proposals waiting for a person; defaults to the proposed tasks listed), optional `stats` (StatTile props, shown with the agent key), `title`, `footer`.

- Agents propose; people publish. Finished work reads *Proposed · awaiting review* until a person accepts it.
- Every task shows its Kestrel label; VERIFIED needs a resolvable `evidenceRef`.
- A blocked task says what a person needs to decide.
- The unattended note appears only while no people are watching; it says what agents are doing and that nothing publishes without review.
