# BuildAndDo Living Rooms

Living Rooms are curated projections over the shared BuildAndDo capability graph. Organization answers who owns what; Capability answers what the system can do and why it believes that; Development preserves SRS/branch/test/deployment evolution, including failed branches that are useful for teaching.

Room modes (`operate`, `inspect`, `teach`, `replay`) change presentation and permitted interactions, never the underlying truth or authority. All graphical elements correspond to a node, edge, measured aggregation, or explicit absence.

The initial public UI consumes static JSON projections at `/room-projections/{organization|capability|development}.json`. The private/local Citadel controller generates those artifacts from repository state and declared operating settings. A missing projection is rendered as unavailable/unmeasured, not replaced with fake sample data.
