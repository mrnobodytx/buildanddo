// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/buddi/BuddiAchievements.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-BUDDI-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-BUDDI-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/lib/buddi.js, apps/web/src/hooks/useLearningSummary.js, apps/web/src/components/buddi/Buddi.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/buddi.js; CONSUMES apps/web/src/hooks/useLearningSummary.js
// DAG Node:    none
// Intent:      Show achievements derived from server-confirmed facts and celebrate each new one once.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import Buddi from '@/components/buddi/Buddi';
import { Badge, Button, Card } from '@/components/site/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useLearningSummary } from '@/hooks/useLearningSummary';
import { acknowledgeAchievements, browserStorage, buddiAchievements, readPreference, unseenAchievements, writePreference } from '@/lib/buddi';

const STATE_BADGE = {
    earned: { tone: 'green', label: 'Earned' },
    open: { tone: 'neutral', label: 'Not yet' },
    unmeasured: { tone: 'amber', label: 'Unmeasured' },
};

/**
 * @param {{missions: {records: object[], loading: boolean, degraded: boolean}}} props The workspace missions already loaded by the page.
 * @returns {React.ReactElement}
 */
export default function BuddiAchievements({ missions }) {
    const { user } = useAuth() || {};
    const { active } = useWorkspace() || {};
    const { demo } = useDemoMode();
    const learning = useLearningSummary();
    const workspace = active?.id || '';
    const key = user?.id && workspace ? `buildanddo.buddi.seen:${user.id}:${workspace}` : '';
    const [seen, setSeen] = useState(null);
    useEffect(() => { setSeen(key ? readPreference(browserStorage(), key) : null); }, [key]);

    const achievements = useMemo(() => buddiAchievements({ missions: { ...missions, demo }, learning, workspace }),
        [missions, demo, learning, workspace]);
    const ready = Boolean(key && !demo && !missions.loading && !learning.loading);
    const { fresh, next } = ready ? unseenAchievements(achievements, seen) : { fresh: [], next: null };
    const seed = next ? JSON.stringify(next) : '';
    useEffect(() => {
        if (!seed) return;
        writePreference(browserStorage(), key, JSON.parse(seed));
        setSeen(JSON.parse(seed));
    }, [seed, key]);

    const celebrating = fresh[0];
    const acknowledge = () => {
        const updated = acknowledgeAchievements(seen, [celebrating]);
        writePreference(browserStorage(), key, updated);
        setSeen(updated);
    };
    const earned = achievements.filter((item) => item.state === 'earned').length;

    return (
        <section aria-labelledby="buddi-achievements-title" className="ph-no-capture" data-dd-privacy="mask">
            <Card className="space-y-4 p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <h2 id="buddi-achievements-title" className="font-display text-xl font-semibold">Achievements</h2>
                    <p className="text-xs text-muted-foreground">{earned} earned</p>
                </div>
                <div role="status" aria-live="polite">
                    {celebrating && <div className="buddi-celebrate flex flex-wrap items-center gap-4 border border-border border-t-4 border-t-[hsl(var(--success))] p-4">
                        <Buddi pose="verified" size={64} arrive />
                        <div className="min-w-0 flex-1">
                            <p className="font-display text-lg font-semibold">Achievement earned: {celebrating.title}</p>
                            <p className="text-sm text-muted-foreground">{celebrating.description}</p>
                        </div>
                        <Button size="sm" variant="secondary" onClick={acknowledge}>Got it</Button>
                    </div>}
                </div>
                <ul aria-label="All achievements" className="grid gap-2 sm:grid-cols-2">
                    {achievements.map((item) => <li key={item.id} className="flex items-start justify-between gap-3 border border-border p-3">
                        <div className="min-w-0">
                            <p className="text-sm font-semibold">{item.title}</p>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p>
                        </div>
                        <Badge tone={STATE_BADGE[item.state].tone}>{STATE_BADGE[item.state].label}</Badge>
                    </li>)}
                </ul>
                <p className="text-xs leading-5 text-muted-foreground">
                    {demo ? 'Demo records never earn achievements. ' : ''}Achievements come only from verified or failed mission status and your saved tutorial certificates. None can be claimed by hand.
                </p>
            </Card>
        </section>
    );
}
