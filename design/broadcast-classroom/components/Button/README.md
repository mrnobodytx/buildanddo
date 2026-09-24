# Button

Rectangular action with a sentence-case verb label; `primary` for the one main action in a view, `secondary` for the rest.

Ported from `apps/web/src/components/site/ui.jsx`.

**Consumer provides:** `children` (the label), `onClick` or `href`, optional `variant` (`primary` · `secondary` · `ghost` · `ink`), `size` (`sm` 36px · `md` 44px · `lg` 48px), `icon` (a name from the Icons group), `disabled`.

- One `primary` per view: *Join class*, *Start lesson session*, *Post to class*, *Confirm end*.
- Everything else is `secondary`: *Leave class*, *Edit class details*, *Keep class open*, *Copy link*.
- Labels name the outcome in the room's words; never "OK" or "Submit".
- Disable while a save is in flight (the `frozen` rule: saving, uncertain, or disconnected) instead of hiding the button.
