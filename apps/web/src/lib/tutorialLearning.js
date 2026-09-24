// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/tutorialLearning.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-19
// Depends:     apps/web/src/lib/tutorialLearnerLesson.js, apps/pocketbase/pb_hooks/tutorial-learning.pb.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/web/src/lib/tutorialLearnerLesson.js; CONSUMES apps/pocketbase/pb_hooks/tutorial-learning.pb.js
// DAG Node:    none
// Intent:      Recover personal learning saves without duplicate credit and export only a validated completion certificate.
// ───────────────────────────────────────────────────────────────

import { validLearnerLesson } from './tutorialLearnerLesson.js';

const id = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
const digest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const integer = (value, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= 0 && value <= max;
const text = (value, max = 5000) => typeof value === 'string' && value.length > 0 && value.length <= max;
const dated = (value) => typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const stale = () => ({ ok: false, reason: 'scope_changed', error: '' });

/** @param {unknown} value Completion receipt. @returns {boolean} Whether its export fields are complete. */
export function validCertificate(value) {
    return Boolean(value && value.schema_version === 'buildanddo.learning-certificate/1' &&
        typeof value.id === 'string' && /^BDO-[A-Z0-9_-]{1,64}$/.test(value.id) &&
        value.issuer === 'BuildAndDo · Citadel Nexus Inc.' && text(value.learner, 120) && text(value.title, 160) && id(value.tutorial) &&
        text(value.curriculum_version, 200) && digest(value.content_digest) && dated(value.issued_at) && value.learning_points === 100 &&
        text(value.achievement, 500) && text(value.scope, 300));
}

function enrollment(value, accountId, tutorialId) {
    if (!value || !id(value.id) || value.owner !== accountId || value.tutorial !== tutorialId || !digest(value.content_digest) ||
        !integer(value.next_section, 20) || typeof value.practiced !== 'boolean' || !integer(value.progress, 100)) return false;
    if (value.status === 'completed') return value.progress === 100 && value.points === 100 && value.practiced && dated(value.completed_at) &&
        validCertificate(value.certificate) && value.certificate.tutorial === tutorialId && value.certificate.content_digest === value.content_digest &&
        value.certificate.id === `BDO-${value.id.toUpperCase()}` && Date.parse(value.completed_at) === Date.parse(value.certificate.issued_at);
    return value.status === 'in_progress' && value.points === 0 && value.progress < 100 && value.completed_at === '' && value.certificate === null;
}
function detail(value, accountId, tutorialId) {
    const tutorial = value?.tutorial;
    if (value?.schema_version !== 1 || value.account_id !== accountId || tutorial?.id !== tutorialId ||
        !text(tutorial.title, 160) || typeof tutorial.summary !== 'string' || !text(tutorial.curriculum_version, 200) ||
        !digest(tutorial.content_digest) || !validLearnerLesson(tutorial.lesson)) return false;
    if (value.enrollment === null) return true;
    const saved = value.enrollment;
    const sections = tutorial.lesson.sections.length;
    return enrollment(saved, accountId, tutorialId) && saved.content_digest === tutorial.content_digest && saved.next_section <= sections &&
        (!saved.practiced || saved.next_section === sections) && saved.progress === (saved.status === 'completed' ? 100 :
        Math.floor((saved.next_section + (saved.practiced ? 1 : 0)) * 100 / (sections + 2))) &&
        (!saved.certificate || saved.certificate.title === tutorial.title && saved.certificate.curriculum_version === tutorial.curriculum_version);
}
function summary(value, accountId, page) {
    if (value?.schema_version !== 1 || value.account_id !== accountId || !integer(value.completed) || value.points !== value.completed * 100 ||
        !integer(value.points) || !text(value.level?.name, 60) || !integer(value.level.number, 4) || value.level.number < 1 ||
        !integer(value.level.floor) || value.level.floor > value.points || !(value.level.next === null || integer(value.level.next) && value.level.next > value.points) ||
        !Array.isArray(value.milestones) || value.milestones.length !== 3 ||
        !value.milestones.every((item) => id(item.id) && text(item.title, 80) && integer(item.target) && item.target > 0 && item.earned === (value.completed >= item.target))) return false;
    const certificates = value.certificates;
    return certificates?.page === page && typeof certificates.has_more === 'boolean' && Array.isArray(certificates.items) && certificates.items.length <= 5 &&
        certificates.items.every((item) => enrollment(item, accountId, item.tutorial) && item.status === 'completed') &&
        new Set(certificates.items.map((item) => item.tutorial)).size === certificates.items.length &&
        (value.resume === null || id(value.resume?.tutorial) && text(value.resume.title, 160) && integer(value.resume.progress, 99));
}

/** @param {object} options Account-scoped native client and liveness guard. @returns {{read: Function, readStates: Function, command: Function, retry: Function}} Recoverable personal learning operations. */
export function createTutorialLearningClient({ client, accountId, demo = false, isCurrent,
    observe = (_collection, _verb, operation) => operation() }) {
    let busy = false, pending = null;
    const current = () => Boolean(!demo && id(accountId) && isCurrent() && client.authStore.record?.id === accountId);
    const prefix = '/api/buildanddo/learning';
    const failure = (error, writing = false) => ({ ok: false,
        reason: error?.status === 409 ? 'conflict' : [401, 403].includes(error?.status) ? 'forbidden' :
            writing && (!error?.status || error.status >= 500) ? 'uncertain' : 'unavailable',
        error: error?.response?.message || (writing ? 'The save could not be confirmed. Retry this checkpoint to recover it.' :
            'Interactive learning is unavailable. You can still read the lessons. Try again later.') });
    const send = async (request) => {
        if (!current()) return stale();
        if (busy) return { ok: false, reason: 'busy', error: '' };
        busy = true;
        try {
            const data = await observe('tutorial_progress', 'update', async () => {
                const value = await client.send(`${prefix}/${encodeURIComponent(request.id)}`, { method: 'POST', body: request.body, requestKey: null, cache: 'no-store' });
                if (!detail(value, accountId, request.id) || !value.enrollment || typeof value.replayed !== 'boolean' ||
                    value.tutorial.content_digest !== request.body.content_digest || !(value.feedback === null ||
                        typeof value.feedback?.correct === 'boolean' && text(value.feedback.explanation))) throw new Error('Incomplete learning receipt');
                const { action, payload } = request.body;
                if (action === 'section' && value.enrollment.next_section <= payload.index ||
                    action === 'practice' && !value.enrollment.practiced ||
                    action !== 'answer' && value.feedback !== null ||
                    action === 'answer' && (!value.feedback || !value.enrollment.practiced ||
                        value.feedback.correct && !value.enrollment.certificate)) throw new Error('Unconfirmed learning checkpoint');
                return value;
            });
            if (!current()) return stale();
            pending = null;
            return { ok: true, data };
        } catch (error) {
            if (!current()) return stale();
            const result = failure(error, true);
            if (result.reason !== 'uncertain') pending = null;
            return result;
        } finally { busy = false; }
    };
    return {
        async readStates() {
            if (!current()) return stale();
            const items = [], tutorials = new Set(), records = new Set();
            try {
                // Bound the full catalogue read; never present a truncated scan as authoritative.
                for (let page = 1; page <= 100; page++) {
                    if (!current()) return stale();
                    const value = await client.send(`${prefix}/states`, { method: 'GET', query: { page }, requestKey: null, cache: 'no-store' });
                    if (!current()) return stale();
                    if (value?.schema_version !== 1 || value.account_id !== accountId || value.page !== page ||
                        typeof value.has_more !== 'boolean' || !Array.isArray(value.items) || value.items.length > 20 ||
                        value.has_more && value.items.length !== 20) return failure(null);
                    for (const item of value.items) {
                        if (!id(item?.tutorial) || !enrollment(item, accountId, item.tutorial) || tutorials.has(item.tutorial) || records.has(item.id)) return failure(null);
                        tutorials.add(item.tutorial); records.add(item.id); items.push(item);
                    }
                    if (!value.has_more) return { ok: true, data: { account_id: accountId, items } };
                }
                return failure(null);
            } catch (error) { return current() ? failure(error) : stale(); }
        },
        async read(tutorialId = '', page = 1) {
            if (!current()) return stale();
            if (tutorialId && !id(tutorialId) || !integer(page, 9999) || page < 1) return failure(null);
            try {
                const value = await client.send(tutorialId ? `${prefix}/${encodeURIComponent(tutorialId)}` : prefix,
                    { method: 'GET', query: tutorialId ? {} : { page }, requestKey: null, cache: 'no-store' });
                if (!current()) return stale();
                if (!(tutorialId ? detail(value, accountId, tutorialId) : summary(value, accountId, page))) return failure(null);
                return { ok: true, data: value };
            } catch (error) { return current() ? failure(error) : stale(); }
        },
        async command(tutorialId, action, contentDigest, payload = {}) {
            if (!current()) return stale();
            if (!id(tutorialId) || !['start', 'section', 'practice', 'answer'].includes(action) || !digest(contentDigest) ||
                !payload || Array.isArray(payload) || typeof payload !== 'object') return failure(null);
            const request = { id: tutorialId, body: { action, content_digest: contentDigest, payload: JSON.parse(JSON.stringify(payload)) } };
            if (pending && JSON.stringify(request) !== JSON.stringify(pending))
                return { ok: false, reason: 'uncertain', error: 'Retry the previous checkpoint before making another change.' };
            pending = request;
            return send(request);
        },
        retry: () => pending ? send(pending) : Promise.resolve(failure(null)),
    };
}

/** @param {object} certificate Saved completion receipt. @returns {string} Offline printable certificate with escaped personal text. */
export function certificateDocument(certificate) {
    if (!validCertificate(certificate)) throw new TypeError('A saved completion certificate is required.');
    const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const date = new Date(certificate.issued_at).toISOString().slice(0, 10);
    return `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>BuildAndDo certificate — ${escape(certificate.title)}</title>
<style>body{font:18px/1.6 Georgia,serif;max-width:850px;margin:4rem auto;padding:2rem}main{border:3px double currentColor;padding:clamp(1rem,5vw,3rem)}h1{font-size:2.5rem;line-height:1.1}h2{font-size:1.8rem}.label{font:small-caps 1rem sans-serif;letter-spacing:.12em}p{overflow-wrap:anywhere}footer{font:14px/1.6 sans-serif;border-top:1px solid;margin-top:2rem;padding-top:1rem}@media print{body{margin:0;padding:0}main{break-inside:avoid}}</style>
<main><p class="label">BuildAndDo · Learning journey</p><h1>Certificate of completion</h1>
<p>open-book tutorial completion; practice self-reported. This is not independently verified mastery.</p>
<p>Awarded to</p><h2>${escape(certificate.learner)}</h2><p>for completing</p><h2>${escape(certificate.title)}</h2>
<p>${escape(certificate.achievement)}</p><p>Issued ${date} · ${certificate.learning_points} learning points</p>
<footer><p>${escape(certificate.issuer)}</p><p>Certificate ${escape(certificate.id)} · Course ${escape(certificate.curriculum_version)}</p>
<p>${escape(certificate.scope)}</p><p>Lesson fingerprint: ${escape(certificate.content_digest)}</p></footer></main></html>`;
}
