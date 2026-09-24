// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/buddi/BuddiGuide.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-BUDDI-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-BUDDI-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/components/buddi/Buddi.jsx, apps/web/src/lib/buddi.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/components/buddi/Buddi.jsx; CONSUMES apps/web/src/lib/buddi.js
// DAG Node:    none
// Intent:      Let Buddi introduce the next actions the workspace already ranks, and answer a press with a short tip.
// ───────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import Buddi from '@/components/buddi/Buddi';
import { BUDDI_TIPS, browserStorage, buddiMood, readPreference, writePreference } from '@/lib/buddi';

const HIDDEN_KEY = 'buildanddo.buddi.hidden';

/**
 * @param {{view: {state: string, actions: object[]}|null, loading: boolean}} props workspaceJourney result and its load state.
 * @returns {React.ReactElement}
 */
export default function BuddiGuide({ view, loading }) {
    const [hidden, setHidden] = useState(() => readPreference(browserStorage(), HIDDEN_KEY) === true);
    const [tip, setTip] = useState(-1);
    const [look, setLook] = useState('center');
    const mood = buddiMood(view, { loading });
    const toggle = () => {
        const next = !hidden;
        setHidden(next);
        setTip(-1);
        writePreference(browserStorage(), HIDDEN_KEY, next);
    };
    if (hidden) {
        return <button type="button" className="motion-small-button" onClick={toggle}>Show Buddi</button>;
    }
    return (
        <div className="flex items-start gap-4" onKeyDown={(event) => { if (event.key === 'Escape') setTip(-1); }}>
            <button type="button" className="buddi-button" aria-label="Buddi, your guide. Press for a tip."
                onClick={() => setTip((index) => (index + 1) % BUDDI_TIPS.length)}
                onPointerEnter={() => setLook('up')} onPointerLeave={() => setLook('center')}
                onFocus={() => setLook('up')} onBlur={() => setLook('center')}>
                <Buddi key={mood.pose} pose={mood.pose} size={72} look={look} arrive />
            </button>
            <div className="min-w-0 flex-1 space-y-2 pt-1">
                <p className="text-sm leading-6" data-testid="buddi-line">{mood.line}</p>
                <p aria-live="polite" className="text-sm leading-6 text-muted-foreground">{tip >= 0 && <><span className="font-semibold text-foreground">Tip: </span>{BUDDI_TIPS[tip]}</>}</p>
                <button type="button" className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground" onClick={toggle}>Hide Buddi</button>
            </div>
        </div>
    );
}
