# Badge

One or two uppercase words of status in a square, ruled box.

Ported from `site/ui.jsx`. **Consumer provides:** `children`, `tone` (`neutral` · `red` · `amber` · `teal` · `green` · `ink`).

- `amber` is for pending or attention states such as *Hand raised*. Its text uses `amber-text` (5.7:1 on paper); the border and tint stay `amber`.
- Do not use `red` for "live" in page chrome; use `SessionStatus`.
