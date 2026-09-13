# BuildAndDo brand assets

These exist because the repo shipped **no logo file at all**, while the footer links out
to a wiki, a forum, a Reddit community and a Discord server that each need one. The three
public properties were all still wearing their software's default identity: Wiki.js's
butterfly, stock Flarum blue, and a Discord icon that was the literal text "bad".

Nothing here is a new design. The mark is the one that already existed, in exactly one
place — `Brand()` in `apps/web/src/components/site/Header.jsx`: a rounded square with a
`primary/40` border and a `primary/10` wash, holding the lucide **Activity** pulse. These
files only make that mark exist as an asset.

## Tokens (resolved from `apps/web/src/index.css`, not picked by eye)

| Token | HSL | Hex |
|---|---|---|
| `--paper` / `--background` | `42 30% 94%` | `#F4F2EB` |
| `--ink` / `--foreground` | `220 16% 12%` | `#1A1D23` |
| `--primary` | `0 70% 40%` | `#AD1F1F` |
| `--accent` / `--amber` | `38 58% 40%` | `#A1762B` |
| `--paper-muted` | `220 10% 38%` | `#575E6B` |
| `--paper-border` | `220 12% 74%` | `#B5BAC5` |
| `--paper-subtle` | `40 16% 90%` | `#EAE7E1` |

Type: **Newsreader** (display/serif), **Inter** (body), **IBM Plex Mono** (evidence).
All three are loaded from Google Fonts by `index.css` line 1.

## Which file to use where

| File | Use |
|---|---|
| `mark.svg` | The mark on a light surface. Matches the header at 32px. |
| `wordmark.svg` | Horizontal lockup — wiki/forum header, docs, slides. |
| `icon-social.svg` / `icon-social-512.png` | **Avatars only**: Discord server icon, forum favicon, OG avatar. |
| `mark-512.png`, `mark-64.png`, `mark-32.png` | Raster fallback where SVG is rejected. |
| `apple-touch-icon.png` | iOS home-screen (180px, per Apple's spec). |

## Why the avatar is a different drawing, not a resize

Discord **circle-crops** server icons. `mark.svg`'s rounded-square border — the thing that
reads as a deliberate button at 64px — has its corners sliced off by that crop and survives
only as a stray arc. So `icon-social` drops the border, fills the whole canvas with paper so
the crop yields a clean disc, and draws the pulse heavier (stroke `1.85` on a 24-grid scaled
to 512, versus the header's `2.4` at 16px) because a hairline disappears at the ~20px Discord
actually renders in a sidebar.

That is the same mark weighted for its size, which is what a mark means at avatar scale — not
a scaled copy of the web one. If you add a new surface, ask which of those two situations it
is in before picking a file.

## Regenerating the PNGs

The SVGs are the source. The PNGs are drawn from the same glyph coordinates by the Pillow
script in the commit that added them (4x supersample, LANCZOS downsample, round caps drawn
explicitly — Pillow's `joint="curve"` rounds joins but leaves the two end caps flat, which
reads as a clipped stroke at small sizes). If a token changes in `index.css`, change it here
too; nothing reads these values at build time.
