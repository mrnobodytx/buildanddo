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
// Depends:     apps/web/src/components/site/PublicPage.jsx, apps/web/src/lib/commercialEnquiry.js, apps/web/src/lib/communityLinks.js
// EnumType:    Widget
// EnumEdges:   DEPENDS_ON apps/web/src/components/site/PublicPage.jsx; CONSUMES apps/web/src/lib/commercialEnquiry.js; CONSUMES apps/web/src/lib/communityLinks.js
// DAG Node:    none
// Intent:      Route real enquiries through existing public channels and an explicit user-sent email draft.
// ───────────────────────────────────────────────────────────────

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PublicPage from '@/components/site/PublicPage';
import { Button, Card } from '@/components/site/ui';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { communityLink } from '@/lib/communityLinks';
import { COMMERCIAL_CONTACT, ENQUIRY_LIMITS, commercialInterest, prepareCommercialEnquiry } from '@/lib/commercialEnquiry';

// Both links come from communityLinks.js: this page used to carry its own copy of the Discord
// invite, and only one invite may ever be published.
const DISCORD_URL = communityLink('discord').url;
const ISSUES_URL = `${communityLink('github').url}/issues`;

function CommercialEnquiryForm({ interest }) {
    const [draft, setDraft] = useState(null);
    const [error, setError] = useState('');
    const pilot = interest === 'pilot';
    const prepareDraft = (event) => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        setDraft(null);
        setError('');
        try {
            setDraft(prepareCommercialEnquiry({
                interest,
                name: fields.get('name'), email: fields.get('email'), message: fields.get('message'),
                ...(pilot ? { outcome: fields.get('outcome'), constraints: fields.get('constraints') } : {}),
            }));
        } catch (failure) {
            setError(failure instanceof TypeError ? failure.message : 'Could not prepare the draft. Check the form and try again.');
        }
    };
    return (
        <form
            onSubmit={prepareDraft}
            onChange={() => { setDraft(null); setError(''); }}
            aria-label="Commercial enquiry"
            className="ph-no-capture mt-6 space-y-4"
            data-dd-privacy="hidden"
            data-dd-action-name="Commercial enquiry form"
        >
            <div>
                <label htmlFor="contact-name" className="mb-2 block text-sm font-medium">Name</label>
                <Input id="contact-name" name="name" autoComplete="name" required maxLength={ENQUIRY_LIMITS.name} />
            </div>
            <div>
                <label htmlFor="contact-email" className="mb-2 block text-sm font-medium">Email</label>
                <Input id="contact-email" name="email" type="email" autoComplete="email" required maxLength={ENQUIRY_LIMITS.email} />
            </div>
            <p id="commercial-data-note" className="text-xs leading-relaxed text-muted-foreground">
                Give a non-sensitive outline. Leave out credentials and customer records;
                agree data handling before sharing live inputs.
            </p>
            <div>
                <label htmlFor="contact-message" className="mb-2 block text-sm font-medium">
                    {pilot ? 'Recurring problem' : 'What would you like to discuss?'}
                </label>
                <Textarea id="contact-message" name="message" rows={5} required minLength={10}
                    maxLength={ENQUIRY_LIMITS.message} aria-describedby="commercial-data-note" />
            </div>
            {pilot && <>
                <div>
                    <label htmlFor="contact-outcome" className="mb-2 block text-sm font-medium">
                        What would a successful result look like?
                    </label>
                    <Textarea id="contact-outcome" name="outcome" rows={3} required minLength={10}
                        maxLength={ENQUIRY_LIMITS.outcome} aria-describedby="commercial-data-note" />
                </div>
                <div>
                    <label htmlFor="contact-constraints" className="mb-2 block text-sm font-medium">
                        Limits or data restrictions (optional)
                    </label>
                    <Textarea id="contact-constraints" name="constraints" rows={3}
                        maxLength={ENQUIRY_LIMITS.constraints} aria-describedby="commercial-data-note" />
                </div>
            </>}
            <Button type="submit">Prepare email draft</Button>
            <p className="text-xs leading-relaxed text-muted-foreground">
                This form prepares a draft in your browser. You review and send the message in
                your email app. A pilot request starts a scope conversation.
            </p>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {draft && (
                <div role="status" className="space-y-3 border border-border bg-secondary p-4">
                    <p className="text-sm">Your draft is ready. Open it in your email app to send.</p>
                    <label htmlFor="contact-draft" className="block text-sm font-medium">Email draft preview</label>
                    <Textarea id="contact-draft" value={draft.body} readOnly rows={10} />
                    <a href={draft.href} data-dd-action-name="Open commercial email draft"
                        className="inline-flex min-h-10 items-center font-semibold text-primary underline underline-offset-4">
                        Open email draft
                    </a>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                        If your email app does not open, copy the draft and send it to the address above.
                    </p>
                </div>
            )}
        </form>
    );
}

export default function ContactPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const interest = commercialInterest(searchParams.toString());
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
                <section id="commercial-enquiry" className="scroll-mt-24 border-t-2 border-foreground pt-5">
                    <h2 className="font-display text-2xl font-semibold">
                        {interest === 'pilot' ? 'Discuss a paid pilot' : interest === 'government' ? 'Request government membership' : 'Commercial licensing'}
                    </h2>
                    {interest === 'pilot' && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                        Start with one workspace and one agreed operation. We confirm the
                        connector and scope, then agree limits, support, data terms and a manual
                        invoice before work starts. Each operation still needs your approval.
                    </p>}
                    {interest === 'government' && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                        Government research membership is $100/month and requires operator approval.
                        Request an invoice and confirm renewal and cancellation terms before paying.
                        Access starts after payment and approval are recorded; this form does not activate it.
                    </p>}
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                        Contact Citadel Nexus Inc. at{' '}
                        <a
                            className="break-all text-primary underline underline-offset-4"
                            href={`mailto:${COMMERCIAL_CONTACT}`}
                        >
                            {COMMERCIAL_CONTACT}
                        </a>
                        , or prepare an email below.
                    </p>
                    <label htmlFor="contact-interest" className="mb-2 mt-6 block text-sm font-medium">Enquiry type</label>
                    <select id="contact-interest" value={interest}
                        onChange={(event) => setSearchParams(['pilot', 'government'].includes(event.target.value) ? { interest: event.target.value } : {}, { replace: true })}
                        className="h-11 w-full border border-input bg-background px-3 text-sm">
                        <option value="commercial">Commercial licensing or team rollout</option>
                        <option value="pilot">Paid pilot</option>
                        <option value="government">Government research membership</option>
                    </select>
                    <CommercialEnquiryForm key={interest} interest={interest} />
                </section>
            </div>
        </PublicPage>
    );
}
