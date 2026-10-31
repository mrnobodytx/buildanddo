// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/lesson-keys.pb.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-CURRICULUM-PRIVATE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-CURRICULUM-PRIVATE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-31
// Depends:     apps/pocketbase/pb_hooks/lesson-keys.js
// EnumType:    Route
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/lesson-keys.js; PRODUCES /api/buildanddo/learning/keys-health;
//              PRODUCES pocketbase lesson-keys check; VERIFIED_BY tests/upgrade/lesson-keys.test.mjs
// DAG Node:    none
// Intent:      Let an operator confirm the lesson key file is installed and agrees with the stored lessons,
//              from counts and states only, without changing anything.
// ───────────────────────────────────────────────────────────────

// Public and uncached: the key state and lesson counts, never a key, an explanation, a hash or a path.
// Handlers run in a pooled VM and share nothing at top level, so the handler requires its module.
routerAdd('GET', '/api/buildanddo/learning/keys-health', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/lesson-keys.js`).health(e.app));
});

// `pocketbase lesson-keys check [file]` reads the key file (the named one, else the configured one)
// and the stored lessons, prints one JSON line of counts and exits 1 when grading would fail.
// It never writes. Run it as the service user against a rehearsal copy of the data directory.
// Command callbacks recover panics, so a failure exits explicitly, as custom-migrations-cmd.pb.js does.
(() => {
    const lessonKeysCommand = new Command({
        use: 'lesson-keys',
        short: 'Inspect the private lesson grading keys without changing anything',
    });
    lessonKeysCommand.addCommand(new Command({
        use: 'check [file]',
        short: 'Report, as counts only, whether the lesson key file and the stored lessons agree',
        run: (_cmd, args) => {
            let ok = false;
            try {
                if (args.length > 1) throw new Error('usage');
                const report = require(`${__hooks}/lesson-keys.js`).check($app, args.length ? String(args[0]) : '');
                console.log(JSON.stringify(report.body));
                ok = report.ok === true;
            } catch (error) {
                // Never echo an unexpected message: it could carry text from the key file.
                console.error(String(error && error.message) === 'usage'
                    ? 'Usage: pocketbase lesson-keys check [file]'
                    : 'lesson-keys check could not finish; nothing was changed.');
            }
            if (!ok) $os.exit(1);
        },
    }));
    $app.rootCmd.addCommand(lessonKeysCommand);
})();
