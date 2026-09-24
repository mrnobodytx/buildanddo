# BroadcastPlatform

A composed page showing how the pieces fit: the stage with transport and latency, the path and tracks under it, and the Sentinel feed in the right rail.

Showcase only, not a bundle export. Build the real page from `BroadcastStage`, `MediaControls`, `RelayPath`, `TrackCatalog`, `ChannelCard` and `LiveFeed` in a grid of `minmax(0, 1fr)` and `feed-rail-width`, stacking at 900px.
