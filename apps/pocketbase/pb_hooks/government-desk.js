// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/government-desk.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-TRUST-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001, VCC-BUILDANDDO-TRUST-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/pocketbase/pb_hooks/government-access.js, apps/pocketbase/pb_hooks/workspace-access.js, apps/pocketbase/pb_migrations/data/research-sprint.json, apps/pocketbase/pb_migrations/data/government-submissions.json
// EnumType:    Service
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/government-access.js; CONSUMES apps/pocketbase/pb_hooks/workspace-access.js; CONSUMES apps/pocketbase/pb_migrations/data/research-sprint.json; CONSUMES apps/pocketbase/pb_migrations/data/government-submissions.json
// Intent:      Disclose research plans and government learning only to paid approved members in their current workspace.
// ───────────────────────────────────────────────────────────────

const access = require(`${__hooks}/workspace-access.js`);
const membership = require(`${__hooks}/government-access.js`);

/** @param {object} e Native authenticated request. @returns {object} Protected learning and the owner-requested research plan. */
function read(e) {
    const scope = access.access(e);
    membership.requireMember(e.app, e.auth);
    const lessons = e.app.findRecordsByFilter('tutorials', 'category = {:category}', 'order,id', 101, 0, { category: 'Government submissions' });
    if (lessons.length > 100) throw new ApiError(503, 'The government catalogue needs an operator review.');
    const items = lessons.map((row) => {
        membership.lesson(e.app, e.auth, row);
        const result = { id: row.id };
        for (const field of ['title', 'summary', 'category', 'prerequisites', 'curriculum_key', 'curriculum_version']) result[field] = row.getString(field);
        result.effort_minutes = row.get('effort_minutes'); result.order = row.get('order'); result.lesson = access.publicLesson(access.json(row, 'lesson'));
        return result;
    });
    const dataDir = $filepath.join(__hooks, '..', 'pb_migrations', 'data');
    let plan, starter;
    try {
        plan = JSON.parse(toString($os.readFile($filepath.join(dataDir, 'research-sprint.json'))));
        starter = JSON.parse(toString($os.readFile($filepath.join(dataDir, 'government-submissions.json')))).mission;
    } catch { throw new ApiError(503, 'The government research plan is unavailable.'); }
    if (plan.schema_version !== 'buildanddo.research-sprint/v1' || !Array.isArray(plan.lanes) || !Array.isArray(plan.days) || !starter)
        throw new ApiError(503, 'The research plan needs an operator review.');
    return { ...scope, account_id: e.auth.id, government: membership.requireMember(e.app, e.auth), plan, lessons: items, starter };
}

module.exports = { read };
