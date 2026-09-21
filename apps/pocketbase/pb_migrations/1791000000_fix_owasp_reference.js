/// <reference path="../pb_data/types.d.ts" />
// ─── CGRF Header ─────────────────────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1791000000_fix_owasp_reference.js
// Stage:       09_VERIFY
// SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
// CAPS:        B
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-20
// Depends:     pb_migrations/data/starter-tutorials.json
// EnumType:    Migration
// EnumEdges:   REPAIRS the one dead reference the OCN content assessment found
// Intent:      Repoint owasp-in-workspace-flows at the ASVS URL that answers, measured 200 from a
//              fleet box, replacing one that answers 404 - the single structural defect in 33
//              lessons. Re-seeds that lesson from the corrected data file rather than editing the
//              stored JSON in place, so the file on disk stays the single source of the content.
// ─────────────────────────────────────────────────────────────────────────────
migrate((app) => {
    const SLUG = 'owasp-in-workspace-flows';
    let curriculum;
    try {
        // 0.39.8 binds no __migrations, so the fixture directory is resolved beside
        // __hooks. Its NAME differs between the deployed layout (pb_migrations) and
        // an isolated test fixture (migrations), so try both instead of hardcoding
        // one and failing wherever the other is used.
        const readData = (fixture) => {
            for (const dir of ['pb_migrations', 'migrations']) {
                try { return toString($os.readFile($filepath.join(__hooks, '..', dir, 'data', fixture))); }
                catch (_) { /* try the next layout */ }
            }
            throw new Error('Starter data not found beside the hooks directory: ' + fixture);
        };
        curriculum = JSON.parse(readData('starter-tutorials.json'));
    } catch (err) {
        // A missing or unreadable data file must not take the whole service down on boot.
        console.log('[1791000000] curriculum unreadable, skipping: ' + err);
        return;
    }

    const seed = (curriculum.lessons || []).filter((l) => l.slug === SLUG)[0];
    if (!seed) { console.log('[1791000000] ' + SLUG + ' not in the data file, skipping'); return; }

    // Refuse to run if the corrected URL is not actually the one in the file - otherwise this
    // migration would silently re-seed whatever happens to be there and still report success.
    if (JSON.stringify(seed.lesson).indexOf('owasp.org/ASVS/') < 0) {
        console.log('[1791000000] data file does not carry the corrected URL, skipping');
        return;
    }

    let found;
    try {
        found = app.findRecordsByFilter('tutorials', 'slug = {:slug}', '', 2, 0, { slug: SLUG });
    } catch (err) {
        console.log('[1791000000] tutorials not queryable, skipping: ' + err);
        return;
    }
    if (!found || !found.length) { console.log('[1791000000] no live ' + SLUG + ' record'); return; }

    for (const record of found) {
        record.set('lesson', seed.lesson);
        app.save(record);
    }
    console.log('[1791000000] repointed ' + found.length + ' record(s) to owasp.org/ASVS/');
}, (app) => {
    // Down is a no-op on purpose: restoring a reference that answers 404 is not a repair.
});
