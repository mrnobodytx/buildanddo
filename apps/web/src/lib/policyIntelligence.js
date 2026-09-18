// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/policyIntelligence.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     apps/research/policy/contracts.py, apps/research/policy/pipeline.py, apps/web/src/lib/missionResearch.js, apps/web/src/lib/missionLearning.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/research/policy/contracts.py; CONSUMES apps/research/policy/pipeline.py; CONSUMES apps/web/src/lib/missionResearch.js; CONSUMES apps/web/src/lib/missionLearning.js
// DAG Node:    none
// Intent:      Admit bounded policy packs and create replayable review proposals through existing workspace authority without trusting imported claims.
// ───────────────────────────────────────────────────────────────

import { createResearchClient } from './missionResearch.js';
import { emptyPlan } from './missionLearning.js';

export const POLICY_STATES = ['OBSERVED', 'ATTRIBUTED', 'ANALYZED', 'UNRESOLVED'];
export const POLICY_KINDS = { legislation: 'Legislation', hearing: 'Hearings', committee: 'Committees', appropriation: 'Appropriations',
    executive_policy: 'Executive Policy', statement: 'Stakeholders', regulation: 'Regulation' };
export const POLICY_AREAS = ['cybersecurity', 'defense', 'energy', 'healthcare', 'homeland_security', 'small_business'];
export const POLICY_MAX_BYTES = 300000;
const sources = { congress: 'congress.gov', govinfo: 'govinfo.gov', federal_register: 'federalregister.gov',
    white_house: 'whitehouse.gov', senate: 'senate.gov', house: 'house.gov' };
const entityTypes = ['bill', 'committee', 'hearing', 'official', 'statement', 'appropriation', 'program', 'issue', 'organization'];
const relations = { member_of: [['official'], ['committee']], referred_to: [['bill'], ['committee']],
    concerns: [['hearing', 'bill', 'policy_event'], ['issue']], affects: [['bill', 'policy_event'], ['program']],
    funds: [['appropriation'], ['program']], made_by: [['statement'], ['official', 'organization']], supported_by: [['statement'], ['source']] };
const accepted = new WeakSet();
const views = new WeakMap();
class PolicyInputError extends Error {}
const requireValue = (ok) => { if (!ok) throw new PolicyInputError('Use a valid policy pack for this workspace.'); };
const keys = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
const text = (value, maximum, empty = false) => typeof value === 'string' && value.length <= maximum && value === value.trim() &&
    (empty || Boolean(value)) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
const id = (value) => text(value, 128) && /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value);
const tenant = (value) => text(value, 64) && /^[A-Za-z0-9_-]+$/.test(value);
const date = (value) => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().replace('.000Z', 'Z') === value;
const list = (value, max, valid) => Array.isArray(value) && value.length <= max && value.every(valid);
const unique = (value) => new Set(value).size === value.length;
const sorted = (value) => value.join('\0') === [...value].sort().join('\0');
const areas = (value) => list(value, 6, (item) => POLICY_AREAS.includes(item)) && value.length > 0 && unique(value) && sorted(value);
const freeze = (value) => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const fold = (value) => value.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ');

/** Serialize the versioned interchange bytes; this is integrity, not authentication. */
export function canonicalPolicy(value) {
    if (Array.isArray(value)) return '[' + value.map(canonicalPolicy).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonicalPolicy(value[key])).join(',') + '}';
    return JSON.stringify(value);
}
async function hash(value, crypto) {
    const result = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
function sourceUrl(source, value) {
    requireValue(Object.hasOwn(sources, source) && text(value, 2048) &&
        /^https:\/\/[a-zA-Z0-9.-]+(?::443)?(?:[/?][^\s\\#]*)?$/.test(value));
    const url = new URL(value); const root = sources[source];
    requireValue(url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443') &&
        (url.hostname === root || url.hostname.endsWith('.' + root)));
}
function shape(item, packet) {
    requireValue(keys(item, ['id', 'tenant_id', 'source_id', 'url', 'document_id', 'title', 'kind', 'state', 'attribution',
        'published_at', 'observed_at', 'mission_areas', 'excerpt', 'provenance', 'entities', 'relations']));
    requireValue(id(item.id) && item.tenant_id === packet.tenant_id && id(item.document_id) && text(item.title, 200) &&
        Object.hasOwn(POLICY_KINDS, item.kind) && POLICY_STATES.includes(item.state) && text(item.attribution, 160, true) &&
        (item.state !== 'ATTRIBUTED' || item.attribution) && date(item.published_at) && date(item.observed_at) &&
        item.published_at <= item.observed_at && item.observed_at <= packet.as_of && areas(item.mission_areas) && text(item.excerpt, 16000));
    sourceUrl(item.source_id, item.url);
    const proof = item.provenance;
    requireValue(keys(proof, ['input_sha256', 'excerpt_sha256', 'processor', 'version', 'truncated', 'research_id', 'verification']) &&
        /^[a-f0-9]{64}$/.test(proof.input_sha256) && /^[a-f0-9]{64}$/.test(proof.excerpt_sha256) &&
        text(proof.processor, 80) && text(proof.version, 80) && typeof proof.truncated === 'boolean' &&
        text(proof.research_id, 64, true) && (!proof.research_id || tenant(proof.research_id)) && proof.verification === 'unreviewed' &&
        ((packet.mode === 'demo') === (proof.processor === 'synthetic-fixture')));
    const types = new Map([['event', 'policy_event'], ['source', 'source']]);
    requireValue(list(item.entities, 32, (entity) => keys(entity, ['id', 'type', 'label']) && id(entity.id) &&
        !/^(pe_|source:)/.test(entity.id) && entityTypes.includes(entity.type) && text(entity.label, 160)));
    for (const entity of item.entities) { requireValue(!types.has(entity.id)); types.set(entity.id, entity.type); }
    requireValue(list(item.relations, 64, (edge) => keys(edge, ['source', 'relation', 'target', 'quote', 'state']) &&
        id(edge.source) && id(edge.target) && Object.hasOwn(relations, edge.relation) &&
        relations[edge.relation][0].includes(types.get(edge.source)) && relations[edge.relation][1].includes(types.get(edge.target)) &&
        text(edge.quote, 1200) && item.excerpt.includes(edge.quote) && POLICY_STATES.includes(edge.state) &&
        (edge.state !== 'ATTRIBUTED' || item.attribution)));
    requireValue(unique(item.relations.map(canonicalPolicy)));
}
function watchShape(rule) {
    requireValue(keys(rule, ['id', 'name', 'mission_areas', 'keywords', 'entity_ids', 'object_refs', 'cadence', 'window_hours']) &&
        id(rule.id) && text(rule.name, 160) && areas(rule.mission_areas) && ['realtime', 'daily'].includes(rule.cadence) &&
        Number.isSafeInteger(rule.window_hours) && rule.window_hours >= 1 && rule.window_hours <= 744);
    for (const field of ['keywords', 'entity_ids', 'object_refs']) {
        requireValue(list(rule[field], 12, field === 'keywords' ? (value) => text(value, 120) : id) &&
            unique(rule[field]) && (field === 'keywords' || sorted(rule[field])));
    }
    requireValue(rule.keywords.length + rule.entity_ids.length > 0);
}

/** Admit a canonical local pack and recompute every input/excerpt/content fingerprint. */
export async function importPolicy(raw, workspaceId, crypto = globalThis.crypto) {
    try {
        requireValue(typeof raw === 'string' && new TextEncoder().encode(raw).length <= POLICY_MAX_BYTES && tenant(workspaceId) && crypto?.subtle);
        const packet = JSON.parse(raw);
        requireValue(keys(packet, ['schema_version', 'tenant_id', 'mode', 'as_of', 'observations', 'watches', 'packet_sha256']) &&
            packet.schema_version === 'citadel.policy.v1' && tenant(packet.tenant_id) && ['research', 'demo'].includes(packet.mode) &&
            (packet.mode === 'demo' ? packet.tenant_id === 'demo-public' : packet.tenant_id === workspaceId) &&
            date(packet.as_of) && list(packet.observations, 100, (item) => { shape(item, packet); return true; }) &&
            unique(packet.observations.map((item) => item.id)) && list(packet.watches, 20, (rule) => { watchShape(rule); return true; }) &&
            unique(packet.watches.map((rule) => rule.id)));
        // Requiring compiler canonical JSON also rejects duplicate keys rather
        // than letting JSON.parse silently choose one conflicting value.
        requireValue(canonicalPolicy(packet) === raw.trim());
        const { packet_sha256: signature, ...body } = packet;
        requireValue(signature === await hash(canonicalPolicy(body), crypto));
        const urls = new Map(); const types = new Map();
        for (const item of packet.observations) {
            const series = canonicalPolicy([item.source_id, item.document_id]);
            requireValue(!urls.has(series) || urls.get(series) === item.url); urls.set(series, item.url);
            for (const entity of item.entities) {
                requireValue(!types.has(entity.id) || types.get(entity.id) === entity.type); types.set(entity.id, entity.type);
            }
            const { id: identity, observed_at: _observed, ...content } = item;
            const { research_id: _receipt, ...proof } = content.provenance;
            content.provenance = proof;
            requireValue(identity === 'pe_' + (await hash(canonicalPolicy(content), crypto)).slice(0, 32) &&
                item.provenance.input_sha256 === await hash(item.url, crypto) && item.provenance.excerpt_sha256 === await hash(item.excerpt, crypto));
        }
        const ruleHashes = new Map();
        for (const rule of packet.watches) ruleHashes.set(rule.id, await hash(canonicalPolicy(rule), crypto));
        freeze(packet); accepted.add(packet);
        const view = derive(packet, ruleHashes);
        for (const alert of view.alerts) {
            alert.id = 'pa_' + (await hash(canonicalPolicy([packet.tenant_id, alert.watch_sha256, alert.observation]), crypto)).slice(0, 32);
        }
        views.set(packet, freeze(view));
        return { ok: true, packet };
    } catch {
        return { ok: false, error: 'Could not read this policy pack. Use a compiler export for this workspace with unchanged source fingerprints.' };
    }
}
function derive(packet, ruleHashes) {
    const uniqueItems = new Map();
    for (const item of packet.observations) {
        const prior = uniqueItems.get(item.id);
        if (!prior || item.observed_at + item.provenance.research_id < prior.observed_at + prior.provenance.research_id) uniqueItems.set(item.id, item);
    }
    const observations = [...uniqueItems.values()].sort((a, b) => (a.observed_at + a.id < b.observed_at + b.id ? -1 : 1));
    const groups = new Map();
    for (const item of observations) {
        const key = canonicalPolicy([item.source_id, item.document_id]);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
    }
    const current = new Set(); const conflicts = new Set(); const edges = []; const nodes = new Map();
    for (const versions of groups.values()) {
        const captures = new Map(); let previous = [];
        for (const item of versions) { if (!captures.has(item.observed_at)) captures.set(item.observed_at, []); captures.get(item.observed_at).push(item); }
        for (const captured of captures.values()) {
            if (captured.length > 1) for (const item of captured) conflicts.add(item.id);
            for (const newer of captured) for (const older of previous) edges.push({ source: newer.id, relation: 'supersedes', target: older.id,
                observation: newer.id, state: 'OBSERVED', quote: '', basis: 'newer_capture_of_same_document' });
            previous = captured;
        }
        for (const item of previous) current.add(item.id);
    }
    for (const item of observations) {
        const source = 'source:' + item.source_id + ':' + item.document_id;
        nodes.set(item.id, { id: item.id, type: 'policy_event', labels: [item.title] });
        nodes.set(source, { id: source, type: 'source', labels: [item.url] });
        for (const entity of item.entities) {
            if (!nodes.has(entity.id)) nodes.set(entity.id, { id: entity.id, type: entity.type, labels: [] });
            const node = nodes.get(entity.id);
            if (!node.labels.includes(entity.label)) node.labels.push(entity.label);
            node.labels.sort();
        }
        const refs = { event: item.id, source };
        for (const edge of item.relations) edges.push({ ...edge, source: Object.hasOwn(refs, edge.source) ? refs[edge.source] : edge.source,
            target: Object.hasOwn(refs, edge.target) ? refs[edge.target] : edge.target, observation: item.id, basis: 'quoted_annotation' });
    }
    const alerts = [];
    for (const rule of [...packet.watches].sort((a, b) => a.id < b.id ? -1 : 1)) {
        const start = Date.parse(packet.as_of) - rule.window_hours * 3600000;
        for (const item of observations) {
            if (!current.has(item.id) || Date.parse(item.observed_at) <= start || !item.mission_areas.some((area) => rule.mission_areas.includes(area))) continue;
            const haystack = fold(item.title + '\n' + item.excerpt);
            const terms = rule.keywords.filter((term) => haystack.includes(fold(term)));
            const entities = rule.entity_ids.filter((value) => item.entities.some((entity) => entity.id === value));
            if ((rule.keywords.length && !terms.length) || (rule.entity_ids.length && !entities.length)) continue;
            alerts.push({ watch_id: rule.id, watch_sha256: ruleHashes.get(rule.id), observation: item.id, cadence: rule.cadence,
                status: 'review_required', reasons: [...terms.map((term) => 'keyword:' + term), ...entities.map((value) => 'entity:' + value)],
                object_refs: rule.object_refs, source_conflict: conflicts.has(item.id) });
        }
    }
    const brief = Object.fromEntries(POLICY_STATES.map((state) => [state, []]));
    const daily = new Set(alerts.filter((alert) => alert.cadence === 'daily').map((alert) => alert.observation));
    const dayStart = Date.parse(packet.as_of) - 86400000;
    for (const item of [...observations].reverse()) if (daily.has(item.id) && Date.parse(item.observed_at) > dayStart)
        brief[conflicts.has(item.id) ? 'UNRESOLVED' : item.state].push(item.id);
    return { tenant_id: packet.tenant_id, as_of: packet.as_of, mode: packet.mode, current: [...current].sort(), conflicts: [...conflicts].sort(),
        graph: { nodes: [...nodes.values()].sort((a, b) => a.id < b.id ? -1 : 1), edges }, alerts, brief,
        delivery: 'not_connected', verification: 'unreviewed' };
}

/** Return derived views only for an admitted, immutable policy pack. */
export function projectPolicy(packet) {
    requireValue(accepted.has(packet));
    return views.get(packet);
}

/** Add a local watch and return a newly validated, exportable pack. */
export async function configurePolicyWatch(packet, configuration, workspaceId, crypto = globalThis.crypto) {
    try {
        projectPolicy(packet);
        requireValue(keys(configuration, ['name', 'mission_areas', 'keywords', 'entity_ids', 'object_refs', 'cadence', 'window_hours']));
        const rule = { ...configuration, id: 'watch_' + (await hash(canonicalPolicy(configuration), crypto)).slice(0, 24) };
        watchShape(rule);
        const next = { ...packet, watches: [...packet.watches.filter((item) => item.id !== rule.id), rule].sort((a, b) => a.id < b.id ? -1 : 1) };
        const { packet_sha256: _signature, ...body } = next;
        next.packet_sha256 = await hash(canonicalPolicy(body), crypto);
        return importPolicy(canonicalPolicy(next), workspaceId, crypto);
    } catch { return { ok: false, error: 'Use a watch name, mission area, literal keywords and valid business object references.' }; }
}

/** Search imported observations with literal text and bounded classification filters. */
export function searchPolicy(packet, { query = '', kind = '', area = '', archive = false } = {}) {
    const view = projectPolicy(packet); const needle = fold(query.slice(0, 200));
    return packet.observations.filter((item) => (archive || view.current.includes(item.id)) &&
        (!kind || item.kind === kind) && (!area || item.mission_areas.includes(area)) &&
        fold(item.title + '\n' + item.excerpt + '\n' + item.entities.map((entity) => entity.label).join('\n')).includes(needle))
        .sort((a, b) => a.observed_at > b.observed_at ? -1 : 1);
}

/** Export an A0 review definition while leaving approvals and outcome evidence empty. */
export function policyProposal(packet, alertId) {
    const alert = projectPolicy(packet).alerts.find((item) => item.id === alertId);
    requireValue(Boolean(alert));
    const source = packet.observations.find((item) => item.id === alert.observation);
    const title = ('Review policy source: ' + source.title).slice(0, 160);
    const description = ['Review this unverified source and its applicability before taking action.',
        'Source annotation: ' + source.state,
        'Source: ' + (source.url.length <= 300 ? source.url : source.source_id + ' (full URL in the retained policy pack)'),
        'Observation: ' + source.id, 'Excerpt SHA-256: ' + source.provenance.excerpt_sha256,
        'Watch SHA-256: ' + alert.watch_sha256,
        'Configured objects: ' + (alert.object_refs.join(', ').slice(0, 160) || 'None'),
        'Resolve current source conflicts and record findings in the mission plan and Evidence Ledger. Approval and verification remain pending.'].join('\n');
    requireValue(description.length <= 1000);
    return { schema_version: 'buildanddo.policy-proposal.v1', mode: packet.mode, authority: 'A0', verified: false,
        source, watch: packet.watches.find((item) => item.id === alert.watch_id), packet_sha256: packet.packet_sha256,
        definition: { title, description, status: 'proposed', priority: 'medium', progress: 0,
            plan: { ...emptyPlan(), risk: 'A0', purpose: 'Review source applicability and collect evidence.',
                in_scope: 'Read the cited source and compare it with the configured business objects.',
                out_of_scope: 'Publication, external outreach, implementation and approval.' } } };
}

/** Reuse native research commands and durable content-based retry keys for proposals. */
export function createPolicyClient(options) {
    let intent = null;
    const research = createResearchClient({ ...options, keyFactory: () => intent.key });
    const current = () => !options.demo && options.isCurrent() && options.client.authStore.record?.id === options.accountId;
    const finish = (result) => { if (result.reason !== 'uncertain' && result.reason !== 'busy') intent = null; return result; };
    return {
        async propose(packet, alertId) {
            if (!current()) return { ok: false, reason: 'scope_changed', error: '' };
            try {
                requireValue(accepted.has(packet) && packet.mode === 'research' && packet.tenant_id === options.workspaceId);
                const proposal = policyProposal(packet, alertId);
                const key = 'policy_' + alertId;
                if (intent && intent.key !== key) return { ok: false, reason: 'uncertain', error: 'Recover the previous proposal before starting another.' };
                intent = { key };
                return finish(await research.command('mission.propose', { title: proposal.definition.title, description: proposal.definition.description }));
            } catch {
                return { ok: false, reason: 'invalid', error: 'Import a research pack for this workspace before proposing a source review.' };
            }
        },
        async retry() { return finish(await research.retry()); },
    };
}
