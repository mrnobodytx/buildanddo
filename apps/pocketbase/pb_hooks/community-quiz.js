// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/community-quiz.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-QUIZ-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-QUIZ-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/pocketbase/pb_hooks/workspace-access.js, apps/pocketbase/pb_hooks/tutorial-learning.js
// EnumType:    Service
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/workspace-access.js; DEPENDS_ON apps/pocketbase/pb_hooks/tutorial-learning.js; CONSUMES scripts/discordbot/grading.py
// DAG Node:    none
// Intent:      Grade the community bot's practice quiz on the server so no public file needs a lesson's answer.
// ───────────────────────────────────────────────────────────────

const access = require(`${__hooks}/workspace-access.js`);
const TOKEN_VARIABLE = 'BUILDANDDO_COMMUNITY_BOT_TOKEN';
const MINIMUM_TOKEN = 32;
const GOVERNMENT = 'Government submissions';
// Fixed windows per key, held in the app's shared store: per-process and reset by a restart.
// Three attempts per person and lesson, thirty per person, and at most MAX_KEYS tracked keys.
const LIMITS = Object.freeze({ window_ms: 10 * 60 * 1000, per_lesson: 3, per_person: 30, max_keys: 2000 });
const STORE_KEY = 'buildanddo.community_quiz.attempts';

/** @param {object} e Native request. Refuses unless the caller holds the configured community bot token. */
function authorize(e) {
    const expected = $os.getenv(TOKEN_VARIABLE) || '';
    if (expected.length < MINIMUM_TOKEN) throw new ApiError(503, 'Community quiz grading is not configured on this server.');
    const header = String(e.request.header.get('Authorization') || '');
    const given = header.startsWith('Bearer ') ? header.slice(7) : '';
    // Equal-length digests keep the comparison time independent of where, or whether, the values differ.
    if (!$security.equal($security.sha256(given), $security.sha256(expected)))
        throw new ApiError(401, 'Community quiz grading needs the community bot credential.');
}

/** @param {object} app Native app. @param {string} person Discord user. @param {string} slug Lesson. @param {number} now Server clock. */
function admit(app, person, slug, now = Date.now()) {
    let wait = 0;
    app.store().setFunc(STORE_KEY, (old) => {
        let table = {};
        try { table = typeof old === 'string' ? JSON.parse(old) : {}; } catch { table = {}; }
        const live = {};
        for (const [key, entry] of Object.entries(table || {}))
            if (Array.isArray(entry) && entry[0] <= now && entry[0] + LIMITS.window_ms > now) live[key] = entry;
        const keys = [['person:' + person, LIMITS.per_person], ['lesson:' + person + ':' + slug, LIMITS.per_lesson]];
        for (const [key, limit] of keys) {
            const entry = live[key];
            if (entry && entry[1] >= limit) wait = Math.max(wait, Math.ceil((entry[0] + LIMITS.window_ms - now) / 1000));
        }
        // A full table refuses new callers instead of growing or evicting someone's window.
        if (!wait && Object.keys(live).length + keys.filter(([key]) => !live[key]).length > LIMITS.max_keys) wait = 60;
        if (!wait) for (const [key] of keys) live[key] = live[key] ? [live[key][0], live[key][1] + 1] : [now, 1];
        return JSON.stringify(live);
    });
    if (wait) throw new ApiError(429, `Too many quiz answers for now. Try again in ${wait} second${wait === 1 ? '' : 's'}.`);
}

/** @param {object} e Native request from the community bot. @returns {object} Whether the choice is right, and the explanation only when it is. */
function check(e) {
    authorize(e);
    const body = e.requestInfo().body;
    access.exact(body, ['slug', 'choice', 'discord_user_id']);
    if (typeof body.slug !== 'string' || body.slug.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug) ||
        typeof body.discord_user_id !== 'string' || !/^[1-9][0-9]{16,19}$/.test(body.discord_user_id) ||
        !Number.isSafeInteger(body.choice) || body.choice < 0 || body.choice > 5)
        access.invalid('Send a lesson slug, a listed choice and the Discord user.');
    admit(e.app, body.discord_user_id, body.slug);
    const rows = e.app.findRecordsByFilter('tutorials', 'slug = {:slug}', '', 2, 0, { slug: body.slug });
    if (rows.length > 1) throw new ApiError(503, 'This lesson needs an operator review.');
    const tutorial = rows[0];
    if (!tutorial || !require(`${__hooks}/tutorial-learning.js`).interactive(tutorial))
        throw new NotFoundError('This lesson is not available for community grading.');
    // Members-only lessons are graded on the website, where membership is checked.
    if (tutorial.getString('category') === GOVERNMENT)
        throw new ForbiddenError('Government lessons are graded on the website for current members.');
    const lesson = access.json(tutorial, 'lesson');
    if (body.choice >= lesson.check.choices.length) access.invalid('Choose a listed answer.');
    // A wrong answer carries nothing that points at the right choice.
    return body.choice === lesson.check.answer ? { correct: true, explanation: lesson.check.explanation } : { correct: false };
}

module.exports = { TOKEN_VARIABLE, MINIMUM_TOKEN, LIMITS, authorize, admit, check };
