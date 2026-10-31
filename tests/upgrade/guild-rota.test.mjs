// --- CGRF Header ------------------------------------------------
// File:        tests/upgrade/guild-rota.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-GUILDMASTER-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-GUILDMASTER-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-31
// Depends:     tests/upgrade/admin-fixture.mjs, apps/pocketbase/pb_hooks/guild-rota.js, apps/pocketbase/pb_hooks/guildmasters.js, libs/guildmasters/rota.py
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/admin-fixture.mjs; VALIDATES apps/pocketbase/pb_hooks/guild-rota.js; VALIDATES libs/guildmasters/rota.py
// Intent:      Prove every week of the guild class rota is a fair permutation and that the server and Python rotas agree on every field.
// ----------------------------------------------------------------

import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, plain, runPython, source } from './admin-fixture.mjs';

const ORDER = ['forge', 'scholar', 'oracle', 'alex', 'sterling', 'muse', 'quill', 'director'];
const DAY = 86400000;
const WEEK = 7 * DAY;
const EPOCH = Date.UTC(2026, 10, 2);
const BEFORE = 20, AFTER = 156;
const mondays = Array.from({ length: BEFORE + AFTER }, (_value, i) => EPOCH + (i - BEFORE) * WEEK);
const rota = fixture().load('guild-rota.js');
const python = (script, ...args) => JSON.parse(runPython(['-c', script, ...args]));
// The module runs in its own VM, so its TypeError is not this realm's: match by name and message.
const refused = (pattern) => (error) => error.name === 'TypeError' && pattern.test(error.message);

test('every week has eight classes whose hosts and auditors are permutations, never the same, with the other seven attending', () => {
    for (const monday of mondays) {
        const plan = plain(rota.week(new Date(monday + 3 * DAY + 5 * 3600000)));
        assert.equal(plan.index, Math.round((monday - EPOCH) / WEEK));
        assert.equal(plan.starts_at, new Date(monday).toISOString());
        assert.equal(plan.classes.length, 8, plan.week);
        assert.deepEqual(plan.classes.map((item) => item.slot), [0, 1, 2, 3, 4, 5, 6, 7]);
        assert.deepEqual(plan.classes.map((item) => item.host).sort(), [...ORDER].sort(), `${plan.week} hosts`);
        assert.deepEqual(plan.classes.map((item) => item.auditor).sort(), [...ORDER].sort(), `${plan.week} auditors`);
        let previous = -Infinity;
        for (const item of plan.classes) {
            assert.notEqual(item.auditor, item.host, plan.week);
            assert.deepEqual([...item.attendees].sort(), ORDER.filter((seat) => seat !== item.host).sort());
            assert.ok(item.attendees.includes(item.auditor));
            // Listed from the guildmaster after the host, wrapping round the rota order.
            assert.equal(item.attendees[0], ORDER[(ORDER.indexOf(item.host) + 1) % 8]);
            const starts = Date.parse(item.starts_at);
            assert.ok(starts > previous && starts >= monday && starts < monday + 4 * DAY, plan.week);
            assert.equal(item.starts_at, new Date(starts).toISOString());
            previous = starts;
        }
    }
    // Week 0 is the published opening week: Forge first, each next guildmaster auditing.
    const opening = plain(rota.week(new Date(EPOCH)));
    assert.deepEqual([opening.week, opening.index], ['2026-W45', 0]);
    assert.deepEqual(opening.classes.map((item) => [item.host, item.auditor, item.starts_at]).slice(0, 2), [
        ['forge', 'scholar', '2026-11-02T15:00:00.000Z'], ['scholar', 'oracle', '2026-11-02T18:00:00.000Z']]);
    assert.deepEqual(opening.classes[7], { slot: 7, host: 'director', persona: 'director-nexus', name: 'Director Nexus', guild: 'entertainment',
        auditor: 'forge', auditor_persona: 'forge', attendees: ORDER.slice(0, 7), starts_at: '2026-11-05T18:00:00.000Z' });
    // The pairings change week by week: over any seven weeks each host is audited by all seven others.
    for (const start of [0, BEFORE, BEFORE + 100])
        for (const host of ORDER) {
            const auditors = mondays.slice(start, start + 7).map((monday) => plain(rota.week(monday)).classes.find((item) => item.host === host).auditor);
            assert.deepEqual([...auditors].sort(), ORDER.filter((seat) => seat !== host).sort(), host);
        }
});

test('the server rota and libs.guildmasters.rota agree on every field for 176 weeks, and ISO labels match Python isocalendar', () => {
    const script = [
        'import json, sys',
        'from datetime import datetime, timezone',
        'from libs.guildmasters import rota',
        'mondays = [datetime.fromtimestamp(ms / 1000, tz=timezone.utc) for ms in json.loads(sys.argv[1])]',
        'iso = ["%04d-W%02d" % monday.isocalendar()[:2] for monday in mondays]',
        'print(json.dumps({"weeks": [rota.week(monday) for monday in mondays], "iso": iso,',
        '    "current": [rota.current(datetime.fromtimestamp(ms / 1000, tz=timezone.utc)) for ms in json.loads(sys.argv[2])]}))',
    ].join('\n');
    const probes = mondays.flatMap((monday) => [monday, monday + 15 * 3600000 + 119 * 60000, monday + 90 * 3600000 + 120 * 60000]);
    const mirrored = python(script, JSON.stringify(mondays), JSON.stringify(probes));
    const weeks = mondays.map((monday) => plain(rota.week(monday)));
    assert.deepEqual(weeks, mirrored.weeks);
    assert.deepEqual(weeks.map((plan) => plan.week), mirrored.iso);
    assert.deepEqual(probes.map((ms) => plain(rota.current(ms))), mirrored.current);
    // Across the 53-week ISO year 2026 into 2027, and before the epoch.
    const labels = weeks.map((plan) => plan.week);
    const at = labels.indexOf('2026-W53');
    assert.ok(at > 0);
    assert.deepEqual(labels.slice(at - 1, at + 2), ['2026-W52', '2026-W53', '2027-W01']);
    assert.equal(weeks[at].starts_at, '2026-12-28T00:00:00.000Z');
    assert.deepEqual([weeks[0].index, weeks[BEFORE - 1].index, weeks[BEFORE].index], [-BEFORE, -1, 0]);
    assert.equal(weeks[BEFORE - 1].week, '2026-W44');
});

test('parseWeek accepts exactly an existing YYYY-Www week and every instant of a week maps to its Monday', () => {
    assert.equal(rota.parseWeek('2026-W45'), EPOCH);
    assert.equal(rota.parseWeek('2026-W53'), Date.UTC(2026, 11, 28));
    assert.equal(rota.parseWeek('2027-W01'), Date.UTC(2027, 0, 4));
    assert.equal(rota.parseWeek('2020-W53'), Date.UTC(2020, 11, 28));
    assert.equal(rota.weekLabel(rota.parseWeek('0001-W01')), '0001-W01');
    for (const bad of ['2026-W54', '2027-W53', '2026-W00', '2026-W5', '2026-w45', ' 2026-W45', '2026-W45 ', '26-W45', '2026W45',
        '0000-W01', '2026-W４5', 'x', '', null, undefined, 202645, ['2026-W45']])
        assert.throws(() => rota.parseWeek(bad), refused(/^Choose a week/), String(bad));
    for (const monday of mondays) {
        const label = rota.weekLabel(monday);
        assert.equal(rota.parseWeek(label), monday);
        for (const offset of [0, 1, DAY, 6 * DAY + 23 * 3600000 + 59 * 60000 + 59999])
            assert.deepEqual([rota.mondayOf(monday + offset), rota.weekLabel(new Date(monday + offset)), rota.weekIndex(monday + offset)],
                [monday, label, Math.round((monday - EPOCH) / WEEK)]);
        assert.notEqual(rota.weekLabel(monday - 1), label);
    }
    for (const bad of ['2026-11-02', NaN, Infinity, null, {}, new Date('invalid')]) assert.throws(() => rota.week(bad), refused(/valid Date/));
});

test('current() is the class in progress until 120 minutes after it starts, then the next one, rolling into next week', () => {
    for (const monday of mondays.slice(BEFORE - 2, BEFORE + 10)) {
        const plan = plain(rota.week(monday));
        const next = plain(rota.week(monday + WEEK));
        assert.deepEqual(plain(rota.current(monday)), { week: plan.week, ...plan.classes[0] });
        plan.classes.forEach((item, slot) => {
            const starts = Date.parse(item.starts_at);
            assert.deepEqual(plain(rota.current(new Date(starts))), { week: plan.week, ...item });
            assert.deepEqual(plain(rota.current(starts + 119 * 60000)), { week: plan.week, ...item });
            const after = slot < 7 ? { week: plan.week, ...plan.classes[slot + 1] } : { week: next.week, ...next.classes[0] };
            assert.deepEqual(plain(rota.current(starts + 120 * 60000)), after);
        });
        assert.deepEqual(plain(rota.current(monday + 6 * DAY)), { week: next.week, ...next.classes[0] });
    }
});

test('the rota module is pure: no environment, clock, storage, network or box identity', () => {
    const text = source('apps/pocketbase/pb_hooks/guild-rota.js');
    for (const pattern of [/\$os\b/, /\$app\b/, /\$http\b/, /Date\.now\(/, /new Date\(\)/, /getenv/, /findRecord/, /SEAT_PERSONAS/])
        assert.doesNotMatch(text, pattern);
    assert.match(text, /require\(`\$\{__hooks\}\/guildmasters\.js`\)/);
    const rotaPy = source('libs/guildmasters/rota.py');
    for (const pattern of [/\bimport os\b/, /os\.environ|getenv/, /datetime\.now\(/, /\bopen\(/, /socket|urllib|subprocess/]) assert.doesNotMatch(rotaPy, pattern);
    assert.deepEqual(plain(rota.SLOT_HOURS), [15, 18, 39, 42, 63, 66, 87, 90]);
    assert.deepEqual([rota.EPOCH_MONDAY, rota.CLASS_MINUTES], [EPOCH, 120]);
});
