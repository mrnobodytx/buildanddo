// // --- CGRF Header ------------------------------------------------
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-DAY21-CLOSURE-001, SRS-BUILDANDDO-PURPOSE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-DAY21-CLOSURE-001, VCC-BUILDANDDO-PURPOSE-001
// Seat:        CLA-INSTALLER, C-ONE (the educational-platform framing)
// Owner:       Citadel Nexus Inc.
// Intent:      Close Hostinger Day-21 runtime evidence and submission packaging gaps without granting deployment authority.
// ----------------------------------------------------------------
import React from 'react';
import { Helmet } from 'react-helmet';
import { ArrowRight, BadgeCheck, Box, Server, Sparkles, Target } from 'lucide-react';
import Header from '@/components/site/Header';
import Footer from '@/components/site/Footer';
import { Button, Card, Rule, Section, SectionLabel } from '@/components/site/ui';
import { HOSTINGER_CHALLENGE as C } from '@/data/hostingerChallenge';

function ProductCard({ product }) {
    return (
        <Card className="p-5">
            <h3 className="font-display text-lg font-semibold">{product.name}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{product.role}</p>
        </Card>
    );
}

export default function HostingerChallengePage() {
    return (
        <div className="min-h-screen bg-background text-foreground">
            <Helmet>
                <title>BuildAndDo — Hostinger 21-Day Challenge</title>
                <meta name="description" content={C.promise} />
            </Helmet>
            <Header ctaHref="/#challenge-desk" ctaLabel="Try the challenge desk" />
            <main id="main-content" tabIndex={-1}>
                <Section className="pt-28 sm:pt-32">
                    <SectionLabel icon={Target}>{C.campaign}</SectionLabel>
                    <div className="mt-4 grid gap-8 lg:grid-cols-12 lg:items-end">
                        <div className="lg:col-span-8">
                            <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-6xl">
                                One real project. One bounded mission. One verified outcome.
                            </h1>
                            <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">
                                {C.promise}
                            </p>
                            <div className="mt-7 flex flex-wrap gap-3">
                                <Button href="/#challenge-desk" size="lg">
                                    Try the challenge desk <ArrowRight className="h-4 w-4" />
                                </Button>
                                <Button href="/signup" size="lg" variant="secondary">
                                    Create an account
                                </Button>
                            </div>
                        </div>
                        <Card className="lg:col-span-4 p-5">
                            <p className="font-evidence text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                                Submission deadline
                            </p>
                            <p className="mt-2 font-display text-2xl font-semibold">September 24, 2026</p>
                            <p className="mt-3 text-sm text-muted-foreground">
                                This page explains the product. Operational proof remains in the evidence-bound submission bundle.
                            </p>
                        </Card>
                    </div>
                </Section>

                <Rule double />

                <Section>
                    <div className="grid gap-6 md:grid-cols-3">
                        <Card className="p-5">
                            <SectionLabel icon={Target}>Problem</SectionLabel>
                            <p className="mt-3 text-sm leading-relaxed">{C.problem}</p>
                        </Card>
                        <Card className="p-5">
                            <SectionLabel icon={Sparkles}>Solution</SectionLabel>
                            <p className="mt-3 text-sm leading-relaxed">{C.solution}</p>
                        </Card>
                        <Card className="p-5">
                            <SectionLabel icon={BadgeCheck}>Target user</SectionLabel>
                            <p className="mt-3 text-sm leading-relaxed">{C.target}</p>
                        </Card>
                    </div>
                </Section>

                <Section className="border-t border-border">
                    <SectionLabel icon={BadgeCheck}>90-second demonstration</SectionLabel>
                    <h2 className="mt-2 font-display text-3xl font-semibold">What the judge should see</h2>
                    <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground">{C.demo}</p>
                    <ol className="mt-7 grid gap-4 md:grid-cols-4">
                        {[
                            ['1', 'Observe', 'Save one real project or question with its source.'],
                            ['2', 'Bound', 'Turn it into a mission with scope and approval.'],
                            ['3', 'Do', 'Perform one bounded action and record its receipt.'],
                            ['4', 'Verify', 'Have a distinct verifier check the outcome and show the readback.'],
                        ].map(([n, title, text]) => (
                            <li key={n} className="border border-border p-5">
                                <p className="font-evidence text-xs text-primary">{n}</p>
                                <h3 className="mt-2 font-display text-xl font-semibold">{title}</h3>
                                <p className="mt-2 text-sm text-muted-foreground">{text}</p>
                            </li>
                        ))}
                    </ol>
                </Section>

                <Section className="border-t border-border bg-secondary/20">
                    <SectionLabel icon={Server}>Meaningful Hostinger usage</SectionLabel>
                    <h2 className="mt-2 font-display text-3xl font-semibold">All four challenge products have a distinct job.</h2>
                    <div className="mt-7 grid gap-4 md:grid-cols-2">
                        {C.products.map((product) => <ProductCard key={product.name} product={product} />)}
                    </div>
                    <p className="mt-5 text-xs text-muted-foreground">
                        This is an architecture explanation, not a self-issued verification. The final submission compiler requires separate evidence for every product before it marks the bundle ready for owner review.
                    </p>
                </Section>

                <Section className="border-t border-border">
                    <SectionLabel icon={Box}>Judging alignment</SectionLabel>
                    <div className="mt-6 overflow-x-auto border border-border">
                        <table className="w-full min-w-[36rem] text-left text-sm">
                            <thead className="border-b border-border bg-secondary/40">
                                <tr><th className="p-3">Evaluation area</th><th className="p-3">Weight</th><th className="p-3">What BuildAndDo demonstrates</th></tr>
                            </thead>
                            <tbody>
                                {C.criteria.map(([name, weight]) => (
                                    <tr key={name} className="border-b border-border last:border-b-0">
                                        <td className="p-3 font-semibold">{name}</td>
                                        <td className="p-3 font-evidence">{weight}%</td>
                                        <td className="p-3 text-muted-foreground">
                                            {name === 'Product and user experience' && 'A public product, signup, challenge intake, workspace journey, evidence and operator readback.'}
                                            {name === 'Business idea' && 'A learning platform where people build something real together and keep the evidence, rather than another course library or a generic assistant.'}
                                            {name === 'Business potential' && 'Reusable mission, workflow, evidence and classroom primitives that extend to every field a guild covers, from building and research to writing and commerce.'}
                                            {name === 'Hostinger product usage' && 'Hosting, Agents, AI Builder and VPS each have a bounded role with separate submission evidence.'}
                                            {name === 'Creativity and innovation' && 'Evidence-first agentic work: action is bounded, verification is independent, and uncertainty stays visible.'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Section>

                <section className="border-t border-foreground/80 bg-foreground text-background">
                    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-12 sm:px-6 md:flex-row md:items-center md:justify-between">
                        <div>
                            <p className="font-evidence text-[10px] uppercase tracking-[0.2em] text-background/60">BuildAndDo</p>
                            <h2 className="mt-2 font-display text-3xl font-semibold">Bring one real project.</h2>
                        </div>
                        <Button href="/#challenge-desk" variant="outlinePaper" size="lg">Try the challenge desk <ArrowRight className="h-4 w-4" /></Button>
                    </div>
                </section>
            </main>
            <Footer />
        </div>
    );
}
