/// <reference path="../pb_data/types.d.ts" />
// ─── CGRF Header ─────────────────────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1791300000_deepen_content_and_practice.js
// Stage:       06_IMPLEMENT
// SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
// CAPS:        B
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-21
// Depends:     pb_migrations/data/starter-tutorials.json
// EnumType:    Migration
// EnumEdges:   RAISES Content production and Practice & improvement above the depth floor
// Intent:      Re-seed the ten lessons where a stub was most self-defeating - a lesson on writing
//              a brief that was itself 271 words had already argued against its own thesis.
// ─────────────────────────────────────────────────────────────────────────────
migrate((app) => {
    const SLUGS = ['audience-and-content-brief', 'blog-from-brief', 'teach-with-a-tutorial',
                   'adapt-for-social', 'editorial-review', 'publication-receipts',
                   'weekly-operations-review', 'accessible-content-checks',
                   'evaluate-content-outcomes', 'release-with-evidence'];
    let curriculum;
    try {
        const dataDir = $filepath.join(__hooks, '..', 'pb_migrations', 'data');
        curriculum = JSON.parse(toString($os.readFile($filepath.join(dataDir, 'starter-tutorials.json'))));
    } catch (err) {
        console.log('[1791300000] curriculum unreadable, skipping: ' + err);
        return;
    }

    const byslug = {};
    for (const lesson of (curriculum.lessons || [])) byslug[lesson.slug] = lesson;

    let updated = 0;
    let skipped = 0;
    for (const slug of SLUGS) {
        const seed = byslug[slug];
        if (!seed) { console.log('[1791300000] ' + slug + ' absent from the data file'); continue; }

        // REFUSE TO RE-SEED A STUB: writing a shallower lesson back over a live one and reporting
        // success is worse than not running at all.
        const sections = (seed.lesson || {}).sections || [];
        if (!sections.some((s) => String(s.heading || '').indexOf('goes wrong') >= 0)) {
            console.log('[1791300000] ' + slug + ' has no failure case in the data file - skipping');
            skipped += 1;
            continue;
        }

        let found;
        try {
            found = app.findRecordsByFilter('tutorials', 'slug = {:slug}', '', 2, 0, { slug: slug });
        } catch (err) {
            console.log('[1791300000] tutorials not queryable: ' + err);
            return;
        }
        if (!found || !found.length) { console.log('[1791300000] no live record for ' + slug); continue; }
        for (const record of found) {
            record.set('lesson', seed.lesson);
            app.save(record);
            updated += 1;
        }
    }
    console.log('[1791300000] deepened ' + updated + ' lesson record(s), skipped ' + skipped);
}, (app) => {
    // Down is a no-op: restoring a stub is not a repair.
});
