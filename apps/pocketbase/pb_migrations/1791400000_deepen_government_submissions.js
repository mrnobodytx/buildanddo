/// <reference path="../pb_data/types.d.ts" />
// ─── CGRF Header ─────────────────────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1791400000_deepen_government_submissions.js
// Stage:       06_IMPLEMENT
// SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
// CAPS:        B
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-21
// Depends:     pb_migrations/data/government-submissions.json
// EnumType:    Migration
// EnumEdges:   RAISES the government-submissions path above the depth floor, on primary sources
// Intent:      Re-seed the last eight lessons. Their worked examples are built on Texas Government
//              Code text retrieved through the CNWB legal-research pipeline with URLs and UTC
//              stamps, rather than on plausible-sounding procurement invented for the purpose.
// ─────────────────────────────────────────────────────────────────────────────
migrate((app) => {
    const SLUGS = ['read-the-government-opportunity', 'government-eligibility-and-authority',
                   'government-capability-evidence', 'write-the-government-solution-brief',
                   'government-costs-data-and-ip', 'government-security-and-cui-boundaries',
                   'government-demo-and-readiness-evidence',
                   'government-submission-receipts-and-transition'];
    let curriculum;
    try {
        const dataDir = $filepath.join(__hooks, '..', 'pb_migrations', 'data');
        curriculum = JSON.parse(toString($os.readFile($filepath.join(dataDir, 'government-submissions.json'))));
    } catch (err) {
        console.log('[1791400000] curriculum unreadable, skipping: ' + err);
        return;
    }

    const byslug = {};
    for (const lesson of (curriculum.lessons || [])) byslug[lesson.slug] = lesson;

    let updated = 0;
    let skipped = 0;
    for (const slug of SLUGS) {
        const seed = byslug[slug];
        if (!seed) { console.log('[1791400000] ' + slug + ' absent from the data file'); continue; }

        // REFUSE TO RE-SEED A STUB. These lessons keep their own headings, so the failure case is
        // the only reliable marker that the data file carries the deepened version.
        const sections = (seed.lesson || {}).sections || [];
        if (!sections.some((s) => String(s.heading || '').indexOf('goes wrong') >= 0)) {
            console.log('[1791400000] ' + slug + ' has no failure case in the data file - skipping');
            skipped += 1;
            continue;
        }

        let found;
        try {
            found = app.findRecordsByFilter('tutorials', 'slug = {:slug}', '', 2, 0, { slug: slug });
        } catch (err) {
            console.log('[1791400000] tutorials not queryable: ' + err);
            return;
        }
        if (!found || !found.length) { console.log('[1791400000] no live record for ' + slug); continue; }
        for (const record of found) {
            record.set('lesson', seed.lesson);
            app.save(record);
            updated += 1;
        }
    }
    console.log('[1791400000] deepened ' + updated + ' lesson record(s), skipped ' + skipped);
}, (app) => {
    // Down is a no-op: restoring a stub is not a repair.
});
