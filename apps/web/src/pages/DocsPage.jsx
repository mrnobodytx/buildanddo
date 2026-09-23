// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/DocsPage.jsx
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
// EnumEdges:   DEPENDS_ON apps/web/src/components/site/PublicPage.jsx;
//              CONSUMES apps/web/src/components/workspace/missions/MissionGuide.jsx
// DAG Node:    none
// Intent:      Explain critical workspace flows with searchable public documentation and real destinations.
// ───────────────────────────────────────────────────────────────

import { useState } from 'react';
import { Link } from 'react-router-dom';
import PublicPage from '@/components/site/PublicPage';
import { Input } from '@/components/ui/input';
import TutorialCatalog from '@/components/workspace/TutorialCatalog';
import MissionGuide from '@/components/workspace/missions/MissionGuide';

export const GUIDES = [
    {
        id: 'knowledge',
        title: 'Assemble workspace context',
        text: 'Knowledge & context groups your missions, completed research, evidence, signals and published wiki pages by topic. Ask a question or select a mission to assemble cited excerpts. Inspect relationships and source coverage before using or exporting the context.',
        link: '/app/knowledge',
        action: 'Open Knowledge & context',
    },
    {
        id: 'classrooms',
        title: 'Host or join a classroom',
        text: 'Open Classrooms in your workspace. An editor or administrator can schedule a lesson and start the session. Members join the shared reading, post questions with editor access, and revisit the discussion after it ends. Where the workspace has live broadcasting set up, the host can stream voice and video during the session.',
        link: '/classrooms',
        action: 'Explore Classrooms',
    },
    {
        id: 'get-started',
        title: 'Create your first workspace',
        text: 'Create an account, choose an intent and objective, then name your workspace. Your starting path links to a lesson and your saved objective. Business and domain context are optional; saving a domain does not verify ownership.',
        link: '/signup',
        action: 'Create an account',
    },
    {
        id: 'signals',
        title: 'Read and record signals',
        text: 'Signals capture observations, inferences and recommendations. Keep the source with the signal so the next person can understand where it came from.',
        link: '/app/signals',
        action: 'Open Signals',
    },
    {
        id: 'missions',
        title: 'Scope a mission',
        text: 'Use the Challenge Desk to describe the outcome you want. Review proposed work before approving it, and keep the next action small enough to evaluate.',
        link: '/app/missions',
        action: 'Open the Challenge Desk',
    },
    {
        id: 'workflows',
        title: 'Build a repeatable workflow',
        text: 'Group related steps into a workflow. Describe what each step does, track its state, and pause it when a decision or dependency needs attention.',
        link: '/app/workflows',
        action: 'Open Workflows',
    },
    {
        id: 'evidence',
        title: 'Attach evidence to an outcome',
        text: 'The Evidence Ledger stores the measurements, decisions and source references behind work. Verified means evidence exists; a completed checkbox alone is not proof.',
        link: '/app/evidence',
        action: 'Open the Evidence Ledger',
    },
    {
        id: 'demo',
        title: 'Explore safely in demonstration mode',
        text: 'The workspace labels demonstration data. Turn demonstration mode off before saving real records. A demonstration does not connect a service or run an external action.',
        link: '/app',
        action: 'Open the workspace',
    },
];

export default function DocsPage() {
    const [query, setQuery] = useState('');
    const guides = GUIDES.filter((guide) =>
        `${guide.title} ${guide.text}`.toLowerCase().includes(query.trim().toLowerCase()),
    );
    return (
        <PublicPage
            path="/docs"
            eyebrow="The field guide"
            title="From the first signal to the final receipt."
            intro="A practical guide to the workspace. Start with one business question, keep the source visible, and verify the result before calling the work done."
        >
            <div className="grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)]">
                <aside className="space-y-6">
                    <div>
                        <label htmlFor="docs-search" className="mb-2 block text-sm font-semibold">
                            Search the guide
                        </label>
                        <Input
                            id="docs-search"
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Try evidence or workflows"
                        />
                    </div>
                    <nav
                        aria-label="Documentation sections"
                        className="flex flex-col gap-3 text-sm"
                    >
                        {guides.map((guide) => (
                            <a
                                key={guide.id}
                                href={`#${guide.id}`}
                                className="text-muted-foreground hover:text-foreground"
                            >
                                {guide.title}
                            </a>
                        ))}
                    </nav>
                    <div className="border-t border-border pt-5 text-sm">
                        <a
                            href="https://github.com/mrnobodytx/buildanddo/blob/main/docs/api/README.md"
                            className="text-primary underline underline-offset-4"
                        >
                            API reference
                        </a>
                        <br />
                        <a
                            href="https://github.com/mrnobodytx/buildanddo/blob/main/CONTRIBUTING.md"
                            className="mt-3 inline-block text-primary underline underline-offset-4"
                        >
                            Contribution guide
                        </a>
                    </div>
                </aside>
                <div className="min-w-0 space-y-8">
                    <p role="status" className="text-xs text-muted-foreground">
                        {guides.length} {guides.length === 1 ? 'guide' : 'guides'} found
                    </p>
                    {guides.length === 0 && (
                        <p>No matching guides. Try a different word or clear your search.</p>
                    )}
                    {guides.map((guide) => (
                        <section
                            id={guide.id}
                            key={guide.id}
                            className="scroll-mt-24 border-t border-border pt-6"
                        >
                            <h2 className="font-display text-2xl font-semibold">{guide.title}</h2>
                            <p className="mt-3 leading-relaxed text-muted-foreground">
                                {guide.text}
                            </p>
                            <Link
                                to={guide.link}
                                className="mt-4 inline-block text-sm font-semibold text-primary underline underline-offset-4"
                            >
                                {guide.action}
                            </Link>
                        </section>
                    ))}
                    <p className="text-sm text-muted-foreground">
                        Workspace links ask you to sign in. Product questions belong on the{' '}
                        <Link to="/contact" className="text-primary underline underline-offset-4">
                            contact page
                        </Link>
                        .
                    </p>
                </div>
            </div>
            <section
                id="workspace-lessons"
                aria-labelledby="workspace-lessons-title"
                className="mt-12 scroll-mt-24 border-t-2 border-foreground pt-6"
            >
                <h2
                    id="workspace-lessons-title"
                    className="mb-5 font-display text-2xl font-semibold"
                >
                    Your Field Manual
                </h2>
                <TutorialCatalog />
                <div id="mission-building" className="mt-10 scroll-mt-24">
                    <MissionGuide />
                </div>
            </section>
        </PublicPage>
    );
}
