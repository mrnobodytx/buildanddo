// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/web/src/components/workspace/missions/MissionGuide.jsx
// Stage:        07_BUILD
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-15
// Depends:      apps/web/src/lib/missionLearning.js
// EnumType:     Widget
// EnumEdges:    DEPENDS_ON apps/web/src/lib/missionLearning.js
// DAG Node:     none
// Intent:       Teach why bounded missions need distinct TEVV checks and how standards and credentials inform evidence without replacing judgment.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { Link } from 'react-router-dom';
import { FRAMEWORKS, TEVV } from '@/lib/missionLearning';

/** Explain the purpose and method of evidence-led missions before the learner starts. */
export default function MissionGuide() {
    return (
        <section
            aria-labelledby="mission-guide-title"
            className="space-y-5 border-y-2 border-foreground py-6"
        >
            <div className="max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Mission building · How and why
                </p>
                <h2 id="mission-guide-title" className="mt-2 font-display text-2xl font-semibold">
                    Turn an intention into a checkable outcome
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    A mission connects a problem, a bounded plan, an approval and an observed
                    result. Write down what would count as failure before starting. That makes
                    learning possible even when an experiment does not work. BuildAndDo records the
                    work; your team performs it.
                </p>
            </div>
            <details className="border border-border bg-card p-4">
                <summary className="min-h-8 cursor-pointer font-semibold">
                    How to build your first mission
                </summary>
                <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-relaxed">
                    <li>
                        <strong>Map the need.</strong> Identify the beneficiary, current baseline
                        and measurable target. Read previous work to avoid repeating an answered
                        question.
                    </li>
                    <li>
                        <strong>Bound the work.</strong> Specify included and excluded actions,
                        authorized access, untrusted inputs, protected data and a stop/recovery
                        plan.
                    </li>
                    <li>
                        <strong>Plan TEVV.</strong> Describe all four checks below. Select
                        applicable OWASP requirements for the system you are actually building.
                    </li>
                    <li>
                        <strong>Save, then approve.</strong> An authorized workspace member reviews
                        the saved plan. A3 or higher work needs separate owner approval outside this
                        flow.
                    </li>
                    <li>
                        <strong>Record work and evidence.</strong> Perform the approved work in the
                        appropriate environment, then attach source-backed observations to the
                        mission.
                    </li>
                    <li>
                        <strong>Review and learn.</strong> Record all four outcomes and a
                        reflection. Verify only with passing evidence. Keep failed experiments
                        visible and start a new mission for another attempt.
                    </li>
                </ol>
                <Link
                    to="/app/missions"
                    className="mt-4 inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
                >
                    Open the mission builder
                </Link>
            </details>
            <div className="grid gap-3 md:grid-cols-2">
                {TEVV.map((step) => (
                    <details key={step.id} className="border border-border bg-card p-4">
                        <summary className="min-h-8 cursor-pointer font-semibold">
                            {step.label} — {step.question}
                        </summary>
                        <p className="mt-3 text-sm">
                            <strong>How:</strong> {step.how}
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">
                            <strong>Why:</strong> {step.why}
                        </p>
                    </details>
                ))}
            </div>
            <details className="border border-border bg-card p-4">
                <summary className="min-h-8 cursor-pointer font-semibold">
                    Standards, trust and the limits of a badge
                </summary>
                <div className="mt-4 space-y-4 text-sm leading-relaxed">
                    {FRAMEWORKS.map((framework) => (
                        <p key={framework.name}>
                            <a
                                className="font-semibold underline underline-offset-4"
                                href={framework.href}
                                target="_blank"
                                rel="noreferrer"
                            >
                                {framework.name}
                            </a>
                            {' — '}
                            {framework.note}
                        </p>
                    ))}
                    <p>
                        For missions involving AI assistants or tools, use the{' '}
                        <a
                            className="font-semibold underline underline-offset-4"
                            href="https://genai.owasp.org/"
                            target="_blank"
                            rel="noreferrer"
                        >
                            OWASP GenAI Security Project
                        </a>{' '}
                        to examine prompt injection, excessive permissions and unsafe output
                        handling alongside application controls.
                    </p>
                    <dl className="grid gap-3 sm:grid-cols-2">
                        {[
                            [
                                'Issuer',
                                'The party making a credential claim. Decide whether you trust that party for this kind of claim.',
                            ],
                            [
                                'Subject',
                                'The person or thing the claim is about. It may differ from the person presenting the credential.',
                            ],
                            [
                                'Evidence',
                                'The observations supporting the claim. Check relevance, provenance and limitations.',
                            ],
                            [
                                'Securing mechanism',
                                'A proof or signed envelope can protect integrity and authenticity. Check status and validity as well; it cannot establish the claim’s truth.',
                            ],
                        ].map(([term, meaning]) => (
                            <div key={term}>
                                <dt className="font-semibold">{term}</dt>
                                <dd className="mt-1 text-muted-foreground">{meaning}</dd>
                            </div>
                        ))}
                    </dl>
                    <p className="border-t border-border pt-3 text-muted-foreground">
                        These are educational mappings, not NIST certification, an OWASP assessment,
                        or a W3C credential issuer. Mission review is a recorded workspace
                        assertion. The downloadable learning record is unsigned and contains no
                        cryptographic proof.
                    </p>
                </div>
            </details>
        </section>
    );
}
