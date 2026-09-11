# BuildAndDo Live Utilization Architecture

A capability progresses through `EXISTS -> CONFIGURED -> CONNECTED -> USED -> VERIFIED -> REPEATED`. No stage is inferred from a later-looking configuration flag.

The first complete episode is:

`BuildAndDo room -> SFU canary + MoQ canary -> evidence records -> verified episode -> content context -> Jinja -> draft outbox -> Living Rooms projection`.

SFU is the primary real-time collaboration transport. MoQ is experimental and non-critical. Content publication is separate from content generation and requires higher authority.

The visual substrate is a read projection. It may simplify measured truth but cannot upgrade truth state, fabricate missing nodes, or render `UNMEASURED` as healthy.
