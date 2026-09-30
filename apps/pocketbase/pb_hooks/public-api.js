// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/public-api.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-BUDDI-002
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/pocketbase/pb_hooks/workspace-access.js, apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js
// EnumType:    Service
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/workspace-access.js; CONSUMES tutorials; SERVED_BY apps/pocketbase/pb_hooks/public-api.pb.js
// DAG Node:    none
// Intent:      Answer the public voice agent's read tools from public platform data only, and say so when there is none.
// ───────────────────────────────────────────────────────────────

// WHAT "PUBLIC" MEANS HERE, EXACTLY.
//
// A challenge is an AUTHORED LESSON: a `tutorials` record carrying both a `slug` and a
// `curriculum_version`, which only the curriculum migrations set. The collection's own API rule asks
// for a signed-in reader, but these lessons are public by design - the site bundles the same JSON for
// anonymous visitors (TutorialCatalog on the home page and Docs) and the README says every lesson is
// readable without an account. Any other `tutorials` record is treated as not public and never read
// into a response. The knowledge check's ANSWER is never returned: handing it out would turn the
// verification step into a formality.
//
// Public evidence is restricted to authored lesson references and content digests. Global operational
// collections are never queried here, even if an older backend still has permissive read rules.
//
// Runs are never public. A lesson run is the learner's own `tutorial_learning` record and a Challenge
// Desk run is a workspace mission; neither collection is queried anywhere in this file. A mission id
// therefore always answers the same 404, whether or not such a mission exists, so these routes cannot
// be used to test whether an id is real.

const access = require(`${__hooks}/workspace-access.js`);

const API = 'buildanddo.public-api/v1';
const SITE = 'https://buildanddo.com';
const CHALLENGE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;
const MISSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const EVIDENCE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const NAME = /^[a-z][a-z_]{0,39}$/;
const MAX_FILTER = 200;
const LIMIT_DEFAULT = 5;
const LIMIT_MAX = 10;
const CATALOGUE = 'BuildAndDo lesson catalogue: tutorials records that carry a slug and a curriculum_version';
const RUNS_PRIVATE = 'Runs are private. A lesson run belongs to the learner\'s own account and a Challenge Desk mission '
    + 'belongs to its workspace; BuildAndDo publishes neither, so no mission id can be looked up here.';
const VERIFICATION = 'Checked on the server: the sections are read in order, the practice checklist is recorded, and the '
    + 'knowledge check is answered correctly. Only then is a completion certificate issued, bound to the lesson\'s '
    + 'content digest. Course completion, not accreditation.';
const STOP = new Set(['the', 'and', 'for', 'with', 'want', 'need', 'how', 'what', 'your', 'you', 'our', 'can', 'does',
    'help', 'get', 'make', 'about', 'into', 'from', 'this', 'that', 'not', 'some', 'any', 'all', 'more', 'most', 'very',
    'just', 'like', 'please', 'would', 'could', 'should', 'will', 'has', 'have', 'had', 'was', 'were', 'been', 'their',
    'them', 'they', 'who', 'which', 'when', 'where', 'why', 'its', 'than', 'then', 'there', 'these', 'those', 'use',
    'using', 'used', 'per', 'before', 'after', 'better', 'improve', 'way', 'ways', 'thing', 'things', 'work', 'real']);

const LESSON_EVIDENCE = ['reference', 'digest'];

// Mirrors of repository-owned public text. tests/upgrade/public-api.test.mjs fails if any of these
// stops matching the file it cites, so an edit to the site cannot silently leave Buddi behind.
const PURPOSE = {
    statement: 'Learn by doing real work. Lessons lead into missions, and a mission isn\'t finished until somebody has checked it.',
    summary: 'BuildAndDo is an educational collaboration platform. Learn with people and AI through real projects, verify what happened, and share what you learned.',
    owner: 'Citadel Nexus Inc.',
    framing: 'BuildAndDo is an educational, collaborative platform. It is not a service that sets up or runs a business on anyone\'s behalf.',
    source: 'README.md (statement); apps/web/src/lib/publicPages.js (summary)',
};
const COMMUNITY = {
    forum: 'https://forum.buildanddo.com',
    wiki: 'https://wiki.buildanddo.com',
    discord: 'https://discord.gg/vTDZxmpHHC',
    reddit: 'https://www.reddit.com/r/buildanddo',
    source: 'apps/web/src/lib/communityLinks.js',
};
const PAGES = [
    { path: '/', label: 'Home', description: 'BuildAndDo is an educational collaboration platform. Learn with people and AI through real projects, verify what happened, and share what you learned.' },
    { path: '/practice', label: 'Practice', description: 'Practice with authored lessons, follow a checklist and continue learning in your workspace.' },
    { path: '/classrooms', label: 'Classrooms', description: 'Learn together in workspace classrooms with host-led Field Manual lessons, attendance and saved discussion.' },
    { path: '/docs', label: 'Docs', description: 'Get started with workspaces, signals, missions, workflows and the evidence ledger. Learn what each state means.' },
    { path: '/pricing', label: 'Pricing', description: 'Discuss a managed paid pilot for one workspace and one approved operation, or explore early access and team rollouts.' },
    { path: '/contact', label: 'Contact', description: 'Request a scoped paid pilot, discuss commercial licensing with Citadel Nexus Inc., or ask a product question.' },
];
const OPERATING_MODEL = {
    flow: [
        'Learn: read an authored lesson, work through its practice checklist and answer its knowledge check.',
        'Bring a challenge: a signed-in member submits one on the Challenge Desk of their workspace. Submitting a challenge does not start an automation or create a verified result.',
        'Plan a mission: the work is scoped as a mission, and a workspace owner or admin approves it before it starts.',
        'Keep the evidence: what happened is recorded in the workspace evidence ledger, and nothing is called verified without evidence.',
        'Learn together: classrooms run host-led shared lessons, and the practice library introduces authored learning activities.',
    ],
    authority: {
        A0: 'Read public information. No account data, no workspace data.',
        A2: 'Submit one bounded request - feedback, a human handoff or a demo-challenge request - that a person reviews. It starts nothing and grants no execution authority.',
    },
    honesty: 'Nothing is invented. Unknown is reported as unknown, and every record keeps its own verification label.',
    source: 'apps/web/src/pages/HomePage.jsx (Challenge Desk); apps/pocketbase/pb_hooks/workflow-policy.js (approvals); apps/web/src/lib/publicPages.js',
};
const BOUNDARIES = {
    can: [
        'Explain BuildAndDo from its public information.',
        'List the public lessons and how each one is verified.',
        'Show authored lesson references and content digests.',
        'Submit feedback, a human-handoff request or a demo-challenge request, each with a receipt.',
    ],
    cannot: [
        'Observe critical system health, internal plans, global governance records or infrastructure.',
        'See or change anyone\'s account, workspace, missions or learning progress.',
        'Start work, approve a mission or mark anything verified.',
        'Quote prices, dates or outcomes the platform has not published.',
    ],
    pricing: 'Government research is an approved membership tier; managed pilots are scoped separately.',
    source: 'apps/web/src/pages/PricingPage.jsx (pricing); SRS-BUILDANDDO-BUDDI-002',
};
const SECTIONS = ['purpose', 'operating_model', 'capabilities', 'use_cases', 'curriculum', 'community', 'roadmap',
    'platform_health', 'boundaries'];

function now() { return new Date().toISOString(); }
function iso(value) { const text = String(value || ''); return text ? text.replace(' ', 'T') : null; }
function text(value, max = 300) { return typeof value === 'string' ? value.slice(0, max) : ''; }

/** @returns {string} Site origin for public links and published files; an operator may point staging at itself. */
function origin() {
    const value = String($os.getenv('BUILDANDDO_PUBLIC_ORIGIN') || '').trim().replace(/\/+$/, '');
    return /^https?:\/\/[A-Za-z0-9.-]+(:[0-9]{1,5})?$/.test(value) ? value : SITE;
}

/** @returns {object} The fields every response carries, merged with the body. */
function stamp(authority, source, body) {
    return Object.assign({ schema: API, authority, source, as_of: now() }, body);
}
function reply(e, status, authority, source, body) {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(status, stamp(authority, source, body));
}
function invalid(e, source, reason, field) { return reply(e, 400, 'A0', source, { state: 'INVALID', reason, field }); }
function unknown(e, source, reason, extra = {}) { return reply(e, 404, 'A0', source, Object.assign({ state: 'UNKNOWN', reason }, extra)); }

/**
 * Run one handler; anything unexpected becomes a stamped 500 rather than PocketBase's bare error.
 * If the handler had already answered, the failure is logged and nothing more is written, so a
 * response can never carry two bodies.
 */
function guard(e, authority, source, handler) {
    try {
        return handler();
    } catch (error) {
        e.app.logger().error('buildanddo public api failed', 'error', String(error), 'path', String(e.request.url.path));
        if (e.written()) return null;
        return reply(e, 500, authority, source, { state: 'ERROR', reason: 'The platform could not answer this request.' });
    }
}

/** @returns {string} One query parameter, trimmed; absent and empty are the same. */
function param(e, name) {
    const value = e.request.url.query().get(name);
    return typeof value === 'string' ? value.trim() : '';
}

// ---- lessons ------------------------------------------------------------------------------------

function strings(list, max = 20) {
    return (Array.isArray(list) ? list : []).filter((item) => typeof item === 'string' && item.trim())
        .slice(0, max).map((item) => item.trim());
}

/** @returns {object|null} One authored lesson projected for the public, or null when it is not presentable. */
function lessonOf(record) {
    // Read the JSON field through its string form: on 0.39.8 record.get() hands back a raw JSON value
    // whose keys are unreachable, and `typeof` still says 'object', so a truthiness check passes.
    let lesson = null;
    try { lesson = JSON.parse(record.getString('lesson') || 'null'); } catch (_) { lesson = null; }
    if (!lesson || lesson.schema_version !== 1 || !Array.isArray(lesson.sections) || !lesson.sections.length ||
        !lesson.exercise || typeof lesson.exercise.prompt !== 'string' || !lesson.check ||
        typeof lesson.check.question !== 'string' || !Array.isArray(lesson.check.choices)) return null;
    const slug = record.getString('slug');
    if (!CHALLENGE_ID.test(slug)) return null;
    return {
        record,
        lesson,
        challenge_id: slug,
        record_id: record.id,
        title: record.getString('title'),
        summary: record.getString('summary'),
        track: record.getString('category'),
        effort_minutes: number(record.get('effort_minutes')),
        prerequisites: record.getString('prerequisites'),
        curriculum_version: record.getString('curriculum_version'),
        outcomes: strings(lesson.outcomes),
        created: iso(record.getString('created')),
        updated: iso(record.getString('updated')),
    };
}

/** @returns {Array<object>|null} Every presentable authored lesson in catalogue order, or null when none is installed. */
function catalogue(app) {
    try {
        app.findCollectionByNameOrId('tutorials');
    } catch (error) {
        if (String(error).includes('no rows in result set')) return null;
        throw error;
    }
    // Filter syntax (&&, quoted ''), not SQL: this is findRecordsByFilter, not countRecords.
    return app.findRecordsByFilter('tutorials', "slug != '' && curriculum_version != ''", 'order,slug', 500, 0)
        .map(lessonOf).filter(Boolean);
}

/** @returns {object|null} The authored lesson with this slug or record id; anything else is null. */
function findLesson(app, id) {
    if (!CHALLENGE_ID.test(String(id || ''))) return null;
    return (catalogue(app) || []).find((item) => item.challenge_id === id || item.record_id === id) || null;
}

/** Same digest tutorial-learning.js binds into a certificate, so the two can be compared. */
function digestOf(item) {
    return $security.sha256(access.canonical({
        title: item.record.getString('title'),
        summary: item.record.getString('summary'),
        category: item.record.getString('category'),
        effort_minutes: Number(item.record.get('effort_minutes') || 10),
        curriculum_version: item.record.getString('curriculum_version') || 'custom',
        lesson: item.lesson,
    }));
}

function links(base) {
    return { read: `${base}/docs#workspace-lessons`, practice_signed_in: `${base}/app/tutorials` };
}

function summaryOf(item, base) {
    return {
        challenge_id: item.challenge_id,
        kind: 'lesson',
        title: item.title,
        summary: item.summary,
        track: item.track,
        effort_minutes: item.effort_minutes,
        outcomes: item.outcomes,
        practice: { prompt: item.lesson.exercise.prompt, checklist: strings(item.lesson.exercise.checklist) },
        verification: VERIFICATION,
        links: links(base),
    };
}

function references(item) {
    return (Array.isArray(item.lesson.references) ? item.lesson.references : []).slice(0, 12)
        .filter((reference) => reference && typeof reference.label === 'string' && typeof reference.url === 'string')
        .map((reference, index) => ({
            evidence_id: `${item.challenge_id}.ref.${index + 1}`,
            type: 'reference',
            label: text(reference.label, 200),
            url: text(reference.url, 2048),
            state: 'CITED',
        }));
}

function lessonEvidence(item) {
    return [...references(item), {
        evidence_id: `${item.challenge_id}.digest`,
        type: 'digest',
        label: 'SHA-256 of the lesson content a completion certificate is bound to',
        content_digest: digestOf(item),
        curriculum_version: item.curriculum_version,
        state: 'COMPUTED',
    }];
}

function tracks(items) {
    const counts = {};
    for (const item of items) counts[item.track || 'Unassigned'] = (counts[item.track || 'Unassigned'] || 0) + 1;
    return Object.keys(counts).map((track) => ({ track, lessons: counts[track] }));
}

// ---- matching --------------------------------------------------------------------------------------

/** @returns {Array<string>} Word prefixes for a filter value: five characters, so verify finds verification. */
function terms(value) {
    const words = String(value).toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 3 && !STOP.has(word));
    return [...new Set(words.map((word) => word.slice(0, 5)))].slice(0, 12);
}
function vocabulary(item) {
    const lesson = item.lesson;
    const parts = [item.title, item.summary, item.track, item.prerequisites, lesson.why, lesson.exercise.prompt,
        ...item.outcomes, ...strings(lesson.exercise.checklist), ...lesson.sections.map((section) => section && section.heading)];
    return String(parts.filter((part) => typeof part === 'string').join(' ')).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}
function matched(words, prefixes) { return prefixes.filter((prefix) => words.some((word) => word.startsWith(prefix))).length; }

// ---- handlers ----------------------------------------------------------------------------------------

/** GET /api/v1/public/product-context?section= */
function productContext(e) {
    const source = 'BuildAndDo product context: reviewed product statements and authored lessons';
    return guard(e, 'A0', source, () => {
        const requested = param(e, 'section').toLowerCase();
        if (requested && !NAME.test(requested)) return invalid(e, source, 'section must be one lowercase word, such as capabilities.', 'section');
        if (requested && !SECTIONS.includes(requested)) return unknown(e, source, `There is no product-context section named ${requested}.`, { sections: SECTIONS });
        const base = origin();
        const lessons = () => catalogue(e.app) || [];
        const build = {
            purpose: () => PURPOSE,
            operating_model: () => OPERATING_MODEL,
            capabilities: () => ({ state: 'AUTHORED', public_pages: PAGES.map((page) => ({ ...page, url: base + page.path })),
                source: 'apps/web/src/lib/publicPages.js', note: 'Product descriptions, not operational measurements.' }),
            use_cases: () => {
                const items = lessons();
                return {
                    learning_paths: tracks(items).map((entry) => Object.assign(entry, {
                        examples: items.filter((item) => (item.track || 'Unassigned') === entry.track).slice(0, 3).map((item) => item.title),
                    })),
                    pages: PAGES.map((page) => Object.assign({ url: base + page.path }, page)),
                    source: `${CATALOGUE}; apps/web/src/lib/publicPages.js`,
                };
            },
            curriculum: () => {
                const items = lessons();
                return {
                    state: items.length ? 'MEASURED' : 'EMPTY', lessons: items.length, tracks: tracks(items),
                    versions: [...new Set(items.map((item) => item.curriculum_version))], read: `${base}/docs#workspace-lessons`,
                    source: CATALOGUE,
                };
            },
            community: () => COMMUNITY,
            roadmap: () => ({ state: 'PRIVATE', reason: 'Operational planning is available only in an authorized workspace.' }),
            platform_health: () => ({ state: 'PRIVATE', reason: 'Critical system observations require operator authority.' }),
            boundaries: () => BOUNDARIES,
        };
        const sections = {};
        for (const name of requested ? [requested] : SECTIONS) sections[name] = build[name]();
        return reply(e, 200, 'A0', source, { state: 'OK', sections });
    });
}

/** GET /api/v1/public/challenges/demo?problem_category=&business_type=&objective=&limit= */
function demoChallenges(e) {
    return guard(e, 'A0', CATALOGUE, () => {
        const filters = {};
        for (const name of ['problem_category', 'business_type', 'objective']) {
            const value = param(e, name);
            if (value.length > MAX_FILTER) return invalid(e, CATALOGUE, `${name} must be at most ${MAX_FILTER} characters.`, name);
            if (value) filters[name] = value;
        }
        const rawLimit = param(e, 'limit');
        if (rawLimit && !/^[0-9]{1,4}$/.test(rawLimit)) return invalid(e, CATALOGUE, 'limit must be a whole number from 1 to 10.', 'limit');
        const asked = rawLimit ? Number(rawLimit) : LIMIT_DEFAULT;
        if (asked < 1) return invalid(e, CATALOGUE, 'limit must be a whole number from 1 to 10.', 'limit');
        const limit = Math.min(asked, LIMIT_MAX);
        const items = catalogue(e.app);
        if (!items) return reply(e, 503, 'A0', CATALOGUE, { state: 'UNAVAILABLE', reason: 'The lesson catalogue is not installed on this server.' });
        // A label (problem_category, business_type) must match on every word; free text (objective)
        // on at least two, or its only word. Together they narrow: each given filter has to hold.
        const wanted = Object.keys(filters).map((name) => ({ name, prefixes: terms(filters[name]) }))
            .filter((filter) => filter.prefixes.length);
        const scored = items.map((item) => {
            const words = vocabulary(item);
            let score = 0;
            for (const filter of wanted) {
                const hits = matched(words, filter.prefixes);
                const needed = filter.name === 'objective' ? Math.min(2, filter.prefixes.length) : filter.prefixes.length;
                if (hits < needed) return null;
                score += hits;
            }
            return { item, score };
        }).filter(Boolean).sort((a, b) => b.score - a.score);
        const base = origin();
        const body = {
            catalogue: { lessons: items.length, tracks: tracks(items) },
            filters: Object.assign({}, filters, { limit, limit_capped: asked > LIMIT_MAX, terms: wanted }),
            items: scored.slice(0, limit).map((entry) => summaryOf(entry.item, base)),
        };
        if (Object.keys(filters).length && !wanted.length) {
            body.note = 'None of the filters contained a searchable word, so the catalogue is listed in order.';
        }
        if (!body.items.length) {
            const given = Object.keys(filters).map((name) => `${name} "${filters[name]}"`).join(', ');
            return reply(e, 200, 'A0', CATALOGUE, Object.assign({
                state: 'EMPTY',
                reason: `No public challenge matches ${given}. BuildAndDo's public challenges are its ${items.length} authored lessons in `
                    + `${body.catalogue.tracks.length} learning paths: ${body.catalogue.tracks.map((entry) => entry.track).join(', ')}.`,
            }, body));
        }
        return reply(e, 200, 'A0', CATALOGUE, Object.assign({ state: 'OK', total_matching: scored.length }, body));
    });
}

/**
 * Shared front half of the state and replay routes: validate, refuse runs, resolve the lesson.
 * `answered` means the refusal has already been written. It is a flag and not e.json's return
 * value, because e.json returns a nil error on success - falsy - so testing that value would fall
 * through and write a second body after the first.
 */
function resolve(e, source) {
    const id = String(e.request.pathValue('challenge_id') || '');
    if (!CHALLENGE_ID.test(id)) {
        invalid(e, source, 'challenge_id must be a lesson slug or record id.', 'challenge_id');
        return { answered: true };
    }
    const mission = param(e, 'mission_id');
    if (mission && !MISSION_ID.test(mission)) {
        invalid(e, source, 'mission_id is not a valid identifier.', 'mission_id');
        return { answered: true };
    }
    if (mission) {
        unknown(e, source, RUNS_PRIVATE);
        return { answered: true };
    }
    const item = findLesson(e.app, id);
    if (!item) {
        unknown(e, source, `No public challenge has the id ${id}.`);
        return { answered: true };
    }
    return { answered: false, item };
}

/** GET /api/v1/public/challenges/{challenge_id}/state?mission_id= */
function challengeState(e) {
    return guard(e, 'A0', CATALOGUE, () => {
        const found = resolve(e, CATALOGUE);
        if (found.answered) return null;
        const item = found.item;
        const sections = item.lesson.sections.filter((entry) => entry && typeof entry.heading === 'string');
        const steps = sections.map((entry, index) => ({ step: index + 1, kind: 'read', heading: text(entry.heading, 200) }));
        steps.push({ step: steps.length + 1, kind: 'practice', prompt: item.lesson.exercise.prompt, checklist: strings(item.lesson.exercise.checklist) });
        steps.push({ step: steps.length + 1, kind: 'check', question: item.lesson.check.question, choices: item.lesson.check.choices.length });
        return reply(e, 200, 'A0', CATALOGUE, {
            state: 'PUBLISHED',
            challenge: summaryOf(item, origin()),
            steps,
            verifier: { state: 'SERVER_CHECKED', method: VERIFICATION },
            content_digest: digestOf(item),
            curriculum_version: item.curriculum_version,
            evidence_refs: lessonEvidence(item).map((entry) => ({ evidence_id: entry.evidence_id, type: entry.type })),
            catalogue: { added: item.created, revised: item.updated },
            runs: { public: false, reason: RUNS_PRIVATE },
        });
    });
}

/** @returns {object|null} A reference or digest of an intentionally authored public lesson. */
function findEvidence(app, id) {
    const lessonMatch = /^(.+)\.(?:ref\.([0-9]{1,2})|digest)$/.exec(id);
    if (!lessonMatch) return null;
    const item = findLesson(app, lessonMatch[1]);
    return item ? lessonEvidence(item).find((entry) => entry.evidence_id === id) || null : null;
}

/** GET /api/v1/public/evidence?challenge_id=&mission_id=&evidence_id=&evidence_type= */
function evidence(e) {
    const source = 'BuildAndDo public lesson references and content digests';
    return guard(e, 'A0', source, () => {
        const challenge = param(e, 'challenge_id'), mission = param(e, 'mission_id');
        const id = param(e, 'evidence_id'), type = param(e, 'evidence_type').toLowerCase();
        if (challenge && !CHALLENGE_ID.test(challenge)) return invalid(e, source, 'challenge_id must be a lesson slug or record id.', 'challenge_id');
        if (mission && !MISSION_ID.test(mission)) return invalid(e, source, 'mission_id is not a valid identifier.', 'mission_id');
        if (id && !EVIDENCE_ID.test(id)) return invalid(e, source, 'evidence_id is not a valid identifier.', 'evidence_id');
        if (type && !NAME.test(type)) return invalid(e, source, 'evidence_type must be one lowercase word, such as reference.', 'evidence_type');
        if (mission) return unknown(e, source, RUNS_PRIVATE);
        const legend = 'References and digests describe authored lessons. Operational evidence and verification records are private.';
        const empty = (reason) => reply(e, 200, 'A0', source, { state: 'EMPTY', reason, legend, items: [], supported_types: LESSON_EVIDENCE });
        if (type && !LESSON_EVIDENCE.includes(type)) return empty('Only authored lesson references and digests are public.');
        const lesson = challenge ? findLesson(e.app, challenge) : null;
        if (challenge && !lesson) return unknown(e, source, 'No public challenge has that id.');
        if (id) {
            const item = findEvidence(e.app, id);
            if (!item || (type && item.type !== type) || (lesson && !item.evidence_id.startsWith(`${lesson.challenge_id}.`)))
                return unknown(e, source, 'No public lesson evidence matches that request.');
            return reply(e, 200, 'A0', source, { state: 'OK', legend, items: [item] });
        }
        if (lesson) {
            const items = lessonEvidence(lesson).filter((entry) => !type || entry.type === type);
            return items.length ? reply(e, 200, 'A0', source, { state: 'OK', legend, items }) : empty('This lesson publishes no evidence of that type.');
        }
        if (type) return empty('Lesson evidence is listed per challenge; pass challenge_id.');
        return reply(e, 200, 'A0', source, { state: 'OK', legend, types: LESSON_EVIDENCE.map((name) =>
            ({ type: name, published: true, records: null, note: 'Per lesson; pass challenge_id.' })) });
    });
}

/** GET /api/v1/public/replay/{challenge_id}?mission_id= */
function replay(e) {
    return guard(e, 'A0', CATALOGUE, () => {
        const found = resolve(e, CATALOGUE);
        if (found.answered) return null;
        const item = found.item;
        const timeline = [{ at: item.created, event: 'published', detail: `Added to the lesson catalogue (curriculum ${item.curriculum_version}).` }];
        if (item.updated && item.updated !== item.created) timeline.push({ at: item.updated, event: 'revised', detail: 'The lesson content was last revised.' });
        return reply(e, 200, 'A0', CATALOGUE, {
            state: 'NO_PUBLIC_RUNS',
            reason: 'A replay of actions and verification outcomes exists only for a run, and runs are private. This is the '
                + 'public history of the challenge itself and the path a run follows.',
            challenge_id: item.challenge_id,
            timeline,
            verification_path: [
                'Read each section in order.',
                'Record the practice checklist.',
                'Answer the knowledge check; the answer is checked on the server.',
                'Receive a completion certificate bound to the lesson content digest.',
            ],
            runs: { public: false, reason: RUNS_PRIVATE },
        });
    });
}

module.exports = { API, CHALLENGE_ID, SECTIONS, PURPOSE, COMMUNITY, PAGES, OPERATING_MODEL, BOUNDARIES, terms,
    stamp, reply, guard, findLesson, productContext, demoChallenges, challengeState, evidence, replay };
