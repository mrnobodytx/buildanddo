// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/web/src/lib/onboarding.js
// Stage:        07_BUILD
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-20
// Depends:      apps/pocketbase/pb_hooks/workspace-onboarding.js, apps/pocketbase/pb_migrations/data/starter-tutorials.json
// EnumType:     Adapter
// EnumEdges:    DEPENDS_ON apps/pocketbase/pb_hooks/workspace-onboarding.js; CONSUMES apps/pocketbase/pb_migrations/data/starter-tutorials.json
// DAG Node:     none
// Intent:       Recover complete onboarding receipts while discarding late responses from a previous account.
// ───────────────────────────────────────────────────────────────

/** Explicit choices for the existing workspace setup form. */
export const ONBOARDING_INTENTS = Object.freeze([
    { value: 'learn', label: 'Learn something' },
    { value: 'build', label: 'Build something' },
    { value: 'project', label: 'Complete a project' },
    { value: 'class', label: 'Join a class' },
    { value: 'challenge', label: 'Join a challenge' },
    { value: 'explore', label: 'Explore' },
]);

/** Recommend existing destinations from a readable, saved workspace objective.
 * @param {object|null} workspace Current workspace with its expanded objective.
 * @returns {object|null} Suggested steps, or null when the objective is unavailable.
 */
export function recommendedPath(workspace) {
    const intent = ONBOARDING_INTENTS.find((item) => item.value === workspace?.onboarding_intent);
    const goal = workspace?.expand?.onboarding_objective;
    if (!intent || !goal || goal.workspace !== workspace.id || goal.id !== workspace.onboarding_objective ||
        typeof goal.title !== 'string' || !goal.title.trim() || goal.title.length > 200 ||
        !/^[a-zA-Z0-9_-]{1,64}$/.test(goal.id)) return null;
    const lessons = {
        learn: ['welcome-to-buildanddo', 'Welcome to BuildAndDo'],
        build: ['measurable-objectives', 'Define a measurable business objective'],
        project: ['objectives-into-tasks', 'Break an objective into linked tasks'],
        class: ['welcome-to-buildanddo', 'Welcome to BuildAndDo'],
        challenge: ['proposing-and-approving-missions', 'Proposing and approving a mission'],
        explore: ['welcome-to-buildanddo', 'Welcome to BuildAndDo'],
    };
    const [slug, title] = lessons[intent.value];
    const next = intent.value === 'class' ? { to: '/app/classrooms', label: 'Choose a classroom' } :
        intent.value === 'explore' ? { to: '/app/tutorials', label: 'Explore the Field Manual' } :
            { to: '/app/missions', label: 'Draft a mission' };
    return { intent: intent.label, objective: goal.title, steps: [
        { to: `/app/tutorials?lesson=${slug}`, label: `First lesson: ${title}` },
        { to: `/app/erp?objective=${encodeURIComponent(goal.id)}`, label: 'Plan tasks for your objective' },
        next,
    ] };
}

/** Create or recover one account-bound setup using a server-derived retry identity.
 * @param {object} client Native PocketBase client.
 * @param {string} accountId Account that reviewed the form.
 * @param {{name: string, domain: string, intent?: string, objective?: string, business_context?: string}} input Reviewed workspace details.
 * @returns {Promise<object>} Confirmed receipt or recoverable failure.
 */
export async function createWorkspace(client, accountId, input) {
    if (!accountId || client.authStore.record?.id !== accountId) return { ok: false, error: 'Sign in before setting up a workspace.' };
    try {
        const result = await client.send('/api/buildanddo/onboarding', { method: 'POST', body: input, requestKey: null });
        if (client.authStore.record?.id !== accountId) return { ok: false, stale: true };
        if (!result?.workspace || result.owner !== accountId || !Array.isArray(result.services) || result.services.length !== 7)
            throw new Error('Incomplete setup receipt');
        if (input.intent && (result.intent !== input.intent || typeof result.objective !== 'string' ||
            !/^[a-zA-Z0-9_-]{1,64}$/.test(result.objective))) throw new Error('Incomplete objective receipt');
        return { ok: true, ...result };
    } catch (error) {
        if (client.authStore.record?.id !== accountId) return { ok: false, stale: true };
        return { ok: false, error: error?.response?.message || 'Could not confirm workspace setup. Retry these same details to recover it without creating a duplicate.' };
    }
}
