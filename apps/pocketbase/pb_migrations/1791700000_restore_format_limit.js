/// <reference path="../pb_data/types.d.ts" />
// ─── CGRF Header ─────────────────────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1791700000_restore_format_limit.js
// Stage:       06_IMPLEMENT
// SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
// CAPS:        B
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-21
// Depends:     pb_migrations/data/government-submissions.json
// EnumType:    Migration
// EnumEdges:   RESTORES a concrete format limit dropped when the worked example was rewritten
// Intent:      read-the-government-opportunity lost the paragraph naming a deck of up to 15 slides
//              OR a paper of up to 10 pages, with its caveat that those are owner-supplied planning
//              numbers rather than a universal rule. A format limit is the constraint that silently
//              disqualifies, so it is carried back into the live record.
// ─────────────────────────────────────────────────────────────────────────────
migrate((app) => {
    const SLUG = 'read-the-government-opportunity';
    // The marker IS the restored content, so a box still holding the pre-restore data file is
    // skipped rather than re-seeded with the version missing the paragraph.
    const MARKER = '15 slides';

    let curriculum;
    try {
        const dataDir = $filepath.join(__hooks, '..', 'pb_migrations', 'data');
        curriculum = JSON.parse(toString($os.readFile($filepath.join(dataDir, 'government-submissions.json'))));
    } catch (err) {
        console.log('[1791700000] curriculum unreadable, skipping: ' + err);
        return;
    }

    const seed = (curriculum.lessons || []).filter(function (lesson) { return lesson.slug === SLUG; })[0];
    if (!seed) { console.log('[1791700000] ' + SLUG + ' absent from the data file'); return; }
    if (JSON.stringify(seed.lesson || {}).indexOf(MARKER) < 0) {
        console.log('[1791700000] data file is pre-restore - skipping');
        return;
    }

    let found;
    try {
        found = app.findRecordsByFilter('tutorials', 'slug = {:slug}', '', 2, 0, { slug: SLUG });
    } catch (err) {
        console.log('[1791700000] tutorials not queryable: ' + err);
        return;
    }
    if (!found || !found.length) { console.log('[1791700000] no live record for ' + SLUG); return; }

    let updated = 0;
    for (const record of found) {
        record.set('lesson', seed.lesson);
        app.save(record);
        updated += 1;
    }
    console.log('[1791700000] restored the format limit on ' + updated + ' record(s)');
}, (app) => {
    // Down is a no-op: dropping a format limit again is the defect, not a rollback.
});
