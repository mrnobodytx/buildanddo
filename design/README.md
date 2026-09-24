# Design sources

The brand and the classroom design system, as source rather than as screenshots. Both were
authored on Claude design canvases and are committed here so the repository — not a link — is
where the product's look is defined.

| Folder | What it is | Canvas |
|---|---|---|
| `brand/` | BuildAndDo identity: the mark, the wordmark lockups, and **Buddi**, the mascot | Buddi & BuildAndDo Brand |
| `broadcast-classroom/` | The classroom and broadcast design system: tokens, 30 components, writing rules | Broadcast Classroom |

## brand/

Five artboards, each a self-contained `.dc.html` (markup plus a small `DCLogic` class that computes
its values), with `canvas.json` holding their frames.

- **`Mark.dc.html`** — the mark: a square block, paper front, editorial-red cap, ochre side, and a
  ruler down the left edge. Takes `size` and `dark`. Below 32px the ruler ticks drop out and the
  outline thickens, so the favicon still reads.
- **`Buddi.dc.html`** — the mascot, the mark awake. One component, five poses: `calm`, `hello`,
  `think`, `verified`, `build`, plus `dark`, `size` and `ground`. Each pose swaps arms, mouth, eye
  position and props, and carries its own `aria-label`.
- **`Main.dc.html`** — the brand sheet: lockups on paper and ink, mark sizes, the palette with hex
  and role, and the three typefaces.
- **`BuddiSheet.dc.html`** — Buddi's own sheet: what each part means, the five poses with when to
  use them, and the do/don't list.
- **`InProduct.dc.html`** — Buddi placed in real surfaces: the assistant panel, an empty missions
  state, a mission review, a verified notice, and the app icon and browser tab.

**The rule the mascot encodes.** `verified` is for after a real check has passed, `think` for
measuring — never a success state. From the sheet: *"Let Buddi say something is done before it has
been measured"* is on the don't list. That is the same rule the acceptance receipts follow, drawn
instead of written.

Animation is deliberately restrained: effects are off by default, `prefers-reduced-motion` always
wins, and the guidance allows one short hop on arrival and no loops.

## broadcast-classroom/

A design system with `tokens.json` (two themes, Paper and Ink), a component bundle, typings, and a
README per component.

The distinction it is built around is the platform's own: **the page is paper, the broadcast is a
stage.** Page chrome uses the warm paper ground with card panels; live video always sits on `stage`,
dark in both themes, and the two token sets never mix.

Its state vocabulary is the one the backend already speaks: a room is *live* because a host started
it, audio is *receiving* because inbound packets were counted, and a transport carries a measured
rung — `EXISTS → CONFIGURED → CONNECTED → USED → VERIFIED → REPEATED`, or `UNMEASURED`. People and
agents are counted separately and never summed.

`tokens.json` records where it was synced from, under `meta`: `apps/web/src/index.css`,
`tailwind.config.js`, and the classroom pages and hooks. Several components name the file they were
built from, so the system and the app can be compared rather than guessed at.

## Using these

The `.dc.html` artboards are design sources, not shipped code — they are not built or served, and
nothing in `apps/web` imports them. To take a component into the product, read its artboard and its
README and implement it against the tokens; `broadcast-classroom/components/index.d.ts` gives the
prop shapes.

Edits belong on the canvases, which are then re-exported here, so the two do not drift silently.
