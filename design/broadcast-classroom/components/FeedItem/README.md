# FeedItem

One Sentinel feed entry: its kind, priority, cue status, time, title, body, and a provenance line with source, confidence and evidence count.

Built from the Sentinel cue contract (`docs/sentinel-maritime/contracts.md`). **Consumer provides:** `kind` (`observation` · `inferred` · `judgment` · `broadcast` · `post` · `correction`), `title`, `time`, optional `body`, `href`, `status` (`OPEN` · `UNDER_REVIEW` · `DISPOSITIONED` · `RETRACTED`), `priority`, `confidence {value, scale, method}`, `correction`, `source`, `evidence`, `unread`. Render inside `LiveFeed` or an `<ol>`.

- Keep observations, inferences and analyst judgments visibly distinct: the kind label always shows.
- Confidence only appears with its scale; a missing value reads *Confidence unknown*, never zero.
- A retracted item stays in place, struck through, with its linked correction. Never delete it from the feed.
- Priority is a badge with a word; it never hides the status or the evidence.
