// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/__tests__/tutorialCurriculum.behavior.test.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-TRUST-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001, VCC-BUILDANDDO-TRUST-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-27
// Depends:     apps/web/src/lib/tutorialCurriculum.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/tutorialCurriculum.js
// DAG Node:    none
// Intent:      Prove lesson validation rejects unbounded or malformed bodies, public
//              lessons never carry earned answers, links stay safe, and catalogue
//              merging and progress selection never invent persistence.
// ───────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import { lessonLink, lessonProgress, mergeTutorials, publicCurriculum, publicLesson, selectTutorials, validLesson } from '@/lib/tutorialCurriculum';

const lesson = () => ({
    schema_version: 1,
    outcomes: ['Name the loop.'],
    why: 'Evidence beats dashboards.',
    preparation: ['Open a test workspace.'],
    sections: [{ heading: 'Idea', paragraphs: ['Observe first.'] }, { heading: 'Try it', steps: ['Open Overview.'] }],
    exercise: { prompt: 'Write one observation.', checklist: ['Source named.'] },
    check: { question: 'Which comes first?', choices: ['Observe', 'Act'], answer: 0, explanation: 'You observe before acting.' },
    references: [{ label: 'Guide', url: '/learn/guide' }, { label: 'Docs', url: 'https://example.com/docs' }],
});
const mutate = (change) => { const value = lesson(); change(value); return value; };

describe('validLesson', () => {
    it('accepts a complete bounded lesson, with or without the earned answer and explanation', () => {
        expect(validLesson(lesson())).toBe(true);
        expect(validLesson(mutate((value) => { delete value.check.answer; delete value.check.explanation; }))).toBe(true);
        expect(validLesson(mutate((value) => { value.references = []; }))).toBe(true);
    });

    it('rejects missing bodies and unsupported schema versions', () => {
        expect(validLesson(null)).toBe(false);
        expect(validLesson('lesson')).toBe(false);
        expect(validLesson(mutate((value) => { value.schema_version = 2; }))).toBe(false);
    });

    it('rejects empty, oversized or non-text string lists', () => {
        expect(validLesson(mutate((value) => { value.outcomes = []; }))).toBe(false);
        expect(validLesson(mutate((value) => { value.outcomes = 'Name the loop.'; }))).toBe(false);
        expect(validLesson(mutate((value) => { value.outcomes = Array(21).fill('x'); }))).toBe(false);
        expect(validLesson(mutate((value) => { value.outcomes = ['  ']; }))).toBe(false);
        expect(validLesson(mutate((value) => { value.outcomes = [7]; }))).toBe(false);
        expect(validLesson(mutate((value) => { value.outcomes = ['x'.repeat(5001)]; }))).toBe(false);
        expect(validLesson(mutate((value) => { value.preparation = []; }))).toBe(false);
    });

    it('rejects a missing, blank or oversized rationale', () => {
        expect(validLesson(mutate((value) => { value.why = undefined; }))).toBe(false);
        expect(validLesson(mutate((value) => { value.why = ' '; }))).toBe(false);
        expect(validLesson(mutate((value) => { value.why = 'x'.repeat(5001); }))).toBe(false);
    });

    it('rejects sections without a bounded heading or any readable content', () => {
        expect(validLesson(mutate((value) => { value.sections = []; }))).toBe(false);
        expect(validLesson(mutate((value) => { value.sections = 'Idea'; }))).toBe(false);
        expect(validLesson(mutate((value) => { value.sections = Array(21).fill({ heading: 'H', steps: ['s'] }); }))).toBe(false);
        expect(validLesson(mutate((value) => { value.sections = [null]; }))).toBe(false);
        expect(validLesson(mutate((value) => { value.sections = [{ heading: 3, steps: ['s'] }]; }))).toBe(false);
        expect(validLesson(mutate((value) => { value.sections = [{ heading: ' ', steps: ['s'] }]; }))).toBe(false);
        expect(validLesson(mutate((value) => { value.sections = [{ heading: 'x'.repeat(201), steps: ['s'] }]; }))).toBe(false);
        expect(validLesson(mutate((value) => { value.sections = [{ heading: 'H', paragraphs: [] }]; }))).toBe(false);
        expect(validLesson(mutate((value) => { value.sections = [{ heading: 'H', steps: [] }]; }))).toBe(false);
        expect(validLesson(mutate((value) => { value.sections = [{ heading: 'H' }]; }))).toBe(false);
    });

    it('rejects an exercise without a bounded prompt and checklist', () => {
        expect(validLesson(mutate((value) => { value.exercise = undefined; }))).toBe(false);
        expect(validLesson(mutate((value) => { value.exercise.prompt = 5; }))).toBe(false);
        expect(validLesson(mutate((value) => { value.exercise.prompt = ''; }))).toBe(false);
        expect(validLesson(mutate((value) => { value.exercise.prompt = 'x'.repeat(5001); }))).toBe(false);
        expect(validLesson(mutate((value) => { value.exercise.checklist = []; }))).toBe(false);
    });

    it('rejects a knowledge check with a bad question, choices, answer or explanation', () => {
        expect(validLesson(mutate((value) => { value.check = undefined; }))).toBe(false);
        expect(validLesson(mutate((value) => { value.check.question = null; }))).toBe(false);
        expect(validLesson(mutate((value) => { value.check.question = ' '; }))).toBe(false);
        expect(validLesson(mutate((value) => { value.check.question = 'x'.repeat(5001); }))).toBe(false);
        expect(validLesson(mutate((value) => { value.check.choices = ['Only one']; }))).toBe(false);
        expect(validLesson(mutate((value) => { value.check.choices = Array(7).fill('c'); }))).toBe(false);
        expect(validLesson(mutate((value) => { value.check.answer = 1.5; }))).toBe(false);
        expect(validLesson(mutate((value) => { value.check.answer = -1; }))).toBe(false);
        expect(validLesson(mutate((value) => { value.check.answer = 2; }))).toBe(false);
        expect(validLesson(mutate((value) => { value.check.explanation = 4; }))).toBe(false);
        expect(validLesson(mutate((value) => { value.check.explanation = ' '; }))).toBe(false);
        expect(validLesson(mutate((value) => { value.check.explanation = 'x'.repeat(5001); }))).toBe(false);
    });

    it('rejects missing, excessive or unsafe references', () => {
        expect(validLesson(mutate((value) => { value.references = undefined; }))).toBe(false);
        expect(validLesson(mutate((value) => { value.references = Array(13).fill({ label: 'L', url: '/a' }); }))).toBe(false);
        expect(validLesson(mutate((value) => { value.references = [null]; }))).toBe(false);
        expect(validLesson(mutate((value) => { value.references = [{ label: 1, url: '/a' }]; }))).toBe(false);
        expect(validLesson(mutate((value) => { value.references = [{ label: 'L', url: 1 }]; }))).toBe(false);
        expect(validLesson(mutate((value) => { value.references = [{ label: 'L', url: 'javascript:alert(1)' }]; }))).toBe(false);
    });
});

describe('publicLesson', () => {
    it('removes the answer and explanation but keeps the question and choices', () => {
        const body = lesson();
        const visible = publicLesson(body);
        expect(visible.check).toEqual({ question: 'Which comes first?', choices: ['Observe', 'Act'] });
        expect(visible.outcomes).toEqual(body.outcomes);
        expect(body.check.answer).toBe(0);
    });

    it('returns bodies without a structured check unchanged', () => {
        expect(publicLesson(null)).toBeNull();
        expect(publicLesson('legacy text')).toBe('legacy text');
        const list = [{ check: {} }];
        expect(publicLesson(list)).toBe(list);
        const noCheck = { outcomes: ['x'] };
        expect(publicLesson(noCheck)).toBe(noCheck);
        const textCheck = { check: 'answer is 0' };
        expect(publicLesson(textCheck)).toBe(textCheck);
    });
});

describe('publicCurriculum', () => {
    it('reduces every lesson in an authored file to its public body', () => {
        const file = { version: '2026.09.1', lessons: [{ slug: 'a', lesson: lesson() }, { slug: 'b', lesson: '' }] };
        const visible = publicCurriculum(file);
        expect(visible.version).toBe('2026.09.1');
        expect(visible.lessons[0].slug).toBe('a');
        expect(visible.lessons[0].lesson.check).not.toHaveProperty('answer');
        expect(visible.lessons[0].lesson.check).not.toHaveProperty('explanation');
        expect(visible.lessons[1].lesson).toBe('');
        expect(file.lessons[0].lesson.check.answer).toBe(0);
    });
});

describe('lessonLink', () => {
    it('keeps local paths and HTTPS links', () => {
        expect(lessonLink('/learn/a')).toBe('/learn/a');
        expect(lessonLink('https://example.com/a')).toBe('https://example.com/a');
    });

    it('rejects protocol-relative, unsafe, credentialed, malformed and oversized values', () => {
        expect(lessonLink(undefined)).toBe('');
        expect(lessonLink(`/${'a'.repeat(2048)}`)).toBe('');
        expect(lessonLink('/a b')).toBe('');
        expect(lessonLink('/a\\b')).toBe('');
        expect(lessonLink('//evil.example')).toBe('');
        expect(lessonLink('http://example.com')).toBe('');
        expect(lessonLink('https://u:p@example.com')).toBe('');
        expect(lessonLink('https://u@example.com')).toBe('');
        expect(lessonLink('relative/path')).toBe('');
    });
});

describe('mergeTutorials', () => {
    const seeds = [
        { id: 'seed1', slug: 'welcome', title: 'Welcome', legacy_summary: 'Old summary', order: 1, lesson: { seeded: 1 } },
        { id: 'seed2', slug: 'second', title: 'Second', order: 2, lesson: { seeded: 2 } },
        { id: 'seed3', slug: 'third', title: 'Third', legacy_summary: 'Third old', order: 3, lesson: { seeded: 3 } },
        { id: 'seed4', slug: 'fourth', title: 'Fourth', order: 4, lesson: { seeded: 4 } },
    ];

    it('binds seeds to saved records by slug, id or legacy identity and keeps the saved body when present', () => {
        const saved = [
            { id: 'rec1', slug: 'welcome', lesson: { saved: 1 } },
            { id: 'seed2', lesson: '' },
            { id: 'rec3', title: 'Third', summary: 'Third old', order: 3, lesson: null },
            { id: 'extra', title: 'Custom', lesson: { saved: 'x' } },
        ];
        const catalogue = mergeTutorials(saved, seeds);
        expect(catalogue.map((entry) => [entry.catalogueKey, entry.persistedId, entry.starter])).toEqual([
            ['welcome', 'rec1', true], ['second', 'seed2', true], ['third', 'rec3', true], ['fourth', '', true], ['extra', 'extra', false],
        ]);
        expect(catalogue[0].lesson).toEqual({ saved: 1 });
        expect(catalogue[1].lesson).toEqual({ seeded: 2 });
        expect(catalogue[2].lesson).toEqual({ seeded: 3 });
        expect(catalogue[3].lesson).toEqual({ seeded: 4 });
        expect(catalogue[4].lesson).toEqual({ saved: 'x' });
    });

    it('does not bind a legacy record whose slug is already set', () => {
        const catalogue = mergeTutorials([{ id: 'other', slug: 'elsewhere', title: 'Third', summary: 'Third old', order: 3 }], seeds);
        expect(catalogue[2].persistedId).toBe('');
        expect(catalogue.at(-1)).toMatchObject({ catalogueKey: 'other', starter: false });
    });
});

describe('lessonProgress', () => {
    it('returns nothing without a persisted lesson id', () => {
        expect(lessonProgress([{ tutorial: '', status: 'completed' }], '')).toBeUndefined();
    });

    it('chooses the most advanced progress for the lesson, newest first on ties', () => {
        const records = [
            { id: 'p1', tutorial: 't1', status: 'in_progress', updated: '2026-01-02' },
            { id: 'p2', tutorial: 't1', status: 'in_progress', created: '2026-01-03' },
            { id: 'p3', tutorial: 't1', status: 'mystery' },
            { id: 'p4', tutorial: 't2', status: 'completed', updated: '2026-02-01' },
        ];
        expect(lessonProgress(records, 't1').id).toBe('p2');
        expect(lessonProgress([...records, { id: 'p5', tutorial: 't1', status: 'completed' }], 't1').id).toBe('p5');
        expect(lessonProgress([{ id: 'u', tutorial: 't1', status: 'unknown' }, { id: 'n', tutorial: 't1', status: 'not_started', updated: '2026-01-01' }], 't1').id).toBe('n');
        expect(lessonProgress(records, 't9')).toBeUndefined();
    });
});

describe('selectTutorials', () => {
    const lessons = [
        { title: 'Welcome', summary: 'Start here', category: 'Foundations' },
        { title: 'Invoices', category: 'Finance' },
        { summary: 'Untitled draft' },
    ];

    it('returns everything without filters', () => {
        expect(selectTutorials(lessons)).toHaveLength(3);
    });

    it('filters by category and by a trimmed, case-insensitive search across title, summary and category', () => {
        expect(selectTutorials(lessons, { category: 'Finance' }).map((entry) => entry.title)).toEqual(['Invoices']);
        expect(selectTutorials(lessons, { query: '  FOUNDATIONS ' }).map((entry) => entry.title)).toEqual(['Welcome']);
        expect(selectTutorials(lessons, { query: 'draft' })).toEqual([lessons[2]]);
        expect(selectTutorials(lessons, { category: 'Finance', query: 'welcome' })).toEqual([]);
    });
});
