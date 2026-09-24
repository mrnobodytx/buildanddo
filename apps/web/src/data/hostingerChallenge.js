// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/data/hostingerChallenge.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-DAY21-CLOSURE-001, SRS-BUILDANDDO-PURPOSE-001, SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-DAY21-CLOSURE-001, VCC-BUILDANDDO-PURPOSE-001, VCC-BUILDANDDO-UPGRADE-001
// Seat:        CLA-INSTALLER, C-ONE (the educational-platform framing)
// Owner:       Citadel Nexus Inc.
// Depends:     docs/day21/JUDGE_STORY.md
// EnumType:    ConfigDoc
// EnumEdges:   CONSUMES docs/day21/JUDGE_STORY.md
// Intent:      Close Hostinger Day-21 runtime evidence and submission packaging gaps without granting deployment authority.
// ───────────────────────────────────────────────────────────────
import { PURPOSE } from '@/lib/purpose';

// The entry describes the startup as the operator decided it is: an educational, collaborative platform
// (2026-09-11), reframed for the entry on 2026-09-23. scripts/ci/day21_submission.py carries the same four
// texts as its defaults for the judge bundle; src/lib/__tests__/purpose.test.js fails when they drift apart.
export const HOSTINGER_CHALLENGE = {
    campaign: 'Hostinger 21-Day Startup Challenge 2026',
    deadline: '2026-09-24',
    promise: PURPOSE.summary,
    target:
        'People who learn best by doing: learners, teams and builders, beginners included, who want to work through a real project together with other people and AI agents, and keep proof of what they built.',
    problem:
        'Online learning mostly stops at watching and reading. People rarely work through a real project with guidance and with others, and when they do, little records what they actually built or whether it worked.',
    solution:
        'BuildAndDo turns one real question or project into a bounded mission: it keeps the sources, asks for approval before anything runs, records the work, verifies the outcome and keeps the evidence, with classrooms, guilds and AI guildmaster agents to learn alongside.',
    demo:
        'A learner’s project becomes a source-bound mission; a bounded action is performed; a separate verifier checks the result; the readback and the Daily Edition explain what happened and what remains uncertain.',
    products: [
        {
            name: 'Unlimited Web Hosting',
            role: 'Public discovery and product experience: the BuildAndDo site, landing pages, signup, challenge intake, and judge-facing submission surface.',
        },
        {
            name: 'Hostinger Agents',
            role: 'Agent-assisted development and operational workflows during the challenge. Final proof is attached to the submission evidence bundle rather than asserted by this page.',
        },
        {
            name: 'Hostinger AI Builder',
            role: 'Build-and-refine workflow for the public application and design iteration. The final submission records the exact prompts/receipts used during the challenge.',
        },
        {
            name: 'VPS KVM 1',
            role: 'Self-hosted runtime capability for backend services, automation, observability, and deployment support used by BuildAndDo.',
        },
    ],
    criteria: [
        ['Product and user experience', 25],
        ['Business idea', 20],
        ['Business potential', 20],
        ['Hostinger product usage', 20],
        ['Creativity and innovation', 15],
    ],
};
