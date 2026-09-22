// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/data/hostingerChallenge.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-DAY21-CLOSURE-001, SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-DAY21-CLOSURE-001, VCC-BUILDANDDO-UPGRADE-001
// Seat:        CLA-INSTALLER
// Owner:       Citadel Nexus Inc.
// Depends:     docs/day21/JUDGE_STORY.md
// EnumType:    ConfigDoc
// EnumEdges:   CONSUMES docs/day21/JUDGE_STORY.md
// Intent:      Close Hostinger Day-21 runtime evidence and submission packaging gaps without granting deployment authority.
// ───────────────────────────────────────────────────────────────
export const HOSTINGER_CHALLENGE = {
    campaign: 'Hostinger 21-Day Startup Challenge 2026',
    deadline: '2026-09-24',
    promise:
        'BuildAndDo is an educational collaboration platform for turning an objective into real, evidence-backed experience. People learn with other people and AI, work on actual projects, preserve what they did, and build reusable knowledge from the result.',
    target:
        'Learners, educators, builders, researchers and teams with something they want to build or accomplish together.',
    problem:
        'People need to connect lessons and shared methods to real projects, inspect what happened, and carry that experience into the next attempt.',
    solution:
        'BuildAndDo connects objectives, lessons, classrooms, collaboration, bounded missions, evidence and reflection. Software, research, business, community, creative and proposal projects share that learning loop.',
    demo:
        'Planned walkthrough: choose a project objective, study a relevant method with a class or collaborator, carry out one approved mission, inspect the result with a separate reviewer, and retain a reflection with evidence. Record only steps actually completed on the accepted candidate.',
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
