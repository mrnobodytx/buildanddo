# Feed and broadcast

The platform layer: channels go on air, travel over an SFU or a MoQ relay chain, and the Sentinel feed reports what happened next to them. Everything here uses the classroom's tokens and the same rule: show what is measured.

## Transports

- Label every broadcast with `TransportBadge`. `SFU` is the primary transport. `MoQ` is experimental and non-critical: dashed border, the word *Experimental* in `amber-text`, and an SFU fallback the room can fall back to without a reload.
- The badge carries the measured utilization rung: `EXISTS → CONFIGURED → CONNECTED → USED → VERIFIED → REPEATED`. A configured relay is `CONFIGURED`, not `CONNECTED`. With no measurement it reads `UNMEASURED`.
- Use `UtilizationLadder` wherever someone decides whether a transport is ready. Its heading copy stays: *Presence is not usage. Usage is not verification.*

## MoQ relays and tracks

- `RelayPath` draws only the hops the relay reports: publisher, relays in order, subscribers. Solid `rule-thick` links are measured, dashed are unmeasured, dotted `destructive` is unreachable and says *Unreachable*.
- `TrackCatalog` lists the catalog's tracks by kind: video renditions, audio, captions, slides, the feed. Subscribing is a checkbox request; the relay's answer sets the state. `stalled` means group numbers stopped advancing.
- Group and object numbers are evidence: set them in `evidence` mono (`g318 · o12`), never as headline numbers.
- On a weak path, drop video renditions first and keep audio and captions. Say so: *Video paused to keep audio. Captions continue.*
- `SignalMeter` works for MoQ too: pass objects received with `unit: 'objects'`. `LatencyReadout` shows object delivery or glass-to-glass latency against a target, and *Unmeasured* without a number.

## Channels

- `ChannelCard` lists broadcasts. On air reads *On air* in `primary` with the dot; scheduled shows when. The whole card is one link.
- Audience is shown only when measured (*42 watching*); otherwise *Audience unmeasured*. Never estimate.

## The Sentinel feed

- `LiveFeed` is a read projection of Sentinel: it may simplify, never upgrade a state or fill in a missing one.
- Keep kinds distinct, always labelled: *Observation*, *Inferred*, *Analyst judgment*, *Broadcast*, *Post*, *Correction*. Observations are neutral, inferences `amber-text`, judgments and broadcasts `primary`.
- Cue status reads in words: *Open*, *Under review*, *Dispositioned*, *Retracted*. A retracted item stays in the feed, struck through, with its linked correction beneath in an `amber` tint. Never delete history.
- Confidence appears only with its scale and method (*Confidence 0.8 / 0–1 · analyst*). Missing confidence is *Confidence unknown*, never 0.
- Priority is a badge with a word (*High priority*). It never overrides status or hides evidence.
- Every item ends with a provenance line in `evidence` mono: `src:`, confidence, evidence count.
- New items never move the list under the reader. They wait behind *Show N new items* (an `ink` bar); *Pause* stops intake entirely.
- Not connected is a sentence: *The Sentinel feed is not connected here. Items appear when the feed answers with measured data.*

## Writing for the platform

Short, factual, present tense. Headlines state what happened (*Relay fra-2 dropping groups for 3 minutes*), bodies state the effect and what still works (*Video stalled for EU subscribers; audio held.*). No alarm words, no exclamation marks. Name the source rather than asserting certainty.
