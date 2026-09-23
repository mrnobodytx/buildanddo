// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/editorial/ChangelogDesk.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-CHANGELOG-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-CHANGELOG-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     /changelog.json (build output of scripts/ci/changelog_feed.py), apps/web/src/components/site/ui.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES /changelog.json; CONSUMED_BY apps/web/src/pages/HomePage.jsx
// DAG Node:    none
// Intent:      Show what shipped, from the build's own history, and offer the same entries as an RSS feed.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { History, Rss } from 'lucide-react';
import { Badge, Card, Rule, Section, SectionLabel } from '@/components/site/ui';
import { ListSkeleton } from '@/components/workspace/WorkspaceNotices';

export const FEED_PATH = '/changelog.json';
export const RSS_PATH = '/changelog.xml';
const HISTORY_URL = 'https://github.com/mrnobodytx/buildanddo/commits';
const SCHEMA = 'buildanddo.changelog-feed/v1';
const TONE = { Added: 'green', Fixed: 'teal', Security: 'red', Changed: 'violet', Removed: 'amber', Deprecated: 'amber' };
// The site's small secondary button, as a plain anchor.
const SUBSCRIBE_CLASS = 'motion-button inline-flex h-9 items-center justify-center gap-2 border border-foreground/70 '
    + 'bg-transparent px-4 text-sm font-semibold text-foreground hover:bg-secondary/70 focus-visible:outline-2 '
    + 'focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))]';

/**
 * The entries of a changelog feed document, or an error when the document is not one.
 * An entry without a title or with a link that is not https is dropped rather than shown half-formed.
 *
 * @param {unknown} document Parsed /changelog.json.
 * @returns {Array<object>}
 */
export function readChangelog(document) {
    if (!document || document.schema !== SCHEMA || !Array.isArray(document.items)) {
        throw new Error('not a changelog feed');
    }
    return document.items.filter((item) => item && typeof item.title === 'string' && item.title
        && typeof item.url === 'string' && /^https:\/\//.test(item.url));
}

const when = (value) => {
    const time = Date.parse(value);
    return Number.isFinite(time)
        ? new Date(time).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
        : 'Date not recorded';
};

/**
 * @param {{limit?: number}} props How many of the newest changes to show.
 */
export default function ChangelogDesk({ limit = 6 }) {
    const [feed, setFeed] = useState({ status: 'loading', items: [], ref: '' });

    useEffect(() => {
        let current = true;
        fetch(FEED_PATH, { cache: 'no-store' })
            .then((response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json();
            })
            .then((document) => {
                if (current) setFeed({ status: 'ready', items: readChangelog(document), ref: String(document.ref || '') });
            })
            .catch(() => {
                if (current) setFeed({ status: 'missing', items: [], ref: '' });
            });
        return () => { current = false; };
    }, []);

    const items = feed.items.slice(0, limit);
    return (
        <Section id="what-shipped" className="border-t border-foreground/80 py-12 sm:py-16">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <SectionLabel icon={History}>What shipped</SectionLabel>
                    <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                        Every change you would notice, as it lands.
                    </h2>
                </div>
                {/* A plain link, not <Button href>: a path there becomes a router Link, and the feed is a file
                    the browser must fetch, not a page of this app. */}
                <a href={RSS_PATH} className={SUBSCRIBE_CLASS}>
                    <Rss className="h-4 w-4" aria-hidden="true" />
                    Subscribe (RSS)
                </a>
            </div>
            <Rule className="my-6" />
            {feed.status === 'loading' && <ListSkeleton label="Loading what shipped…" />}
            {feed.status === 'missing' && (
                <p role="status" className="text-sm leading-6 text-muted-foreground">
                    The change feed is not part of this build. Every change is still in the project&apos;s history:{' '}
                    <a href={HISTORY_URL} target="_blank" rel="noreferrer" className="underline underline-offset-4">read it on GitHub</a>.
                </p>
            )}
            {feed.status === 'ready' && items.length === 0 && (
                <p role="status" className="text-sm leading-6 text-muted-foreground">
                    No feature, fix or content change is in this build&apos;s history yet.
                </p>
            )}
            {items.length > 0 && (
                <ol aria-label="Latest changes" className="space-y-3">
                    {items.map((item) => (
                        <li key={item.id || item.url}>
                            <Card className="flex flex-wrap items-start gap-3 p-4">
                                <Badge tone={TONE[item.section] || 'neutral'}>{item.section || 'Change'}</Badge>
                                <div className="min-w-0 flex-1">
                                    <p className="break-words text-sm font-semibold leading-6">{item.title}</p>
                                    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-evidence text-[11px] text-muted-foreground">
                                        <time dateTime={item.published}>{when(item.published)}</time>
                                        {Array.isArray(item.srs) && item.srs.length > 0 && <span>{item.srs.join(', ')}</span>}
                                        <a href={item.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                                            View the change
                                        </a>
                                    </p>
                                </div>
                            </Card>
                        </li>
                    ))}
                </ol>
            )}
            {feed.status === 'ready' && (
                <p className="mt-4 text-xs text-muted-foreground">
                    From the commits this site is built from{feed.ref ? ` (build ${feed.ref})` : ''}. Housekeeping changes stay in the
                    project&apos;s changelog.
                </p>
            )}
        </Section>
    );
}
