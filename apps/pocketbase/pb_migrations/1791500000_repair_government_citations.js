/// <reference path="../pb_data/types.d.ts" />
// ─── CGRF Header ─────────────────────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1791500000_repair_government_citations.js
// Stage:       06_IMPLEMENT
// SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
// CAPS:        B
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-21
// Depends:     pb_migrations/data/government-submissions.json
// EnumType:    Migration
// EnumEdges:   REPAIRS a citation that pointed readers at a 404
// Intent:      Every government lesson told the reader to read the chapter at a DIRECTORY path,
//              which returns 404 - measured, alongside each real chapter URL returning 200. Three
//              of the eight also claimed retrieved Texas statute while citing no section at all.
//              This re-seeds them with the chapter URLs they actually rest on, and gives the other
//              three a note that claims only what is true of them.
// ─────────────────────────────────────────────────────────────────────────────
migrate((app) => {
    const SLUGS = ['read-the-government-opportunity', 'government-eligibility-and-authority',
                   'government-capability-evidence', 'write-the-government-solution-brief',
                   'government-costs-data-and-ip', 'government-security-and-cui-boundaries',
                   'government-demo-and-readiness-evidence',
                   'government-submission-receipts-and-transition'];
    // The exact sentence that sent readers to a 404. A data file still carrying it is the OLD one.
    const DEAD = 'htm/ - this lesson is research';
    const REPAIRED = 'legal-research pipeline';

    let curriculum;
    try {
        const dataDir = $filepath.join(__hooks, '..', 'pb_migrations', 'data');
        curriculum = JSON.parse(toString($os.readFile($filepath.join(dataDir, 'government-submissions.json'))));
    } catch (err) {
        console.log('[1791500000] curriculum unreadable, skipping: ' + err);
        return;
    }

    const byslug = {};
    for (const lesson of (curriculum.lessons || [])) byslug[lesson.slug] = lesson;

    let updated = 0;
    let skipped = 0;
    for (const slug of SLUGS) {
        const seed = byslug[slug];
        if (!seed) { console.log('[1791500000] ' + slug + ' absent from the data file'); continue; }

        // REFUSE TO WRITE THE OLD TEXT BACK. If the data file on this box is the pre-repair one,
        // applying it would reinstate the dead citation and the migration would be recorded as
        // done - so the repair could never be applied again.
        const body = JSON.stringify(seed.lesson || {});
        if (body.indexOf(DEAD) >= 0 || body.indexOf(REPAIRED) < 0) {
            console.log('[1791500000] ' + slug + ' data file is pre-repair - skipping');
            skipped += 1;
            continue;
        }

        let found;
        try {
            found = app.findRecordsByFilter('tutorials', 'slug = {:slug}', '', 2, 0, { slug: slug });
        } catch (err) {
            console.log('[1791500000] tutorials not queryable: ' + err);
            return;
        }
        if (!found || !found.length) { console.log('[1791500000] no live record for ' + slug); continue; }
        for (const record of found) {
            record.set('lesson', seed.lesson);
            app.save(record);
            updated += 1;
        }
    }
    console.log('[1791500000] repaired ' + updated + ' lesson record(s), skipped ' + skipped);
}, (app) => {
    // Down is a no-op: restoring a citation that 404s is not a repair.
});
