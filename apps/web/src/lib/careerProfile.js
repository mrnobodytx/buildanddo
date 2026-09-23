// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/careerProfile.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-CAREER-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-CAREER-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/pocketbase/pb_hooks/career-profile.pb.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/career-profile.pb.js
// DAG Node:    none
// Intent:      Request the signed-in user's Citadel-held career profile and accept it only for that account, keeping it in memory.
// ───────────────────────────────────────────────────────────────

export const PROFILE_STATES = Object.freeze(['ready', 'not_configured', 'no_profile']);
const CLAIM_STATES = ['VERIFIED', 'OBSERVED', 'DECLARED', 'ABSENT'];
const text = (value, max) => typeof value === 'string' && value.length <= max;

const capabilityShape = (row) => row && text(row.capability_id, 40) && text(row.label, 80) && text(row.claim_verb, 60)
    && CLAIM_STATES.includes(row.state) && row.verified === (row.state === 'VERIFIED')
    && Number.isSafeInteger(row.records) && row.records >= 1
    && typeof row.confidence === 'number' && row.confidence >= 0 && row.confidence <= 1;

const profileShape = (profile) => profile && text(profile.person_id, 120) && text(profile.as_of, 40)
    && typeof profile.digest === 'string' && /^sha256:[a-f0-9]{64}$/.test(profile.digest)
    && Array.isArray(profile.capabilities) && profile.capabilities.length <= 64 && profile.capabilities.every(capabilityShape)
    && Array.isArray(profile.sources) && Array.isArray(profile.limits) && text(profile.card, 20000);

/** Bind profile reads to the current native account.
 * @param {object} options Native client, account id and a scope guard.
 * @returns {{load: () => Promise<object>}} A loader whose result is dropped if the account changed.
 */
export function createCareerProfileClient({ client, accountId, isCurrent }) {
    const current = () => Boolean(accountId) && isCurrent() && client.authStore.record?.id === accountId;
    return {
        async load() {
            if (!current()) return { ok: false, reason: 'scope_changed' };
            try {
                const data = await client.send('/api/buildanddo/career/profile', { method: 'GET', requestKey: null, cache: 'no-store' });
                if (!current()) return { ok: false, reason: 'scope_changed' };
                if (data?.subject_id !== accountId || !PROFILE_STATES.includes(data.state)
                    || (data.state === 'ready' && (!profileShape(data.profile) || !text(data.issued_at, 40))))
                    return { ok: false, reason: 'unavailable' };
                return { ok: true, state: data.state, profile: data.state === 'ready' ? data.profile : null,
                    issuedAt: data.state === 'ready' ? data.issued_at : '' };
            } catch (error) {
                if (!current()) return { ok: false, reason: 'scope_changed' };
                return { ok: false, reason: [401, 403].includes(error?.status) ? 'forbidden' : 'unavailable' };
            }
        },
    };
}
