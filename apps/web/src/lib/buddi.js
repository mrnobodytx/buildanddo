// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/buddi.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-BUDDI-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-BUDDI-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/lib/workspaceJourney.js
// EnumType:    Library
// EnumEdges:   CONSUMES apps/web/src/lib/workspaceJourney.js
// DAG Node:    none
// Intent:      Give Buddi a pose, a sentence and achievements that only restate what the page has read from the server.
// ───────────────────────────────────────────────────────────────
//
// Buddi adds no recommender and no scoring. Its mood restates the first action
// workspaceJourney already ranks, and its achievements come only from mission
// status (transitions the server enforces) and the server's learning summary.
// tutorial_progress, the mission progress percentage and mission learning
// points are client-writable or browser-only, so they never count here.

export const BUDDI_POSES = Object.freeze(['calm', 'hello', 'think', 'verified', 'build']);

export const BUDDI_TIPS = Object.freeze([
    'Verified means all four checks passed: test, evaluate, verify and validate.',
    'Short missions you can check teach faster than big ones.',
    'A failed mission is a finished mission. Recording it is how the next one goes better.',
    'Evidence belongs to the mission that produced it.',
    'I only celebrate what the server has confirmed.',
]);

/**
 * @param {{state: string, actions: object[]}|null} view workspaceJourney result.
 * @param {{loading?: boolean}} [options] Whether the sources are still loading.
 * @returns {{pose: string, line: string}} Buddi's pose and one plain sentence.
 */
export function buddiMood(view, { loading = false } = {}) {
    if (loading) return { pose: 'think', line: 'I am reading your missions, signals and evidence before suggesting anything.' };
    if (!view || view.state === 'unavailable') return { pose: 'calm', line: 'I cannot read every record right now, so I will not guess what comes next.' };
    if (view.state === 'demo') return { pose: 'hello', line: 'This is the demo workspace. Your own records decide what I suggest.' };
    const first = view.actions?.[0];
    if (!first) return { pose: 'calm', line: 'Nothing is waiting on you right now.' };
    if (first.id === 'begin') return { pose: 'build', line: 'Start by writing down the problem you want to solve.' };
    if (first.priority <= 1) return { pose: 'think', line: 'Something needs a look before work continues.' };
    if (first.id === 'signals') return { pose: 'hello', line: 'New signals came in. Start with the first one.' };
    if (first.priority === 7) return { pose: 'calm', line: 'Your finished work is kept. Nothing else is waiting.' };
    return { pose: 'build', line: 'There is work ready to move. Start with the first one.' };
}

const MISSION_ACHIEVEMENTS = Object.freeze([
    { id: 'mission:first-verified', title: 'First verified mission', status: 'verified', target: 1,
        description: 'A mission passed all four checks.' },
    { id: 'mission:five-verified', title: 'Five verified missions', status: 'verified', target: 5,
        description: 'Five missions passed all four checks.' },
    { id: 'mission:honest-close', title: 'Closed honestly', status: 'failed', target: 1,
        description: 'Recorded a failed outcome instead of leaving a mission open.' },
]);

/**
 * @param {{missions?: {records: object[], loading: boolean, degraded: boolean, demo?: boolean}, learning?: {data: object|null, loading: boolean}, workspace?: string}} sources
 * @returns {{id: string, title: string, description: string, source: string, state: 'earned'|'open'|'unmeasured'}[]}
 */
export function buddiAchievements({ missions, learning, workspace } = {}) {
    const list = [];
    const missionsKnown = Boolean(missions && !missions.loading && !missions.degraded && !missions.demo && workspace);
    const scoped = missionsKnown ? missions.records.filter((record) => record.workspace === workspace) : [];
    for (const item of MISSION_ACHIEVEMENTS) {
        const count = scoped.filter((record) => record.status === item.status).length;
        list.push({ id: item.id, title: item.title, description: item.description, source: 'missions',
            state: !missionsKnown ? 'unmeasured' : count >= item.target ? 'earned' : 'open' });
    }
    const summary = learning && !learning.loading ? learning.data : null;
    if (summary && Array.isArray(summary.milestones)) {
        for (const milestone of summary.milestones) list.push({ id: `learning:${milestone.id}`, title: milestone.title,
            description: `Earn ${milestone.target} tutorial ${milestone.target === 1 ? 'certificate' : 'certificates'}.`,
            source: 'learning', state: milestone.earned === true ? 'earned' : 'open' });
    } else list.push({ id: 'learning', title: 'Learning milestones', source: 'learning', state: 'unmeasured',
        description: 'Tutorial certificates appear here once your saved learning can be read.' });
    return list;
}

/**
 * Celebrations are tracked per source so a source that was unreadable earlier
 * is seeded silently the first time it is read, instead of replaying old wins.
 * @param {object[]} achievements buddiAchievements result.
 * @param {object|null} seen Stored map of source to already-shown ids.
 * @returns {{fresh: object[], next: object|null}} New earned achievements, and a map to store when a source was seeded.
 */
export function unseenAchievements(achievements, seen) {
    const stored = seen && typeof seen === 'object' && !Array.isArray(seen) ? seen : {};
    const next = { ...stored };
    const fresh = [];
    let seeded = false;
    const sources = [...new Set(achievements.filter((item) => item.state !== 'unmeasured').map((item) => item.source))];
    for (const source of sources) {
        const earned = achievements.filter((item) => item.source === source && item.state === 'earned');
        if (!Array.isArray(stored[source])) { next[source] = earned.map((item) => item.id); seeded = true; }
        else fresh.push(...earned.filter((item) => !stored[source].includes(item.id)));
    }
    return { fresh, next: seeded ? next : null };
}

/** @param {object|null} seen Stored map. @param {object[]} items Achievements just shown. @returns {object} Map including them. */
export function acknowledgeAchievements(seen, items) {
    const next = seen && typeof seen === 'object' && !Array.isArray(seen) ? { ...seen } : {};
    for (const item of items) next[item.source] = [...new Set([...(next[item.source] || []), item.id])];
    return next;
}

/** @returns {Storage|undefined} localStorage when the browser allows it. */
export function browserStorage() {
    try { return typeof window === 'undefined' ? undefined : window.localStorage; } catch { return undefined; }
}

/** @param {Storage|undefined} storage @param {string} key @returns {any} Parsed value, or null when absent or unreadable. */
export function readPreference(storage, key) {
    try {
        const raw = storage?.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

/** @param {Storage|undefined} storage @param {string} key @param {any} value Stored as JSON; failures are ignored. */
export function writePreference(storage, key, value) {
    try { storage?.setItem(key, JSON.stringify(value)); } catch { /* private mode or blocked storage */ }
}
