// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/observability/config.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-14
// Depends:     apps/web/src/lib/observability/context.js
// EnumType:    ConfigDoc
// EnumEdges:   DEPENDS_ON apps/web/src/lib/observability/context.js
// DAG Node:    none
// Intent:      Centralize browser sampling and the bounded workspace mutation action vocabulary.
// ───────────────────────────────────────────────────────────────

export const BROWSER_TELEMETRY = Object.freeze({
    site: 'us5.datadoghq.com',
    service: 'buildanddo-web',
    sessionSampleRate: 100,
    sessionReplaySampleRate: 20,
    traceSampleRate: 20,
});

// Collection names are deliberately closed; record content never enters names.
export const WORKSPACE_ENTITIES = Object.freeze({
    missions: 'mission',
    challenge_submissions: 'challenge',
    workflows: 'workflow',
    workflow_runs: 'workflow_run',
    signals: 'signal',
    services: 'service',
    operations: 'operation',
    operation_runs: 'operation_run',
    roadmap_items: 'roadmap_item',
    evidence: 'evidence',
    research_submissions: 'research_submission',
    suite_runs: 'mission_suite_run',
    research_uploads: 'research_upload',
    daily_editions: 'edition',
    editions: 'edition',
    specialist_desks: 'specialist_desk',
    seat_events: 'seat_event',
    domains: 'domain',
    tutorial_progress: 'tutorial_progress',
    classroom_rooms: 'classroom_room',
    classroom_messages: 'classroom_message',
    support_sources: 'support_source',
    corrections: 'correction',
    erp_objectives: 'objective',
    erp_tasks: 'task',
    erp_contacts: 'contact',
    social_channels: 'social_channel',
    social_content: 'social_content',
    workspace_controls: 'workspace_control',
    wiki_pages: 'wiki_page',
    forum_topics: 'forum_topic',
    forum_replies: 'forum_reply',
});

// These are native command names, not arbitrary body.action values or CRUD aliases.
const COMMAND_ACTIONS = {
    workspace_controls: {
        'settings.save': 'workspace.settings.save',
        'member.set': 'workspace.member.set',
        'member.remove': 'workspace.member.remove',
        'integration.save': 'workspace.integration.save',
        'integration.check': 'workspace.integration.check',
    },
    wiki_pages: { 'wiki.save': 'workspace.wiki.save', 'wiki.transition': 'workspace.wiki.transition' },
    forum_topics: { 'forum.create': 'workspace.forum.create', 'forum.moderate': 'workspace.forum.moderate' },
    forum_replies: { 'forum.reply': 'workspace.forum.reply', 'forum.moderate': 'workspace.forum.moderate' },
    support_sources: { 'support.request': 'workspace.support.request' },
    corrections: { 'correction.save': 'workspace.correction.save' },
    daily_editions: { 'edition.save': 'workspace.edition.save', 'edition.publish': 'workspace.edition.publish' },
    specialist_desks: { 'desk.save': 'workspace.desk.save' },
    social_content: { 'content.save': 'workspace.content.save' },
    social_channels: { 'channel.request': 'workspace.channel.request' },
    seat_events: { 'seat.report': 'workspace.seat.report' },
    business_jobs: {
        'source.capture': 'workspace.business.source.capture',
        'action.enqueue': 'workspace.business.action.enqueue',
        'action.claim': 'workspace.business.action.claim',
        'action.begin': 'workspace.business.action.begin',
        'action.complete': 'workspace.business.action.complete',
        'action.hold': 'workspace.business.action.hold',
        'action.cancel': 'workspace.business.action.cancel',
        'action.reconcile': 'workspace.business.action.reconcile',
        'integration.observe': 'workspace.business.integration.observe',
    },
    assistant_sessions: {
        'session.start': 'workspace.assistant.session.start',
        'session.close': 'workspace.assistant.session.close',
        'session.forget': 'workspace.assistant.session.forget',
        'plan.record': 'workspace.assistant.plan.record',
        chat: 'workspace.assistant.chat',
    },
    private_dossiers: {
        'dossier.update': 'workspace.dossier.update',
        'entity.create': 'workspace.dossier.entity.create',
        'entity.update': 'workspace.dossier.entity.update',
        'entity.delete': 'workspace.dossier.entity.delete',
        'note.add': 'workspace.dossier.note.add',
        'note.update': 'workspace.dossier.note.update',
        'note.delete': 'workspace.dossier.note.delete',
    },
    career_reviews: { 'review.import': 'workspace.career.review.import' },
    blueprints: { analyze: 'workspace.blueprint.analyze', upload: 'workspace.blueprint.upload',
        retry: 'workspace.blueprint.retry', cancel: 'workspace.blueprint.cancel' },
};

export const MUTATION_ACTIONS = Object.freeze(
    Object.fromEntries(
        [...new Set([...Object.keys(WORKSPACE_ENTITIES), ...Object.keys(COMMAND_ACTIONS)])].map((collection) => [
            collection,
            Object.freeze({
                ...Object.fromEntries(
                    (Object.hasOwn(WORKSPACE_ENTITIES, collection) ? ['create', 'update', 'delete'] : []).map((verb) => [
                        verb,
                        `workspace.${WORKSPACE_ENTITIES[collection]}.${verb}`,
                    ]),
                ),
                ...COMMAND_ACTIONS[collection],
            }),
        ]),
    ),
);
