/// <reference path="../pb_data/types.d.ts" />

// Forwards new early-access sign-ups into the connected Reach audience.
// Reach requires an email — skip the sync when absent. Any Reach failure is
// logged and swallowed so the local record is always preserved.

onRecordAfterCreateSuccess((e) => {
  const email = e.record.get("email");
  if (!email) {
    e.next();
    return;
  }

  try {
    $http.send({
      url: $os.getenv("REACH_API_URL") + "/api/public/v1/contacts",
      method: "POST",
      headers: {
        Authorization: "Bearer " + $os.getenv("REACH_API_TOKEN"),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        groupName: "Hostinger AI Builder early access form",
        contacts: [
          {
            email: email,
            name: e.record.get("name"),
          },
        ],
      }),
    });
  } catch (err) {
    $app
      .logger()
      .error("Reach contact sync failed", "err", String(err));
  }

  e.next();
}, "early_access");
