# ParticipantTile

A seat on the stage: video or initials, a caption plate with name, host tag and mic state; a 2px green ring while speaking.

Intentional addition. **Consumer provides:** `name`, `isHost`, `own`, `mic` (`on` · `off`), `speaking` (from measured audio level, not from mic-on), optional `children` (a `<video>`).

- Speaking is shown by ring **and** the mic icon colour and a screen-reader word; the ring alone never carries it.
- Muted uses the crossed-out mic, not colour alone.
