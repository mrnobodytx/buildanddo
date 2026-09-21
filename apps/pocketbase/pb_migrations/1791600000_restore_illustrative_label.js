/// <reference path="../pb_data/types.d.ts" />
// ─── CGRF Header ─────────────────────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1791600000_restore_illustrative_label.js
// Stage:       06_IMPLEMENT
// SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
// CAPS:        B
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-21
// Depends:     pb_migrations/data/starter-tutorials.json
// EnumType:    Migration
// EnumEdges:   RESTORES a reader-facing honesty label dropped while deepening the curriculum
// Intent:      The worked-example heading read "Worked example - illustrative data". Shortening it
//              to "Worked example" while making headings consistent removed the guarantee that the
//              figures shown are not the reader's own workspace data. The label is restored on all
//              25 starter lessons; the deepened prose is unchanged.
// ─────────────────────────────────────────────────────────────────────────────
migrate((app) => {
    // Only the heading moves. Re-seeding whole bodies here would silently revert any later
    // curriculum edit that has not reached this box, so this migration touches one field of one
    // section and leaves everything else exactly as the records already hold it.
    const OLD = 'Worked example';
    const NEW = 'Worked example — illustrative data';

    // MEASURED: a filter of 'id != ""' returned nothing here and the migration reported a clean
    // "relabelled 0" while 25 records needed the change - a silent no-op that only the printed
    // count exposed. Every migration in this tree looks records up by slug, so this does too, and
    // it takes the slug list from the data file rather than inventing a match-all filter.
    let curriculum;
    try {
        const dataDir = $filepath.join(__hooks, '..', 'pb_migrations', 'data');
        curriculum = JSON.parse(toString($os.readFile($filepath.join(dataDir, 'starter-tutorials.json'))));
    } catch (err) {
        console.log('[1791600000] curriculum unreadable, skipping: ' + err);
        return;
    }

    let updated = 0;
    let already = 0;
    let absent = 0;
    for (const seed of (curriculum.lessons || [])) {
        let found;
        try {
            found = app.findRecordsByFilter('tutorials', 'slug = {:slug}', '', 2, 0, { slug: seed.slug });
        } catch (err) {
            console.log('[1791600000] tutorials not queryable: ' + err);
            return;
        }
        if (!found || !found.length) { absent += 1; continue; }
        for (const record of found) {
            // MEASURED: record.get() on a JSON field does NOT return a JS object here. It
            // returns the raw JSON type, whose typeof is 'object', so a naive truthiness check
            // passes and then finds no .sections - this migration reported "relabelled 0" twice
            // before the probe showed every lesson hitting that branch. Route it through
            // toString() and parse, and only trust an object that already carries sections.
            const raw = record.get('lesson');
            let lesson = (raw && typeof raw === 'object' && raw.sections) ? raw : null;
            if (!lesson) {
                try { lesson = JSON.parse(toString(raw)); } catch (err) { lesson = null; }
            }
            if (!lesson || !lesson.sections) continue;

            let touched = false;
            for (const section of lesson.sections) {
                const heading = String(section.heading || '');
                if (heading.indexOf('illustrative') >= 0) { already += 1; continue; }
                if (heading === OLD) { section.heading = NEW; touched = true; }
            }
            if (!touched) continue;
            record.set('lesson', lesson);
            app.save(record);
            updated += 1;
        }
    }
    console.log('[1791600000] relabelled ' + updated + ' lesson(s), ' + already
                + ' already correct, ' + absent + ' absent');
}, (app) => {
    // Down is a no-op: dropping the label again is the defect, not a rollback.
});
