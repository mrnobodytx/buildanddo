// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/seatDisplay.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     none
// EnumType:    Utility
// EnumEdges:   CONSUMED_BY apps/web/src/components/broadcast/AgentActivity.jsx; CONSUMED_BY apps/web/src/components/broadcast/LiveBroadcast.jsx
// DAG Node:    none
// Intent:      Name a seat to workspace members without showing a login, or the machine a guildmaster runs on.
// ───────────────────────────────────────────────────────────────

// A seat string is whatever wrote the event: a role (kestrel-verify), a persona (Scholar, gm-builder-forge), or an
// account's username or email. The fleet boxes ARE the guildmasters' signing seats and their accounts are named after
// the box, so a raw seat can say which machine houses a guildmaster; the room system must never show that (operator,
// 2026-09-21), and a member's login is not for other members either.

// The machine-name families of the estate's public rule (scripts/ci/public_redaction.py on the integration branch).
// A hyphen separates a specific family from the words around it: a machine joined into a slug
// ("codegen-<machine>-broadcast") is still that machine. The broad mesh family keeps the hyphen as part of the word,
// so a compound word that merely contains it ("capability-mesh-fallback") stays readable.
const SPECIFIC = ['ray-[a-z]{3}\\d+-\\d+', 'kvm\\d+', 'rig\\d+', 'cni-service-box-[a-z]+', 'srv\\d{6,}', 'desktop-[a-z0-9]{7}'];
const WORD_BOUND = ['mesh-[a-z]+'];
const MACHINE_SOURCE = `(^|[^a-z0-9])(?:${SPECIFIC.join('|')})(?![a-z0-9])|(^|[^a-z0-9-])(?:${WORD_BOUND.join('|')})(?![a-z0-9-])`;
const MACHINE = new RegExp(MACHINE_SOURCE, 'i');
// A seat is an identifier, not prose: any part from the mesh family hides it.
const MESH_PART = /(^|[^a-z0-9])mesh-[a-z]/i;
const ROLE = /^[a-z][a-z0-9]*(?:[-:][a-z0-9]+)*$/i;
const PERSONA = /^gm[-:](?:[a-z0-9]+-)*([a-z][a-z0-9]*)$/i;

/** What the estate's public rule puts in place of a withheld name. */
export const WITHHELD = '█'.repeat(8);

/**
 * How a seat is named to other members. A guildmaster id names its persona (gm-forge, gm:forge, gm-builder-forge ->
 * "Forge"); a plain role or persona name is shown as written; anything else - an email, a login, a name that follows a
 * machine family - is never shown, and the fallback stands in for it.
 *
 * @param {unknown} seat Raw seat or presence id.
 * @param {string} [fallback] What to show when the seat cannot be named safely.
 * @returns {string}
 */
export function seatName(seat, fallback = 'Agent') {
    const value = String(seat ?? '').trim();
    if (!value || value.includes('@') || MACHINE.test(value) || MESH_PART.test(value) || !ROLE.test(value)) return fallback;
    const persona = PERSONA.exec(value);
    if (persona) return persona[1].charAt(0).toUpperCase() + persona[1].slice(1).toLowerCase();
    return value;
}

/**
 * Text a seat wrote, with every name that follows a machine family withheld.
 *
 * @param {unknown} text
 * @returns {string}
 */
export function withoutMachineNames(text) {
    return String(text ?? '').replace(new RegExp(MACHINE_SOURCE, 'gi'), (_match, lead, wordLead) => `${lead ?? wordLead ?? ''}${WITHHELD}`);
}
