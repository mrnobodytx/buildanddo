
/// <reference path="../pb_data/types.d.ts" />
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

    const response = $http.send({
        url: `${$os.getenv("BUILDER_MAILER_API_URL")}/api/v2/email`,
        method: "POST",
        headers: {
            "Authorization": `Bearer ${$os.getenv("BUILDER_MAILER_API_KEY")}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });
    
    if (response.statusCode !== 200) {
        $app.logger().error("Failed to send email", "error", response.json);

        throw new ApiError(500, response.json?.message || 'Failed to send email');
    }
})
