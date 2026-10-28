// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/__tests__/businessPlanning.behavior.test.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-27
// Depends:     apps/web/src/lib/businessPlanning.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/businessPlanning.js
// DAG Node:    none
// Intent:      Prove date normalization, task urgency ordering, outline scaffolds,
//              preview parsing, publication links and saved-field checks behave
//              as operators rely on, including malformed and missing input.
// ───────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import { contentOutline, dateInput, draftBlocks, localDay, overdue, publicationUrl, retainedFields, selectTasks } from '@/lib/businessPlanning';

describe('dateInput', () => {
    it('keeps the calendar date of a stored timestamp', () => {
        expect(dateInput('2026-03-04 10:11:12.000Z')).toBe('2026-03-04');
    });

    it('rejects non-strings, malformed text and impossible calendar dates', () => {
        expect(dateInput(undefined)).toBe('');
        expect(dateInput(20260304)).toBe('');
        expect(dateInput('03/04/2026')).toBe('');
        expect(dateInput('2026-02-30')).toBe('');
        expect(dateInput('2026-13-01')).toBe('');
    });
});

describe('localDay', () => {
    it('formats the local calendar date with zero padding', () => {
        expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    });

    it('defaults to the current clock', () => {
        expect(localDay()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
});

describe('overdue', () => {
    it('flags unfinished work whose due date has passed', () => {
        expect(overdue({ status: 'todo', due_date: '2026-01-01' }, '2026-01-02')).toBe(true);
    });

    it('never flags finished work, undated work or work due today or later', () => {
        expect(overdue({ status: 'done', due_date: '2020-01-01' }, '2026-01-02')).toBe(false);
        expect(overdue({ status: 'todo' }, '2026-01-02')).toBe(false);
        expect(overdue({ status: 'todo', due_date: 'not a date' }, '2026-01-02')).toBe(false);
        expect(overdue({ status: 'todo', due_date: '2026-01-02' }, '2026-01-02')).toBe(false);
    });

    it('compares against the local day when no date is supplied', () => {
        expect(overdue({ status: 'todo', due_date: '1999-12-31' })).toBe(true);
        expect(overdue({ status: 'todo', due_date: '9999-12-31' })).toBe(false);
    });
});

describe('selectTasks', () => {
    const today = '2026-05-10';
    const tasks = [
        { id: 'a', title: 'Zeta report', status: 'todo', priority: 'low', due_date: '2026-06-01' },
        { id: 'b', title: 'Alpha call', description: 'Supplier follow up', status: 'in_progress', priority: 'high', due_date: '2026-05-20' },
        { id: 'c', title: 'Late invoice', status: 'todo', due_date: '2026-05-01', objective: 'obj1', contact: 'con1' },
        { id: 'd', status: 'done', priority: 'high', due_date: '2026-04-01' },
        { id: 'e', title: 'Beta draft', status: 'todo', priority: 'high' },
        { id: 'f', title: 'Alpha plan', status: 'todo', priority: 'high' },
    ];

    it('returns every task with no filters, overdue first then priority, due date and title', () => {
        expect(selectTasks(tasks, { today }).map((task) => task.id)).toEqual(['c', 'd', 'b', 'f', 'e', 'a']);
    });

    it('accepts no filter object at all', () => {
        expect(selectTasks([{ id: 'x', title: 'Only' }])).toEqual([{ id: 'x', title: 'Only' }]);
    });

    it('searches titles and descriptions case-insensitively, ignoring surrounding spaces', () => {
        expect(selectTasks(tasks, { query: '  SUPPLIER ', today }).map((task) => task.id)).toEqual(['b']);
        expect(selectTasks(tasks, { query: 'alpha', today }).map((task) => task.id)).toEqual(['b', 'f']);
    });

    it('filters by an explicit status or by the derived overdue state', () => {
        expect(selectTasks(tasks, { status: 'overdue', today }).map((task) => task.id)).toEqual(['c']);
        expect(selectTasks(tasks, { status: 'done', today }).map((task) => task.id)).toEqual(['d']);
    });

    it('treats a missing priority as normal when filtering', () => {
        expect(selectTasks(tasks, { priority: 'normal', today }).map((task) => task.id)).toEqual(['c']);
        expect(selectTasks(tasks, { priority: 'low', today }).map((task) => task.id)).toEqual(['a']);
    });

    it('narrows to the linked objective, contact or a single task', () => {
        expect(selectTasks(tasks, { objective: 'obj1', today }).map((task) => task.id)).toEqual(['c']);
        expect(selectTasks(tasks, { contact: 'con1', today }).map((task) => task.id)).toEqual(['c']);
        expect(selectTasks(tasks, { task: 'e', today }).map((task) => task.id)).toEqual(['e']);
        expect(selectTasks(tasks, { objective: 'missing', today })).toEqual([]);
    });
});

describe('contentOutline', () => {
    it('fills every placeholder when the brief is empty and falls back to the blog body', () => {
        const outline = contentOutline({});
        expect(outline).toContain('# Working title');
        expect(outline).toContain('Audience: [Describe the reader]');
        expect(outline).toContain('[State the problem and facts you can support]');
        expect(outline).toContain('## The reader’s problem');
        expect(outline.endsWith('## Next step\n[Give one clear, optional next action.]')).toBe(true);
    });

    it('uses the trimmed author input and the requested format body', () => {
        const outline = contentOutline({ format: 'tutorial', title: '  Fix a leak ', audience: ' Renters ', brief: ' Water drips. ', call_to_action: ' Book a visit ' });
        expect(outline.startsWith('# Fix a leak\n\nAudience: Renters\n\nWater drips.')).toBe(true);
        expect(outline).toContain('## Worked example');
        expect(outline.endsWith('## Next step\nBook a visit')).toBe(true);
    });

    it('builds the social scaffold and treats unknown formats as a blog', () => {
        expect(contentOutline({ format: 'social' })).toContain('## Hook');
        expect(contentOutline({ format: 'podcast' })).toContain('## Evidence and limits');
    });
});

describe('draftBlocks', () => {
    it('returns nothing for empty or missing bodies', () => {
        expect(draftBlocks(undefined)).toEqual([]);
        expect(draftBlocks('\n\n   \n\n')).toEqual([]);
    });

    it('splits headings, lists and paragraphs, normalizing Windows line endings', () => {
        const body = '# Title\r\n\r\n- one\r\n* two\r\n\r\n1. first\r\n2. second\r\n\r\nPlain line\r\nsecond line\r\n\r\n#### too deep';
        expect(draftBlocks(body)).toEqual([
            { kind: 'heading', text: 'Title' },
            { kind: 'unordered', items: ['one', 'two'] },
            { kind: 'ordered', items: ['first', 'second'] },
            { kind: 'paragraph', text: 'Plain line\nsecond line' },
            { kind: 'paragraph', text: '#### too deep' },
        ]);
    });

    it('treats a heading followed by body text in one chunk as a paragraph', () => {
        expect(draftBlocks('## Heading\nbody')).toEqual([{ kind: 'paragraph', text: '## Heading\nbody' }]);
    });
});

describe('publicationUrl', () => {
    it('returns the normalized HTTPS link', () => {
        expect(publicationUrl('https://example.com/post')).toBe('https://example.com/post');
    });

    it('rejects non-strings, overlong values, whitespace, unparsable text, plain HTTP and embedded credentials', () => {
        expect(publicationUrl(null)).toBe('');
        expect(publicationUrl(`https://example.com/${'a'.repeat(2048)}`)).toBe('');
        expect(publicationUrl('https://example.com/a b')).toBe('');
        expect(publicationUrl('not a url'.replace(/ /g, ''))).toBe('');
        expect(publicationUrl('http://example.com')).toBe('');
        expect(publicationUrl('https://user:pass@example.com')).toBe('');
        expect(publicationUrl('https://user@example.com')).toBe('');
    });
});

describe('retainedFields', () => {
    it('confirms a saved record kept every submitted field, comparing dates by calendar day', () => {
        expect(retainedFields({ id: 'r1', title: 'Plan', due_date: '2026-05-01 00:00:00.000Z' }, { title: 'Plan', due_date: '2026-05-01' })).toBe(true);
        expect(retainedFields({ id: 'r1', scheduled_for: '2026-05-02 00:00:00.000Z' }, { scheduled_for: '2026-05-02' })).toBe(true);
    });

    it('fails when the record has no identity', () => {
        expect(retainedFields(null, {})).toBe(false);
        expect(retainedFields({ title: 'Plan' }, { title: 'Plan' })).toBe(false);
    });

    it('fails when the schema dropped or changed a field', () => {
        expect(retainedFields({ id: 'r1' }, { title: 'Plan' })).toBe(false);
        expect(retainedFields({ id: 'r1', due_date: '2026-05-02' }, { due_date: '2026-05-01' })).toBe(false);
        expect(retainedFields({ id: 'r1', due_date: null }, { due_date: '' })).toBe(false);
    });
});
