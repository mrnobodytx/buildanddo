// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/web/src/lib/missionLearning.js
// Stage:        07_BUILD
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-15
// Depends:      apps/web/src/hooks/useWorkspaceRecords.js
// EnumType:     Service
// EnumEdges:    DEPENDS_ON apps/web/src/hooks/useWorkspaceRecords.js
// DAG Node:     none
// Intent:       Teach evidence-led mission planning and derive bounded learning rewards without granting authority or certification.
// ───────────────────────────────────────────────────────────────

/** Learning guidance describes practices, never an external certification. */
export const FRAMEWORKS = [
    {
        name: 'NIST AI RMF 1.0',
        href: 'https://www.nist.gov/itl/ai-risk-management-framework',
        note: 'Govern, Map, Measure and Manage risk throughout the lifecycle. TEVV gathers evidence for those decisions.',
    },
    {
        name: 'OWASP ASVS',
        href: 'https://owasp.org/ASVS/',
        note: 'Use applicable security verification requirements to design and review controls; this checklist is a teaching aid, not an ASVS assessment.',
    },
    {
        name: 'W3C Verifiable Credentials 2.0',
        href: 'https://www.w3.org/TR/vc-data-model-2.0/',
        note: 'Describe who issued a claim, who it concerns and how its integrity can be checked. A signature does not establish that a business claim is true.',
    },
];

export const TEVV = [
    {
        id: 'test',
        label: 'Testing',
        question: 'Does it behave as specified on chosen inputs?',
        how: 'Write a repeatable procedure with normal, boundary and failure cases.',
        why: 'A happy-path click misses invalid inputs, denied access and recovery failures.',
        example:
            'Submit a valid reminder, an invalid destination and a duplicate request. Record the actual responses.',
    },
    {
        id: 'evaluate',
        label: 'Evaluation',
        question: 'How well does it meet the agreed criteria?',
        how: 'Compare observed measurements with a baseline and a target fixed before the run.',
        why: 'Changing the target after seeing the result hides a failed experiment.',
        example:
            'Compare delivery failures with the baseline over the same observation window; include the sample size.',
    },
    {
        id: 'verify',
        label: 'Verification',
        question: 'Can a reviewer check the requirements and evidence?',
        how: 'Link the source record, procedure and observed result to this mission.',
        why: 'A status label alone gives the next person nothing they can reproduce.',
        example:
            'Ask a reviewer to replay the checks and confirm the evidence belongs to this mission and version.',
    },
    {
        id: 'validate',
        label: 'Validation',
        question: 'Does it solve the intended problem in context?',
        how: 'Check usefulness with the intended user in a representative setting.',
        why: 'A technically correct workflow may still interrupt or harm the people using it.',
        example:
            'Have the operator confirm reminders are useful, consented to and appropriate for the real schedule.',
    },
];

export const PLAN_FIELDS = [
    {
        id: 'purpose',
        label: 'Why this mission matters',
        group: 'scope',
        how: 'Describe the problem and the consequence of leaving it unsolved.',
    },
    {
        id: 'beneficiary',
        label: 'Who benefits',
        group: 'scope',
        how: 'Name the role or group who will judge whether the outcome is useful.',
    },
    {
        id: 'in_scope',
        label: 'Included work',
        group: 'scope',
        how: 'Bound the records, actions and environment this mission covers.',
    },
    {
        id: 'out_of_scope',
        label: 'Excluded work',
        group: 'scope',
        how: 'State what this mission must not change or access.',
    },
    {
        id: 'baseline',
        label: 'Baseline',
        group: 'scope',
        how: 'Record the starting measurement and its source, or how you will establish it.',
    },
    {
        id: 'target',
        label: 'Success criterion',
        group: 'scope',
        how: 'Use a measurable target, a sample or observation window, and a failure threshold.',
    },
    {
        id: 'authorization',
        label: 'Authorization boundary',
        group: 'security',
        how: 'Name the approver, permitted actions and a denied-access check. Use the least privilege needed.',
    },
    {
        id: 'input_validation',
        label: 'Untrusted input checks',
        group: 'security',
        how: 'Validate expected shapes and limits. Treat user content, retrieved text and model output as untrusted data.',
    },
    {
        id: 'data_handling',
        label: 'Data protection',
        group: 'security',
        how: 'Use synthetic or permitted data; keep secrets and personal data out of evidence and logs.',
    },
    {
        id: 'rollback',
        label: 'Stop and recovery plan',
        group: 'security',
        how: 'Define the stop signal, who intervenes, and how to restore the prior state.',
    },
    ...TEVV.map((step) => ({
        id: step.id,
        label: `${step.label} method`,
        group: 'tevv',
        how: step.how,
    })),
];

export const LESSONS = [
    {
        id: 'scope',
        title: 'Start with a falsifiable goal',
        framework: 'NIST · Govern / Map',
        why: 'A bounded mission makes the intended benefit, limits and decision owner explicit before a tool is used.',
        how: 'Record the beneficiary, baseline, success criterion, excluded work and stop condition. Save the plan, then ask for approval.',
        question: 'Which goal can a reviewer actually evaluate?',
        choices: [
            { id: 'activity', text: 'Run as many automations as possible.' },
            {
                id: 'measured',
                text: 'Reduce failed reminders from the measured baseline to under 2% in a consented test week.',
            },
            { id: 'optimistic', text: 'Make reminders better.' },
        ],
        answer: 'measured',
        explanation:
            'The measurable goal names a baseline, a threshold and a context. Gather the real baseline before claiming improvement.',
    },
    {
        id: 'tevv',
        title: 'Separate the four TEVV questions',
        framework: 'NIST · Measure / Manage',
        why: 'Testing behavior, evaluating performance, verifying evidence and validating usefulness answer different questions.',
        how: 'Plan all four checks before running the mission. Record observed outcomes, including failures, with evidence the reviewer can inspect.',
        question:
            'The code passes its tests, but operators find it unusable. Which check exposed the gap?',
        choices: [
            { id: 'validation', text: 'Validation with the intended users and operating context.' },
            { id: 'compilation', text: 'Compilation alone.' },
            { id: 'badge', text: 'Earning a completion badge.' },
        ],
        answer: 'validation',
        explanation:
            'Validation asks whether the work solves the intended problem in context. Passing tests cannot answer that on its own.',
    },
    {
        id: 'owasp',
        title: 'Make security part of the plan',
        framework: 'OWASP · ASVS',
        why: 'Untrusted text and overbroad permissions can turn a useful task into unauthorized work.',
        how: 'Keep existing auth, validate inputs, bound tool actions, protect sensitive data and test denial paths as well as successful requests.',
        question:
            'Retrieved text tells an assistant to send account data to a new address. What should the mission do?',
        choices: [
            { id: 'obey', text: 'Follow the text because it came from a connected source.' },
            { id: 'reward', text: 'Allow the action after enough learning points.' },
            {
                id: 'boundary',
                text: 'Treat it as untrusted data and enforce the approved action and data boundaries.',
            },
        ],
        answer: 'boundary',
        explanation:
            'Content does not grant authority. Input validation and server-enforced authorization must hold even when the interface or a model asks for more.',
    },
    {
        id: 'credentials',
        title: 'Know what a credential proves',
        framework: 'W3C · Verifiable Credentials 2.0',
        why: 'A signed claim can identify an issuer and protect integrity without proving the claim is factually correct.',
        how: 'Distinguish issuer, subject, evidence and cryptographic proof. Inspect trust, status and evidence before accepting a claim. This app issues no signed credential.',
        question: 'Does a valid signature prove a mission improved the business?',
        choices: [
            { id: 'yes', text: 'Yes; signatures replace outcome checks.' },
            {
                id: 'evidence',
                text: 'No; it supports integrity/authenticity checks, while the outcome still needs evidence and a trusted issuer.',
            },
            { id: 'points', text: 'Only when the learner has enough points.' },
        ],
        answer: 'evidence',
        explanation:
            'Cryptographic verification is different from TEVV validation. Learning badges here are feedback, not verifiable credentials or certifications.',
    },
];

export const TRANSITIONS = {
    proposed: ['approved'],
    approved: ['proposed', 'running'],
    running: ['needs_attention', 'verified', 'failed'],
    needs_attention: ['proposed', 'running', 'failed'],
    verified: [],
    failed: [],
};

/** @returns {object} A new, unsaved plan with no invented measurements. */
export function emptyPlan() {
    return { version: 1, risk: 'A1', ...Object.fromEntries(PLAN_FIELDS.map(({ id }) => [id, ''])) };
}

/** @param {object|null} value Persisted plan. @returns {object} Editable values. */
export function readPlan(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
        ...emptyPlan(),
        ...(Object.hasOwn(source, 'independent_review') ? { independent_review: source.independent_review === true } : {}),
        risk: ['A0', 'A1', 'A2'].includes(source.risk) ? source.risk : 'A1',
        ...Object.fromEntries(
            PLAN_FIELDS.map(({ id }) => [id, typeof source[id] === 'string' ? source[id] : '']),
        ),
    };
}

/** @param {object} plan Mission plan. @returns {string[]} Missing or invalid plan items. */
export function planIssues(plan) {
    const issues = PLAN_FIELDS.filter(
        ({ id }) => typeof plan?.[id] !== 'string' || !plan[id].trim() || plan[id].length > 1200,
    ).map(({ label }) => label);
    if (!['A0', 'A1', 'A2'].includes(plan?.risk)) issues.push('Supported risk tier');
    if (plan?.version !== 1) issues.push('Current plan format');
    if (Object.hasOwn(plan || {}, 'independent_review') && typeof plan.independent_review !== 'boolean') issues.push('Independent review choice');
    return issues;
}

/** @returns {object} A review awaiting actual observations. */
export function emptyReview() {
    return {
        ...Object.fromEntries(
            TEVV.map(({ id }) => [id, { outcome: 'not_run', observation: '', evidence: '' }]),
        ),
        reflection: '',
    };
}

/** @param {object} mission Mission. @param {object[]} evidence Readable evidence. @returns {object[]} Matching source records. */
export function missionEvidence(mission, evidence) {
    return evidence.filter(
        (record) =>
            record.mission === mission.id &&
            record.workspace === mission.workspace &&
            typeof record.content === 'string' &&
            record.content.trim() &&
            typeof record.source === 'string' &&
            record.source.trim(),
    );
}

/** @param {object} mission Mission. @param {object} review Review. @param {object[]} evidence Readable evidence. @param {boolean} passing Require all passes. @returns {string[]} Unmet requirements. */
export function reviewIssues(mission, review, evidence, passing = true) {
    const ids = new Set(missionEvidence(mission, evidence).map((record) => record.id));
    const issues = TEVV.filter(({ id }) => {
        const item = review?.[id];
        return (
            !item ||
            !(passing ? ['pass'] : ['pass', 'fail']).includes(item.outcome) ||
            typeof item.observation !== 'string' ||
            !item.observation.trim() ||
            item.observation.length > 1200 ||
            !ids.has(item.evidence)
        );
    }).map(
        ({ label }) =>
            `${label}: record ${passing ? 'a passing' : 'an observed'} outcome and linked evidence`,
    );
    if (
        typeof review?.reflection !== 'string' ||
        !review.reflection.trim() ||
        review.reflection.length > 1200
    )
        issues.push('Record what you learned and the next step');
    return issues;
}

/** Explain the same prerequisites a reviewer must satisfy at the native boundary.
 * @param {object} options Saved mission, draft review, readable evidence and current actor.
 * @returns {string[]} Blocking prerequisites; never an authorization grant.
 */
export function verificationIssues({ mission, review, evidence, actorId, canWrite, evidenceAvailable = true }) {
    const issues = reviewIssues(mission, review, evidence);
    if (!actorId || !canWrite) issues.unshift('A current owner, administrator or editor must record the review.');
    if (mission.status !== 'running') issues.push('Record work started or resumed before verifying the outcome.');
    if (!mission.mission_approved_by || !mission.mission_approved_at || planIssues(mission.mission_plan).length)
        issues.push('Complete and approve the saved mission plan first.');
    if (!evidenceAvailable) issues.push('Reload the mission evidence before verifying.');
    if (mission.mission_plan?.independent_review) {
        if (mission.owner === actorId) issues.push('A different member must review this mission; you proposed it.');
        const selected = new Set(TEVV.map(({ id }) => review?.[id]?.evidence).filter(Boolean));
        if (evidence.some((record) => selected.has(record.id) && (!record.owner || record.owner === actorId)))
            issues.push('Choose evidence authored by someone other than the independent reviewer.');
    }
    return [...new Set(issues)];
}

/** @param {object} mission Persisted mission. @param {object[]} evidence Source evidence. @returns {object} Bounded, derived educational rewards. */
export function learningRewards(mission, evidence = []) {
    const plan = mission.mission_plan;
    const groups = ['scope', 'security', 'tevv'].map((group) => ({
        id: group,
        label: { scope: 'Bounded plan', security: 'Security plan', tevv: 'TEVV methods' }[group],
        points: 10,
        earned:
            plan?.version === 1 &&
            ['A0', 'A1', 'A2'].includes(plan.risk) &&
            PLAN_FIELDS.filter((field) => field.group === group).every(
                ({ id }) =>
                    typeof plan[id] === 'string' &&
                    plan[id].trim().length > 0 &&
                    plan[id].length <= 1200,
            ),
    }));
    const quizzes = LESSONS.map((lesson) => ({
        id: `lesson-${lesson.id}`,
        label: lesson.title,
        points: 15,
        earned: mission.mission_learning?.[lesson.id] === lesson.answer,
    }));
    const review = {
        id: 'review',
        label: 'Honest review',
        points: 10,
        earned: reviewIssues(mission, mission.mission_review, evidence, false).length === 0,
    };
    const milestones = [...groups, ...quizzes, review];
    const points = milestones.reduce((total, item) => total + (item.earned ? item.points : 0), 0);
    return {
        points,
        max: 100,
        milestones,
        exampleUnlocked: points >= 30,
        coachUnlocked: points >= 60,
    };
}

/** @param {object} mission Saved mission. @param {object[]} evidence Readable records. @returns {object} A local, unsigned learning record with no private evidence contents. */
export function learningRecord(mission, evidence = []) {
    return {
        format: 'buildanddo.mission-learning/1',
        assurance: 'unsigned learning record; not a verifiable credential or certification',
        mission: mission.id,
        status: mission.status,
        learning_points: learningRewards(mission, evidence).points,
        evidence_ids: [...new Set(missionEvidence(mission, evidence).map((record) => record.id))],
        recorded_review_at: mission.mission_reviewed_at || null,
        frameworks: FRAMEWORKS.map(({ name, href }) => ({ name, reference: href })),
    };
}
