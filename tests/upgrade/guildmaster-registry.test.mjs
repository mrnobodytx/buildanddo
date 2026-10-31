// --- CGRF Header ------------------------------------------------
// File:        tests/upgrade/guildmaster-registry.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-GUILDMASTER-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-GUILDMASTER-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-31
// Depends:     tests/upgrade/admin-fixture.mjs, apps/pocketbase/pb_hooks/guildmasters.js, apps/pocketbase/pb_hooks/guildmasters.pb.js, apps/pocketbase/pb_migrations/1792200000_guildmaster_seat_display.js, libs/guildmasters/__init__.py
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/admin-fixture.mjs; VALIDATES apps/pocketbase/pb_hooks/guildmasters.js;
//              VALIDATES apps/pocketbase/pb_hooks/guildmasters.pb.js;
//              VALIDATES apps/pocketbase/pb_migrations/1792200000_guildmaster_seat_display.js;
//              VALIDATES libs/guildmasters/__init__.py
// DAG Node:    none
// Intent:      Prove every copy of the guildmaster roster agrees with the server registry, that only a stored, verified, flagged seat account is a guildmaster, and that a client cannot make itself one.
// ----------------------------------------------------------------
// The shared fixture executes the real hook and migration sources against storage doubles. It
// proves the decision logic, not native PocketBase behaviour; the native boundary is stated in
// docs/guildmasters.md. Seat ids outside the eight are invented (seat-alpha) or the long-standing
// non-guildmaster seat c-one; no machine name or address appears here.
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { fixture, plain, runPython, source } from './admin-fixture.mjs';
import { PERSONAS } from '../../apps/web/src/data/personas.js';

const LIB = 'apps/pocketbase/pb_hooks/guildmasters.js';
const HOOK = 'apps/pocketbase/pb_hooks/guildmasters.pb.js';
const DISPLAY = 'apps/pocketbase/pb_migrations/1792200000_guildmaster_seat_display.js';
const FIRST_SEATS = 'apps/pocketbase/pb_migrations/1789100000_ocn_seat_users.js';
const GUILD_SEATS = 'apps/pocketbase/pb_migrations/1789100002_ocn_seat_users_guildmasters.js';
const ROTA = ['forge', 'scholar', 'oracle', 'alex', 'sterling', 'muse', 'quill', 'director'];
const DOMAIN = '@ocn.buildanddo.invalid';
const missing = () => new Error('sql: no rows in result set');

/** A fixture whose request-hook registrations are captured, with the registry loaded through it. */
function registry() {
    const hooks = { create: [], update: [] };
    const f = fixture({ runtime: {
        onRecordCreateRequest: (handler, collection) => hooks.create.push({ handler, collection }),
        onRecordUpdateRequest: (handler, collection) => hooks.update.push({ handler, collection }),
    } });
    // PocketBase resolves seat accounts by email; the shared fixture has no auth lookup, so this
    // models the native one: case-insensitive, and "no rows" when absent.
    f.app.findAuthRecordByEmail = (collection, email) => {
        const row = (f.data[collection] || []).find((item) => String(item.email || '').toLowerCase() === String(email).toLowerCase());
        if (!row) throw missing();
        return f.app.findRecordById(collection, row.id);
    };
    return { f, gm: f.load('guildmasters.js'), hooks };
}

const seat = (id, local, values = {}) => ({ id, email: `${local}${DOMAIN}`, verified: true, ocn_seat: true, name: `OCN seat: ${local}`, ...values });
const roster = (gm) => plain(gm.GUILDMASTERS);

test('(a) the registry names eight unique guildmasters in rota order, with Director Nexus on seat director', () => {
    const { gm } = registry();
    assert.equal(gm.GUILDMASTERS.length, 8);
    assert.deepEqual(plain(gm.ORDER), ROTA);
    assert.deepEqual(roster(gm).map((item) => item.seat), ROTA);
    assert.equal(new Set(gm.GUILDMASTERS.map((item) => item.seat)).size, 8);
    assert.equal(new Set(gm.GUILDMASTERS.map((item) => item.slug)).size, 8);
    assert.equal(new Set(gm.GUILDMASTERS.map((item) => item.guild)).size, 8);
    const director = plain(gm.bySeat('director'));
    assert.deepEqual(director, { seat: 'director', slug: 'director-nexus', name: 'Director Nexus', guild: 'entertainment', aliases: ['director'] });
    for (const item of roster(gm)) {
        assert.deepEqual(Object.keys(item), ['seat', 'slug', 'name', 'guild', 'aliases']);
        assert.match(item.seat, /^[a-z0-9][a-z0-9-]{0,62}$/);
        if (item.seat !== 'director') assert.deepEqual(item.aliases, []);
    }
    assert.equal(gm.SEAT_DOMAIN, DOMAIN);
    // Frozen all the way down: a handler cannot edit the roster another handler then reads.
    assert.ok(Object.isFrozen(gm.GUILDMASTERS) && Object.isFrozen(gm.ORDER));
    assert.ok(gm.GUILDMASTERS.every((item) => Object.isFrozen(item) && Object.isFrozen(item.aliases)));
});

test('(b) the public personas carry the same slug, name, guild and aliases', () => {
    const { gm } = registry();
    const key = (items) => Object.fromEntries(items.map(({ slug, name, guild, aliases }) => [slug, plain({ slug, name, guild, aliases })]));
    assert.deepEqual(key(PERSONAS), key(gm.GUILDMASTERS));
});

test('(c) libs.guildmasters.as_json() is the server registry, entry for entry and in order', () => {
    const { gm } = registry();
    const mirrored = JSON.parse(runPython(['-c', 'import json; from libs.guildmasters import as_json; print(json.dumps(as_json()))']));
    assert.deepEqual(mirrored, roster(gm));
});

test('(c) the Python resolver agrees with the server resolver on every spelling', () => {
    const { gm } = registry();
    const spellings = ['forge', 'FORGE', 'gm:forge', 'gm-forge', 'gm_forge', 'gm-builder-forge', 'gm-ent-director', 'director',
        'director-nexus', 'Director Nexus', '  Director   Nexus ', 'gm-director-nexus', 'gm:Director Nexus', 'scholar', 'Oracle',
        'alex', 'Sterling', 'MUSE', 'quill', 'gm-writers-quill', 'nobody', '', 'gm-', 'gm', 'forger', 'forge-x', 'nexus', 'c-one',
        'seat-alpha', '---', 'gm-gm-forge'];
    const script = 'import json, sys\nfrom libs.guildmasters import resolve\n'
        + 'print(json.dumps([(resolve(v).seat if resolve(v) else None) for v in json.loads(sys.argv[1])]))';
    const python = JSON.parse(runPython(['-c', script, JSON.stringify(spellings)]));
    assert.deepEqual(python, spellings.map((value) => gm.resolve(value)?.seat ?? null));
});

test('(d) ocn_seat_session.GUILDMASTERS maps each guild to the same guildmaster name', () => {
    const { gm } = registry();
    const script = 'import importlib.util, json\n'
        + 'spec = importlib.util.spec_from_file_location("ocn_seat_session", "scripts/ci/ocn_seat_session.py")\n'
        + 'module = importlib.util.module_from_spec(spec)\nspec.loader.exec_module(module)\n'
        + 'print(json.dumps({guild: row["persona"] for guild, row in module.GUILDMASTERS.items()}))';
    const session = JSON.parse(runPython(['-c', script]));
    assert.deepEqual(session, Object.fromEntries(gm.GUILDMASTERS.map((item) => [item.guild, item.name])));
});

test('(e) every trade_assist producer and verifier names a canonical slug in its own guild', () => {
    const { gm } = registry();
    const script = 'import json\nfrom apps.trade_assist.roster import PRODUCERS, VERIFIERS\n'
        + 'print(json.dumps([[a.guildmaster, a.guild] for a in PRODUCERS + VERIFIERS]))';
    const pairs = JSON.parse(runPython(['-c', script]));
    assert.ok(pairs.length >= 8, 'the roster pairs were not read');
    for (const [slug, guild] of pairs) {
        assert.ok(gm.bySlug(slug), `${slug} is not a canonical persona slug`);
        assert.equal(gm.resolve(slug)?.guild, guild, `${slug} is bound to ${guild}`);
    }
});

/**
 * Run one migration's up step against a capturing app and report what it asked for and saved.
 * `present` decides whether a seat account already exists (and in what shape).
 */
function capture(path, present = () => null) {
    const asked = [], saved = [];
    class Record {
        constructor(_collection, values = {}) { this.data = { ...values }; }
        set(name, value) { this.data[name] = value; }
        get(name) { return this.data[name] ?? null; }
        getBool(name) { return this.data[name] === true; }
        getString(name) { return this.data[name] === undefined || this.data[name] === null ? '' : String(this.data[name]); }
    }
    const users = { name: 'users', fields: { getByName: (name) => (name === 'ocn_seat' ? { name } : null), add: () => {} } };
    const app = {
        findCollectionByNameOrId: () => users,
        findAuthRecordByEmail: (_collection, email) => {
            asked.push(email);
            const values = present(email);
            if (!values) throw missing();
            return new Record(users, values);
        },
        save: (record) => saved.push({ ...record.data }),
        delete: () => assert.fail('an up step deleted a record'),
    };
    let up;
    vm.runInNewContext(source(path), {
        migrate: (yes) => { up = yes; }, Record, Field: class { constructor(definition) { Object.assign(this, definition); } },
        $security: { randomString: (length) => 'x'.repeat(length) },
    });
    up(app);
    const local = (email) => { assert.ok(email.endsWith(DOMAIN), email); return email.slice(0, -DOMAIN.length); };
    return { seats: asked.map(local), saved };
}

test('(f) the seat migrations and the display snapshot list exactly the registry seats', () => {
    const { gm } = registry();
    const first = capture(FIRST_SEATS);
    assert.ok(first.seats.includes('forge'));
    assert.deepEqual(first.seats.filter((name) => gm.bySeat(name)), ['forge'], '1789100000 seats only forge among the guildmasters');
    const guild = capture(GUILD_SEATS);
    assert.deepEqual([...guild.seats].sort(), ROTA.filter((name) => name !== 'forge').sort());
    // Both seed the exact name the display migration renames from.
    for (const { saved } of [first, guild]) {
        for (const row of saved) assert.equal(row.name, `OCN seat: ${row.email.slice(0, -DOMAIN.length)}`);
    }
    // 1792200000's literal map, read by running it against accounts still carrying the seeded name.
    const display = capture(DISPLAY, (email) => seat('x', email.slice(0, -DOMAIN.length)));
    assert.deepEqual(display.seats, ROTA);
    assert.deepEqual(Object.fromEntries(display.saved.map((row) => [row.email.slice(0, -DOMAIN.length), row.name])),
        Object.fromEntries(gm.GUILDMASTERS.map((item) => [item.seat, item.name])));
});

test('(g) seatOf names the guildmaster only for a stored, verified, flagged seat account', () => {
    const { f, gm } = registry();
    f.seed('users', seat('gmforge', 'forge'));
    f.seed('users', { ...seat('gmdirector', 'director'), email: `DIRECTOR${DOMAIN.toUpperCase()}` });
    f.seed('users', seat('flagless', 'scholar', { ocn_seat: false }));
    f.seed('users', seat('unverified', 'oracle', { verified: false }));
    f.seed('users', seat('cone', 'c-one'));
    f.seed('users', seat('boxseat', 'seat-alpha', { name: 'Forge' }));
    f.seed('users', { id: 'foreign', email: 'forge@example.com', verified: true, ocn_seat: true, name: 'Forge' });
    f.seed('users', { id: 'human', email: 'person@example.com', verified: true, name: 'Forge' });
    f.seed('users', seat('subdomain', 'forge', { email: 'forge@ocn.buildanddo.invalid.example.com' }));
    f.seed('users', seat('padded', 'alex', { email: ` alex${DOMAIN} ` }));
    const auth = (id) => f.app.findRecordById('users', id);

    assert.equal(gm.seatOf(f.app, auth('gmforge'))?.slug, 'forge');
    assert.equal(gm.seatOf(f.app, auth('gmdirector'))?.slug, 'director-nexus', 'an uppercase email is normalised');
    assert.equal(gm.seatOf(f.app, auth('padded'))?.seat, 'alex', 'surrounding whitespace is trimmed');
    for (const id of ['flagless', 'unverified', 'cone', 'boxseat', 'foreign', 'human', 'subdomain', 'viewer', 'owner']) {
        assert.equal(gm.seatOf(f.app, auth(id)), null, `${id} is not a guildmaster`);
    }
    // A deleted account: the token still names it, the row is gone.
    assert.equal(gm.seatOf(f.app, f.record('users', seat('ghost', 'quill'))), null);
    // The decision re-reads the stored row: an auth object claiming a seat email and flag in memory
    // (a forged or stale token record) changes nothing.
    assert.equal(gm.seatOf(f.app, f.record('users', seat('human', 'forge'))), null);
    // Another collection's record with a guildmaster's id is not that guildmaster.
    assert.equal(gm.seatOf(f.app, { id: 'gmforge', collection: () => ({ name: '_superusers' }) }), null);
    // Anything missing or failing means "not a guildmaster".
    assert.equal(gm.seatOf(null, auth('gmforge')), null);
    assert.equal(gm.seatOf(f.app, null), null);
    assert.equal(gm.seatOf(f.app, { id: '' }), null);
    assert.equal(gm.seatOf({ findRecordById: () => { throw new Error('database is locked'); } }, auth('gmforge')), null);

    assert.equal(gm.isSeat(f.app, auth('gmforge'), 'gm:forge'), true);
    assert.equal(gm.isSeat(f.app, auth('gmforge'), 'Forge'), true);
    assert.equal(gm.isSeat(f.app, auth('gmdirector'), 'gm-ent-director'), true);
    assert.equal(gm.isSeat(f.app, auth('gmdirector'), 'Director Nexus'), true);
    assert.equal(gm.isSeat(f.app, auth('gmforge'), 'gm-scholar'), false, 'a guildmaster cannot claim another persona');
    assert.equal(gm.isSeat(f.app, auth('gmforge'), 'gm-nobody'), false);
    assert.equal(gm.isSeat(f.app, auth('human'), 'gm-forge'), false);
    assert.equal(gm.isSeat(f.app, auth('boxseat'), 'Forge'), false, 'a box seat renamed to a persona is not that persona');
    assert.equal(gm.isSeat(f.app, auth('human'), 'nobody'), false, 'null never equals null');
});

test('(h) resolve, lookups, personaId and seatEmail', () => {
    const { gm } = registry();
    const cases = {
        forge: 'forge', FORGE: 'forge', 'gm:forge': 'forge', 'gm-forge': 'forge', 'gm-builder-forge': 'forge',
        'gm-ent-director': 'director', director: 'director', 'director-nexus': 'director', 'Director Nexus': 'director',
        'gm-director-nexus': 'director', 'gm_scholar': 'scholar', 'gm-writers-quill': 'quill', Sterling: 'sterling',
        nobody: null, '': null, 'gm-': null, gm: null, forger: null, 'forge-x': null, nexus: null, 'c-one': null, '---': null,
    };
    for (const [value, expected] of Object.entries(cases)) assert.equal(gm.resolve(value)?.seat ?? null, expected, value);
    for (const value of [null, undefined, 42, {}, ['forge']]) assert.equal(gm.resolve(value), null);
    assert.equal(gm.resolve('gm:forge'), gm.bySeat('forge'), 'resolve returns the registry entry itself');

    assert.equal(gm.bySeat('Forge'), null, 'seat lookup is exact');
    assert.equal(gm.bySeat('director-nexus'), null);
    assert.equal(gm.bySlug('director'), null);
    assert.equal(gm.bySlug('director-nexus')?.seat, 'director');
    assert.equal(gm.bySeat(undefined), null);

    assert.equal(gm.personaId(gm.bySeat('forge')), 'gm-forge');
    assert.equal(gm.personaId(gm.bySeat('director')), 'gm-director-nexus');
    assert.equal(gm.personaId(null), '');
    assert.deepEqual(plain(gm.GUILDMASTERS.map((item) => gm.resolve(gm.personaId(item))?.seat)), ROTA);

    assert.equal(gm.seatEmail('forge'), `forge${DOMAIN}`);
    assert.equal(gm.seatEmail('director'), `director${DOMAIN}`);
    for (const value of ['c-one', 'Forge', 'director-nexus', '', null]) assert.equal(gm.seatEmail(value), null);
});

test('(h) the registry loads with no I/O, no environment and no box identity', () => {
    // Loaded in a bare context: a top-level require, $app, $os or process reference would throw.
    const module = { exports: {} };
    vm.runInNewContext(source(LIB), { module, require: () => assert.fail('guildmasters.js required a module at load') });
    assert.equal(module.exports.GUILDMASTERS.length, 8);
    const code = source(LIB).split(/\r?\n/).filter((line) => !line.trim().startsWith('//')).join('\n');
    assert.equal(/\$os\b|\$app\b|process\.|getenv|require\(|BUILDANDDO_/.test(code), false);
    for (const path of [LIB, HOOK, DISPLAY]) assert.equal(/BUILDANDDO_SEAT_PERSONAS|\$os\.getenv/.test(source(path)), false, path);
});

test('(i) a client cannot set or change ocn_seat; a superuser can; unchanged updates pass through', () => {
    const { f, hooks } = registry();
    f.load('guildmasters.pb.js');
    assert.equal(hooks.create.length, 1);
    assert.equal(hooks.update.length, 1);
    assert.equal(hooks.create[0].collection, 'users');
    assert.equal(hooks.update[0].collection, 'users');
    const create = hooks.create[0].handler, update = hooks.update[0].handler;
    const event = (record, superuser) => {
        const e = { record, passed: 0, next() { this.passed += 1; } };
        if (superuser !== undefined) e.hasSuperuserAuth = typeof superuser === 'function' ? superuser : () => superuser;
        return e;
    };
    const refused = (handler, e) => {
        assert.throws(() => handler(e), (error) => error.status === 403 && /set by the operator/.test(error.message));
        assert.equal(e.passed, 0, 'a refused request never reaches next()');
    };
    const passes = (handler, e) => { handler(e); assert.equal(e.passed, 1); };

    // Create.
    refused(create, event(f.record('users', { email: 'person@example.com', ocn_seat: true }), false));
    refused(create, event(f.record('users', seat('', 'forge')), undefined));
    refused(create, event(f.record('users', seat('', 'forge')), () => { throw new Error('no request auth'); }));
    passes(create, event(f.record('users', { email: 'person@example.com' }), false));
    passes(create, event(f.record('users', { email: 'person@example.com', ocn_seat: false }), false));
    passes(create, event(f.record('users', seat('', 'forge')), true));

    // Update: the record carries its stored state as original().
    const changed = (values, mutate) => { const record = f.record('users', values); mutate(record); return record; };
    refused(update, event(changed({ id: 'human', email: 'person@example.com', ocn_seat: false }, (r) => r.set('ocn_seat', true)), false));
    refused(update, event(changed(seat('gmforge', 'forge'), (r) => r.set('ocn_seat', false)), false));
    refused(update, event(changed(seat('cone', 'c-one'), (r) => r.set('email', `forge${DOMAIN}`)), false));
    passes(update, event(changed(seat('gmforge', 'forge'), (r) => r.set('name', 'Forge')), false));
    passes(update, event(changed({ id: 'human', email: 'person@example.com' }, (r) => r.set('name', 'Ada')), false));
    passes(update, event(changed({ id: 'human', email: 'person@example.com' }, (r) => r.set('email', 'ada@example.com')), false));
    passes(update, event(changed({ id: 'human', email: 'person@example.com', ocn_seat: false }, (r) => r.set('ocn_seat', true)), true));
    passes(update, event(changed(seat('gmforge', 'forge'), (r) => r.set('email', `forge-retired${DOMAIN}`)), true));
});

test('(j) the display migration renames only untouched persona seats, keeps operator names, and is idempotent', () => {
    const { f } = registry();
    for (const name of ['forge', 'scholar', 'oracle', 'director']) f.seed('users', seat(`gm${name}`, name));
    f.seed('users', seat('gmquill', 'quill', { name: 'Quill (operator)' }));
    f.seed('users', seat('gmmuse', 'muse', { verified: false }));
    f.seed('users', { id: 'reserved', email: `sterling${DOMAIN}`, verified: true, ocn_seat: false, name: 'OCN seat: sterling' });
    f.seed('users', seat('boxseat', 'seat-alpha'));
    f.seed('users', { id: 'human', email: 'person@example.com', verified: true, name: 'Forge' });
    // alex is absent: a deployment without that seat is not an error.
    const names = () => Object.fromEntries(f.data.users.filter((row) => row.email).map((row) => [row.id, row.name]));
    const untouched = { gmquill: 'Quill (operator)', gmmuse: 'OCN seat: muse', reserved: 'OCN seat: sterling',
        boxseat: 'OCN seat: seat-alpha', human: 'Forge' };
    const display = f.migration(DISPLAY);

    display.up();
    assert.deepEqual(names(), { gmforge: 'Forge', gmscholar: 'Scholar', gmoracle: 'Oracle', gmdirector: 'Director Nexus', ...untouched });
    const after = plain(f.data.users);
    display.up();
    assert.deepEqual(plain(f.data.users), after, 'a second run writes nothing');

    // An operator renames forge after the migration; down must keep that choice.
    const forge = f.app.findRecordById('users', 'gmforge');
    forge.set('name', 'Forge Prime');
    f.app.save(forge);
    display.down();
    assert.deepEqual(names(), { gmforge: 'Forge Prime', gmscholar: 'OCN seat: scholar', gmoracle: 'OCN seat: oracle',
        gmdirector: 'OCN seat: director', ...untouched });
    const reverted = plain(f.data.users);
    display.down();
    assert.deepEqual(plain(f.data.users), reverted, 'a second rollback writes nothing');
});
