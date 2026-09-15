// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/workspace-summary.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/lib/workspaceSummary.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/workspaceSummary.js
// DAG Node:    none
// Intent:      Verify that workspace previews select observed records and never treat draft editions or pending connections as results.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import test from 'node:test';
import {
    activeMissions,
    verifiedEvidence,
    isToday,
    latestPublishedEdition,
    verifiedCorrections,
    hasReportedRevenue,
    reportedMoney,
    recordTimestamp,
} from '../../apps/web/src/lib/workspaceSummary.js';

const now = new Date(2026, 8, 15, 12);
const morning = new Date(2026, 8, 15, 8).toISOString();
const yesterday = new Date(2026, 8, 14, 8).toISOString();
const tomorrow = new Date(2026, 8, 16, 8).toISOString();

test('home and workspace agree on active mission and verified evidence states', () => {
    const missions = [
        'proposed',
        'approved',
        'running',
        'needs_attention',
        'verified',
        'failed',
    ].map((status) => ({ status }));
    assert.deepEqual(
        activeMissions(missions).map((record) => record.status),
        ['approved', 'running', 'needs_attention'],
    );
    assert.deepEqual(
        verifiedEvidence([
            { type: 'observed' },
            { type: 'verified', id: 'receipt' },
            { status: 'verified' },
        ]),
        [{ type: 'verified', id: 'receipt' }],
    );
    assert.equal(missions.length, 6);
    assert.deepEqual(activeMissions([]), []);
});

test('today uses the local calendar and excludes unknown and future timestamps', () => {
    assert.equal(isToday(morning, now), true);
    for (const value of [yesterday, tomorrow, 'invalid', '', null, undefined])
        assert.equal(isToday(value, now), false);
    assert.equal(isToday(new Date(2026, 8, 15, 23).toISOString(), now), false);
    assert.equal(isToday(new Date().toISOString()), true);
});

test('editions show the latest publication, excluding drafts, future and invalid dates', () => {
    const records = [
        { id: 'older', status: 'published', edition_date: yesterday, created: morning },
        { id: 'draft', status: 'draft', edition_date: morning },
        { id: 'scheduled', status: 'published', edition_date: tomorrow },
        { id: 'invalid', status: 'published', edition_date: 'invalid' },
        { id: 'latest', status: 'published', edition_date: '', created: morning },
    ];
    assert.equal(latestPublishedEdition(records, now).id, 'latest');
    assert.deepEqual(
        records.map((record) => record.id),
        ['older', 'draft', 'scheduled', 'invalid', 'latest'],
    );
    assert.equal(latestPublishedEdition(records.slice(1, 4), now), null);
    assert.equal(latestPublishedEdition([]), null);
});

test('correction previews require both halves of a verified comparison', () => {
    const complete = {
        status: 'verified',
        prior_prediction: 'Expected 4',
        observed_result: 'Measured 2',
    };
    assert.deepEqual(
        verifiedCorrections([
            complete,
            { ...complete, status: 'pending' },
            { ...complete, observed_result: ' ' },
            { ...complete, prior_prediction: '' },
            { status: 'verified' },
        ]),
        [complete],
    );
});

test('a reported amount requires a real sync and currency, not just a connection state', () => {
    const record = { status: 'healthy', last_sync: morning, gross: 20, currency: 'USD' };
    assert.equal(hasReportedRevenue(record, now), true);
    assert.equal(hasReportedRevenue({ ...record, gross: 0 }, now), true);
    assert.equal(hasReportedRevenue({ ...record, status: 'degraded' }, now), true);
    for (const overrides of [
        { status: 'pending' },
        { status: 'not_connected' },
        { last_sync: null },
        { last_sync: 0 },
        { last_sync: '' },
        { last_sync: 'bad-date' },
        { last_sync: tomorrow },
        { gross: null },
        { gross: '' },
        { gross: '20' },
        { gross: NaN },
        { gross: Infinity },
        { gross: -1 },
        { currency: '' },
        { currency: 'usd' },
        { currency: 'UNKNOWN' },
    ])
        assert.equal(
            hasReportedRevenue({ ...record, ...overrides }, now),
            false,
            JSON.stringify(overrides),
        );
    assert.equal(hasReportedRevenue({ ...record, last_sync: new Date().toISOString() }), true);
});

test('amounts preserve currency and missing fees never become zero', () => {
    assert.equal(reportedMoney(12.5, 'USD'), 'USD 12.50');
    assert.equal(reportedMoney(12.5, 'EUR'), 'EUR 12.50');
    assert.equal(reportedMoney(0, 'USD'), 'USD 0.00');
    for (const value of [undefined, null, '', '12', NaN, Infinity, -1])
        assert.equal(reportedMoney(value, 'USD'), 'Not reported');
    assert.equal(reportedMoney(12, ''), 'Not reported');
    assert.equal(reportedMoney(12, 'UNKNOWN'), 'Not reported');
});

test('timestamps never turn missing provenance into an epoch or Invalid Date', () => {
    for (const value of [null, undefined, '', 'bad-date'])
        assert.equal(recordTimestamp(value), 'Not recorded');
    assert.equal(recordTimestamp(morning), new Date(morning).toLocaleString());
});
