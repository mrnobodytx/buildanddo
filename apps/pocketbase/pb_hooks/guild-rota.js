// --- CGRF Header ------------------------------------------------
// File:        apps/pocketbase/pb_hooks/guild-rota.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-GUILDMASTER-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-GUILDMASTER-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-31
// Depends:     apps/pocketbase/pb_hooks/guildmasters.js
// EnumType:    Model
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/guildmasters.js; CONSUMED_BY apps/pocketbase/pb_hooks/guild-classes.js; MIRRORED_BY libs/guildmasters/rota.py; VERIFIED_BY tests/upgrade/guild-rota.test.mjs
// Intent:      Decide, from the date alone, which guildmaster hosts, attends and audits each weekly guild class.
// ----------------------------------------------------------------
//
// Pure CommonJS: no I/O, no environment and no clock. Every answer is a function of the instant
// passed in, so the server cron and libs/guildmasters/rota.py (which must agree field for field)
// can never drift on "which week is it". Weeks are ISO 8601 weeks, Monday 00:00 UTC.
//
// Owner decision (2) of 2026-10-31: each guildmaster hosts one class a week, the other seven
// attend, and one of them audits. In week w, slot s is hosted by ORDER[(s + w) mod 8], so every
// guildmaster hosts exactly once and the hosts rotate through the slots week by week. The auditor
// is ORDER[(s + w + k) mod 8] with k = 1 + (w mod 7): a fixed shift for the week, never zero, so
// the auditors are also a permutation, nobody audits their own class and the pairings change.

const guildmasters = require(`${__hooks}/guildmasters.js`);

const HOUR = 3600000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
// Monday 2026-11-02 00:00 UTC, ISO week 2026-W45: week index 0. Earlier weeks have negative indices.
const EPOCH_MONDAY = Date.UTC(2026, 10, 2);
// UTC hours after Monday 00:00: Monday to Thursday at 15:00 and 18:00.
const SLOT_HOURS = Object.freeze([15, 18, 39, 42, 63, 66, 87, 90]);
const CLASS_MINUTES = 120;
const WEEK_LABEL = /^([0-9]{4})-W([0-9]{2})$/;

const mod = (n, m) => ((n % m) + m) % m;
const iso = (ms) => new Date(ms).toISOString();

/**
 * Milliseconds since the epoch for a Date or a finite number; anything else is refused. A Date is
 * recognised by its internal tag rather than instanceof, so one made in another VM still counts.
 */
function instant(t) {
    const ms = Object.prototype.toString.call(t) === '[object Date]' ? Date.prototype.getTime.call(t) : t;
    if (typeof ms !== 'number' || !Number.isFinite(ms)) throw new TypeError('Pass a valid Date or epoch milliseconds.');
    return ms;
}

/** Monday 00:00 UTC of the ISO week containing `t`, in milliseconds. 1970-01-01 was a Thursday. */
function mondayOf(t) {
    const day = Math.floor(instant(t) / DAY);
    return (day - mod(day + 3, 7)) * DAY;
}

/** The ISO 8601 week label of `t`, 'YYYY-Www'. The ISO year is the year of that week's Thursday. */
function weekLabel(t) {
    const thursday = new Date(mondayOf(t) + 3 * DAY);
    const year = thursday.getUTCFullYear();
    const january = new Date(0);
    january.setUTCFullYear(year, 0, 1);
    const week = Math.floor((thursday.getTime() - january.getTime()) / WEEK) + 1;
    return `${String(year).padStart(4, '0')}-W${String(week).padStart(2, '0')}`;
}

/** Whole weeks between EPOCH_MONDAY and the week containing `t`; negative before the epoch. */
function weekIndex(t) {
    return Math.floor((mondayOf(t) - EPOCH_MONDAY) / WEEK);
}

/**
 * Monday 00:00 UTC of an ISO week label, in milliseconds. Strict: exactly 'YYYY-Www', year 0001 to
 * 9999, and a week that exists in that year ('2027-W53' does not). Anything else throws.
 */
function parseWeek(label) {
    const match = typeof label === 'string' ? WEEK_LABEL.exec(label) : null;
    const year = match ? Number(match[1]) : 0;
    const week = match ? Number(match[2]) : 0;
    if (!match || year < 1 || week < 1 || week > 53) throw new TypeError('Choose a week as YYYY-Www.');
    // setUTCFullYear, not Date.UTC: Date.UTC maps years 0 to 99 onto 1900 to 1999.
    const fourth = new Date(0);
    fourth.setUTCFullYear(year, 0, 4);              // 4 January is always in week 1
    const monday = mondayOf(fourth) + (week - 1) * WEEK;
    if (weekLabel(monday) !== label) throw new TypeError('Choose a week that exists in that year.');
    return monday;
}

function classOf(index, slot, monday) {
    const at = mod(slot + index, 8);
    const host = guildmasters.GUILDMASTERS[at];
    const auditor = guildmasters.GUILDMASTERS[mod(at + 1 + mod(index, 7), 8)];
    // Everyone but the host, starting after the host; the auditor is one of them.
    const attendees = [];
    for (let step = 1; step < 8; step += 1) attendees.push(guildmasters.ORDER[mod(at + step, 8)]);
    return {
        slot, host: host.seat, persona: host.slug, name: host.name, guild: host.guild,
        auditor: auditor.seat, auditor_persona: auditor.slug, attendees,
        starts_at: iso(monday + SLOT_HOURS[slot] * HOUR),
    };
}

/** The rota of the ISO week containing `t`: its label, index, first instant and eight classes in slot order. */
function week(t) {
    const monday = mondayOf(t);
    const index = Math.floor((monday - EPOCH_MONDAY) / WEEK);
    const classes = SLOT_HOURS.map((_hours, slot) => classOf(index, slot, monday));
    return { week: weekLabel(monday), index, starts_at: iso(monday), classes };
}

/**
 * The class happening now or next: the first class this week, else next week, that has not ended
 * by `t` (starts_at + CLASS_MINUTES > t). It carries its week label. There is always one.
 */
function current(t) {
    const ms = instant(t);
    for (const plan of [week(ms), week(mondayOf(ms) + WEEK)]) {
        const found = plan.classes.find((item) => Date.parse(item.starts_at) + CLASS_MINUTES * 60000 > ms);
        if (found) return { week: plan.week, ...found };
    }
    throw new Error('The rota has no class after this instant.');   // unreachable: next week always has eight
}

module.exports = {
    EPOCH_MONDAY, SLOT_HOURS, CLASS_MINUTES, WEEK, mod, mondayOf, weekLabel, weekIndex, parseWeek, week, current,
};
