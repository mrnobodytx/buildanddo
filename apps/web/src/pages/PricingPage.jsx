// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/PricingPage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-14
// Depends:     apps/web/src/components/site/PublicPage.jsx, apps/web/src/lib/commercialEnquiry.js
// EnumType:    Widget
// EnumEdges:   DEPENDS_ON apps/web/src/components/site/PublicPage.jsx; CONSUMES apps/web/src/lib/commercialEnquiry.js
// DAG Node:    none
// Intent:      Explain access and commercial conversations without inventing prices or plan guarantees.
// ───────────────────────────────────────────────────────────────

import { ArrowRight, Check } from 'lucide-react';
import PublicPage from '@/components/site/PublicPage';
import { Button, Card } from '@/components/site/ui';
import { PILOT_SCOPE } from '@/lib/commercialEnquiry';
import { PUBLIC_ACTIONS, trackPublicAction } from '@/lib/publicActions';

export default function PricingPage() {
    const selectPlan = (plan) => trackPublicAction(PUBLIC_ACTIONS.CTA, 'intent', 'user_requested', undefined, { placement: 'pricing', plan });
    return (
        <PublicPage
            path="/pricing"
            eyebrow="Access & pricing"
            title="Start with one useful outcome."
            intro="BuildAndDo is in early access. Tell us what you want to learn or build, and we can discuss the right scope together. Government research is an approved membership tier; managed pilots are scoped separately."
        >
            <Card className="space-y-4 p-6 sm:p-8"><h2 className="font-display text-3xl font-semibold">Government research membership</h2><p className="text-xl font-semibold">$100/month · approval required</p><p className="leading-relaxed text-muted-foreground">Government learning, research preparation and submission tools are reserved for approved government-tier members. An operator confirms payment and approval before activating a membership period.</p><p className="text-sm text-muted-foreground">Payment does not establish federal eligibility or authorize research execution or submission. Activation uses a confirmed invoice; online checkout is not available yet.</p><Button href="/contact?interest=government" onClick={() => selectPlan('government')}>Request government membership</Button></Card>
            <Card className="grid gap-8 border-primary p-6 sm:p-8 lg:grid-cols-2">
                <div>
                    <p className="font-evidence text-xs uppercase tracking-widest text-primary">
                        A managed first engagement
                    </p>
                    <h2 className="mt-3 font-display text-3xl font-semibold">Paid pilot</h2>
                    <p className="mt-4 leading-relaxed text-muted-foreground">
                        Bring one recurring operational problem. We will scope a supported pilot
                        around an approved action, its result and an independent review.
                    </p>
                    <Button href="/contact?interest=pilot#commercial-enquiry" onClick={() => selectPlan('pilot')} className="mt-6">
                        Discuss a paid pilot <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                </div>
                <div>
                    <h3 className="font-semibold">Proposed scope</h3>
                    <ul className="mt-4 list-inside list-disc space-y-3 text-sm text-muted-foreground">
                        {PILOT_SCOPE.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                    <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
                        We confirm the connector, authorized data and live acceptance with you
                        before scheduling work. Requesting a pilot starts a scope conversation.
                    </p>
                </div>
            </Card>
            <section aria-labelledby="pilot-terms" className="space-y-5 border-t border-border pt-8">
                <h2 id="pilot-terms" className="font-display text-2xl font-semibold">
                    Agree the terms before work starts
                </h2>
                <dl className="grid gap-6 text-sm leading-relaxed md:grid-cols-3">
                    <div>
                        <dt className="font-semibold">Scope and payment</dt>
                        <dd className="mt-2 text-muted-foreground">
                            Set the operation, duration, run limit and success criteria in writing.
                            Agree a quoted fee and manual invoice schedule. Further operations
                            need a new scope and approval.
                        </dd>
                    </div>
                    <div>
                        <dt className="font-semibold">Support and recovery</dt>
                        <dd className="mt-2 text-muted-foreground">
                            Name the support contact, support hours and response target. Agree how
                            to pause work, resolve uncertain results, cancel and handle refunds
                            or remaining fees before starting.
                        </dd>
                    </div>
                    <div>
                        <dt className="font-semibold">Data and permissions</dt>
                        <dd className="mt-2 text-muted-foreground">
                            Agree the allowed inputs, providers and people with access, plus
                            retention, deletion and any required data agreement before sharing
                            live data. Payment does not approve an operation.
                        </dd>
                    </div>
                </dl>
            </section>
            <div className="grid gap-6 md:grid-cols-2">
                <Card className="flex flex-col p-6 sm:p-8">
                    <p className="font-evidence text-xs uppercase tracking-widest text-primary">
                        For individuals
                    </p>
                    <h2 className="mt-3 font-display text-3xl font-semibold">Early access</h2>
                    <p className="mt-4 leading-relaxed text-muted-foreground">
                        Explore the workspace and help shape it around a real project.
                    </p>
                    <ul className="my-8 space-y-4 text-sm">
                        {[
                            'Signals and a bounded challenge desk',
                            'Workflows with an inspectable record',
                            'An evidence ledger for outcomes',
                        ].map((item) => (
                            <li key={item} className="flex gap-3">
                                <Check
                                    className="h-4 w-4 shrink-0 text-success"
                                    aria-hidden="true"
                                />
                                {item}
                            </li>
                        ))}
                    </ul>
                    <Button href="/#early-access" onClick={() => selectPlan('early_access')} className="mt-auto">
                        Request early access <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                </Card>
                <Card className="flex flex-col p-6 sm:p-8">
                    <p className="font-evidence text-xs uppercase tracking-widest text-primary">
                        For teams
                    </p>
                    <h2 className="mt-3 font-display text-3xl font-semibold">Discuss a rollout</h2>
                    <p className="mt-4 leading-relaxed text-muted-foreground">
                        Bring your operating constraints, hosting needs and commercial questions to
                        a conversation with Citadel Nexus Inc.
                    </p>
                    <ul className="my-8 list-inside list-disc space-y-4 text-sm text-muted-foreground">
                        <li>Agree the scope before committing to a plan.</li>
                        <li>Review the services and data you would connect.</li>
                        <li>Discuss licensing and support requirements.</li>
                    </ul>
                    <Button href="/contact" onClick={() => selectPlan('team')} variant="secondary" className="mt-auto">
                        Contact the team
                    </Button>
                </Card>
            </div>
            <section className="grid gap-6 border-t border-border pt-8 md:grid-cols-2">
                <h2 className="font-display text-2xl font-semibold">What should I expect?</h2>
                <div className="space-y-5 text-sm leading-relaxed text-muted-foreground">
                    <p>
                        Joining the early-access list registers your interest. It does not purchase
                        a subscription or guarantee an invitation date.
                    </p>
                    <p>
                        Demonstration data is labeled in the workspace. A service is only shown as
                        connected when there is an actual connection.
                    </p>
                    <Button href="/docs" variant="ghost">
                        Read the getting-started guide
                    </Button>
                </div>
            </section>
        </PublicPage>
    );
}
