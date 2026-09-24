# LiveFeed

The Sentinel feed panel: kicker and title, connection state, pause, an *N new items* button, and the list, newest first.

Intentional addition. **Consumer provides:** `state` (`live` · `paused` · `degraded` · `not-connected`), `items` (FeedItem props), `newCount` + `onShowNew`, `onPause`, optional `title`, `kicker`, `emptyText`, `footer`.

- New items never push the list while someone reads: they wait behind the *Show N new items* button.
- `not-connected` says so in a sentence; it never renders an empty list that looks quiet.
- The feed is a read projection: it can simplify, never upgrade a state.
