// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/BlogPage.jsx
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
// Intent:      Publish substantive editorial notes about evidence and scoped work without invented release claims.
// ───────────────────────────────────────────────────────────────

import PublicPage from '@/components/site/PublicPage';
import { SITE_ORIGIN } from '@/lib/publicPages';

const NOTES = [
    {
        id: 'verified-outcomes',
        title: 'What counts as a verified outcome?',
        category: 'Evidence',
        intro: 'An action finishing tells us something happened. It takes a source and a comparison to know whether it helped.',
        paragraphs: [
            'Start with a question you can measure. A team trying to reduce missed appointments could compare the number of missed appointments before and after changing its reminder process.',
            'Keep the observation separate from the explanation. A lower count is an observation; saying the new reminder caused it is a claim that may need more evidence.',
            'Attach the source and the measurement to the mission. The next reader should be able to inspect the result without taking your word for it.',
        ],
    },
    {
        id: 'bounded-work',
        title: 'The case for one bounded mission',
        category: 'Practice',
        intro: 'A smaller scope makes a decision easier to review and its outcome easier to understand.',
        paragraphs: [
            'Describe one outcome, the work proposed to reach it, and the point at which a person must make a decision. A useful scope also states what happens if the work fails.',
            'Record the starting state before changing anything. A result without a baseline can be interesting, but it cannot establish an improvement by itself.',
            'Finish with the evidence and the next decision. If the original question remains unanswered, record that uncertainty instead of turning it into a success claim.',
        ],
    },
];

export default function BlogPage() {
    const structuredData = NOTES.map((note) => ({
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: note.title,
        description: note.intro,
        url: `${SITE_ORIGIN}/blog#${note.id}`,
        author: { '@type': 'Organization', name: 'Citadel Nexus Inc.' },
        isPartOf: { '@type': 'Blog', name: 'The BuildAndDo journal', url: `${SITE_ORIGIN}/blog` },
    }));
    return (
        <PublicPage
            path="/blog"
            eyebrow="The BuildAndDo journal"
            title="Notes from the work."
            intro="Short essays on evidence, operating decisions and the value of a clear record. These are field guides, not claims about customer results."
            structuredData={structuredData}
        >
            <div className="grid gap-10 md:grid-cols-2">
                {NOTES.map((note) => (
                    <article
                        id={note.id}
                        key={note.id}
                        className="scroll-mt-24 border-t-2 border-foreground pt-5"
                    >
                        <p className="font-evidence text-xs uppercase tracking-widest text-primary">
                            {note.category}
                        </p>
                        <h2 className="mt-3 font-display text-3xl font-semibold">{note.title}</h2>
                        <p className="mt-4 leading-relaxed text-muted-foreground">{note.intro}</p>
                        <details className="mt-6">
                            <summary className="cursor-pointer py-2 text-sm font-semibold text-primary">
                                Read “{note.title}”
                            </summary>
                            <div className="mt-3 space-y-4 text-sm leading-relaxed text-muted-foreground">
                                {note.paragraphs.map((paragraph) => (
                                    <p key={paragraph}>{paragraph}</p>
                                ))}
                            </div>
                        </details>
                    </article>
                ))}
            </div>
        </PublicPage>
    );
}
