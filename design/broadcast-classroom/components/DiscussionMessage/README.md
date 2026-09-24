# DiscussionMessage

One saved class message: name (with *(you)*), local time, and the body with preserved line breaks.

Built from `RoomDiscussion` in `ClassroomsPage.jsx`. **Consumer provides:** `name`, `own`, `time` (a formatted local string), `body`. Render inside an `<ol aria-label="Class messages">`, newest first.
