// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/ContactPage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-COMMUNITY-WEB-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001, VCC-BUILDANDDO-COMMUNITY-WEB-001
// Seat:        BITS-CODEGEN, C-ONE (community links from the one source)
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-14
// Depends:     apps/web/src/components/site/PublicPage.jsx
// EnumType:    Widget
// EnumEdges:   DEPENDS_ON apps/web/src/components/site/PublicPage.jsx
// DAG Node:    none
// Intent:      Route real enquiries through existing public channels and an explicit user-sent email draft.
// ───────────────────────────────────────────────────────────────

import { useState } from 'react';
import PublicPage from '@/components/site/PublicPage';
import { Button, Card } from '@/components/site/ui';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { communityLink } from '@/lib/communityLinks';

const LICENSING_EMAIL = 'licensing@citadel-nexus.com';
// Both links come from communityLinks.js: this page used to carry its own copy of the Discord
// invite, and only one invite may ever be published.
const DISCORD_URL = communityLink('discord').url;
const ISSUES_URL = `${communityLink('github').url}/issues`;

export default function ContactPage() {
    const [draft, setDraft] = useState('');
    const prepareDraft = (event) => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        const body = `${fields.get('message')}\n\nFrom: ${fields.get('name')}\nReply to: ${fields.get('email')}`;
        setDraft(
            `mailto:${LICENSING_EMAIL}?subject=${encodeURIComponent('BuildAndDo commercial enquiry')}&body=${encodeURIComponent(body)}`,
        );
    };
    return (
        <PublicPage
            path="/contact"
            eyebrow="The correspondence desk"
            title="Tell us what you are working on."
            intro="Choose the channel that fits your question. For a product conversation, join the community. For a reproducible problem, use the public issue tracker."
        >
            <div className="grid gap-8 lg:grid-cols-2">
                <div className="space-y-6">
                    <Card className="p-6">
                        <h2 className="font-display text-2xl font-semibold">Product & community</h2>
                        <p className="my-3 text-sm leading-relaxed text-muted-foreground">
                            Discuss your use case and ask how the workspace fits your work.
                        </p>
                        <a
                            href={DISCORD_URL}
                            className="font-semibold text-primary underline underline-offset-4"
                        >
                            Join the Discord conversation
                        </a>
                    </Card>
                    <Card className="p-6">
                        <h2 className="font-display text-2xl font-semibold">Report a problem</h2>
                        <p className="my-3 text-sm leading-relaxed text-muted-foreground">
                            Include the page, what you expected and the steps needed to reproduce
                            it. Public issues should contain no account details or private business
                            data.
                        </p>
                        <a
                            href={ISSUES_URL}
                            className="font-semibold text-primary underline underline-offset-4"
                        >
                            Open the issue tracker
                        </a>
                    </Card>
                </div>
                <section className="border-t-2 border-foreground pt-5">
                    <h2 className="font-display text-2xl font-semibold">Commercial licensing</h2>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                        Contact Citadel Nexus Inc. at{' '}
                        <a
                            className="break-all text-primary underline underline-offset-4"
                            href={`mailto:${LICENSING_EMAIL}`}
                        >
                            {LICENSING_EMAIL}
                        </a>
                        , or prepare an email below.
                    </p>
                    <form
                        onSubmit={prepareDraft}
                        onChange={() => setDraft('')}
                        className="mt-6 space-y-4"
                    >
                        <div>
                            <label
                                htmlFor="contact-name"
                                className="mb-2 block text-sm font-medium"
                            >
                                Name
                            </label>
                            <Input
                                id="contact-name"
                                name="name"
                                autoComplete="name"
                                required
                                maxLength={120}
                            />
                        </div>
                        <div>
                            <label
                                htmlFor="contact-email"
                                className="mb-2 block text-sm font-medium"
                            >
                                Email
                            </label>
                            <Input
                                id="contact-email"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                maxLength={254}
                            />
                        </div>
                        <div>
                            <label
                                htmlFor="contact-message"
                                className="mb-2 block text-sm font-medium"
                            >
                                What would you like to discuss?
                            </label>
                            <Textarea
                                id="contact-message"
                                name="message"
                                rows={5}
                                required
                                minLength={10}
                                maxLength={2000}
                            />
                        </div>
                        <Button type="submit">Prepare email draft</Button>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                            You review and send the message in your email app.
                        </p>
                        {draft && (
                            <div
                                role="status"
                                className="space-y-3 border border-border bg-secondary p-4"
                            >
                                <p className="text-sm">
                                    Your draft is ready. Open it in your email app to send.
                                </p>
                                <a
                                    href={draft}
                                    className="inline-flex min-h-10 items-center font-semibold text-primary underline underline-offset-4"
                                >
                                    Open email draft
                                </a>
                            </div>
                        )}
                    </form>
                </section>
            </div>
        </PublicPage>
    );
}
