/// <reference path="../pb_data/types.d.ts" />
// ─── CGRF Header ─────────────────────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1791100000_deepen_foundations.js
// Stage:       06_IMPLEMENT
// SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
// CAPS:        B
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-21
// Depends:     pb_migrations/data/starter-tutorials.json
// EnumType:    Migration
// EnumEdges:   RAISES the five first-path lessons from stubs to lessons that teach
// Intent:      Re-seed the five lessons a new reader meets first, each now carrying a worked
//              example that is actually worked and a failure case showing what going wrong looks
//              like - the two things every lesson in this curriculum was missing.
// ─────────────────────────────────────────────────────────────────────────────
migrate((app) => {
    // The five first-path lessons. Named explicitly rather than re-seeding everything, so this
    // migration cannot quietly revert curriculum somebody else has edited.
    const SLUGS = ['welcome-to-buildanddo', 'domain-selection-and-authority', 'reading-signals',
                   'proposing-and-approving-missions', 'inspecting-evidence'];
    let curriculum;
    try {
        const dataDir = $filepath.join(__hooks, '..', 'pb_migrations', 'data');
        curriculum = JSON.parse(toString($os.readFile($filepath.join(dataDir, 'starter-tutorials.json'))));
    } catch (err) {
        // An unreadable data file must not take the service down at boot.
        console.log('[1791100000] curriculum unreadable, skipping: ' + err);
        return;
    }

    const byslug = {};
    for (const lesson of (curriculum.lessons || [])) byslug[lesson.slug] = lesson;

    let updated = 0;
    for (const slug of SLUGS) {
        const seed = byslug[slug];
        if (!seed) { console.log('[1791100000] ' + slug + ' absent from the data file'); continue; }

        // REFUSE TO RUN ON A SHALLOW FILE. If the data file has not actually been deepened this
        // would re-seed the stub and report success, which is worse than not running at all.
        const sections = (seed.lesson || {}).sections || [];
        const hasFailureCase = sections.some((s) => String(s.heading || '').indexOf('goes wrong') >= 0);
        if (!hasFailureCase) {
            console.log('[1791100000] ' + slug + ' has no failure case in the data file - skipping');
            continue;
        }

        let found;
        try {
            found = app.findRecordsByFilter('tutorials', 'slug = {:slug}', '', 2, 0, { slug: slug });
        } catch (err) {
            console.log('[1791100000] tutorials not queryable: ' + err);
            return;
        }
        if (!found || !found.length) { console.log('[1791100000] no live record for ' + slug); continue; }
        for (const record of found) {
            record.set('lesson', seed.lesson);
            app.save(record);
            updated += 1;
        }
    }
    console.log('[1791100000] deepened ' + updated + ' lesson record(s)');
}, (app) => {
    // Down is a no-op: restoring a stub is not a repair.
});
