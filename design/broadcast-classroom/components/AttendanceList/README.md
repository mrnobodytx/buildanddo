# AttendanceList

Who is attending, while the session and your connection are live; otherwise a sentence saying when attendance appears.

Built from the attendance card in `ClassroomsPage.jsx`. **Consumer provides:** `live` (room live **and** connected), `participants` `[{id, name, isHost, hand}]` from presence rows that have not expired.
