# TrackCatalog

The MoQ catalog as a checklist: each published track with its rendition, state and latest group and object, and a checkbox to subscribe.

Intentional addition. **Consumer provides:** `namespace`, `tracks` `[{name, label, kind, rendition, subscribed, state, group, object}]`, `onToggle(name)`, optional `note`.

- The checkbox asks; the relay decides. Show `stalled` when group numbers stop advancing, not when a request is slow.
- Keep audio and captions visibly separate from video so a weak connection can drop video and keep the class.
