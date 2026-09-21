/// <reference path="../pb_data/types.d.ts" />
// ─── CGRF Header ─────────────────────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1791200000_deepen_operations_and_workflows.js
// Stage:       06_IMPLEMENT
// SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
// CAPS:        B
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-21
// Depends:     pb_migrations/data/starter-tutorials.json
// EnumType:    Migration
// EnumEdges:   RAISES the Operations and Missions-and-workflows paths above the depth floor
// Intent:      Re-seed ten lessons whose worked examples now use real incidents from this estate -
//              a migration that took a service down, an authorisation rule that could never match,
//              a retry that reused a key - because an example with invented numbers teaches the
//              shape and not the habit.
// ─────────────────────────────────────────────────────────────────────────────
migrate((app) => {
    const SLUGS = ['connecting-services', 'measurable-objectives', 'objectives-into-tasks',
                   'priorities-and-dates', 'contact-hygiene', 'risk-and-rollback',
                   'designing-tevv', 'owasp-in-workspace-flows',
                   'workflow-approval-checkpoints', 'failed-runs-and-retries'];
    let curriculum;
    try {
        const dataDir = $filepath.join(__hooks, '..', 'pb_migrations', 'data');
        curriculum = JSON.parse(toString($os.readFile($filepath.join(dataDir, 'starter-tutorials.json'))));
    } catch (err) {
        console.log('[1791200000] curriculum unreadable, skipping: ' + err);
        return;
    }

    const byslug = {};
    for (const lesson of (curriculum.lessons || [])) byslug[lesson.slug] = lesson;

    let updated = 0;
    let skipped = 0;
    for (const slug of SLUGS) {
        const seed = byslug[slug];
        if (!seed) { console.log('[1791200000] ' + slug + ' absent from the data file'); continue; }

        // REFUSE TO RE-SEED A STUB. If the data file has not been deepened, writing it back would
        // overwrite the live lesson with a shallower one and report success.
        const sections = (seed.lesson || {}).sections || [];
        if (!sections.some((s) => String(s.heading || '').indexOf('goes wrong') >= 0)) {
            console.log('[1791200000] ' + slug + ' has no failure case in the data file - skipping');
            skipped += 1;
            continue;
        }

        let found;
        try {
            found = app.findRecordsByFilter('tutorials', 'slug = {:slug}', '', 2, 0, { slug: slug });
        } catch (err) {
            console.log('[1791200000] tutorials not queryable: ' + err);
            return;
        }
        if (!found || !found.length) { console.log('[1791200000] no live record for ' + slug); continue; }
        for (const record of found) {
            record.set('lesson', seed.lesson);
            app.save(record);
            updated += 1;
        }
    }
    console.log('[1791200000] deepened ' + updated + ' lesson record(s), skipped ' + skipped);
}, (app) => {
    // Down is a no-op: restoring a stub is not a repair.
});
