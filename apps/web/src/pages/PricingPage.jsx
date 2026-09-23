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
// Depends:     apps/web/src/components/site/PublicPage.jsx
// EnumType:    Widget
// EnumEdges:   DEPENDS_ON apps/web/src/components/site/PublicPage.jsx
// DAG Node:    none
// Intent:      Explain access and commercial conversations without inventing prices or plan guarantees.
// ───────────────────────────────────────────────────────────────

import { ArrowRight, Check } from 'lucide-react';
import PublicPage from '@/components/site/PublicPage';
import { Button, Card } from '@/components/site/ui';

export default function PricingPage() {
    return (
        <PublicPage
            path="/pricing"
            eyebrow="Access & pricing"
            title="Start with one useful outcome."
            intro="BuildAndDo is in early access. Public subscription prices have not been announced. Tell us what you want to learn or build, and we can discuss the right scope together."
        >
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
                    <Button href="/#early-access" className="mt-auto">
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
                    <Button href="/contact" variant="secondary" className="mt-auto">
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
