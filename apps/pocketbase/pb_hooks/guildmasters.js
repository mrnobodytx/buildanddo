// --- CGRF Header ------------------------------------------------
// File:        apps/pocketbase/pb_hooks/guildmasters.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-GUILDMASTER-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-GUILDMASTER-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-31
// Depends:     apps/pocketbase/pb_migrations/1789100000_ocn_seat_users.js, apps/pocketbase/pb_migrations/1789100002_ocn_seat_users_guildmasters.js
// EnumType:    Model
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_migrations/1789100000_ocn_seat_users.js; DEPENDS_ON apps/pocketbase/pb_migrations/1789100002_ocn_seat_users_guildmasters.js; CONSUMED_BY apps/pocketbase/pb_hooks/guildmasters.pb.js; MIRRORED_BY libs/guildmasters/__init__.py; VERIFIED_BY tests/upgrade/guildmaster-registry.test.mjs
// Intent:      Name the eight guildmasters once, and recognise a guildmaster only from its own stored seat account.
// ----------------------------------------------------------------
//
// CommonJS with no I/O and no side effect at load: handlers require() this inside themselves,
// because PocketBase runs every handler in its own VM and file-scope helpers are not shared.
//
// The roster is public by design (apps/web/src/data/personas.js renders it). What is NOT here,
// and must never be, is which machine runs which seat: box seats are not guildmasters to this
// module, and nothing below reads the environment or any box identity.

const SEAT_DOMAIN = '@ocn.buildanddo.invalid';
// The flag 1789100000 added to users. Only a superuser may set or change it (guildmasters.pb.js).
const SEAT_FLAG = 'ocn_seat';
const SEAT_EMAIL = /^([a-z0-9][a-z0-9-]{0,62})@ocn\.buildanddo\.invalid$/;

const entry = (seat, slug, name, guild, aliases = []) => Object.freeze({
    seat, slug, name, guild, aliases: Object.freeze([...aliases]),
});

// Rota order. The seat is the account local part the seat migrations created; the slug is the
// public persona id. They differ only for Director Nexus, whose account predates the slug.
const GUILDMASTERS = Object.freeze([
    entry('forge', 'forge', 'Forge', 'builder'),
    entry('scholar', 'scholar', 'Scholar', 'research'),
    entry('oracle', 'oracle', 'Oracle', 'intelligence'),
    entry('alex', 'alex', 'Alex', 'commerce'),
    entry('sterling', 'sterling', 'Sterling', 'finance'),
    entry('muse', 'muse', 'Muse', 'creator'),
    entry('quill', 'quill', 'Quill', 'writers'),
    entry('director', 'director-nexus', 'Director Nexus', 'entertainment', ['director']),
]);
const ORDER = Object.freeze(GUILDMASTERS.map((item) => item.seat));

/** The entry whose seat id is exactly `seat`, or null. No normalisation: ids are lowercase. */
function bySeat(seat) {
    return typeof seat === 'string' ? GUILDMASTERS.find((item) => item.seat === seat) || null : null;
}

/** The entry whose persona slug is exactly `slug`, or null. */
function bySlug(slug) {
    return typeof slug === 'string' ? GUILDMASTERS.find((item) => item.slug === slug) || null : null;
}

/**
 * The guildmaster a claim names, or null.
 *
 * Accepts a seat, slug, alias, display name or classroom presence id. Presence rows spell a
 * guildmaster several ways (`gm-forge`, `gm:forge`, `gm-builder-forge`, `gm-ent-director`), so
 * the value is lowercased, every run of other characters becomes `-`, a leading `gm-` is dropped,
 * and the rest matches when it IS a slug, seat or alias, or ENDS with `-<slug>` / `-<alias>`.
 * Exact matches are tried across the whole roster before suffixes. This only maps a claim to a
 * name; whether the caller may make the claim is `isSeat`.
 */
function resolve(value) {
    if (typeof value !== 'string') return null;
    const key = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^gm-/, '');
    if (!key) return null;
    const names = (item) => [item.slug, item.seat, ...item.aliases];
    return GUILDMASTERS.find((item) => names(item).includes(key))
        || GUILDMASTERS.find((item) => [item.slug, ...item.aliases].some((name) => key.endsWith(`-${name}`)))
        || null;
}

/** The canonical classroom persona id of an entry: `gm-<slug>`. */
function personaId(item) {
    return item && typeof item.slug === 'string' ? `gm-${item.slug}` : '';
}

/** The reserved account email of a registered seat, or null for anything else. */
function seatEmail(seat) {
    return bySeat(seat) ? `${seat}${SEAT_DOMAIN}` : null;
}

/**
 * The guildmaster the authenticated account IS, or null.
 *
 * Decided from the stored users row only: it is re-read by id, and must be verified, carry
 * `ocn_seat`, and have the reserved email of a registered seat. The display name, token claims,
 * request body, environment and box ids are never consulted, so renaming an account to "Forge"
 * or sending a persona in a body changes nothing. Any error means "not a guildmaster".
 */
function seatOf(app, auth) {
    try {
        if (!app || !auth || !auth.id) return null;
        if (typeof auth.collection === 'function' && auth.collection().name !== 'users') return null;
        const user = app.findRecordById('users', auth.id);
        if (!user || user.collection().name !== 'users') return null;
        if (!user.getBool(SEAT_FLAG) || !user.getBool('verified')) return null;
        const match = SEAT_EMAIL.exec(String(user.getString('email') || '').trim().toLowerCase());
        return match ? bySeat(match[1]) : null;
    } catch (_err) {
        return null;
    }
}

/** True only when the authenticated account is the guildmaster `who` names. */
function isSeat(app, auth, who) {
    const mine = seatOf(app, auth);
    return Boolean(mine) && mine === resolve(who);
}

/** Superuser auth, read defensively; a hook without the method is not a superuser. */
function isSuperuser(e) {
    try { return typeof e.hasSuperuserAuth === 'function' ? e.hasSuperuserAuth() === true : false; } catch (_err) { return false; }
}

module.exports = {
    SEAT_DOMAIN, SEAT_FLAG, GUILDMASTERS, ORDER, bySeat, bySlug, resolve, personaId, seatEmail, seatOf, isSeat, isSuperuser,
};
