# MediaControls

The stage toolbar: publishers get mic, camera and screen share; listeners get *Raise hand*; everyone gets the red leave action at the far end.

Intentional addition. **Consumer provides:** `canPublish` (the server's `may_publish` flag), `isHost`, `mic`, `camera`, `sharing`, `hand` booleans, `onToggle(kind)` with `mic` · `camera` · `share` · `hand` · `leave`, `disabled` while a request is in flight.

- `canPublish` is advisory for layout only; the server re-checks every publish. On a 403, flip back and say *Publishing is limited to the host for this class.*
- Every toggle shows icon **and** label, and `aria-pressed`. Off states are dashed, not just dimmed.
- The leave button reads *Leave class*; for the publishing host, *End broadcast*. Ending the class itself stays in the page's *End class* dialog.
