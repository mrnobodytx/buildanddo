// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/site/StatusPanels.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-COMMUNITY-WEB-001
// CAPS:        B
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-COMMUNITY-WEB-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/web/src/lib/communityStatus.js, apps/web/src/components/site/ui.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/public/community-status.json; CONSUMES apps/web/public/platform-health.json;
//              CONSUMED_BY apps/web/src/pages/StatusPage.jsx; CONSUMED_BY apps/web/src/pages/RoadmapPage.jsx
// Intent:      Draw community and platform health with the time each was measured, and say UNMEASURED
//              instead of green whenever there is no fresh reading.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { Badge, Card } from '@/components/site/ui';
import {
    COMMUNITY_STATUS_URL,
    PLATFORM_HEALTH_URL,
    countStates,
    formatAge,
    readCommunityStatus,
    readPlatformHealth,
} from '@/lib/communityStatus';

const SURFACE_TONE = { UP: 'green', DEGRADED: 'amber', DOWN: 'red', UNMEASURED: 'neutral' };
const PLATFORM_TONE = { connected: 'green', hold: 'amber', disconnected: 'red' };

/**
 * Fetch one published JSON file. `doc` stays null when the file is missing or unreadable, which
 * the readers in communityStatus.js turn into UNMEASURED rows rather than an empty panel.
 *
 * @param {string} url Same-origin path of the file.
 * @returns {{doc: unknown, settled: boolean}} The parsed document and whether the read finished.
 */
function usePublishedJson(url) {
    const [state, setState] = useState({ doc: null, settled: false });
    useEffect(() => {
        let cancelled = false;
        fetch(url, { cache: 'no-store' })
            .then((response) => (response.ok ? response.json() : null))
            .catch(() => null)
            .then((doc) => { if (!cancelled) setState({ doc, settled: true }); });
        return () => { cancelled = true; };
    }, [url]);
    return state;
}

function ageOf(iso, now) {
    const time = iso ? Date.parse(iso) : NaN;
    return Number.isFinite(time) ? Math.max(0, Math.round((now - time) / 1000)) : NaN;
}

/** One row per canonical community surface, from an already-read community status. */
export function CommunityStatusRows({ reading, now = Date.now() }) {
    const counts = countStates(reading.surfaces);
    return (
        <div>
            <p className="font-evidence text-[11px] leading-relaxed text-muted-foreground">
                {reading.state === 'MEASURED'
                    ? `Reading generated ${reading.generated_at} (${formatAge(reading.age_seconds)} ago) · window ${Math.round(reading.stale_after_seconds / 3600)} h · `
                        + `${counts.UP} up, ${counts.DEGRADED} degraded, ${counts.DOWN} down, ${counts.UNMEASURED} unmeasured.`
                    : `${reading.state} · ${reading.reason}`
                        + (reading.generated_at ? ` Last reading generated ${reading.generated_at} (${formatAge(reading.age_seconds)} ago).` : '')
                        + ' Every surface is shown as unmeasured until a fresh reading arrives.'}
            </p>
            <Card className="mt-4 divide-y divide-border">
                {reading.surfaces.map((row) => (
                    <div
                        key={row.id}
                        data-testid={`community-surface-${row.id}`}
                        className="grid grid-cols-12 items-center gap-3 p-4 text-sm"
                    >
                        <div className="col-span-12 sm:col-span-4">
                            <a href={row.url} target="_blank" rel="noreferrer" className="font-medium hover:text-primary">
                                {row.label}
                            </a>
                        </div>
                        <div className="font-evidence col-span-6 text-[11px] text-muted-foreground sm:col-span-3">
                            {row.checked_at ? `checked ${formatAge(ageOf(row.checked_at, now))} ago` : 'never checked'}
                        </div>
                        <div className="col-span-6 flex justify-end sm:col-span-2 sm:justify-start">
                            <Badge tone={SURFACE_TONE[row.state]}>{row.state}</Badge>
                        </div>
                        <p className="font-evidence col-span-12 text-[11px] text-muted-foreground sm:col-span-3">
                            {row.detail}
                        </p>
                    </div>
                ))}
            </Card>
        </div>
    );
}

/** Community surfaces, read from community-status.json. */
export function CommunityStatusPanel() {
    const { doc, settled } = usePublishedJson(COMMUNITY_STATUS_URL);
    const reading = useMemo(() => readCommunityStatus(doc), [doc]);
    if (!settled) {
        return <p role="status" className="text-sm text-muted-foreground">Reading community status…</p>;
    }
    return <CommunityStatusRows reading={reading} />;
}

/** The recorded platform assessment, read from platform-health.json. */
export function PlatformHealthRows({ reading }) {
    if (reading.state === 'ABSENT') {
        return (
            <p className="text-sm text-muted-foreground">
                UNMEASURED · platform-health.json was not served with this build, so no platform is
                shown as connected.
            </p>
        );
    }
    const current = reading.state === 'MEASURED';
    return (
        <div>
            <p className="font-evidence text-[11px] leading-relaxed text-muted-foreground">
                {reading.observed_at
                    ? `Observed ${reading.observed_at} (${formatAge(reading.age_seconds)} ago)`
                    : 'Observation time unknown'}
                {reading.generated_at ? ` · projected into this build ${reading.generated_at}` : ''}
                {current
                    ? '.'
                    : ` · ${reading.state}: a recorded assessment, not a live probe, so states below are shown without colour.`}
            </p>
            <Card className="mt-4 divide-y divide-border">
                {reading.platforms.map((platform) => (
                    <div
                        key={platform.id}
                        data-testid={`platform-${platform.id}`}
                        className="grid grid-cols-12 items-center gap-3 p-4 text-sm"
                    >
                        <p className="col-span-12 font-medium sm:col-span-4">{platform.label}</p>
                        <div className="col-span-12 flex flex-wrap gap-2 sm:col-span-8">
                            <Badge tone={current && platform.verified ? PLATFORM_TONE[platform.state] || 'neutral' : 'neutral'}>
                                {platform.state}
                            </Badge>
                            {!platform.verified && <Badge tone="neutral">unverified</Badge>}
                        </div>
                    </div>
                ))}
            </Card>
        </div>
    );
}

/** Platform health, read from platform-health.json. */
export function PlatformHealthPanel() {
    const { doc, settled } = usePublishedJson(PLATFORM_HEALTH_URL);
    const reading = useMemo(() => readPlatformHealth(doc), [doc]);
    if (!settled) {
        return <p role="status" className="text-sm text-muted-foreground">Reading platform health…</p>;
    }
    return <PlatformHealthRows reading={reading} />;
}
