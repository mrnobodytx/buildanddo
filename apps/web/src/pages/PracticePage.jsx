// --- CGRF Header ------------------------------------------------
// File:        apps/web/src/pages/PracticePage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/web/src/lib/pocketbaseClient.js, apps/web/src/lib/observability/runtime.js, apps/web/src/lib/navigationIntent.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/pocketbaseClient.js; CONSUMES apps/web/src/lib/observability/runtime.js; CONSUMES apps/web/src/lib/navigationIntent.js
// Intent:      Keep an unavailable practice library distinct from a successfully read empty collection.
// ----------------------------------------------------------------

import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { BookOpen, Info, Users } from 'lucide-react';
import Header from '@/components/site/Header';
import Footer from '@/components/site/Footer';
import Seo from '@/components/Seo';
import { Section, SectionLabel, Card, StatePill } from '@/components/site/ui';
import pb from '@/lib/pocketbaseClient';
import { readFailed } from '@/lib/observability/runtime';
import { telemetrySection } from '@/lib/navigationIntent';

// Public praxis knowledge base - "how do I do X" methods with their evidence
// state, backed by the community-audited evidence fabric (knowledge_claims /
// praxis_methods / governance_audits). This is deliberately NOT the same as
// the in-app Evidence or Tutorials pages: those are a signed-in user's own
// private mission trail / curated product onboarding. This page is public,
// cross-user knowledge about arbitrary real-world objectives.
const KNOWLEDGE_STATE_LABEL = {
    PROPOSED: 'proposed', COMMUNITY_TESTED: 'community-tested',
    VERIFIED: 'verified', DISPUTED: 'disputed', DEPRECATED: 'deprecated',
};

export default function PracticePage() {
    const [methods, setMethods] = useState(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        let cancelled = false;
        let received = false;
        const accountId = pb.authStore.record?.id;
        const pathname = globalThis.window?.location?.pathname;
        const section = telemetrySection(pathname);
        pb.collection('praxis_methods').getList(1, 20, { sort: '-created' })
            .then((res) => {
                if (cancelled) return;
                received = true;
                if (!Array.isArray(res?.items) || res.items.some((item) => !item || typeof item.id !== 'string' || !item.id))
                    throw new Error('Unexpected practice response');
                setMethods(res.items);
            })
            .catch((error) => {
                if (cancelled) return;
                const aborted = error?.isAbort || error?.name === 'AbortError' || error?.originalError?.name === 'AbortError';
                const malformed = received || error?.name === 'SyntaxError' || error?.originalError?.name === 'SyntaxError';
                if (!aborted && accountId === pb.authStore.record?.id && pathname === globalThis.window?.location?.pathname)
                    readFailed(section, 'practice', malformed ? 'invalid_response' : 'unavailable', received ? 200 : malformed && error?.status === 0 ? undefined : error?.status);
                setError(true);
            });
        return () => { cancelled = true; };
    }, []);

    return (
        <div className="min-h-screen bg-background text-foreground">
            <Helmet>
                <title>BuildAndDo — Practice library</title>
                <meta name="description" content="Community-audited methods for real objectives: what evidence supports each step, what commonly fails, and how current the information is." />
            </Helmet>
            <Seo title="BuildAndDo — Practice library" siteName="BuildAndDo" type="website" />

            <Header />
            <main id="main-content" tabIndex={-1} className="pt-14">
            <div className="rule-double" />

            <Section className="py-14 sm:py-20">
                <SectionLabel icon={BookOpen}>Practice library</SectionLabel>
                <h1 className="mt-3 font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
                    Methods, with their evidence attached.
                </h1>
                <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                    Every method here carries a real knowledge state — proposed, community-tested,
                    verified, or disputed. Competing methods for the same objective are shown
                    side by side, never collapsed into one forced &ldquo;best&rdquo; answer.
                </p>
            </Section>

            <Section className="border-t border-foreground/80 py-12 sm:py-16">
                <SectionLabel icon={Users}>Live from the evidence fabric</SectionLabel>
                {methods === null && !error && (
                    <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
                )}
                {error && (
                    <p className="mt-6 text-sm text-muted-foreground">Unknown — the practice library is unreachable right now.</p>
                )}
                {methods && methods.length === 0 && (
                    <p className="mt-6 text-sm text-muted-foreground">
                        No methods published yet. This library grows as the community contributes
                        and audits real-world methods.
                    </p>
                )}
                {methods && methods.length > 0 && (
                    <div className="mt-6 grid gap-4 sm:grid-cols-2">
                        {methods.map((m) => (
                            <Card key={m.id} className="p-5">
                                <div className="flex items-start justify-between gap-3">
                                    <h2 className="font-display text-lg font-semibold">{m.objective}</h2>
                                    <StatePill state={KNOWLEDGE_STATE_LABEL[m.knowledge_state] || 'proposed'} />
                                </div>
                                <p className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">{m.domain}</p>
                                <p className="mt-3 text-xs text-muted-foreground">
                                    {m.community_attempts || 0} community attempts ·{' '}
                                    {m.community_verified_successes || 0} verified successes
                                </p>
                            </Card>
                        ))}
                    </div>
                )}
            </Section>

            <p className="mx-auto flex max-w-6xl items-start gap-2 px-4 pb-10 text-xs leading-relaxed text-muted-foreground/70 sm:px-6">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Knowledge state reflects real audit history, not popularity. A method with
                zero attempts is honestly labeled &ldquo;proposed,&rdquo; not hidden.
            </p>

            </main>
            <Footer />
        </div>
    );
}
