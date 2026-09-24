// CGRF: SRS=SRS-BUILDANDDO-BUDDI-002 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/public-api.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-BUDDI-002
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-BUDDI-002
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/pocketbase/pb_hooks/workspace-access.js, apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js,
//              apps/pocketbase/pb_migrations/1788800000_create_praxis_evidence_fabric.js,
//              apps/pocketbase/pb_migrations/1788940000_create_evidence_witness.js
// EnumType:    Service
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/workspace-access.js; CONSUMES tutorials; CONSUMES knowledge_sources;
//              CONSUMES knowledge_claims; CONSUMES governance_audits; CONSUMES governance_research_quests;
//              CONSUMES evidence_epochs; CONSUMES anchor_manifests; SERVED_BY apps/pocketbase/pb_hooks/public-api.pb.js
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
// Evidence is served only from a collection whose list AND view rules are the empty string, checked
// on every request. If an operator locks one of them down, this module stops serving it the same
// minute, instead of publishing around the platform's own rule.
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

// type -> the public collection it reads and the fields it publishes. Actor references
// (auditor, submitted_by) are deliberately left out: they are opaque ids nobody here needs.
const EVIDENCE = {
    source: { collection: 'knowledge_sources', state: 'source_type',
        fields: ['title', 'publisher', 'url', 'source_type', 'captured_at', 'content_hash'] },
    claim: { collection: 'knowledge_claims', state: 'epistemic_state',
        fields: ['subject', 'predicate', 'object', 'domain', 'epistemic_state', 'confidence', 'observed_at', 'valid_until'] },
    audit: { collection: 'governance_audits', state: 'result',
        fields: ['target_type', 'target_id', 'action', 'result', 'independent', 'observed_at'] },
    research_quest: { collection: 'governance_research_quests', state: 'status',
        fields: ['question', 'trigger_reason', 'subject_type', 'subject_id', 'status'] },
    epoch: { collection: 'evidence_epochs', state: 'status',
        fields: ['root_algorithm', 'root_digest', 'previous_root', 'artifact_count', 'status', 'sealed_at'] },
    anchor: { collection: 'anchor_manifests', state: 'verification_state',
        fields: ['schema', 'root_digest', 'manifest_digest', 'anchor_network', 'anchor_reference', 'anchor_url',
            'anchored_at', 'observed_public_root', 'observed_at', 'verification_state'] },
};
const NUMBERS = new Set(['confidence', 'artifact_count']);
const BOOLEANS = new Set(['independent']);
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
    { path: '/practice', label: 'Practice', description: 'Community-audited methods for real objectives, with evidence, knowledge states and lessons from each attempt.' },
    { path: '/classrooms', label: 'Classrooms', description: 'Learn together in workspace classrooms with host-led Field Manual lessons, attendance and saved discussion.' },
    { path: '/docs', label: 'Docs', description: 'Get started with workspaces, signals, missions, workflows and the evidence ledger. Learn what each state means.' },
    { path: '/roadmap', label: 'Roadmap', description: 'Follow the BuildAndDo plan, its current state and the evidence needed to call work complete.' },
    { path: '/pricing', label: 'Pricing', description: 'Discuss a managed paid pilot for one workspace and one approved operation, or explore early access and team rollouts.' },
    { path: '/contact', label: 'Contact', description: 'Request a scoped paid pilot, discuss commercial licensing with Citadel Nexus Inc., or ask a product question.' },
];
const OPERATING_MODEL = {
    flow: [
        'Learn: read an authored lesson, work through its practice checklist and answer its knowledge check.',
        'Bring a challenge: a signed-in member submits one on the Challenge Desk of their workspace. Submitting a challenge does not start an automation or create a verified result.',
        'Plan a mission: the work is scoped as a mission, and a workspace owner or admin approves it before it starts.',
        'Keep the evidence: what happened is recorded in the workspace evidence ledger, and nothing is called verified without evidence.',
        'Learn together: classrooms run host-led shared lessons, and the practice library publishes community-audited methods.',
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
        'Show public evidence with the label it carries.',
        'Submit feedback, a human-handoff request or a demo-challenge request, each with a receipt.',
    ],
    cannot: [
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
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }

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

function ruleOf(value) { return value === null || value === undefined ? null : String(value); }

/** @returns {object|null} The collection, only while both of its read rules are public. */
function publicCollection(app, name) {
    let collection;
    try {
        collection = app.findCollectionByNameOrId(name);
    } catch (error) {
        if (String(error).includes('no rows in result set')) return null;
        throw error;
    }
    return ruleOf(collection.listRule) === '' && ruleOf(collection.viewRule) === '' ? collection : null;
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

// ---- published site files ---------------------------------------------------------------------------

/**
 * One file the site publishes (capabilities.json, roadmap-status.json, platform-health.json), cached
 * for five minutes and a failure for one. A 200 is not accepted as proof: the site answers every
 * unknown path with its HTML shell and a 200, so only a JSON content type that parses counts.
 */
function published(name, deadline) {
    const key = `buildanddo.public-api.${name}`;
    const store = $app.store();
    try {
        const cached = JSON.parse(store.get(key) || 'null');
        if (cached && Date.now() - cached.fetched_ms < (cached.ok ? 300000 : 60000)) return cached;
    } catch (_) { /* a cache entry that does not parse is refetched */ }
    let result;
    if (Date.now() > deadline) {
        return { ok: false, reason: 'Not fetched within this request\'s time budget.', fetched_at: now() };
    }
    let response = null;
    try {
        response = $http.send({
            url: `${origin()}/${name}`,
            method: 'GET',
            headers: { Accept: 'application/json', 'User-Agent': 'BuildAndDo-PublicAPI/1.0 (+https://buildanddo.com)' },
            timeout: 2,
        });
    } catch (_) {
        result = { ok: false, reason: 'The published file could not be fetched.' };
    }
    if (response) {
        const type = String(((response.headers || {})['Content-Type'] || [''])[0] || '');
        if (response.statusCode !== 200) result = { ok: false, reason: `The site answered ${response.statusCode}.` };
        else if (!type.includes('application/json')) result = { ok: false, reason: `The site served ${type || 'no content type'}, not JSON.` };
        else {
            try { result = { ok: true, doc: JSON.parse(toString(response.body)) }; }
            catch (_) { result = { ok: false, reason: 'The site served JSON that does not parse.' }; }
        }
    }
    result.fetched_ms = Date.now();
    result.fetched_at = now();
    store.set(key, JSON.stringify(result));
    return result;
}

function section(name, deadline, summarize) {
    const file = published(name, deadline);
    const base = { source: `${origin()}/${name}`, fetched_at: file.fetched_at };
    if (!file.ok || !file.doc || typeof file.doc !== 'object') return Object.assign(base, { state: 'UNAVAILABLE', reason: file.reason || 'Not a JSON object.' });
    return Object.assign(base, { state: 'MEASURED' }, summarize(file.doc));
}

function capabilitiesOf(doc) {
    const all = Array.isArray(doc.capabilities) ? doc.capabilities.filter((item) => item && typeof item === 'object') : [];
    const counts = {};
    for (const key of Object.keys(doc.counts || {})) if (number(doc.counts[key]) !== null) counts[text(key, 40)] = number(doc.counts[key]);
    return {
        generated_at: text(doc.generated_at, 40), file_state: text(doc.state, 40),
        deployed: { production: text((doc.deployed || {}).production, 40), staging: text((doc.deployed || {}).staging, 40) },
        counts, total: number(doc.total),
        public_pages: all.filter((item) => item.surface === 'public').slice(0, 40)
            .map((item) => ({ label: text(item.label, 80), path: text(item.path, 200), state: text(item.state, 20) })),
        workspace_surfaces: all.filter((item) => item.surface !== 'public').length,
    };
}
function roadmapOf(doc) {
    return {
        generated_at: text(doc.generated_at, 40), file_state: text(doc.state, 40), campaign_id: text(doc.campaign_id, 80),
        sprint_day: number(doc.sprint_day), sprint_days: number(doc.sprint_days),
        planned_pct: number(doc.planned_pct), actual_pct: number(doc.actual_pct), gate_state: text(doc.gate_state, 40),
        milestones: (Array.isArray(doc.milestones) ? doc.milestones : []).slice(0, 40).filter((item) => item && typeof item === 'object')
            .map((item) => ({ day: number(item.day), title: text(item.title, 200), status: text(item.status, 40) })),
    };
}
function platformHealthOf(doc) {
    const totals = doc.totals || {};
    return {
        generated_at: text(doc.generated_at, 40), observed_at: text(doc.observed_at, 40), file_state: text(doc.state, 40),
        totals: { platforms: number(totals.platforms), connected: number(totals.connected), unverified: number(totals.unverified) },
        platforms: (Array.isArray(doc.platforms) ? doc.platforms : []).slice(0, 20).filter((item) => item && typeof item === 'object')
            .map((item) => ({ label: text(item.label, 80), state: text(item.state, 40), verified: item.verified === true })),
    };
}

// ---- handlers ----------------------------------------------------------------------------------------

/** GET /api/v1/public/product-context?section= */
function productContext(e) {
    const source = 'BuildAndDo product context: reviewed repository statements, the live lesson catalogue and files the site publishes';
    return guard(e, 'A0', source, () => {
        const requested = param(e, 'section').toLowerCase();
        if (requested && !NAME.test(requested)) return invalid(e, source, 'section must be one lowercase word, such as capabilities.', 'section');
        if (requested && !SECTIONS.includes(requested)) return unknown(e, source, `There is no product-context section named ${requested}.`, { sections: SECTIONS });
        const base = origin();
        const deadline = Date.now() + 5000;
        const lessons = () => catalogue(e.app) || [];
        const build = {
            purpose: () => PURPOSE,
            operating_model: () => OPERATING_MODEL,
            capabilities: () => section('capabilities.json', deadline, capabilitiesOf),
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
            roadmap: () => section('roadmap-status.json', deadline, roadmapOf),
            platform_health: () => section('platform-health.json', deadline, platformHealthOf),
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

/** @returns {object} One public evidence record in the shape every type shares. */
function evidenceOf(type, record) {
    const spec = EVIDENCE[type];
    const item = { evidence_id: record.getString('display_id'), type, collection: spec.collection,
        state: record.getString(spec.state) || 'UNLABELLED' };
    for (const field of spec.fields) {
        if (NUMBERS.has(field)) item[field] = number(record.get(field));
        else if (BOOLEANS.has(field)) item[field] = record.getBool(field);
        else item[field] = text(record.getString(field), 2048);
    }
    return item;
}

/** @returns {object|null} The public evidence item with this id, lesson evidence included; null otherwise. */
function findEvidence(app, id) {
    const lessonMatch = /^(.+)\.(?:ref\.([0-9]{1,2})|digest)$/.exec(id);
    if (lessonMatch) {
        const item = findLesson(app, lessonMatch[1]);
        return item ? lessonEvidence(item).find((entry) => entry.evidence_id === id) || null : null;
    }
    for (const type of Object.keys(EVIDENCE)) {
        const collection = publicCollection(app, EVIDENCE[type].collection);
        if (!collection) continue;
        const rows = app.findRecordsByFilter(collection.name, 'display_id = {:id}', '', 1, 0, { id });
        if (rows.length) return evidenceOf(type, rows[0]);
    }
    return null;
}

/** GET /api/v1/public/evidence?challenge_id=&mission_id=&evidence_id=&evidence_type= */
function evidence(e) {
    const source = 'BuildAndDo public evidence: lesson references and digests, and fabric records whose read rules are public';
    return guard(e, 'A0', source, () => {
        const challenge = param(e, 'challenge_id');
        const mission = param(e, 'mission_id');
        const id = param(e, 'evidence_id');
        const type = param(e, 'evidence_type').toLowerCase();
        if (challenge && !CHALLENGE_ID.test(challenge)) return invalid(e, source, 'challenge_id must be a lesson slug or record id.', 'challenge_id');
        if (mission && !MISSION_ID.test(mission)) return invalid(e, source, 'mission_id is not a valid identifier.', 'mission_id');
        if (id && !EVIDENCE_ID.test(id)) return invalid(e, source, 'evidence_id is not a valid identifier.', 'evidence_id');
        if (type && !NAME.test(type)) return invalid(e, source, 'evidence_type must be one lowercase word, such as claim.', 'evidence_type');
        if (mission) return unknown(e, source, RUNS_PRIVATE);
        const types = [...LESSON_EVIDENCE, ...Object.keys(EVIDENCE)];
        const legend = 'Each item keeps the state its own record carries. This API never upgrades a label, so an unverified claim is returned as unverified.';
        if (type && !types.includes(type)) {
            return reply(e, 200, 'A0', source, { state: 'EMPTY', reason: `BuildAndDo publishes no evidence of type ${type}.`, supported_types: types, items: [] });
        }
        const empty = (reason, extra = {}) => reply(e, 200, 'A0', source, Object.assign({ state: 'EMPTY', reason, legend, items: [] }, extra));
        const lesson = challenge ? findLesson(e.app, challenge) : null;
        if (challenge && !lesson) return unknown(e, source, `No public challenge has the id ${challenge}.`);
        if (id) {
            const item = findEvidence(e.app, id);
            // With a challenge named, the evidence must belong to it: fabric records are not linked to
            // lessons, and a lesson's evidence ids all start with its slug.
            if (!item || (type && item.type !== type) || (lesson && !item.evidence_id.startsWith(`${lesson.challenge_id}.`))) {
                return unknown(e, source, `No public evidence has the id ${id}${type ? ` and type ${type}` : ''}${lesson ? ` for challenge ${lesson.challenge_id}` : ''}.`);
            }
            return reply(e, 200, 'A0', source, { state: 'OK', legend, items: [item] });
        }
        if (lesson) {
            if (type && !LESSON_EVIDENCE.includes(type)) {
                return empty(`Lessons carry reference and digest evidence. The public evidence fabric (${type}) is not linked to lessons.`);
            }
            const items = lessonEvidence(lesson).filter((entry) => !type || entry.type === type);
            if (!items.length) return empty('This lesson publishes no evidence of that type.');
            return reply(e, 200, 'A0', source, { state: 'OK', legend, items });
        }
        if (type && LESSON_EVIDENCE.includes(type)) return empty(`Lesson ${type} evidence is listed per challenge; pass challenge_id.`);
        if (type) {
            const collection = publicCollection(e.app, EVIDENCE[type].collection);
            if (!collection) return empty(`No public ${type} evidence is published on this server.`);
            const total = e.app.countRecords(collection.name);
            if (!total) return empty(`No ${type} evidence has been published yet.`, { total });
            const rows = e.app.findRecordsByFilter(collection.name, "display_id != ''", '-created', LIMIT_MAX, 0);
            return reply(e, 200, 'A0', source, { state: 'OK', legend, total, items: rows.map((record) => evidenceOf(type, record)) });
        }
        const summary = Object.keys(EVIDENCE).map((name) => {
            const collection = publicCollection(e.app, EVIDENCE[name].collection);
            return { type: name, published: Boolean(collection), records: collection ? e.app.countRecords(collection.name) : 0 };
        });
        return reply(e, 200, 'A0', source, { state: 'OK', legend, types: [
            { type: 'reference', published: true, records: null, note: 'Per lesson; pass challenge_id.' },
            { type: 'digest', published: true, records: null, note: 'Per lesson; pass challenge_id.' },
            ...summary,
        ] });
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

module.exports = { API, CHALLENGE_ID, SECTIONS, PURPOSE, COMMUNITY, PAGES, OPERATING_MODEL, BOUNDARIES, EVIDENCE, terms,
    stamp, reply, guard, findLesson, productContext, demoChallenges, challengeState, evidence, replay };
