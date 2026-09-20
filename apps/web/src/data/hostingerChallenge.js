// // --- CGRF Header ------------------------------------------------
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-DAY21-CLOSURE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-DAY21-CLOSURE-001
// Seat:        CLA-INSTALLER
// Owner:       Citadel Nexus Inc.
// Intent:      Close Hostinger Day-21 runtime evidence and submission packaging gaps without granting deployment authority.
// ----------------------------------------------------------------
export const HOSTINGER_CHALLENGE = {
    campaign: 'Hostinger 21-Day Startup Challenge 2026',
    deadline: '2026-09-24',
    promise:
        'BuildAndDo watches the important parts of a small business, explains what changed, and turns the next best action into a verified task.',
    target:
        'Small business owners and operators who have repetitive operational problems spread across too many tools.',
    problem:
        'Business owners can see signals in many places, but diagnosis, coordination, follow-up, and proof of completion remain manual.',
    solution:
        'BuildAndDo converts one observed business problem into a bounded mission, preserves the source, requires approval, records the work, verifies the outcome, and keeps the evidence.',
    demo:
        'A business challenge becomes a source-bound mission; a bounded action is performed; a separate verifier checks the result; the operator readback and Daily Edition explain what happened and what remains uncertain.',
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
