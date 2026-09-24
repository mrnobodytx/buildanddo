// --- CGRF Header ------------------------------------------------
// File:        apps/pocketbase/pb_hooks/reach-contact-sync.pb.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/pocketbase/pb_hooks/telemetry.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/telemetry.js
// Intent:      Preserve local sign-ups when optional audience delivery fails without exporting contact content or credentials to logs.
// ----------------------------------------------------------------

// Forwards new early-access sign-ups into the connected Reach audience.
// Reach requires an email — skip the sync when absent. Any Reach failure is
// logged and swallowed so the local record is always preserved.

onRecordAfterCreateSuccess((e) => {
  const email = e.record.get("email");
  if (!email) {
    e.next();
    return;
  }

  const log = (category, status) => {
    try { require(`${__hooks}/telemetry.js`).diagnostic('reach.contacts', category, status); }
    catch (_) { /* Do not block the remaining record hooks. */ }
  };
  let category = 'config';
  try {
    const url = $os.getenv('REACH_API_URL'), token = $os.getenv('REACH_API_TOKEN');
    if (!url || !token) {
      log('config');
    } else {
      category = 'transport';
      const response = $http.send({
        url: url + "/api/public/v1/contacts",
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
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
      category = 'schema';
      if (!response || !Number.isInteger(response.statusCode) || response.statusCode < 100 || response.statusCode > 599) log('schema');
      else if (response.statusCode < 200 || response.statusCode >= 300) log('upstream_status', response.statusCode);
    }
  } catch (_) {
    log(category);
  }

  e.next();
}, "early_access");
