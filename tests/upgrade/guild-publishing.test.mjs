// --- CGRF Header ------------------------------------------------
// File:        tests/upgrade/guild-publishing.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-GUILDMASTER-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-GUILDMASTER-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-31
// Depends:     tests/upgrade/admin-fixture.mjs, apps/pocketbase/pb_hooks/guild-publishing.js, apps/pocketbase/pb_hooks/guild-publishing.pb.js, apps/pocketbase/pb_hooks/workspace-claims.js, apps/pocketbase/pb_hooks/business-policy.js, apps/pocketbase/pb_hooks/workspace-community.js, apps/pocketbase/pb_migrations/1792400000_guild_publications.js, apps/pocketbase/pb_migrations/1792400001_guild_withdrawn_status.js
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/admin-fixture.mjs; VALIDATES apps/pocketbase/pb_hooks/guild-publishing.js; VALIDATES apps/pocketbase/pb_hooks/guild-publishing.pb.js; VALIDATES apps/pocketbase/pb_hooks/workspace-claims.js; VALIDATES apps/pocketbase/pb_hooks/business-policy.js; VALIDATES apps/pocketbase/pb_hooks/workspace-community.js; VALIDATES apps/pocketbase/pb_migrations/1792400000_guild_publications.js; VALIDATES apps/pocketbase/pb_migrations/1792400001_guild_withdrawn_status.js
// Intent:      Prove guildmaster seats publish only their own work, every publication is audited once, and only owners and admins withdraw it.
// ----------------------------------------------------------------

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import vm from 'node:vm';
import { fixture, plain, source } from './admin-fixture.mjs';

const denied = (operation, status = 403) => assert.throws(operation, (error) => error.status === status);
const CLAIMS = 'apps/pocketbase/pb_migrations/1791500001_workspace_claim_authority.js';
const PUBLICATIONS = 'apps/pocketbase/pb_migrations/1792400000_guild_publications.js';
const WITHDRAWN = 'apps/pocketbase/pb_migrations/1792400001_guild_withdrawn_status.js';
const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ?
    `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
const runtime = { toString: String, $os: { readFile: () => source('apps/pocketbase/pb_migrations/data/starter-tutorials.json') },
    $security: { sha256 } };
const edition = { title: 'Weekly builder notes', summary: 'What the guild shipped', body: 'Three synthetic changes.', edition_date: '' };
const article = { title: 'Guild article', body: 'A reported synthetic change.', audience: 'Builders', status: 'draft', format: 'blog' };
const review = { status: 'approved', review_checks: { accuracy: true, privacy: true, rights: true, accessibility: true }, review_note: 'Checked the saved synthetic copy.' };

// Seat accounts shaped as 1789100000/1789100002 create them. No machine name or address appears.
function guildFixture({ publications = true, withdrawn = true } = {}) {
    const f = fixture({ runtime });
    f.migration('apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js').up();
    f.migration(CLAIMS).up();
    if (publications) f.migration(PUBLICATIONS).up();
    if (withdrawn) f.migration(WITHDRAWN).up();
    const seat = (id, local, role, values = {}) => {
        f.seed('users', { id, name: `OCN seat: ${local}`, email: `${local}@ocn.buildanddo.invalid`, verified: true, ocn_seat: true, ...values });
        if (role) f.seed('workspace_members', { id: `${id}member`, workspace: 'ws1', user: id, role });
    };
    seat('forgeseat', 'forge', 'editor'); seat('directorseat', 'director', 'editor'); seat('museviewer', 'muse', 'viewer');
    seat('quilladmin', 'quill', 'admin'); seat('scholarseat', 'scholar', null);
    seat('flaglessforge', 'forge', 'editor', { ocn_seat: false });
    let sequence = 0;
    const key = () => `guild_request_${++sequence}_synthetic`;
    f.claim = (action, values, { actor = 'forgeseat', id = '', revision = 0, key: retry } = {}) =>
        plain(f.load('workspace-claims.js').command(f.event(actor, { action, revision, request_key: retry || key(),
            payload: action === 'edition.publish' ? { id } : { id, values } })));
    f.community = (action, payload, { actor = 'forgeseat', revision = 0, key: retry } = {}) =>
        plain(f.load('workspace-community.js').command(f.event(actor, { action, revision, request_key: retry || key(), payload })));
    f.withdraw = (payload, { actor = 'admin', revision = 0, key: retry } = {}) =>
        plain(f.load('guild-publishing.js').command(f.event(actor, { action: 'publication.withdraw', revision, request_key: retry || key(), payload })));
    f.publications = (actor = 'admin', query = {}) => plain(f.load('guild-publishing.js').list(f.event(actor, {}, { query })));
    f.rows = () => f.data.guild_publications || [];
    f.publishEdition = (actor = 'forgeseat', options = {}) => {
        const draft = f.claim('edition.save', edition, { actor });
        return f.claim('edition.publish', {}, { actor, id: draft.id, revision: 1, ...options });
    };
    return f;
}

test('a guildmaster seat publishes its own edition directly and the publication is audited exactly once', () => {
    const f = guildFixture();
    const draft = f.claim('edition.save', edition);
    const published = f.claim('edition.publish', {}, { id: draft.id, revision: 1, key: 'guild_edition_publish_001' });
    assert.equal(published.record.status, 'published'); assert.equal(published.record.published_by, 'forgeseat');
    assert.ok(Date.parse(published.record.published_at));
    assert.equal(f.rows().length, 1);
    const [row] = f.rows();
    assert.deepEqual([row.workspace, row.actor, row.actor_seat, row.persona, row.action, row.kind, row.target, row.title, row.note],
        ['ws1', 'forgeseat', 'forge', 'forge', 'published', 'daily_edition', draft.id, edition.title, '']);
    assert.match(row.content_digest, /^[0-9a-f]{64}$/);
    assert.equal(row.content_digest, sha256(canonical(edition)));
    const replay = f.claim('edition.publish', {}, { id: draft.id, revision: 1, key: 'guild_edition_publish_001' });
    assert.equal(replay.replayed, true); assert.equal(f.rows().length, 1);
    // The account id is director; the public persona is director-nexus.
    f.publishEdition('directorseat');
    assert.deepEqual([f.rows()[1].actor_seat, f.rows()[1].persona], ['director', 'director-nexus']);
});

test('a guildmaster seat cannot publish another member\'s edition, and viewers or non-members cannot publish at all', () => {
    const f = guildFixture();
    const human = f.claim('edition.save', edition, { actor: 'editor' });
    assert.throws(() => f.claim('edition.publish', {}, { id: human.id, revision: 1 }), /publishes only what it authored/);
    const theirs = f.claim('edition.save', edition, { actor: 'directorseat' });
    denied(() => f.claim('edition.publish', {}, { id: theirs.id, revision: 1 }));
    f.seed('daily_editions', { id: 'viewerdraft', workspace: 'ws1', owner: 'museviewer', status: 'draft', title: 'Viewer draft', claim_revision: 1 });
    denied(() => f.claim('edition.publish', {}, { id: 'viewerdraft', revision: 1, actor: 'museviewer' }));
    f.seed('daily_editions', { id: 'scholardraft', workspace: 'ws1', owner: 'scholarseat', status: 'draft', title: 'Outside draft', claim_revision: 1 });
    denied(() => f.claim('edition.publish', {}, { id: 'scholardraft', revision: 1, actor: 'scholarseat' }));
    assert.deepEqual(f.data.daily_editions.map((row) => row.status), ['draft', 'draft', 'draft', 'draft']);
    assert.equal(f.rows().length, 0);
});

test('TRUST-001 still holds for people: a non-guildmaster editor cannot publish, and admin publishing writes no guild row', () => {
    const f = guildFixture();
    const draft = f.claim('edition.save', edition, { actor: 'editor' });
    denied(() => f.claim('edition.publish', {}, { id: draft.id, revision: 1, actor: 'editor' }));
    const admin = f.claim('edition.publish', {}, { id: draft.id, revision: 1, actor: 'admin' });
    assert.equal(admin.record.published_by, 'admin');
    assert.equal(f.rows().length, 0);
    // A guildmaster seat holding admin role is audited whatever its role, even on another author's draft.
    const other = f.claim('edition.save', edition, { actor: 'editor' });
    f.claim('edition.publish', {}, { id: other.id, revision: 1, actor: 'quilladmin' });
    assert.deepEqual([f.rows().length, f.rows()[0].persona, f.rows()[0].actor], [1, 'quill', 'quilladmin']);
});

test('a forge-named account without the ocn_seat flag is not a guildmaster and cannot publish', () => {
    const f = guildFixture();
    const draft = f.claim('edition.save', edition, { actor: 'flaglessforge' });
    denied(() => f.claim('edition.publish', {}, { id: draft.id, revision: 1, actor: 'flaglessforge' }));
    f.seed('users', { id: 'flaglessforge', name: 'Forge', email: 'forge@ocn.buildanddo.invalid', verified: false, ocn_seat: true });
    denied(() => f.claim('edition.publish', {}, { id: draft.id, revision: 1, actor: 'flaglessforge' }));
    assert.equal(f.rows().length, 0);
});

test('a guildmaster seat self-reviews its own social content with the four checks and records the publication once', () => {
    const f = guildFixture();
    const draft = f.claim('content.save', article);
    f.claim('content.save', { status: 'awaiting_approval' }, { id: draft.id, revision: 1 });
    denied(() => f.claim('content.save', { ...review, review_checks: { accuracy: true } }, { id: draft.id, revision: 2 }), 400);
    denied(() => f.claim('content.save', { ...review, review_note: ' ' }, { id: draft.id, revision: 2 }), 400);
    const approved = f.claim('content.save', review, { id: draft.id, revision: 2 });
    assert.equal(approved.record.reviewed_by, 'forgeseat'); assert.ok(approved.record.reviewed_at);
    assert.equal(f.rows().length, 0);
    denied(() => f.claim('content.save', { status: 'published', published_url: 'http://example.test/plain' }, { id: draft.id, revision: 3 }), 400);
    const published = f.claim('content.save', { status: 'published', published_url: 'https://example.test/article' }, { id: draft.id, revision: 3, key: 'guild_content_publish_01' });
    assert.equal(published.record.published_by, 'forgeseat');
    assert.equal(f.claim('content.save', { status: 'published', published_url: 'https://example.test/article' }, { id: draft.id, revision: 3, key: 'guild_content_publish_01' }).replayed, true);
    assert.equal(f.rows().length, 1);
    assert.deepEqual([f.rows()[0].kind, f.rows()[0].target, f.rows()[0].persona], ['social_content', draft.id, 'forge']);
    // Another member's content still needs a current administrator.
    const human = f.claim('content.save', article, { actor: 'editor' });
    f.claim('content.save', { status: 'awaiting_approval' }, { id: human.id, revision: 1, actor: 'editor' });
    denied(() => f.claim('content.save', review, { id: human.id, revision: 2 }));
    denied(() => f.claim('content.save', review, { id: human.id, revision: 2, actor: 'editor' }));
    assert.equal(f.data.social_content.find((row) => row.id === human.id).status, 'awaiting_approval');
    assert.equal(f.rows().length, 1);
});

test('the content review policy accepts a guildmaster decision only on its own record, even when called directly', () => {
    const f = guildFixture();
    const policy = f.load('business-policy.js');
    const decide = (actor, owner) => {
        const e = f.event(actor);
        e.record = f.record('social_content', { id: `direct${owner}`, workspace: 'ws1', owner, status: 'awaiting_approval', format: 'blog', title: 'Copy',
            body: 'Body', audience: 'Builders', review_checks: {}, review_note: '' });
        e.record.set('status', 'approved'); e.record.set('review_checks', review.review_checks); e.record.set('review_note', review.review_note);
        let saved = false; e.next = () => { saved = true; };
        policy.content(e, false);
        return [saved, e.record.getString('reviewed_by')];
    };
    assert.deepEqual(decide('forgeseat', 'forgeseat'), [true, 'forgeseat']);
    for (const [actor, owner] of [['forgeseat', 'editor'], ['forgeseat', 'directorseat'], ['editor', 'editor'], ['flaglessforge', 'flaglessforge'], ['museviewer', 'museviewer']])
        denied(() => decide(actor, owner));
    assert.deepEqual(decide('admin', 'editor'), [true, 'admin']);
});

test('with moderation on a guildmaster topic is open and its reply visible, while a person\'s stay pending', () => {
    const f = guildFixture(); f.enable();
    const topic = f.community('forum.create', { title: 'Guild office hours', body: 'Bring one question.' }, { key: 'guild_topic_retry_0001' });
    assert.equal(topic.status, 'open');
    assert.equal(f.community('forum.create', { title: 'Guild office hours', body: 'Bring one question.' }, { key: 'guild_topic_retry_0001' }).replayed, true);
    const reply = f.community('forum.reply', { topic: topic.id, body: 'First answer.' }, { revision: 1 });
    assert.equal(reply.status, 'visible');
    const human = f.community('forum.create', { title: 'Editor question', body: 'Is this ready?' }, { actor: 'editor' });
    assert.equal(human.status, 'pending');
    assert.equal(f.community('forum.reply', { topic: topic.id, body: 'Editor answer.' }, { actor: 'editor', revision: 1 }).status, 'pending');
    assert.deepEqual(f.rows().map((row) => [row.kind, row.target, row.persona]), [['forum_topic', topic.id, 'forge'], ['forum_reply', reply.id, 'forge']]);
    assert.equal(f.rows()[1].title, 'Reply: Guild office hours');
    const api = f.load('workspace-community.js');
    assert.equal(api.forums(f.event('viewer')).items.length, 1);
    assert.equal(api.thread(f.event('viewer', {}, { id: topic.id })).items.length, 1);
});

test('a guildmaster seat publishes its own wiki draft but cannot archive it, publish another page or moderate', () => {
    const f = guildFixture(); f.enable();
    const page = f.community('wiki.save', { id: '', title: 'Guild handbook', slug: 'guild-handbook', body: 'How the guild works.' });
    const published = f.community('wiki.transition', { id: page.id, status: 'published' }, { revision: 1 });
    assert.equal(published.status, 'published');
    const saved = f.data.wiki_pages.find((row) => row.id === page.id);
    assert.equal(saved.published_by, 'forgeseat');
    assert.deepEqual(f.rows().map((row) => [row.kind, row.target, row.title]), [['wiki_page', page.id, 'Guild handbook']]);
    denied(() => f.community('wiki.transition', { id: page.id, status: 'archived' }, { revision: 2 }));
    denied(() => f.community('wiki.transition', { id: page.id, status: 'draft' }, { revision: 2 }));
    denied(() => f.community('wiki.transition', { id: page.id, status: 'published' }, { revision: 2 }), 409);
    const human = f.community('wiki.save', { id: '', title: 'Editor page', slug: 'editor-page', body: 'Draft.' }, { actor: 'editor' });
    denied(() => f.community('wiki.transition', { id: human.id, status: 'published' }, { revision: 1 }));
    const topic = f.community('forum.create', { title: 'Pending', body: 'Waiting.' }, { actor: 'editor' });
    denied(() => f.community('forum.moderate', { kind: 'topic', id: topic.id, status: 'open', note: 'Self-appointed moderator.' }, { revision: 1 }));
    denied(() => f.community('wiki.transition', { id: human.id, status: 'published' }, { revision: 1, actor: 'editor' }));
    assert.equal(f.data.wiki_pages.find((row) => row.id === human.id).status, 'draft');
    assert.equal(f.rows().length, 1);
    // A seat that archived as an administrator cannot recover that decision after losing the role.
    f.community('wiki.transition', { id: human.id, status: 'archived' }, { revision: 1, actor: 'quilladmin', key: 'guild_admin_archive_01' });
    f.seed('workspace_members', { id: 'quilladminmember', workspace: 'ws1', user: 'quilladmin', role: 'editor' });
    denied(() => f.community('wiki.transition', { id: human.id, status: 'archived' }, { revision: 1, actor: 'quilladmin', key: 'guild_admin_archive_01' }));
});

test('owners and admins withdraw each editorial and community kind with a required note; editors and guildmasters cannot', () => {
    const f = guildFixture(); f.enable();
    const editionId = f.publishEdition().id;
    const content = f.claim('content.save', article);
    f.claim('content.save', { status: 'awaiting_approval' }, { id: content.id, revision: 1 });
    f.claim('content.save', review, { id: content.id, revision: 2 });
    f.claim('content.save', { status: 'published', published_url: 'https://example.test/article' }, { id: content.id, revision: 3 });
    const topic = f.community('forum.create', { title: 'Guild topic', body: 'Open.' });
    const reply = f.community('forum.reply', { topic: topic.id, body: 'Visible.' }, { revision: 1 });
    const page = f.community('wiki.save', { id: '', title: 'Guild page', slug: 'guild-page', body: 'Body.' });
    f.community('wiki.transition', { id: page.id, status: 'published' }, { revision: 1 });
    assert.equal(f.rows().length, 5);
    const cases = [
        ['daily_edition', editionId, 2, 'daily_editions', 'claim_revision', 'withdrawn'],
        ['social_content', content.id, 4, 'social_content', 'claim_revision', 'withdrawn'],
        ['forum_topic', topic.id, 1, 'forum_topics', 'revision', 'hidden'],
        ['forum_reply', reply.id, 1, 'forum_replies', 'revision', 'hidden'],
        ['wiki_page', page.id, 2, 'wiki_pages', 'revision', 'archived'],
    ];
    for (const [kind, target, revision, collection, field, status] of cases) {
        const payload = { kind, target, note: `Withdrawn after review of ${kind}.` };
        for (const actor of ['editor', 'forgeseat', 'directorseat', 'viewer', 'outsider']) denied(() => f.withdraw(payload, { actor, revision }));
        denied(() => f.withdraw(payload, { revision: revision + 1 }), 409);
        denied(() => f.withdraw({ ...payload, note: ' ' }, { revision }), 400);
        const result = f.withdraw(payload, { actor: kind === 'wiki_page' ? 'owner' : 'admin', revision, key: `withdraw_retry_${kind}` });
        assert.deepEqual([result.id, result.kind, result.status, result.revision, result.replayed], [target, kind, status, revision + 1, false]);
        assert.equal(f.withdraw(payload, { actor: kind === 'wiki_page' ? 'owner' : 'admin', revision, key: `withdraw_retry_${kind}` }).replayed, true);
        const saved = f.data[collection].find((row) => row.id === target);
        assert.equal(saved.status, status); assert.equal(saved[field], revision + 1);
        if (kind.startsWith('forum_')) {
            assert.equal(saved.moderation_note, payload.note); assert.equal(saved.moderated_by, 'admin'); assert.ok(Date.parse(saved.moderated_at));
        }
        const row = f.rows().at(-1);
        assert.deepEqual([row.action, row.kind, row.target, row.note, row.persona, row.actor_seat],
            ['withdrawn', kind, target, payload.note, 'forge', '']);
        denied(() => f.withdraw(payload, { revision: revision + 1 }), 409);
    }
    assert.equal(f.rows().length, 10);
    // Withdrawn records are retained: they cannot be edited or republished.
    denied(() => f.claim('edition.save', { title: 'Rewrite' }, { id: editionId, revision: 3 }), 400);
    denied(() => f.claim('edition.publish', {}, { id: editionId, revision: 3 }), 400);
    denied(() => f.claim('edition.publish', {}, { id: editionId, revision: 3, actor: 'admin' }), 400);
    denied(() => f.claim('content.save', { status: 'draft' }, { id: content.id, revision: 5, actor: 'admin' }), 400);
    denied(() => f.claim('content.save', { status: 'published', published_url: 'https://example.test/again' }, { id: content.id, revision: 5 }), 400);
    // A record no guildmaster published has nothing to withdraw.
    const human = f.claim('edition.save', edition, { actor: 'editor' });
    f.claim('edition.publish', {}, { id: human.id, revision: 1, actor: 'admin' });
    denied(() => f.withdraw({ kind: 'daily_edition', target: human.id, note: 'Not a guild publication.' }, { revision: 2 }), 404);
    denied(() => f.withdraw({ kind: 'daily_edition', target: 'missingrecord', note: 'Missing.' }, { revision: 0 }), 404);
    for (const payload of [{ kind: 'account', target: editionId, note: 'x' }, { kind: 'daily_edition', target: '../x', note: 'x' },
        { kind: 'daily_edition', target: editionId, note: 'x'.repeat(801) }, { kind: 'daily_edition', target: editionId }])
        denied(() => f.withdraw(payload, { revision: 3 }), 400);
});

test('without the guild publications migration a guildmaster publication fails closed and people keep working', () => {
    const f = guildFixture({ publications: false }); f.enable();
    const draft = f.claim('edition.save', edition);
    const before = plain(f.data);
    denied(() => f.claim('edition.publish', {}, { id: draft.id, revision: 1 }), 503);
    assert.deepEqual(f.data, before);
    denied(() => f.community('forum.create', { title: 'Guild topic', body: 'Open.' }), 503);
    const page = f.community('wiki.save', { id: '', title: 'Guild page', slug: 'guild-page', body: 'Body.' });
    denied(() => f.community('wiki.transition', { id: page.id, status: 'published' }, { revision: 1 }), 503);
    assert.equal(f.data.wiki_pages[0].status, 'draft');
    assert.equal(f.claim('edition.publish', {}, { id: draft.id, revision: 1, actor: 'admin' }).record.status, 'published');
    assert.equal(f.community('forum.create', { title: 'Editor topic', body: 'Pending.' }, { actor: 'editor' }).status, 'pending');
    assert.equal(f.community('forum.create', { title: 'Admin topic', body: 'Open.' }, { actor: 'admin' }).status, 'open');
    denied(() => f.publications(), 503);
    denied(() => f.withdraw({ kind: 'daily_edition', target: draft.id, note: 'No table.' }, { revision: 2 }), 503);
    assert.equal(f.data.guild_publications, undefined);
});

test('the guild publication migrations are idempotent, validate shape and refuse rollback while history exists', () => {
    const f = guildFixture();
    const installed = plain(f.collections.guild_publications);
    for (const key of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']) assert.equal(installed[key], null);
    f.migration(PUBLICATIONS).up();
    assert.deepEqual(plain(f.collections.guild_publications), installed);
    f.migration(WITHDRAWN).up();
    for (const name of ['daily_editions', 'social_content'])
        assert.equal(f.collections[name].fields.getByName('status').values.filter((value) => value === 'withdrawn').length, 1);
    for (const corrupt of [
        (c) => { c.listRule = "@request.auth.id != ''"; }, (c) => { c.fields.getByName('note').max = 10; },
        (c) => { c.fields.getByName('actor').cascadeDelete = true; }, (c) => { c.indexes = []; }, (c) => { c.type = 'view'; },
    ]) {
        const g = guildFixture(); corrupt(g.collections.guild_publications);
        assert.throws(g.migration(PUBLICATIONS).up, /Review/);
    }
    f.publishEdition();
    const rows = plain(f.data.guild_publications);
    assert.throws(f.migration(PUBLICATIONS).down, /audit trail/);
    assert.deepEqual(f.data.guild_publications, rows);
    const open = guildFixture(); open.collections.guild_publications.viewRule = '';
    assert.throws(open.migration(PUBLICATIONS).down, /Review custom guild_publications\.viewRule/);
    const empty = guildFixture();
    empty.migration(PUBLICATIONS).down(); empty.migration(PUBLICATIONS).down();
    assert.equal(empty.collections.guild_publications, undefined);
    // The withdrawn state is kept while a record is in it.
    const withdrawn = guildFixture();
    const id = withdrawn.publishEdition().id;
    withdrawn.withdraw({ kind: 'daily_edition', target: id, note: 'Checked.' }, { revision: 2 });
    assert.throws(withdrawn.migration(WITHDRAWN).down, /withdrawn record/);
    assert.ok(withdrawn.collections.daily_editions.fields.getByName('status').values.includes('withdrawn'));
    const clean = guildFixture();
    clean.migration(WITHDRAWN).down(); clean.migration(WITHDRAWN).down();
    assert.equal(clean.collections.daily_editions.fields.getByName('status').values.includes('withdrawn'), false);
    assert.deepEqual(plain(clean.collections.social_content.fields.getByName('status').values), ['draft', 'awaiting_approval', 'scheduled', 'published', 'failed', 'approved']);
});

test('the publication history is owner/admin only, bounded, reports target state and carries no email', () => {
    const f = guildFixture();
    const ids = [];
    for (let i = 0; i < 22; i++) ids.push(f.publishEdition().id);
    f.app.delete(f.app.findRecordById('daily_editions', ids[0]));
    for (const actor of ['editor', 'viewer', 'forgeseat', 'directorseat', 'outsider']) denied(() => f.publications(actor));
    const first = f.publications('owner'), second = f.publications('admin', { page: '2' });
    assert.equal(first.items.length, 20); assert.equal(first.has_more, true);
    assert.equal(second.items.length, 2); assert.equal(second.has_more, false);
    denied(() => f.publications('admin', { page: '0' }), 400);
    const all = [...first.items, ...second.items];
    assert.equal(new Set(all.map((item) => item.id)).size, 22);
    const gone = all.find((item) => item.target === ids[0]);
    assert.deepEqual([gone.target_status, gone.target_revision, gone.withdrawable], ['unavailable', null, false]);
    const live = all.find((item) => item.target === ids[1]);
    assert.deepEqual([live.target_status, live.target_revision, live.withdrawable, live.persona, live.kind], ['published', 2, true, 'forge', 'daily_edition']);
    assert.deepEqual(Object.keys(live).sort(), ['action', 'actor', 'actor_seat', 'content_digest', 'created', 'id', 'kind', 'note', 'persona',
        'target', 'target_revision', 'target_status', 'title', 'withdrawable'].sort());
    assert.doesNotMatch(JSON.stringify([first, second]), /@|buildanddo\.invalid/);
});

test('the guild publication routes require users authentication, a body limit and no-store responses', () => {
    const routes = [];
    vm.runInNewContext(source('apps/pocketbase/pb_hooks/guild-publishing.pb.js'), {
        __hooks: '/hooks', routerAdd: (method, path, handler, ...middleware) => routes.push({ method, path, handler, middleware }),
        $apis: { requireAuth: (...collections) => ({ auth: collections }), bodyLimit: (limit) => ({ limit }) },
        require: () => ({ list: () => ({ listed: true }), command: () => ({ commanded: true }) }),
    });
    assert.deepEqual(routes.map((route) => `${route.method} ${route.path}`), [
        'GET /api/buildanddo/workspaces/{workspace}/guild-publications', 'POST /api/buildanddo/workspaces/{workspace}/guild-publications']);
    assert.deepEqual(plain(routes[0].middleware), [{ auth: ['users'] }]);
    assert.deepEqual(plain(routes[1].middleware), [{ auth: ['users'] }, { limit: 30000 }]);
    for (const route of routes) {
        const headers = {};
        const result = route.handler({ response: { header: () => ({ set: (name, value) => { headers[name] = value; } }) }, json: (status, body) => ({ status, body }) });
        assert.equal(headers['Cache-Control'], 'no-store'); assert.equal(result.status, 200);
    }
});
