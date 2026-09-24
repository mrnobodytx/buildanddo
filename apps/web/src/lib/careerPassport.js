// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/careerPassport.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/web/src/lib/operatorPlane.js, libs/career_passport/cli.py
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/web/src/lib/operatorPlane.js; CONSUMES libs/career_passport/cli.py
// Intent:      Review career compiler outputs under current workspace scope without importing their verification or submission authority.
// ───────────────────────────────────────────────────────────────

import { createOperatorClient, projectOperator } from './operatorPlane.js';

export const CAREER_MAX_BYTES = 6_000_000;
const hash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const text = (value, max = 6000) => typeof value === 'string' && value.length > 0 && value.length <= max;
const array = (value, max, check) => Array.isArray(value) && value.length <= max && value.every(check);
const strings = (value, max = 100) => array(value, max, (item) => text(item));
const check = (condition) => { if (!condition) throw new TypeError('Invalid career review'); };
const roles = ['PERSONALLY_IMPLEMENTED', 'PERSONALLY_OPERATED', 'DESIGNED', 'DIRECTED', 'REVIEWED', 'VERIFIED', 'TEAM_DELIVERED', 'AGENT_EXECUTED'];
const states = ['VERIFIED', 'UNREVIEWED', 'NOT_PERSONAL', 'MISSING_EVIDENCE', 'REVIEW_REJECTED', 'STALE', 'CONFLICTING'];
const freeze = (value) => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const stamp = (value) => typeof value === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? Date.parse(value) : NaN;

function stable(value, depth = 0) {
    check(depth < 40);
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number') { check(Number.isFinite(value)); return JSON.stringify(value); }
    if (Array.isArray(value)) return '[' + value.map((item) => stable(item, depth + 1)).join(',') + ']';
    check(value && typeof value === 'object');
    return '{' + Object.keys(value).sort().map((key) => {
        check(!['__proto__', 'constructor', 'prototype'].includes(key));
        return JSON.stringify(key) + ':' + stable(value[key], depth + 1);
    }).join(',') + '}';
}

/** Permit a source link only within the selected public ATS board and posting. */
export function careerJobUrl(job) {
    try {
        check(['lever', 'ashby'].includes(job?.board?.provider) && /^[A-Za-z0-9_-]{1,100}$/.test(job.board.board) && /^[A-Za-z0-9_-]{1,100}$/.test(job.posting_id));
        const url = new URL(job.source_url);
        const host = job.board.provider === 'lever' ? 'jobs.lever.co' : 'jobs.ashbyhq.com';
        check(url.protocol === 'https:' && url.host === host && !url.username && !url.password && !url.search && !url.hash &&
            url.pathname === `/${job.board.board}/${job.posting_id}`);
        const apply = new URL(job.apply_url);
        check(apply.protocol === 'https:' && apply.host === host && !apply.username && !apply.password && !apply.search && !apply.hash &&
            [url.pathname, url.pathname + '/apply', url.pathname + '/application'].includes(apply.pathname));
        return url.href;
    } catch { return null; }
}

/** Validate integrity and display structure; imported claims stay attributed to the file. */
export async function importCareerReview(raw, { person, workspace, crypto = globalThis.crypto, now = Date.now() }) {
    try {
        check(typeof raw === 'string' && new TextEncoder().encode(raw).length <= CAREER_MAX_BYTES);
        const packet = JSON.parse(raw);
        check(packet?.schema_version === 'buildanddo.career-review/v1' && packet.person === person && packet.workspace === workspace &&
            packet.authority_granted === false && packet.live_jobs_verified === 0 && ['HOLD', 'DRAFTS_REQUIRE_REVIEW'].includes(packet.state) &&
            hash(packet.content_sha256) && text(packet.canonical_content, CAREER_MAX_BYTES) && strings(packet.gaps) &&
            Number.isFinite(stamp(packet.as_of)) && stamp(packet.as_of) <= now);
        const { canonical_content: canonical, content_sha256: expected, ...data } = packet;
        check(stable(JSON.parse(canonical)) === stable(data));
        const actual = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
        check(Array.from(new Uint8Array(actual), (byte) => byte.toString(16).padStart(2, '0')).join('') === expected);
        const passport = packet.passport;
        check(passport?.schema_version === 'buildanddo.career-passport/v1' && passport.person === person && passport.workspace === workspace &&
            passport.as_of === packet.as_of && passport.authority_granted === false && passport.employment_years === null &&
            hash(passport.work_sha256) && strings(passport.gaps) && array(passport.claims, 500, (claim) =>
                text(claim?.id, 200) && text(claim.statement) && states.includes(claim.state) && strings(claim.reasons, 30) &&
                (claim.state === 'VERIFIED' ? claim.evidence_state === 'VERIFIED' && hash(claim.review_sha256) : claim.evidence_state === 'OBSERVED') &&
                claim.contribution?.workspace === workspace && text(claim.contribution.participant, 200) &&
                roles.includes(claim.contribution.participation) && strings(claim.contribution.artifact_ids, 30) &&
                strings(claim.contribution.capabilities, 20) && strings(claim.contribution.scope, 12) &&
                (claim.state !== 'VERIFIED' || claim.contribution.participant === person && claim.contribution.participation !== 'AGENT_EXECUTED' &&
                    typeof claim.contribution.agent_assistance === 'boolean')));
        const claims = new Map(passport.claims.map((claim) => [claim.id, claim]));
        check(claims.size === passport.claims.length && passport.verified_personal_claims === passport.claims.filter((claim) => claim.state === 'VERIFIED').length);
        check(Number.isInteger(packet.job_count) && packet.job_count >= 0 && packet.job_count <= 1000);
        check(array(packet.dossiers, 10, (row) => row?.person === person && row.workspace === workspace && row.authority_granted === false &&
            row.as_of === packet.as_of && hash(row.job_revision) && text(row.job_id, 300) && text(row.job?.role, 500) &&
            text(row.job?.board?.company, 160) && text(row.job?.location, 500) && careerJobUrl(row.job) &&
            ['HOLD', 'REVIEW_GAPS', 'STRONG_CANDIDATE'].includes(row.state) && ['CURRENT', 'STALE', 'FUTURE'].includes(row.freshness) &&
            strings(row.do_not_claim, 200) && array(row.selected_claim_ids, 500, (id) => claims.get(id)?.state === 'VERIFIED') &&
            array(row.coverage, 200, (item) => text(item?.quote) && hash(item.requirement_id) && strings(item.reasons, 30) &&
                ['SUPPORTED', 'PARTIAL', 'GAP', 'NEEDS_REVIEW', 'NOT_PROVEN', 'HUMAN_INPUT'].includes(item.state) &&
                ['required', 'preferred', 'responsibility', 'unclassified'].includes(item.importance) &&
                array(item.claim_ids, 500, (id) => claims.get(id)?.state === 'VERIFIED'))));
        check(new Set(packet.dossiers.map((row) => row.job_id)).size === packet.dossiers.length && packet.dossiers.length <= packet.job_count);
        for (const row of packet.dossiers) {
            check(stable(row.do_not_claim) === stable(row.coverage.filter((item) => item.state !== 'SUPPORTED').map((item) => item.quote)));
            const required = row.coverage.filter((item) => item.importance === 'required');
            check(row.required_total === required.length && row.required_supported === required.filter((item) => item.state === 'SUPPORTED').length);
            check(Number.isFinite(stamp(row.job.captured_at)) && stamp(row.job.captured_at) <= stamp(packet.as_of));
            check(row.freshness === 'CURRENT' && stamp(packet.as_of) - stamp(row.job.captured_at) <= 7 * 86400000);
        }
        check(array(packet.packages, 3, (item) => item?.person === person && item.workspace === workspace && item.authority_granted === false &&
            item.state === 'DRAFT_REQUIRES_HUMAN_REVIEW' && hash(item.package_sha256) &&
            packet.dossiers.some((row) => row.job_revision === item.job_revision && row.job_id === item.job_id && row.job.apply_url === item.apply_url) &&
            item.files && Object.keys(item.files).length === 6 && ['resume_variant.pdf', 'cover_letter.txt', 'application_answers.json',
                'portfolio_manifest.json', 'interview_brief.md', 'evidence_manifest.json'].every((name) =>
                hash(item.files[name]?.sha256) && Number.isSafeInteger(item.files[name].bytes) && item.files[name].bytes > 0)));
        check(packet.outcomes?.state === 'UNMEASURED' && packet.outcomes.authority_granted === false &&
            ['submitted', 'response', 'interview', 'offer'].every((key) => packet.outcomes.counts?.[key] === 0));
        return { ok: true, packet: freeze(packet), trust: 'IMPORTED_REVIEW', stale: now - stamp(packet.as_of) > 86400000 };
    } catch { return { ok: false, error: 'This career review is invalid, changed, or belongs to another person or workspace.' }; }
}

/** Read current native history and fence delayed imports and exports after scope changes. */
export function createCareerClient({ client, accountId, workspaceId, demo = false, isCurrent, crypto = globalThis.crypto, now = () => Date.now() }) {
    let disposed = false; let generation = 0; let snapshot = null;
    const current = () => !disposed && !demo && isCurrent() && client.authStore.record?.id === accountId;
    const person = `cni://person/pocketbase/${accountId}`;
    const api = createOperatorClient({ client, accountId, workspaceId, demo, isCurrent: current });
    const changed = () => ({ ok: false, reason: 'scope_changed', error: '' });
    const readable = () => current() && snapshot && projectOperator(snapshot, now()).freshness === 'current';
    return {
        person,
        activate() { disposed = false; snapshot = null; ++generation; },
        async read(page = 1) {
            snapshot = null; const request = ++generation;
            if (!current() || request !== generation) return changed();
            const result = await api.read(page);
            if (!current() || request !== generation) return changed();
            if (result.ok && projectOperator(result.data, now()).freshness === 'current') snapshot = result.data;
            return snapshot ? { ok: true, snapshot } : { ok: false, error: result.error || 'Current work history is unavailable. Refresh before exporting or importing a review.' };
        },
        async importReview(raw) {
            if (!readable()) return { ok: false, error: 'Refresh your current work history before loading a career review.' };
            const request = ++generation;
            const result = await importCareerReview(raw, { person, workspace: workspaceId, crypto, now: now() });
            return readable() && request === generation ? result : changed();
        },
        exportWork() {
            if (!readable()) return null;
            return { schema_version: 'buildanddo.career-workspace/v1', person, workspace: workspaceId, snapshot };
        },
        dispose() { disposed = true; snapshot = null; ++generation; },
    };
}
