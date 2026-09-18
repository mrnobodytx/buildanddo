// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/editorialContent.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     apps/web/src/lib/workspaceSummary.js
// EnumType:    Service
// EnumEdges:   CONSUMES apps/web/src/lib/workspaceSummary.js
// DAG Node:    none
// Intent:      Keep public research reading distinct from current private records and preserve dates and evidence states.
// ───────────────────────────────────────────────────────────────

import { isToday, latestPublishedEdition } from './workspaceSummary.js';

// Editorial reading selections, not a live news feed. Dates belong to the sources.
// Decorative subjects follow the supplied newspaper's left column, top to bottom.
export const RESEARCH_READING = Object.freeze([
    {
        id: 'retrieval', kicker: 'Machine learning', title: 'Give the answer a source.',
        description: 'Retrieval-augmented generation brings documents into language-model answers. Read the original method and its evaluation.',
        source: 'Lewis et al. · arXiv', date: '2020-05-22', illustration: 'wireless',
        href: 'https://arxiv.org/abs/2005.11401', linkLabel: 'Read the paper',
        motion: 'push', duration: 16,
    },
    {
        id: 'react', kicker: 'Agents & reasoning', title: 'Reason, act, then observe.',
        description: 'ReAct interleaves reasoning with actions and observations. The paper studies how that changes task performance.',
        source: 'Yao et al. · arXiv', date: '2022-10-06', illustration: 'flight',
        href: 'https://arxiv.org/abs/2210.03629', linkLabel: 'Read the paper',
        motion: 'left', duration: 19,
    },
    {
        id: 'risk-framework', kicker: 'Evaluation & trust', title: 'A framework for better questions.',
        description: 'NIST organizes AI risk work around Govern, Map, Measure and Manage. Start with the framework itself.',
        source: 'NIST · AI RMF 1.0', date: '2023-01-26', illustration: 'medicine',
        href: 'https://doi.org/10.6028/NIST.AI.100-1', linkLabel: 'Read the framework',
        motion: 'pull', duration: 17,
    },
    {
        id: 'attention', kicker: 'Research foundations', title: 'A different way to pay attention.',
        description: 'The Transformer replaces recurrent layers with attention. Revisit the architecture behind modern language models.',
        source: 'Vaswani et al. · arXiv', date: '2017-06-12', illustration: 'automobile',
        href: 'https://arxiv.org/abs/1706.03762', linkLabel: 'Read the paper',
        motion: 'rise', duration: 21,
    },
]);

// These are editorial starting points, not a ranking inferred from private usage.
// Use the reference's right-column subjects; the extra practice card shares gears.
export const PLATFORM_AREAS = Object.freeze([
    {
        id: 'classrooms', kicker: 'Learn with people', title: 'The classroom.',
        description: 'Follow a shared lesson, bring a question, and work through it together.',
        source: 'Classrooms', illustration: 'storefront', href: '/classrooms',
        linkLabel: 'Find a classroom', motion: 'push', duration: 18,
    },
    {
        id: 'missions', kicker: 'Turn intent into work', title: 'The mission desk.',
        description: 'Give a real problem a clear scope, a next step, and a record of what happened.',
        source: 'Workspace', illustration: 'gears', href: '/app/missions',
        linkLabel: 'Open missions', motion: 'left', duration: 22,
    },
    {
        id: 'knowledge', kicker: 'Connect the pieces', title: 'The knowledge room.',
        description: 'Explore the sources and relationships already recorded in your workspace.',
        source: 'Workspace', illustration: 'ship', href: '/app/knowledge',
        linkLabel: 'Explore knowledge', motion: 'pull', duration: 19,
    },
    {
        id: 'evidence', kicker: 'Show your work', title: 'The evidence ledger.',
        description: 'Keep the observation, its source, and the review alongside the claim.',
        source: 'Workspace', illustration: 'typewriter', href: '/app/evidence',
        linkLabel: 'Inspect evidence', motion: 'rise', duration: 24,
    },
    {
        id: 'practice', kicker: 'Try a method', title: 'The practice library.',
        description: 'Discover ways to turn an objective into a bounded, testable piece of work.',
        source: 'Practice', illustration: 'gears', href: '/practice',
        linkLabel: 'Browse practices', motion: 'right', duration: 20,
    },
]);

const compact = (value, limit) => {
    if (typeof value !== 'string') return '';
    const text = value.replace(/\s+/g, ' ').trim();
    return text.length > limit ? text.slice(0, limit - 1).trimEnd() + '…' : text;
};
const readable = (source) => Boolean(source && !source.loading && !source.degraded && !source.error && !source.demo);
const validDate = (value, now) => typeof value === 'string' && value.trim() && Number.isFinite(Date.parse(value)) && Date.parse(value) <= now.getTime();

/** Select finished research from the current, validated workspace response.
 * @param {object} research Research hook state.
 * @param {string} workspaceId Current workspace.
 * @param {Date} now Local clock.
 * @returns {Array<object>} Source-linked research cards, never verification claims.
 */
export function researchReelItems(research, workspaceId, now = new Date()) {
    if (!readable(research) || !workspaceId || research.data?.workspace !== workspaceId) return [];
    const seen = new Set();
    return (research.data.items || [])
        .filter((item) => {
            if (item.workspace !== workspaceId || !/^[a-zA-Z0-9_-]{1,64}$/.test(item.id) ||
                !['ready', 'attached'].includes(item.status) || !compact(item.title, 120) ||
                !validDate(item.processed_at, now) || seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
        })
        .sort((a, b) => Date.parse(b.processed_at) - Date.parse(a.processed_at) || a.id.localeCompare(b.id))
        .slice(0, 12)
        .map((item, index) => ({
            id: item.id,
            title: compact(item.title, 120),
            kicker: item.status === 'attached' ? 'Attached to evidence' : 'Ready for review',
            description: compact(item.context, 170) || 'Open the research desk to inspect the original source and extracted material.',
            source: 'Workspace research', date: item.processed_at,
            href: '/app/research?source=' + encodeURIComponent(item.id),
            // Saved research has no artwork metadata; keep a neutral subject as its position changes.
            linkLabel: 'Inspect the research', illustration: 'typewriter',
            motion: ['push', 'left', 'pull', 'rise'][index % 4], duration: 16 + index % 4 * 2,
        }));
}

/** Select only today's readable highlights without promoting their saved status.
 * @param {object} sources Current scoped home sources.
 * @param {Date} now Local clock.
 * @returns {Array<object>} Up to three dated highlights.
 */
export function dailyHighlights(sources, now = new Date()) {
    const highlights = [];
    if (readable(sources.editions)) {
        const edition = latestPublishedEdition(sources.editions.records, now);
        if (edition && isToday(edition.edition_date || edition.created, now)) highlights.push({
            id: 'edition/' + edition.id, title: compact(edition.title, 140), kicker: 'Published edition',
            date: edition.edition_date || edition.created, href: '#daily-edition',
        });
    }
    for (const [name, label, href] of [
        ['evidence', 'Evidence recorded', '#evidence-ledger'],
        ['signals', 'Signal recorded', '/app/signals'],
    ]) {
        if (!readable(sources[name])) continue;
        const records = [...sources[name].records].filter((record) => isToday(record.created, now) && compact(record.title, 140))
            .sort((a, b) => Date.parse(b.created) - Date.parse(a.created));
        const record = records[0];
        if (record) highlights.push({
            id: name + '/' + record.id, title: compact(record.title, 140),
            kicker: name === 'evidence' && record.type === 'verified' ? 'Evidence marked verified' : label,
            date: record.created, href,
        });
    }
    return highlights;
}

/** Format date-only publication dates without shifting them to the previous day.
 * @param {string} value Publication date or recorded timestamp.
 * @returns {string} Readable date, or an explicit unknown label.
 */
export function editorialDate(value) {
    if (typeof value !== 'string' || !value.trim()) return 'Date not recorded';
    const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? value + 'T12:00:00' : value);
    return Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
    }) : 'Date not recorded';
}
