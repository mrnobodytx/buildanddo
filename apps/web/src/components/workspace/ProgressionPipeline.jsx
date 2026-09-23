// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/ProgressionPipeline.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/components/site/ui.jsx, .gitlab/ci/day21-submission.yml, .gitlab/ci/source-validation.yml
// EnumType:    Widget
// EnumEdges:   VALIDATES .gitlab/ci/day21-submission.yml; USES_TEMPLATE apps/web/src/components/site/ui.jsx; CONSUMES .gitlab/ci/source-validation.yml
// Intent:      Show the contribution flow the repository actually enforces, one step at a time.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import {
    Lightbulb,
    FileText,
    GitBranch,
    Code2,
    FlaskConical,
    GitPullRequest,
    ShieldCheck,
    Eye,
    Rocket,
    Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge, Card } from '@/components/site/ui';

/**
 * The BuildAndDo contribution pipeline.
 *
 * Every step is something the repository can actually observe. `tag` is the
 * pipeline tag a step reports under — steps with `tag: null` are human work
 * with no automated gate, and saying so is more useful than inventing one.
 * `actor` is who performs the step, not who is accountable for it.
 */
export const PIPELINE_STEPS = [
    {
        id: 'idea',
        label: 'Idea',
        icon: Lightbulb,
        actor: 'human',
        description:
            'Someone notices a gap. Nothing is authorised yet and nothing is written down.',
        checks: ['No gate. An unwritten idea has no governance footprint.'],
        tag: null,
    },
    {
        id: 'issue',
        label: 'Issue',
        icon: FileText,
        actor: 'human',
        description:
            'The gap becomes an issue form: bug report, feature request, good first issue, or workspace page enhancement.',
        checks: [
            'Actor type declared: human, agent, or mixed',
            'Acceptance criteria written before work starts',
            'SRS code must already exist in .bits/srs_registry.yml',
        ],
        tag: null,
    },
    {
        id: 'branch',
        label: 'Fork / branch',
        icon: GitBranch,
        actor: 'mixed',
        description:
            'Work claims a branch named bits/<SRS-CODE>-<slug>. One branch, one SRS code, no bundling.',
        checks: [
            'Branch name carries the SRS code',
            'Never a direct commit to main',
        ],
        tag: null,
    },
    {
        id: 'code',
        label: 'Code',
        icon: Code2,
        actor: 'mixed',
        description:
            'The change is written by copying an existing pattern rather than inventing a second way to do the same thing.',
        checks: [
            'Existing UI primitives reused instead of duplicated',
            'No secrets, tokens, or .env contents committed',
            'Commit footer carries SRS and dispatch',
        ],
        tag: null,
    },
    {
        id: 'test',
        label: 'Test',
        icon: FlaskConical,
        actor: 'mixed',
        description:
            'The claim gets evidence. "It builds" is not proof a feature works, so the verification is a command someone else can run.',
        checks: [
            'Lint passes',
            'GitLab runs source Node/Python, semantic-twin and web coverage suites',
            'Native Discord/PDF and CPU blueprint checks pass with required dependencies',
            'Foundry, federal portfolio and mission coverage passes on Python 3.11 and 3.12',
            'Career, Knowledge Unit, integrity and world-twin coverage passes on Python 3.11 and 3.12',
            'Membership, evidence/authority and fault-handling source assurance runs on reviewed changes',
            'The separately requested full-assurance lane exercises browser journeys, accessibility, browser sizes, load and backup restoration',
            'Skipped or unavailable dependencies keep acceptance incomplete',
            'Native PocketBase dossier, suite, operator and classroom auth, scoped reads, storage, presence, leases and retry checks pass for both declared runtimes',
            'Native interactive tutorial checkpoints, completion certificates, concurrent credit and migration retention pass for both declared runtimes',
            'Native signal proposals, ordered workflow receipts, separate mission review and operator readback pass for both declared runtimes',
            'All eighteen acceptance profiles pass for the same candidate',
            'Receipts, logs, JUnit and the build artifact remain available for revalidation',
            'Every manifest matches the dependency lockfile',
            'Verification commands from the issue produce their stated output',
        ],
        tag: 'ci:test',
    },
    {
        id: 'pr',
        label: 'Pull request',
        icon: GitPullRequest,
        actor: 'mixed',
        description:
            'The pull request template is filled in — mission ID, actor type, risk tier, acceptance evidence, rollback, boundary statement.',
        checks: [
            'Exactly one actor label applied',
            'Build produces dist/apps/web/index.html',
        ],
        tag: 'ci:build',
    },
    {
        id: 'governance',
        label: 'Governance check',
        icon: ShieldCheck,
        actor: 'ci',
        description:
            'Automated gates run before a human spends attention: public boundary scan, secret scan, actor label, and the agent context lock.',
        checks: [
            'verify_public_boundary.py reports PASS',
            'No forbidden path or secret-like literal',
            'The current review has exactly one actor label',
            'agent_context.py --check finds the lock current',
        ],
        tag: 'governance:boundary-scan',
    },
    {
        id: 'readiness',
        label: 'Sprint readiness',
        icon: ShieldCheck,
        actor: 'ci',
        description:
            'Every milestone keeps a reason, owner, acceptance requirement and next step bound to the reviewed source.',
        checks: [
            'All eleven milestone definitions match the canonical sprint plan',
            'Changed source requires another governance review',
            'Skipped, stale or synthetic evidence cannot establish completed acceptance',
            'Internal submission standards remain separate from official eligibility and deadlines',
        ],
        tag: 'governance:readiness',
    },
    {
        id: 'review',
        label: 'Review',
        icon: Eye,
        actor: 'human',
        description:
            'A maintainer reads the diff against the acceptance criteria published in the issue. Judgement calls happen here and nowhere else.',
        checks: [
            'Acceptance criteria ticked off individually',
            'Scope matches the issue — out-of-scope findings become comments, not commits',
        ],
        tag: null,
    },
    {
        id: 'staging',
        label: 'Staging deploy',
        icon: Rocket,
        actor: 'ci',
        description:
            'The merged candidate mirrors to the private plane, which holds release and deployment authority.',
        checks: [
            'Candidate mirror job succeeds on main',
            'Deployment event reported for DORA metrics',
        ],
        tag: 'deploy:staging-probe',
    },
    {
        id: 'production',
        label: 'Production',
        icon: Globe,
        actor: 'ci',
        description:
            'The change reaches real users, where RUM and browser logs decide whether the acceptance evidence held up outside CI.',
        checks: [
            'Release identifier visible in RUM',
            'No new error signature attributable to the deploy',
        ],
        tag: 'deploy:production',
    },
];

const ACTOR_META = {
    human: { label: 'Human', tone: 'violet' },
    agent: { label: 'Agent', tone: 'teal' },
    mixed: { label: 'Human + agent', tone: 'amber' },
    ci: { label: 'CI', tone: 'neutral' },
};

/**
 * Renders the contribution pipeline, optionally highlighting where one issue or
 * pull request currently sits.
 *
 * @param {object} props Component props.
 * @param {string} [props.currentStep] Step id from `PIPELINE_STEPS`. Steps before
 *   it render as done, steps after it as pending. Omit to render the flow neutrally.
 * @param {string} [props.subject] Optional label for what is moving through the
 *   pipeline, for example a pull request title.
 * @param {boolean} [props.compact] Hide per-step checks, keeping the rail short.
 * @param {string} [props.className] Extra classes on the root element.
 * @returns {JSX.Element} The pipeline.
 */
export default function ProgressionPipeline({
    currentStep,
    subject,
    compact = false,
    className,
}) {
    const currentIndex = PIPELINE_STEPS.findIndex((s) => s.id === currentStep);
    const hasCurrent = currentIndex >= 0;

    return (
        <div className={cn('space-y-3', className)}>
            {subject && (
                <p className="font-evidence text-[11px] text-muted-foreground">
                    tracking: {subject}
                </p>
            )}

            <ol className="space-y-2">
                {PIPELINE_STEPS.map((step, index) => {
                    const isCurrent = hasCurrent && index === currentIndex;
                    const isDone = hasCurrent && index < currentIndex;
                    const actor = ACTOR_META[step.actor] || ACTOR_META.human;
                    return (
                        <li key={step.id} className="relative">
                            {index < PIPELINE_STEPS.length - 1 && (
                                <span
                                    aria-hidden="true"
                                    className="absolute left-[19px] top-[42px] bottom-[-8px] w-px bg-border"
                                />
                            )}
                            <Card
                                className={cn(
                                    'p-4 transition-colors',
                                    isCurrent && 'border-primary/50 bg-primary/5',
                                    isDone && 'opacity-70',
                                )}
                                aria-current={isCurrent ? 'step' : undefined}
                            >
                                <div className="flex gap-3">
                                    <span
                                        className={cn(
                                            'relative z-10 flex h-10 w-10 shrink-0 items-center justify-center border',
                                            isCurrent
                                                ? 'border-primary/50 bg-primary/10 text-primary'
                                                : 'border-border bg-secondary text-muted-foreground',
                                        )}
                                    >
                                        <step.icon className="h-4 w-4" strokeWidth={2.1} />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-evidence text-[11px] text-muted-foreground">
                                                {String(index + 1).padStart(2, '0')}
                                            </span>
                                            <p className="font-display text-sm font-semibold tracking-tight">
                                                {step.label}
                                            </p>
                                            <Badge tone={actor.tone}>{actor.label}</Badge>
                                            {isCurrent && <Badge tone="red">Here now</Badge>}
                                        </div>
                                        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                                            {step.description}
                                        </p>
                                        {step.tag ? (
                                            <p className="mt-2 font-evidence inline-flex border border-border bg-secondary/40 px-2 py-1 text-[11px] text-muted-foreground">
                                                {step.tag}
                                            </p>
                                        ) : (
                                            <p className="mt-2 font-evidence text-[11px] text-muted-foreground/70">
                                                no automated gate
                                            </p>
                                        )}
                                        {!compact && (
                                            <ul className="mt-3 space-y-1 border-t border-border/60 pt-2.5 text-xs text-muted-foreground">
                                                {step.checks.map((check) => (
                                                    <li key={check} className="flex gap-2">
                                                        <span aria-hidden="true">·</span>
                                                        <span>{check}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                </div>
                            </Card>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}

export { ProgressionPipeline };
