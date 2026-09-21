// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/suiteWorker.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-20
// Depends:     apps/pocketbase/pb_hooks/mission-suite.js
// EnumType:    Library
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/mission-suite.js
// DAG Node:    none
// Intent:      Decide what a suite worker may claim and how it must complete, mirroring the
//              server's own preconditions so the worker never asks for something it cannot finish.
// ───────────────────────────────────────────────────────────────

/**
 * WHY THIS EXISTS. mission-suite.js declares `WORKER = ['poll', 'claim', 'complete']` and enforces
 * a lease, an attempt cap and a source binding. Nothing implements the other side: `claim` appears
 * only in the hook that defines it and the fixtures that exercise it. The engine has a protocol and
 * no driver, which is why day 9 shows a working design and no running work.
 *
 * THE RULES BELOW ARE NOT INVENTED - THEY MIRROR THE SERVER. mission-suite.js refuses a claim when:
 *
 *     status not in (queued, processing)
 *     OR (status is processing AND the lease has not expired)
 *     OR attempt >= 3
 *     OR the control's active_run is not this run
 *
 * and refuses a completion when:
 *
 *     status is not processing
 *     OR the processor is not the caller
 *     OR the submitted attempt != the record's attempt
 *     OR the lease has expired
 *     OR source_sha256 does not match the binding
 *
 * A worker that disagrees with any of those will claim work it cannot finish, burn an attempt on
 * every pass, and drive a healthy run to the 3-attempt cap without ever doing anything. So the
 * eligibility test lives here in one place, tested, rather than being re-guessed at a call site.
 *
 * NO I/O. Every function is pure and takes `now` explicitly. A worker loop that cannot be tested
 * without a live PocketBase is a worker loop nobody tests - and this repo's Python suites already
 * need a live backend, which is exactly why public CI skips them.
 */

/** The lease the server grants on a successful claim. From mission-suite.js: now + 120000ms. */
export const LEASE_MS = 120000;

/** The server's cap. A run that has already been attempted this many times is not claimable. */
export const MAX_ATTEMPTS = 3;

/** Parse the server's timestamp shape. It stores 'YYYY-MM-DD HH:MM:SS.sssZ' with a space, which
 *  Date cannot reliably parse in every engine - the hook itself normalises the space to 'T'. */
export function leaseDeadline(run) {
    const raw = String(run?.lease_until ?? '').trim();
    if (!raw) return 0;
    const parsed = Date.parse(raw.replace(' ', 'T'));
    return Number.isNaN(parsed) ? 0 : parsed;
}

export function leaseExpired(run, now) {
    return leaseDeadline(run) <= now;
}

/**
 * Can this run be claimed right now? Returns `{ ok, reason }` - never a bare boolean, because the
 * caller needs to log WHY a queue full of runs produced no work.
 */
export function claimable(run, now, activeRunId) {
    const status = String(run?.status ?? '');
    if (!['queued', 'processing'].includes(status)) {
        return { ok: false, reason: `status ${status || 'missing'} is not claimable` };
    }
    // A run already being processed is only up for grabs once its lease lapses. Claiming a live
    // lease would hand the same work to two workers, and the second would fail `complete` anyway.
    if (status === 'processing' && !leaseExpired(run, now)) {
        return { ok: false, reason: 'another worker holds a live lease' };
    }
    if (Number(run?.attempt ?? 0) >= MAX_ATTEMPTS) {
        return { ok: false, reason: `attempt cap reached (${MAX_ATTEMPTS})` };
    }
    // The control names one active run. Claiming any other is refused server-side, so asking is a
    // wasted round trip that still risks incrementing an attempt.
    if (activeRunId && run?.id !== activeRunId) {
        return { ok: false, reason: 'not the control\'s active run' };
    }
    return { ok: true, reason: '' };
}

/** Pick the one run to work on: the oldest eligible, so a queue drains in order rather than
 *  starving whatever arrived first. Returns null plus the reasons when nothing is eligible. */
export function selectClaimable(runs, now, activeRunId) {
    const list = Array.isArray(runs) ? runs : null;
    if (!list) return { run: null, state: 'unavailable', reasons: ['no run list supplied'] };
    const reasons = [];
    const eligible = [];
    for (const run of list) {
        const verdict = claimable(run, now, activeRunId);
        if (verdict.ok) eligible.push(run);
        else reasons.push(`${run?.id ?? '?'}: ${verdict.reason}`);
    }
    eligible.sort((a, b) => String(a.created ?? '').localeCompare(String(b.created ?? ''))
        || String(a.id ?? '').localeCompare(String(b.id ?? '')));
    return { run: eligible[0] ?? null, state: 'available', eligible: eligible.length, reasons };
}

/**
 * Build the completion payload.
 *
 * `attempt` MUST be the value the record carries AFTER the claim incremented it - the server
 * compares the submitted attempt to the stored one and rejects a mismatch. Using the pre-claim
 * value is the easiest possible mistake here and fails every time, so the claim response is the
 * only accepted source for it.
 */
export function planCompletion(claimed, outcome) {
    const attempt = Number(claimed?.attempt);
    if (!Number.isInteger(attempt)) {
        return { ok: false, reason: 'the claim response did not carry an attempt number' };
    }
    const sourceSha = String(claimed?.source_sha256 ?? '').trim();
    if (!sourceSha) {
        return { ok: false, reason: 'no source_sha256 on the claim; the binding cannot be proven' };
    }
    const failure = String(outcome?.failure ?? '').trim();
    return {
        ok: true,
        payload: {
            id: claimed.id,
            attempt,
            // A failure and a result are mutually exclusive: the server reads `failure` to decide
            // between 'failed' and 'ready', so sending both would record a success with a reason.
            result_canonical: failure ? '' : String(outcome?.result_canonical ?? ''),
            failure,
            source_sha256: sourceSha,
        },
    };
}

/** Is there still enough lease left to be worth starting/continuing?
 *
 *  Completing after expiry is refused, so work finished at second 121 is work thrown away. The
 *  margin exists so a worker stops BEFORE burning an attempt it cannot bank. */
export function leaseRemaining(run, now) {
    return Math.max(0, leaseDeadline(run) - now);
}

export function shouldAbandon(run, now, marginMs = 5000) {
    return leaseRemaining(run, now) <= marginMs;
}

/** A run that has exhausted its attempts is not a transient failure - it needs a person.
 *  Reported separately so a queue that is stuck does not look like a queue that is empty. */
export function exhausted(runs) {
    return (Array.isArray(runs) ? runs : []).filter(
        (run) => Number(run?.attempt ?? 0) >= MAX_ATTEMPTS && String(run?.status ?? '') !== 'ready',
    );
}
