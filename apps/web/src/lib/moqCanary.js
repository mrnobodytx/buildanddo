// CGRF: SRS=SRS-BUILDANDDO-LIVE-UTILIZATION-001 | CAPS=B | Seat=VCC
// Dispatch: VCC-20260911-BND-LIVE-001 (task 4, MoQ canary)
//
// Browser-side MoQ transport canary.
//
// WHY THE BROWSER. Node 24 has no WebTransport (verified: globalThis.WebTransport is
// undefined, and --experimental-webtransport is not a recognised flag) and Python's
// aioquic did not complete a handshake from this seat. The browser has WebTransport
// natively, and this page is the surface that has to work anyway.
//
// CREDENTIAL RULE — non-negotiable. The relay JWTs are long-lived (CF_MOQ_STAGING is
// valid to 2027-09-08). They MUST NOT be compiled into the bundle. There is deliberately
// no import.meta.env / VITE_ read anywhere in this file. The token is fetched at RUNTIME
// from an authenticated backend endpoint, held only in a local const, never logged,
// never returned in observations, and never written to state.
//
// TRUTH RULE. utilization.yaml sets `transport_success_is_not_semantic_success: true`.
// A WebTransport session proves reachability and nothing else. Every object-level fact
// is reported MEASURED only if it was actually computed; otherwise UNMEASURED with a
// reason. Nothing here defaults to true — the selftest this replaces had
// `digest_match: true` hardcoded, which is exactly the failure being avoided.

/** Default relay edge. Measured 2026-09-11; `moq.cloudflare.com` is a JWT audience, not a host. */
export const DEFAULT_RELAY_HOST = 'draft-16.cloudflare.mediaoverquic.com';

/** One measured fact, or an explicit statement that it was not measured. */
function observation(name, measured, value, detail) {
    return { name, state: measured ? 'MEASURED' : 'UNMEASURED', value: measured ? value : null, detail: detail || '' };
}

/** SHA-256 hex of a Uint8Array, via SubtleCrypto. */
async function digestHex(bytes) {
    const buf = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Fetches a short-lived relay token from the backend.
 * The caller supplies the endpoint; this module never embeds one.
 * Returns the token string, or throws with a reason that contains no secret.
 */
async function fetchRelayToken(tokenEndpoint, authToken) {
    const headers = { Accept: 'application/json' };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    const res = await fetch(tokenEndpoint, { method: 'POST', headers, credentials: 'same-origin' });
    if (!res.ok) throw new Error(`token endpoint HTTP ${res.status}`);
    const body = await res.json();
    const token = body && (body.token || body.relay_token);
    if (!token) throw new Error('token endpoint returned no token');
    return token;
}

/**
 * Runs the MoQ transport canary.
 *
 * @param {object} opts
 * @param {string} opts.tokenEndpoint Backend route that brokers the relay JWT.
 * @param {string} [opts.authToken]   Caller's session token for that route.
 * @param {string} [opts.relayHost]   Relay edge host.
 * @param {number} [opts.objects]     How many objects to publish.
 * @returns {Promise<object>} A receipt: transport facts + per-fact observations.
 *   Contains no credential material of any kind.
 */
export async function runMoqCanary(opts = {}) {
    const relayHost = opts.relayHost || DEFAULT_RELAY_HOST;
    const objects = Number.isInteger(opts.objects) ? opts.objects : 100;
    const startedAt = new Date().toISOString();
    const observations = [];
    let reachable = false;
    let handshakeMs = null;
    let error = '';

    if (typeof WebTransport === 'undefined') {
        observations.push(observation('relay_reachable', false, null, 'WebTransport unavailable in this browser'));
        return receipt({ relayHost, objects, startedAt, reachable, handshakeMs, error: 'no WebTransport', observations });
    }

    let token;
    try {
        token = await fetchRelayToken(opts.tokenEndpoint, opts.authToken);
    } catch (e) {
        // The reason is surfaced; the token never is.
        observations.push(observation('relay_reachable', false, null, `token broker: ${e.message}`));
        return receipt({ relayHost, objects, startedAt, reachable, handshakeMs, error: 'token unavailable', observations });
    }

    const t0 = performance.now();
    let transport;
    try {
        // The relay authenticates the JWT on the session URL; it is never logged.
        transport = new WebTransport(`https://${relayHost}/${encodeURIComponent(token)}`);
        await transport.ready;
        reachable = true;
        handshakeMs = Math.round(performance.now() - t0);
        observations.push(observation('relay_reachable', true, true, `${relayHost}`));
    } catch (e) {
        observations.push(observation('relay_reachable', false, null, `session failed: ${e.name}`));
        return receipt({ relayHost, objects, startedAt, reachable, handshakeMs, error: e.name, observations });
    }

    try {
        const stream = await transport.createBidirectionalStream();
        const writer = stream.writable.getWriter();
        const reader = stream.readable.getReader();

        const sent = [];
        for (let i = 1; i <= objects; i += 1) {
            const payload = new TextEncoder().encode(JSON.stringify({ seq: i, run: startedAt }));
            sent.push(payload);
            await writer.write(payload);
        }
        await writer.close();
        observations.push(observation('objects_published', true, sent.length, 'written to the relay stream'));

        const received = [];
        const deadline = performance.now() + 15000;
        while (received.length < objects && performance.now() < deadline) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) received.push(value);
        }
        observations.push(observation('objects_received', true, received.length, 'read back from the relay'));

        // Ordering: only claimable if every object came back.
        if (received.length === sent.length) {
            let ordered = true;
            for (let i = 0; i < received.length; i += 1) {
                try {
                    if (JSON.parse(new TextDecoder().decode(received[i])).seq !== i + 1) { ordered = false; break; }
                } catch { ordered = false; break; }
            }
            observations.push(observation('sequence_complete', true, ordered, 'per-object seq compared to publish order'));

            const sentDigest = await digestHex(concat(sent));
            const recvDigest = await digestHex(concat(received));
            observations.push(observation('digest_match', true, sentDigest === recvDigest,
                'SHA-256 over the concatenated payloads, computed on both sides'));
        } else {
            const why = `received ${received.length} of ${sent.length}; equality not computable`;
            observations.push(observation('sequence_complete', false, null, why));
            observations.push(observation('digest_match', false, null, why));
        }
    } catch (e) {
        error = e.name || String(e);
        for (const n of ['objects_published', 'objects_received', 'sequence_complete', 'digest_match']) {
            if (!observations.some((o) => o.name === n)) {
                observations.push(observation(n, false, null, `aborted: ${error}`));
            }
        }
    } finally {
        try { transport.close(); } catch { /* closing must not alter the result */ }
    }

    return receipt({ relayHost, objects, startedAt, reachable, handshakeMs, error, observations });
}

function concat(chunks) {
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) { out.set(c, at); at += c.length; }
    return out;
}

function receipt(o) {
    const semantic = o.observations.some(
        (x) => x.state === 'MEASURED' && x.name !== 'relay_reachable' && x.name !== 'alpn_negotiated',
    );
    return {
        schema: 'buildanddo.moq-canary-observation/v1',
        mode: 'OBSERVED_PROVIDER',
        classification: 'EXPERIMENTAL',
        relay_host: o.relayHost,
        objects_intended: o.objects,
        started_at: o.startedAt,
        completed_at: new Date().toISOString(),
        transport_reachable: o.reachable,
        handshake_ms: o.handshakeMs,
        error: o.error,
        observations: o.observations,
        // Stated in the payload so no consumer can read reachability as delivery.
        transport_success_is_not_semantic_success: true,
        // Advisory only. The Python harness is the sole authority on truth state.
        any_semantic_measurement: semantic,
    };
}
