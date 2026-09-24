The BuildAndDo classroom, broadcast: a host teaches live on a dark stage while the shared lesson, attendance and discussion stay on warm editorial paper. It extends the BuildAndDo broadsheet identity (paper, ink, restrained editorial red, muted green, ochre; serif headlines, sans utility, mono evidence; sharp rules) with one new surface, the **stage**, a small set of broadcast components, and a mini feed and broadcast platform: channels on air over SFU or MoQ, and the Sentinel feed beside them. The platform rules are in *Feed and broadcast*; broadcaster, world and agent stats in *Audience and agents*.

## Principles

- **Say what is measured.** A room is *live* because the host started it. Audio is *receiving* because inbound packets were counted. An HTTP 200, a resolved promise or an open peer connection proves neither. Show `measuring` until packets arrive and `silent` (*Connected · no frames*) if they don't.
- **The lesson is the record; the broadcast is the room.** The stage sits above the shared lesson and never replaces it. When media is unavailable, the class still works through reading and text discussion, and the UI says so plainly.
- **Authority lives on the server.** `may_publish` shapes the controls; it does not grant anything. A refused publish flips the control back with a sentence, never a silent failure.
- **Transport-neutral, SFU first.** Components take state, not a client. The SFU (Cloudflare Realtime on the tenant plane, LiveKit on the private plane) is the primary transport; MoQ is experimental and non-critical, always labelled so, and a room keeps working when its MoQ path fails.
- **Unmeasured is a state, not a zero.** Latency, audience, confidence and utilization rungs render `UNMEASURED` or *unknown* until something measures them. Nothing upgrades a state because it looks ready.

## Content fundamentals

Plain, calm, second person. Sentence case everywhere except the uppercase label styles. No emoji, no exclamation marks, no hype. Say what happens next and what stays available.

- Buttons are the outcome in the room's words: *Join class*, *Leave class*, *Start lesson session*, *Post to class*, *Keep class open*, *Confirm end*, *Raise hand*, *End broadcast*.
- Status copy is a fact, then the consequence: *Waiting for the host to start.* · *Attendance expires when a member disconnects or closes this room.* · *Members will no longer be able to join or post. The lesson and discussion remain available.*
- Unavailable is not an error: *Broadcast is not enabled for this workspace. Classes use shared lessons and text discussion.*
- Permissions are explained, not hidden: *Viewer seats can read the discussion. An editor seat is required to post.*
- Mark your own entries with *(you)*; mark the host with *Host*.

## Visual foundations

**Two grounds.** Page chrome is `background` (paper in the Paper theme, ink in the Ink theme) with `card` panels. The broadcast is always on `stage`, dark in both themes, so video never sits on paper. Never mix: no paper tokens on the stage, no stage tokens in page panels.

**Colour.**
- Text is `foreground` on `background`, `card` and `secondary`; secondary copy is `muted-foreground`.
- `primary` (editorial red) marks the one main action per view, kickers, and the live status. `destructive` is the same red: pair it with words.
- `success` is saved, connected and receiving; `amber` is pending, measuring and attention. `amber` measures 3.6:1 on paper, so use it for fills, dots and bars; ochre text under 19px bold uses `amber-text` (5.7:1).
- On the stage: text `stage-foreground`, secondary `stage-muted`, tiles `stage-raised`, edges `stage-border`, the LIVE plate and leave button `stage-live` with `stage-live-foreground` text, speaking and good signal `stage-speaking`, weak signal `stage-caution`. Name plates over video sit on `stage-scrim`.
- Charts: `chart-human` (blue) for people and `chart-agent` (ochre) for agents, on marks only, always beside a legend or the word. See *Audience and agents*.
- State is never colour alone: live carries the word, speaking carries the ring and the mic icon, muted carries the crossed mic, signal carries a word beside the bars.

**Type.** `display` (Newsreader) for headlines: the room title in `headline-3xl`, panels in `headline-2xl`/`headline-xl`. `sans` (Inter) for everything functional: `body` for descriptions and messages, `body-reading` for lesson text, `body-sm` for labels, `caption` for helper text and timestamps. Uppercase label styles: `kicker` in `primary` above a headline, `badge`, `state-pill`, `status-label`. `mono` (IBM Plex Mono) `evidence` for measured values: packet counts, sources, session references.

**Space and layout.** Tailwind's 4px scale: cards pad `space-5` (or `space-6`), grids gap `space-4`, button groups `space-3`. The room is a two-column grid at xl: stage and shared lesson left (3fr), attendance and discussion right (2fr, or `rail-width` beside a wide stage). The platform page puts the stage, path and tracks left and the feed in a `feed-rail-width` rail from 900px. The stage is 16:9; tiles are 4:3 with a 160px minimum. Everything must wrap to a single column without horizontal scroll.

**Shape.** Square. `radius` is 0 for cards, buttons, inputs, badges, tiles and the stage; `radius-full` only for dots. Rules, not shadows: `rule-thin` borders and dividers, `rule-thick` under a masthead and as the speaking ring, `rule-double` for major divisions. The one shadow is `focus-halo` on text inputs.

**States.** Focus is a 2px solid `ring` outline at 2–3px offset on every interactive element (on the stage it uses `stage-live`, 6.5:1 on `stage`). Disabled is `opacity-disabled` with a not-allowed cursor, never hidden. Media controls that are off are dashed, not merely dimmed. Controls freeze while a save is in flight or the connection is uncertain.

**Motion.** Off by default: every duration token in the app is 0ms until the person turns effects on, and `prefers-reduced-motion` always wins. When on, use the app's ease `cubic-bezier(0.22, 1, 0.36, 1)`, a 0.98 press scale on buttons, and nothing that loops. No pulsing live dot.

## Iconography

Lucide, the outline set the app ships (`lucide-react` 0.469.0): 24px grid, 2px stroke, round caps and joins, `currentColor`. Use 20px in panels and controls, 14–16px inline with small text. Icons are decorative and sit beside a word. The Icons group holds the broadcast set (`mic`, `mic-off`, `video`, `video-off`, `monitor-up`, `hand`, `phone-off`, `radio`, `signal`, `wifi-off`, `circle-dot`), the classroom's `book-open`, `users`, `message-circle`, and the platform set: `antenna` (MoQ, relays, on air), `waypoints` (a path), `activity` (latency), `radar` (Sentinel), `rss` (feed tracks), `tv-minimal` (broadcast items), `shield-check` (analyst judgment), `undo-2` (corrections), `file-search` (evidence), `triangle-alert`, and the stats set: `user-round` (a person), `bot` (an agent), `globe` (regions), `eye` (watching), `share-2` (content use), `search-check` (research), `pen-line` (improve), `badge-check` (verify). No emoji.

## Brand mark

There is no logo file. BuildAndDo is set as a wordmark in `display` at `headline-lg` weight 600 with -0.025em tracking. Classroom pages end with *Powered by Citadel Nexus Inc. · Service status* in `caption`.
