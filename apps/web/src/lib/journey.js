// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/journey.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-JOURNEY-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-JOURNEY-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/lib/missionLearning.js, apps/pocketbase/pb_migrations/data/starter-tutorials.json
// EnumType:    Service
// EnumEdges:   DEPENDS_ON apps/web/src/lib/missionLearning.js; PRODUCES apps/web/src/pages/workspace/JourneyPage.jsx
// DAG Node:    none
// Intent:      Turn five multiple-choice answers into one first lesson and one proposed mission draft, leaving the measurements only the person can supply.
// ───────────────────────────────────────────────────────────────

import { emptyPlan, planIssues } from './missionLearning.js';

/** The Guildmaster interview, one choice at a time. */
export const JOURNEY_QUESTIONS = Object.freeze([
    { id: 'mode', prompt: 'What brought you here today?', choices: [
        { id: 'build', label: 'I want to build', hint: 'Learn a skill or make something new.' },
        { id: 'do', label: 'I want to do', hint: 'Get a piece of real work finished.' },
    ] },
    { id: 'area', prompt: 'Which kind of work?', choices: [
        { id: 'software', label: 'Software and delivery', hint: 'Code, tests, pipelines, releases.' },
        { id: 'content', label: 'Content and publishing', hint: 'Writing, teaching, social posts.' },
        { id: 'operations', label: 'Business operations', hint: 'Objectives, tasks, contacts, reviews.' },
        { id: 'security', label: 'Security and risk', hint: 'Access, untrusted input, rollback.' },
        { id: 'automation', label: 'AI and automation', hint: 'Workflows and agents with approval steps.' },
    ] },
    { id: 'experience', prompt: 'How familiar is this for you?', choices: [
        { id: 'new', label: 'New to me', hint: 'Start with the basics.' },
        { id: 'some', label: 'I have done some', hint: 'Practise on something real.' },
        { id: 'experienced', label: 'I do this often', hint: 'Prove it with evidence.' },
    ] },
    { id: 'time', prompt: 'How much time do you have for the first mission?', choices: [
        { id: 'hour', label: 'About an hour' },
        { id: 'day', label: 'A day' },
        { id: 'week', label: 'A week' },
    ] },
    { id: 'proof', prompt: 'Who will check the result?', choices: [
        { id: 'self', label: 'I will check it myself', hint: 'Your review stays your own claim.' },
        { id: 'reviewer', label: 'Someone else will review it', hint: 'Needed before the work counts as verified.' },
    ] },
]);

// Lesson slugs come from the shipped curriculum (starter-tutorials.json).
const LESSON = {
    software: { new: ['welcome-to-buildanddo', 'Welcome to BuildAndDo'], some: ['designing-tevv', 'Designing tests, evaluation, verification and validation'], experienced: ['release-with-evidence', 'Release with evidence'] },
    content: { new: ['audience-and-content-brief', 'Audience and content brief'], some: ['blog-from-brief', 'From brief to blog post'], experienced: ['evaluate-content-outcomes', 'Evaluate content outcomes'] },
    operations: { new: ['measurable-objectives', 'Define a measurable objective'], some: ['objectives-into-tasks', 'Break an objective into tasks'], experienced: ['weekly-operations-review', 'Weekly operations review'] },
    security: { new: ['risk-and-rollback', 'Risk and rollback'], some: ['owasp-in-workspace-flows', 'OWASP in workspace flows'], experienced: ['owasp-in-workspace-flows', 'OWASP in workspace flows'] },
    automation: { new: ['workflow-approval-checkpoints', 'Workflow approval checkpoints'], some: ['failed-runs-and-retries', 'Failed runs and retries'], experienced: ['release-with-evidence', 'Release with evidence'] },
};

const SUBJECT = {
    software: ['a small change to a service or script', 'the people who use or maintain it'],
    content: ['one piece of content for a named audience', 'the readers the content is for'],
    operations: ['one business objective broken into tasks', 'the team that owns the objective'],
    security: ['one access or input check on an existing flow', 'the people whose data the flow handles'],
    automation: ['one workflow step with an approval checkpoint', 'the person who approves the step'],
};
const SPAN = { hour: 'within one hour', day: 'within one working day', week: 'within one week' };

/** Return a choice label, or throw when an answer is not one of the listed choices. */
function choice(answers, id) {
    const question = JOURNEY_QUESTIONS.find((item) => item.id === id);
    const picked = question.choices.find((item) => item.id === answers?.[id]);
    if (!picked) throw new TypeError(`Answer "${id}" is missing or not a listed choice.`);
    return picked;
}

/** Report whether every question has a listed answer. */
export function journeyComplete(answers) {
    return JOURNEY_QUESTIONS.every((question) => question.choices.some((item) => item.id === answers?.[question.id]));
}

/** Compile answers into a lesson link and a proposed mission draft.
 * @param {object} answers One listed choice id per question.
 * @returns {{lesson: object, mission: object, remaining: string[], summary: string}} A draft; nothing is saved.
 */
export function compileJourney(answers) {
    const mode = choice(answers, 'mode').id; const area = choice(answers, 'area').id;
    const experience = choice(answers, 'experience').id; const time = choice(answers, 'time').id;
    const reviewer = choice(answers, 'proof').id === 'reviewer';
    const [slug, title] = LESSON[area][experience];
    const [what, who] = SUBJECT[area];
    const verb = mode === 'build' ? 'Build' : 'Complete';
    const plan = {
        ...emptyPlan(),
        risk: experience === 'new' ? 'A0' : 'A1',
        independent_review: reviewer,
        purpose: `${verb} ${what} ${SPAN[time]}, so the result can be shown rather than described.`,
        beneficiary: `${who[0].toUpperCase()}${who.slice(1)}.`,
        in_scope: `${what[0].toUpperCase()}${what.slice(1)} in this workspace, using synthetic or permitted data.`,
        out_of_scope: 'Production systems, other people\'s records and anything outside this workspace.',
        authorization: reviewer ? 'A named reviewer other than me approves the plan and checks the result.' : 'I approve and check my own work; the result stays a self-reported claim.',
        input_validation: 'Treat pasted text, retrieved content and model output as untrusted; check shape and length before use.',
        data_handling: 'No secrets or personal data in evidence or logs.',
        rollback: 'Stop if the result is worse than the baseline or anything outside scope changes; restore the saved prior state.',
        test: 'Try one normal case, one boundary case and one failure case, and write down what happened.',
        evaluate: 'Compare the observed result with the baseline and the success criterion recorded before starting.',
        verify: 'Link the source record, the steps followed and the observed result to this mission.',
        validate: `Ask ${who} whether the result is useful to them.`,
        // Only the person can measure where they start and decide what success is.
        baseline: '',
        target: '',
    };
    const mission = {
        title: `${verb}: ${what}`.slice(0, 200),
        description: `Compiled from the Guildmaster interview: ${mode}, ${area}, ${experience}, ${time}, ${reviewer ? 'independent review' : 'self review'}. First lesson: ${title}. Edit anything that does not fit.`,
        priority: 'normal',
        status: 'proposed',
        mission_plan: plan,
    };
    return {
        lesson: { slug, title, to: `/app/tutorials?lesson=${encodeURIComponent(slug)}` },
        mission,
        remaining: planIssues(plan),
        summary: `I want to ${mode} in ${choice(answers, 'area').label.toLowerCase()}; it is ${choice(answers, 'experience').label.toLowerCase()}; I have ${choice(answers, 'time').label.toLowerCase()}; ${reviewer ? 'someone else will review it' : 'I will check it myself'}.`,
    };
}

/** The message a person can send to the assistant to refine the compiled draft. */
export function assistantDraft(compiled) {
    return `Guildmaster interview answers: ${compiled.summary} My first lesson is "${compiled.lesson.title}" and my draft mission is "${compiled.mission.title}". Help me choose a baseline I can measure and a success criterion someone could check.`;
}
