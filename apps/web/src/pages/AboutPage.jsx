// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/AboutPage.jsx
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
// Intent:      Introduce the confirmed operator and the evidence standards behind the product.
// ───────────────────────────────────────────────────────────────

import { Link } from 'react-router-dom';
import PublicPage from '@/components/site/PublicPage';
import { Card } from '@/components/site/ui';

export default function AboutPage() {
    return (
        <PublicPage
            path="/about"
            eyebrow="People & purpose"
            title="Work should leave a record."
            intro="BuildAndDo is a Citadel Nexus Inc. product for people who run businesses. It turns changes, decisions and outcomes into a record you can inspect."
        >
            <section className="grid gap-8 md:grid-cols-[1fr_2fr]">
                <h2 className="font-display text-2xl font-semibold">The people behind the work</h2>
                <Card className="p-6 sm:p-8">
                    <p className="font-evidence text-xs uppercase tracking-widest text-primary">
                        Owner & operator
                    </p>
                    <h3 className="mt-3 font-display text-3xl font-semibold">Dmitry Richard</h3>
                    <p className="mt-3 leading-relaxed text-muted-foreground">
                        Dmitry operates BuildAndDo within Citadel Nexus Inc. Human contributors and
                        agent seats collaborate through the public repository, with review and
                        evidence attached to their work.
                    </p>
                    <a
                        href="https://github.com/mrnobodytx/buildanddo/graphs/contributors"
                        className="mt-6 inline-block text-sm font-semibold text-primary underline underline-offset-4"
                    >
                        See the contribution record
                    </a>
                </Card>
            </section>
            <section>
                <h2 className="font-display text-3xl font-semibold">Three editorial standards</h2>
                <div className="mt-6 grid gap-6 md:grid-cols-3">
                    {[
                        [
                            'Name the source',
                            'An observation should say where it came from. Missing data stays missing until a source is connected.',
                        ],
                        [
                            'Bound the action',
                            'A mission has a purpose and a scope. Proposed work and approved work are distinct states.',
                        ],
                        [
                            'Show the outcome',
                            'A completed action is not automatically a verified improvement. Evidence makes the difference.',
                        ],
                    ].map(([heading, copy], index) => (
                        <article key={heading} className="border-t-2 border-foreground pt-5">
                            <p className="font-evidence text-xs text-primary">0{index + 1}</p>
                            <h3 className="mt-3 font-display text-2xl font-semibold">{heading}</h3>
                            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                                {copy}
                            </p>
                        </article>
                    ))}
                </div>
            </section>
            <p className="border-t border-border pt-6 text-sm leading-relaxed text-muted-foreground">
                Want to help?{' '}
                <Link
                    to="/docs"
                    className="font-semibold text-primary underline underline-offset-4"
                >
                    Read the guide
                </Link>{' '}
                or{' '}
                <Link
                    to="/contact"
                    className="font-semibold text-primary underline underline-offset-4"
                >
                    start a conversation
                </Link>
                .
            </p>
        </PublicPage>
    );
}
