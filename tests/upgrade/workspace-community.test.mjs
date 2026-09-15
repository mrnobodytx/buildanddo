// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/workspace-community.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     tests/upgrade/admin-fixture.mjs, apps/pocketbase/pb_hooks/workspace-community.js
// EnumType:    Test
// EnumEdges:   DEPENDS_ON tests/upgrade/admin-fixture.mjs; VALIDATES apps/pocketbase/pb_hooks/workspace-community.js
// DAG Node:    none
// Intent:      Verify wiki and forum user journeys including publication authority, private drafts, moderation, stale revisions and lost-response retries.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, plain } from './admin-fixture.mjs';
const denied = (operation, status = 403) => assert.throws(operation, (error) => error.status === status);
const draft = { id: '', title: 'Working together', slug: 'working-together', body: 'Record the plan.\n\nReview the evidence.' };
const wiki = (f, options = {}) => f.command('wiki.save', draft, { actor: 'editor', revision: 0, ...options });
const topic = (f, options = {}) => f.command('forum.create', { title: 'First discussion', body: 'How should we test this?' }, { actor: 'editor', revision: 0, ...options });

test('wiki drafts become readable to the workspace only after an administrator publishes', () => {
    const f = fixture(); f.enable(); const api = f.load('workspace-community.js'); const page = wiki(f);
    assert.equal(page.status, 'draft');
    assert.equal(api.wiki(f.event('viewer')).items.length, 0); assert.equal(api.wiki(f.event('editor')).items.length, 1);
    denied(() => f.command('wiki.transition', { id: page.id, status: 'published' }, { actor: 'editor', revision: 1 }));
    f.command('wiki.transition', { id: page.id, status: 'published' }, { actor: 'admin', revision: 1 });
    const published = api.wiki(f.event('viewer')).items[0];
    assert.equal(published.body, draft.body); assert.equal(published.published_by, 'admin'); assert.ok(Date.parse(published.published_at));
    assert.equal(published.owner, 'editor'); assert.equal(published.revision, 2);
    denied(() => api.wiki(f.event('outsider')));
    denied(() => f.command('wiki.save', { ...draft, id: page.id }, { actor: 'admin', revision: 2 }), 409);
    f.command('wiki.transition', { id: page.id, status: 'draft' }, { revision: 2 });
    assert.equal(api.wiki(f.event('viewer')).items.length, 0);
    f.command('wiki.save', { ...draft, id: page.id, body: 'Revised guidance.' }, { actor: 'editor', revision: 3 });
    f.command('wiki.transition', { id: page.id, status: 'archived' }, { revision: 4 });
    assert.equal(api.wiki(f.event('admin')).items[0].status, 'archived');
});

test('wiki saves preserve authorship, reject foreign/missing records, and validate page addresses and body limits', () => {
    const f = fixture(); f.enable(); const page = wiki(f);
    f.seed('wiki_pages', { id: 'teammate', owner: 'admin', workspace: 'ws1', status: 'draft', revision: 1 });
    denied(() => f.command('wiki.save', { ...draft, id: 'teammate' }, { actor: 'editor', revision: 1 }));
    f.seed('wiki_pages', { id: 'foreign', owner: 'editor', workspace: 'ws2', status: 'draft', revision: 1 });
    denied(() => f.command('wiki.save', { ...draft, id: 'foreign' }, { actor: 'editor', revision: 1 }), 404);
    denied(() => f.command('wiki.save', { ...draft, id: 'missing' }, { actor: 'editor', revision: 1 }), 404);
    denied(() => wiki(f), 409);
    for (const changed of [{ slug: '../somewhere' }, { title: '' }, { body: 'x'.repeat(16001) }, { owner: 'owner' }])
        denied(() => f.command('wiki.save', { ...draft, ...changed }, { actor: 'editor', revision: 0 }), 400);
    denied(() => wiki(f, { revision: 1 }), 400);
    denied(() => f.command('wiki.transition', { id: page.id, status: 'signed' }, { revision: 1 }), 400);
});

test('wiki retry after persistence returns the same page and rejects stale or altered requests', () => {
    const f = fixture(); f.enable(); const options = { key: 'wiki_response_lost_12345' };
    const page = wiki(f, options); const replay = wiki(f, options);
    assert.equal(replay.id, page.id); assert.equal(replay.replayed, true); assert.equal(f.data.wiki_pages.length, 1);
    denied(() => f.command('wiki.save', { ...draft, body: 'Changed retry' }, { actor: 'editor', revision: 0, ...options }), 409);
    f.command('wiki.save', { ...draft, id: page.id, body: 'Second revision' }, { actor: 'editor', revision: 1 });
    denied(() => f.command('wiki.save', { ...draft, id: page.id }, { actor: 'editor', revision: 1 }), 409);
    f.command('member.remove', { user: 'editor' }); denied(() => wiki(f, options));
});

test('disabled community settings and viewer roles are enforced on reads and writes independently of the UI', () => {
    const f = fixture(); const api = f.load('workspace-community.js');
    denied(() => wiki(f)); denied(() => topic(f));
    assert.equal(api.wiki(f.event()).enabled, false); assert.equal(api.forums(f.event()).enabled, false);
    denied(() => api.thread(f.event('owner', {}, { id: 'missing' })));
    f.enable();
    denied(() => wiki(f, { actor: 'viewer' })); denied(() => topic(f, { actor: 'viewer' }));
    wiki(f); topic(f); f.enable({ wiki_enabled: false, forum_enabled: false });
    assert.equal(api.wiki(f.event()).items.length, 0); assert.equal(api.forums(f.event()).items.length, 0);
    denied(() => wiki(f, { key: 'retry_while_disabled' }));
});

test('forum moderation keeps pending topics private, attributes approval and preserves locked discussion reads', () => {
    const f = fixture(); f.enable(); const api = f.load('workspace-community.js'); const post = topic(f);
    assert.equal(post.status, 'pending'); assert.equal(api.forums(f.event('viewer')).items.length, 0);
    assert.equal(api.forums(f.event('editor')).items.length, 1);
    denied(() => api.thread(f.event('viewer', {}, { id: post.id })), 404);
    denied(() => f.command('forum.moderate', { kind: 'topic', id: post.id, status: 'open', note: 'Reviewed' }, { actor: 'editor', revision: 1 }));
    f.command('forum.moderate', { kind: 'topic', id: post.id, status: 'open', note: 'Reviewed the contribution.' }, { actor: 'admin', revision: 1 });
    assert.equal(api.forums(f.event('viewer')).items.length, 1);
    const reply = f.command('forum.reply', { topic: post.id, body: 'A proposed answer.' }, { actor: 'editor', revision: 2 });
    assert.equal(reply.status, 'pending');
    assert.equal(api.thread(f.event('viewer', {}, { id: post.id })).items.length, 0);
    assert.equal(api.thread(f.event('editor', {}, { id: post.id })).items.length, 1);
    f.command('forum.moderate', { kind: 'reply', id: reply.id, status: 'visible', note: 'Answer reviewed.' }, { actor: 'admin', revision: 1 });
    const visible = api.thread(f.event('viewer', {}, { id: post.id })).items[0];
    assert.equal(visible.moderated_by, 'admin'); assert.equal(visible.status, 'visible');
    f.command('forum.moderate', { kind: 'topic', id: post.id, status: 'locked', note: 'Discussion concluded.' }, { revision: 2 });
    assert.equal(api.thread(f.event('viewer', {}, { id: post.id })).topic.status, 'locked');
    denied(() => f.command('forum.reply', { topic: post.id, body: 'Late reply' }, { actor: 'editor', revision: 3 }), 409);
    f.command('forum.moderate', { kind: 'topic', id: post.id, status: 'hidden', note: 'Removed from member view.' }, { revision: 3 });
    denied(() => api.thread(f.event('editor', {}, { id: post.id })), 404);
    assert.equal(api.forums(f.event('admin')).items.length, 1);
    assert.equal(api.forums(f.event('editor')).items.length, 0);
});

test('moderation-off settings permit immediate editor discussion while cross-workspace replies and stale locks fail', () => {
    const f = fixture(); f.enable({ forum_moderation: false }); const post = topic(f); const api = f.load('workspace-community.js');
    assert.equal(post.status, 'open');
    const reply = f.command('forum.reply', { topic: post.id, body: 'Visible answer' }, { actor: 'editor', revision: 1 });
    assert.equal(reply.status, 'visible');
    f.command('forum.moderate', { kind: 'topic', id: post.id, status: 'locked', note: 'Close the thread.' }, { revision: 1 });
    denied(() => f.command('forum.reply', { topic: post.id, body: 'Stale answer' }, { actor: 'editor', revision: 1 }), 409);
    f.seed('forum_topics', { id: 'foreign', workspace: 'ws2', owner: 'otherowner', status: 'open', revision: 1 });
    denied(() => f.command('forum.reply', { topic: 'foreign', body: 'Wrong workspace' }, { revision: 1 }), 404);
    denied(() => api.thread(f.event('owner', {}, { id: 'foreign' })), 404);
    denied(() => f.command('forum.moderate', { kind: 'topic', id: 'foreign', status: 'hidden', note: 'Cannot do this.' }, { revision: 1 }), 404);
});

test('forum and reply retries have one receipt each and rollback leaves no unlogged content', () => {
    const f = fixture(); f.enable();
    const post = topic(f, { actor: 'admin', key: 'topic_lost_response_12345' });
    assert.equal(topic(f, { actor: 'admin', key: 'topic_lost_response_12345' }).id, post.id);
    const payload = { topic: post.id, body: 'Reviewed reply.' }; const options = { actor: 'admin', revision: 1, key: 'reply_lost_response_12345' };
    const first = f.command('forum.reply', payload, options); assert.equal(f.command('forum.reply', payload, options).id, first.id);
    assert.equal(f.data.forum_topics.length, 1); assert.equal(f.data.forum_replies.length, 1); assert.equal(f.data.workspace_admin_events.length, 3);
    const before = plain(f.data); f.config.failAudit = true;
    assert.throws(() => f.command('forum.reply', { topic: post.id, body: 'Rollback' }, { actor: 'admin', revision: 1 }), /audit storage unavailable/);
    assert.deepEqual(f.data, before);
    assert.throws(() => wiki(f), /audit storage unavailable/); assert.deepEqual(f.data, before);
});

test('community reads paginate and omit foreign, hidden and teammate-pending contributions', () => {
    const f = fixture(); f.enable(); const api = f.load('workspace-community.js');
    for (let i = 0; i < 23; i++) {
        f.seed('wiki_pages', { id: `wiki${i}`, workspace: 'ws1', owner: 'owner', status: 'published', revision: 1 });
        f.seed('forum_topics', { id: `topic${i}`, workspace: 'ws1', owner: 'owner', status: 'open', revision: 1 });
    }
    f.seed('wiki_pages', { id: 'foreignwiki', workspace: 'ws2', owner: 'viewer', status: 'published', revision: 1 });
    f.seed('forum_topics', { id: 'hidden', workspace: 'ws1', owner: 'viewer', status: 'hidden', revision: 1 });
    for (const fn of ['wiki', 'forums']) {
        const one = api[fn](f.event('viewer')); const two = api[fn](f.event('viewer', {}, { query: { page: '2' } }));
        assert.equal(one.items.length, 20); assert.equal(one.has_more, true); assert.equal(two.items.length, 3); assert.equal(two.has_more, false);
        denied(() => api[fn](f.event('viewer', {}, { query: { page: '0' } })), 400);
    }
});

test('malformed moderation, huge bodies and command envelopes fail without any write', () => {
    const f = fixture(); f.enable(); const api = f.load('workspace-community.js'); const before = plain(f.data);
    for (const body of [null, {}, { action: 'wiki.save', revision: -1, request_key: 'valid_request_key', payload: draft },
        { action: 'wiki.save', revision: 0, request_key: 'short', payload: draft },
        { action: 'wiki.save', revision: 0, request_key: 'valid_request_key', payload: [] },
        { action: 'execute', revision: 0, request_key: 'valid_request_key', payload: {} }]) denied(() => api.command(f.event('owner', body)), 400);
    denied(() => f.command('forum.create', { title: 'x', body: 'x'.repeat(8001) }, { revision: 0 }), 400);
    denied(() => f.command('forum.create', { title: 'x', body: 'x' }, { revision: 2 }), 400);
    denied(() => f.command('forum.moderate', { kind: 'account', id: 'owner', status: 'admin', note: 'invalid' }), 400);
    assert.deepEqual(f.data, before);
});
