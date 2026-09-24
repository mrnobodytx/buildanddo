# BroadcasterCard

The broadcaster: identity, on-air status, seat verification, a short bio and a KPI row.

Intentional addition. **Consumer provides:** `name`, `handle`, `role`, `status` (`live` → *On air*, `ended` → *Off air*), `verified` (seat), `bio`, `stats` (StatTile props), optional `children` (an `<img>` avatar; initials otherwise).

- Stats describe the broadcaster's own channels over a named period; leave out what isn't measured rather than showing zero.
