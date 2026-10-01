// --- CGRF Header ------------------------------------------------
// File:        apps/pocketbase/pb_hooks/builder-mailer.pb.js
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
// Intent:      Diagnose existing mail delivery failures without logging messages, recipient data or upstream payloads.
// ----------------------------------------------------------------

// Account mail goes out through the first of: PocketBase SMTP when it is enabled
// in settings; Customer.io when BUILDER_MAILER_PROVIDER=customerio
// (customerio-mail.js); otherwise the builder mailer API below.
onMailerSend((e) => {
    if (e.app.settings().smtp.enabled) {
        return e.next()
    }

    if (($os.getenv("BUILDER_MAILER_PROVIDER") || "").trim().toLowerCase() === "customerio") {
        const result = require(`${__hooks}/customerio-mail.js`).send(e.message, $http, (name) => $os.getenv(name))
        if (!result.ok) {
            e.app.logger().error("Customer.io did not accept an account email",
                "reason", result.reason, "status", result.status, "detail", result.detail)
            throw new ApiError(500, "Failed to send email")
        }
        e.app.logger().info("Account email handed to Customer.io", "delivery", result.delivery)
        return
    }

    const senderAddress = $os.getenv("BUILDER_MAILER_SENDER_ADDRESS");
    const url = $os.getenv('BUILDER_MAILER_API_URL'), key = $os.getenv('BUILDER_MAILER_API_KEY');
    const log = (category, status) => {
        try { require(`${__hooks}/telemetry.js`).diagnostic('mailer.send', category, status); }
        catch (_) { /* Preserve the original mail result or exception. */ }
    };
    const configured = Boolean(senderAddress && url && key);
    if (!configured) log('config');

    const payload = {
        "subject": e.message.subject,
        "content": {
            ...(e.message.html ? {
                "html": e.message.html,
            } : {
                "text": e.message.text,
            }),
            "type": "plain",
        },
        "from": senderAddress,
        "fromName": e.message.from?.name,
        "replyTo": senderAddress,
        "to": e.message.to[0].address,
    }

    let response;
    try { response = $http.send({
        url: `${url}/api/v2/email`,
        method: "POST",
        headers: {
            "Authorization": `Bearer ${key}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    }); } catch (error) {
        if (configured) log('transport');
        throw error;
    }
    let status;
    try { status = response.statusCode; }
    catch (error) { log('schema'); throw error; }
    if (status !== 200) {
        log('upstream_status', status);

        throw new ApiError(500, response.json?.message || 'Failed to send email');
    }
})
