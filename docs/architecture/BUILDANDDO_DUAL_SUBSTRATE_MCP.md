# BuildAndDo Dual Substrate + MCP

BuildAndDo uses one capability identity across three projections rather than one undifferentiated agent context.

```text
                         CAPABILITY GRAPH
                               |
             +-----------------+-----------------+
             |                                   |
       USER SUBSTRATE                      DEVELOPMENT SUBSTRATE
       PocketBase state                    Git / CI / SRS / evidence
             |                                   |
        user MCP profile                    developer MCP profile
             +-----------------+-----------------+
                               |
                        guildmaster profile
                               |
                   organization + curriculum
```

## Boundary

The user substrate owns business/workspace state. The development substrate owns software-development observations. The meta projection connects both through stable capability IDs. None of the three surfaces grants execution authority.

A capability can therefore answer four different questions without duplicating truth:

1. What can the product expose to a user?
2. What code, branch, tests and evidence implement it?
3. Which organization/guild owns it?
4. Which tutorial or practice object teaches it?

Missing evidence is `UNMEASURED`; adjacency is not causality; a read surface cannot promote a capability to verified state.
