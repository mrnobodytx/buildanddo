// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/PublicProof.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-WITNESS-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/components/site/ui.jsx,
//              docs/architecture/EVIDENCE_WITNESS.md
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/pocketbase/pb_migrations/1788940000_create_evidence_witness.js;
//              VALIDATES docs/architecture/CAPABILITY_PASSPORT.md
// Intent:      Render the verification state of one evidence epoch, including the
//              limits of what a public anchor proves.
// ───────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import {
    Check,
    ChevronDown,
    Circle,
    Copy,
    Minus,
    ShieldCheck,
    TriangleAlert,
    X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Card, Rule, SectionLabel } from '@/components/site/ui';

/**
 * Layer state vocabulary, shared with the `capabilities` json on an epoch:
 * VERIFIED | PENDING | ABSENT | FAILED. ABSENT is not a failure — it means no
 * record exists, which is a truthful and common value.
 */
const LAYER_STATE = {
    VERIFIED: { label: 'Verified', icon: Check, cls: 'text-success border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/10' },
    PENDING: { label: 'Pending', icon: Circle, cls: 'text-amber-warm border-[hsl(var(--amber))]/40 bg-[hsl(var(--amber))]/10' },
    ABSENT: { label: 'No record', icon: Minus, cls: 'text-muted-foreground border-border bg-secondary/50' },
    FAILED: { label: 'Failed', icon: X, cls: 'text-primary border-primary/40 bg-primary/10' },
};

function layerMeta(state) {
    return LAYER_STATE[state] || LAYER_STATE.ABSENT;
}

/**
 * Compares two recorded digests. This is a comparison, not a derivation: the
 * browser does not rebuild a Merkle tree and must not imply that it did.
 *
 * Three outcomes, never two — "not anchored" is distinct from "mismatch",
 * because the absence of a witness says nothing about the evidence.
 */
export function compareRoots(localRoot, publicRoot) {
    const local = (localRoot || '').trim().toLowerCase();
    const pub = (publicRoot || '').trim().toLowerCase();
    if (!local) return 'unavailable';
    if (!pub) return 'not_anchored';
    return local === pub ? 'match' : 'mismatch';
}

const OUTCOME = {
    match: {
        label: 'Match',
        detail: 'The evidence recorded now produces the same fingerprint that was anchored publicly.',
        cls: 'border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/10 text-success',
        icon: ShieldCheck,
    },
    mismatch: {
        label: 'Mismatch',
        detail: 'The recorded evidence no longer matches the fingerprint that was anchored. This is reported, not resolved — the disagreement is the signal and needs investigation.',
        cls: 'border-primary/40 bg-primary/10 text-primary',
        icon: TriangleAlert,
    },
    not_anchored: {
        label: 'Not yet anchored',
        detail: 'This epoch has no public anchor yet, so there is nothing to compare against. Absence of a witness is not evidence of tampering.',
        cls: 'border-[hsl(var(--amber))]/40 bg-[hsl(var(--amber))]/10 text-amber-warm',
        icon: Circle,
    },
    unavailable: {
        label: 'No local root',
        detail: 'This epoch has not been sealed, so it has no stable root digest. An open epoch is still accepting artifacts and cannot be verified.',
        cls: 'border-border bg-secondary/60 text-muted-foreground',
        icon: Minus,
    },
};

function Digest({ label, value, onCopy }) {
    const [copied, setCopied] = useState(false);
    const [full, setFull] = useState(false);
    const has = Boolean(value);

    const copy = async () => {
        if (!has) return;
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
            if (onCopy) onCopy(label);
        } catch (_) {
            // Clipboard access can be denied by the browser. The digest is
            // still selectable on screen, so this stays silent rather than
            // claiming a copy that did not happen.
            setFull(true);
        }
    };

    const shown = !has
        ? 'not recorded'
        : full || value.length <= 20
            ? value
            : `${value.slice(0, 8)}...${value.slice(-8)}`;

    return (
        <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {label}
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
                <button
                    type="button"
                    onClick={() => has && setFull((f) => !f)}
                    title={has ? 'Show the full digest' : undefined}
                    className={cn(
                        'font-evidence truncate text-[12px]',
                        has ? 'text-foreground hover:text-primary' : 'text-muted-foreground',
                    )}
                >
                    {shown}
                </button>
                {has && (
                    <button
                        type="button"
                        onClick={copy}
                        aria-label={`Copy ${label}`}
                        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                    >
                        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                )}
            </span>
        </div>
    );
}

/**
 * The proof block for one evidence epoch.
 *
 * Renders the verification layers behind the epoch, compares the locally
 * recorded root against the publicly anchored one, and always states the limits
 * of the result. The "does not prove" list is not collapsed behind an
 * interaction — a reader must not be able to reach the outcome without it.
 */
export default function PublicProof({
    epochId,
    localRoot,
    publicRoot,
    anchorTimestamp,
    capabilities = [],
    anchorNetwork,
    anchorUrl,
    tevvState,
    onCopyDigest,
    className,
}) {
    const [showArtifacts, setShowArtifacts] = useState(false);
    const outcome = OUTCOME[compareRoots(localRoot, publicRoot)];
    const OutcomeIcon = outcome.icon;

    const witnessState = publicRoot
        ? compareRoots(localRoot, publicRoot) === 'match' ? 'VERIFIED' : 'FAILED'
        : 'PENDING';

    // Layer status is aggregated across the capabilities this epoch covers: a
    // layer counts as verified only when every covered capability has it.
    const aggregate = (key) => {
        if (!capabilities.length) return 'ABSENT';
        const values = capabilities.map((c) => c?.[key] || 'ABSENT');
        if (values.includes('FAILED')) return 'FAILED';
        if (values.every((v) => v === 'VERIFIED')) return 'VERIFIED';
        if (values.includes('VERIFIED') || values.includes('PENDING')) return 'PENDING';
        return 'ABSENT';
    };

    const layers = [
        {
            key: 'lineage',
            label: 'Internal lineage',
            state: aggregate('lineage'),
            answers: 'What exactly this is: the commit and what it was derived from.',
        },
        {
            key: 'sbom',
            label: 'SBOM linked',
            state: aggregate('sbom'),
            answers: 'What it is made of: the recorded dependency set.',
        },
        {
            key: 'tevv',
            label: 'TEVV verified',
            state: tevvState || aggregate('tevv'),
            answers: 'Whether it works. This is the only layer that speaks to truth.',
        },
        {
            key: 'witness',
            label: 'Publicly witnessed',
            state: witnessState,
            answers: 'That this record existed by the anchor time and has not silently changed.',
        },
    ];

    return (
        <Card className={cn('p-5', className)}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <SectionLabel icon={ShieldCheck}>BuildAndDo public proof</SectionLabel>
                    <p className="font-evidence mt-2 text-sm text-foreground">
                        {epochId || 'No epoch selected'}
                    </p>
                </div>
                <span
                    className={cn(
                        'inline-flex items-center gap-1.5 border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]',
                        outcome.cls,
                    )}
                >
                    <OutcomeIcon className="h-3.5 w-3.5" strokeWidth={2.4} />
                    {outcome.label}
                </span>
            </div>

            <Rule className="my-4" />

            <ol className="space-y-3">
                {layers.map((layer, i) => {
                    const meta = layerMeta(layer.state);
                    const Icon = meta.icon;
                    return (
                        <li key={layer.key} className="flex gap-3">
                            <span className="flex flex-col items-center">
                                <span
                                    className={cn(
                                        'flex h-6 w-6 shrink-0 items-center justify-center border',
                                        meta.cls,
                                    )}
                                >
                                    <Icon className="h-3.5 w-3.5" strokeWidth={2.6} />
                                </span>
                                {i < layers.length - 1 && (
                                    <span aria-hidden="true" className="mt-1 h-4 w-px bg-border" />
                                )}
                            </span>
                            <div className="min-w-0 flex-1 pb-0.5">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                    <span className="text-sm font-medium">{layer.label}</span>
                                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                        {meta.label}
                                    </span>
                                </div>
                                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                                    {layer.answers}
                                </p>
                            </div>
                        </li>
                    );
                })}
            </ol>

            <Rule className="my-4" />

            <div className="space-y-2">
                <Digest label="Local root" value={localRoot} onCopy={onCopyDigest} />
                <Digest label="Public root" value={publicRoot} onCopy={onCopyDigest} />
                <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Anchored
                    </span>
                    <span className="font-evidence text-[12px] text-foreground">
                        {anchorTimestamp
                            ? new Date(anchorTimestamp).toLocaleString()
                            : 'not anchored'}
                    </span>
                </div>
                {anchorNetwork && (
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            Public witness
                        </span>
                        <span className="font-evidence truncate text-[12px] text-foreground">
                            {anchorUrl ? (
                                <a
                                    href={anchorUrl}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className="underline decoration-dotted hover:text-primary"
                                >
                                    {anchorNetwork}
                                </a>
                            ) : (
                                anchorNetwork
                            )}
                        </span>
                    </div>
                )}
            </div>

            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {outcome.detail}
            </p>

            <div className="mt-4 border border-border bg-secondary/30 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    What this proves
                </p>
                <ul className="mt-2 space-y-1.5 text-xs leading-relaxed">
                    <li className="flex gap-2">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" strokeWidth={2.6} />
                        The evidence fingerprint existed no later than the anchor time.
                    </li>
                    <li className="flex gap-2">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" strokeWidth={2.6} />
                        The evidence read now matches the fingerprint that was anchored.
                    </li>
                </ul>

                <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    What this does NOT prove
                </p>
                <ul className="mt-2 space-y-1.5 text-xs leading-relaxed">
                    <li className="flex gap-2">
                        <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2.6} />
                        That every underlying claim is true. TEVV verification does that; a
                        publicly witnessed false claim is still false.
                    </li>
                    <li className="flex gap-2">
                        <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2.6} />
                        That the public network granted or performed the verification.
                    </li>
                    <li className="flex gap-2">
                        <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2.6} />
                        That anything is authorised. An anchor carries no authority at all.
                    </li>
                    <li className="flex gap-2">
                        <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2.6} />
                        That the evidence set was complete. An epoch proves what was
                        included, not that nothing was left out.
                    </li>
                </ul>
                <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/80">
                    This page compares two recorded digests. It does not rebuild the Merkle
                    root in your browser. Genuine independent verification means recomputing
                    the root yourself from the artifacts, using the algorithm named in the
                    anchor manifest.
                </p>
            </div>

            {capabilities.length > 0 && (
                <div className="mt-4">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowArtifacts((s) => !s)}
                        aria-expanded={showArtifacts}
                    >
                        <ChevronDown
                            className={cn('h-4 w-4 transition-transform', showArtifacts && 'rotate-180')}
                        />
                        {showArtifacts ? 'Hide' : 'Show'} covered capabilities ({capabilities.length})
                    </Button>
                    {showArtifacts && (
                        <ul className="mt-3 space-y-2">
                            {capabilities.map((c, i) => (
                                <li
                                    key={c?.capability_id || i}
                                    className="border border-border bg-card p-3"
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="font-evidence text-[12px] text-foreground">
                                            {c?.capability_id || 'unidentified capability'}
                                        </span>
                                        <span className="font-evidence text-[11px] text-muted-foreground">
                                            {c?.source_commit
                                                ? `commit ${String(c.source_commit).slice(0, 10)}`
                                                : 'no source commit recorded'}
                                        </span>
                                    </div>
                                    {c?.title && (
                                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                            {c.title}
                                        </p>
                                    )}
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {['lineage', 'sbom', 'tevv'].map((k) => {
                                            const meta = layerMeta(c?.[k]);
                                            return (
                                                <span
                                                    key={k}
                                                    className={cn(
                                                        'inline-flex items-center gap-1 border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]',
                                                        meta.cls,
                                                    )}
                                                >
                                                    {k}: {meta.label}
                                                </span>
                                            );
                                        })}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </Card>
    );
}
