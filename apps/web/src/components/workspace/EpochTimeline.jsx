// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/EpochTimeline.jsx
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
// Intent:      Browse sealed evidence epochs and the hash links that chain them,
//              without implying a proof the record does not contain.
// ───────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { ChevronDown, GitCommitVertical, Link2, Link2Off } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Rule, StatePill } from '@/components/site/ui';

// Epoch status -> the StatePill vocabulary already used across the workspace.
const STATUS_PILL = {
    OPEN: 'active',
    SEALED: 'pending',
    ANCHOR_PENDING: 'pending',
    ANCHORED: 'verified',
    MISMATCH: 'failed',
};

const STATUS_NOTE = {
    OPEN: 'Still accepting artifacts. No stable root yet.',
    SEALED: 'Closed and rooted. Not submitted to a public witness.',
    ANCHOR_PENDING: 'Submitted to a public witness; no confirmation recorded yet.',
    ANCHORED: 'Root digest recorded on a public network.',
    MISMATCH: 'Recorded evidence disagrees with the anchored root. Under investigation.',
};

export function shortDigest(value, head = 8, tail = 8) {
    if (!value) return 'not recorded';
    const v = String(value);
    if (v.length <= head + tail + 3) return v;
    return `${v.slice(0, head)}...${v.slice(-tail)}`;
}

function asArray(value) {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    // A json field can arrive as a string if it was stored pre-serialised.
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    }
    return [];
}

/**
 * Merkle path for one artifact.
 *
 * When the epoch record carries no path for an artifact, this says so rather
 * than drawing a plausible-looking tree. A diagram of a path that was never
 * published would be the exact kind of decorative proof this surface exists to
 * avoid.
 */
function MerklePath({ artifact, rootDigest }) {
    const path = asArray(artifact?.merkle_path);
    if (!path.length) {
        return (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                <Link2Off className="mt-0.5 h-3 w-3 shrink-0" />
                No Merkle path published for this artifact. Recompute it from the full
                artifact set using the algorithm named in the anchor manifest.
            </p>
        );
    }
    return (
        <ol className="font-evidence mt-2 space-y-1 text-[11px] text-muted-foreground">
            <li className="text-foreground">leaf {shortDigest(artifact?.digest)}</li>
            {path.map((step, i) => (
                <li key={i} className="flex items-center gap-1.5">
                    <span aria-hidden="true" className="text-muted-foreground/60">
                        &#8627;
                    </span>
                    {typeof step === 'string'
                        ? `sibling ${shortDigest(step)}`
                        : `${step?.side || 'sibling'} ${shortDigest(step?.digest)}`}
                </li>
            ))}
            <li className="flex items-center gap-1.5 text-foreground">
                <span aria-hidden="true" className="text-muted-foreground/60">
                    &#8627;
                </span>
                root {shortDigest(rootDigest)}
            </li>
        </ol>
    );
}

function EpochRow({ epoch, anchor, isLast, expanded, selected, onToggle }) {
    const artifacts = asArray(epoch.artifacts);
    const capabilities = asArray(epoch.capabilities);
    const status = epoch.status || 'SEALED';
    const sealed = epoch.sealed_at || epoch.created;

    return (
        <li className="relative pl-8">
            {/* Chain rail: the vertical line between epochs is the hash link. */}
            {!isLast && (
                <span
                    aria-hidden="true"
                    className="absolute left-[11px] top-7 h-[calc(100%-1rem)] w-px bg-border"
                />
            )}
            <span
                aria-hidden="true"
                className={cn(
                    'absolute left-0 top-1 flex h-6 w-6 items-center justify-center border',
                    status === 'ANCHORED'
                        ? 'border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/10 text-success'
                        : status === 'MISMATCH'
                            ? 'border-primary/40 bg-primary/10 text-primary'
                            : 'border-border bg-secondary text-muted-foreground',
                )}
            >
                <GitCommitVertical className="h-3.5 w-3.5" strokeWidth={2.4} />
            </span>

            <div
                className={cn(
                    'border bg-card p-4 transition-colors',
                    selected ? 'border-primary/50' : 'border-border',
                )}
            >
                <button
                    type="button"
                    onClick={() => onToggle(epoch)}
                    aria-expanded={expanded}
                    className="w-full text-left"
                >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                            <p className="font-evidence text-sm text-foreground">
                                {epoch.display_id}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {sealed ? new Date(sealed).toLocaleString() : 'no seal timestamp'}
                                {' · '}
                                {Number(epoch.artifact_count ?? artifacts.length) || 0} artifacts
                                {capabilities.length > 0 && ` · ${capabilities.length} capabilities`}
                            </p>
                        </div>
                        <span className="flex shrink-0 items-center gap-2">
                            <StatePill state={STATUS_PILL[status] || 'pending'} />
                            <ChevronDown
                                className={cn(
                                    'h-4 w-4 text-muted-foreground transition-transform',
                                    expanded && 'rotate-180',
                                )}
                            />
                        </span>
                    </div>

                    <div className="font-evidence mt-3 space-y-1 text-[11px] text-muted-foreground">
                        <p>
                            root {shortDigest(epoch.root_digest)}
                            {epoch.root_algorithm ? ` · ${epoch.root_algorithm}` : ''}
                        </p>
                        <p className="flex items-center gap-1.5">
                            {epoch.previous_root ? (
                                <Link2 className="h-3 w-3 shrink-0" />
                            ) : (
                                <Link2Off className="h-3 w-3 shrink-0" />
                            )}
                            {epoch.previous_root
                                ? `parent ${shortDigest(epoch.previous_root)}`
                                : 'no parent recorded (first epoch, or chain start)'}
                        </p>
                    </div>
                </button>

                {expanded && (
                    <div className="mt-3">
                        <Rule className="mb-3" />
                        <p className="text-xs leading-relaxed text-muted-foreground">
                            {STATUS_NOTE[status] || 'Status not recognised.'}
                        </p>

                        {anchor && (
                            <dl className="font-evidence mt-3 space-y-1 text-[11px] text-muted-foreground">
                                <div className="flex justify-between gap-3">
                                    <dt>manifest</dt>
                                    <dd className="text-foreground">{anchor.schema || 'unversioned'}</dd>
                                </div>
                                <div className="flex justify-between gap-3">
                                    <dt>manifest digest</dt>
                                    <dd className="text-foreground">{shortDigest(anchor.manifest_digest)}</dd>
                                </div>
                                <div className="flex justify-between gap-3">
                                    <dt>observed public root</dt>
                                    <dd className="text-foreground">{shortDigest(anchor.observed_public_root)}</dd>
                                </div>
                                <div className="flex justify-between gap-3">
                                    <dt>witness</dt>
                                    <dd className="text-foreground">{anchor.anchor_network || 'not recorded'}</dd>
                                </div>
                                <div className="flex justify-between gap-3">
                                    <dt>trigger</dt>
                                    <dd className="text-foreground">{anchor.trigger || 'not recorded'}</dd>
                                </div>
                            </dl>
                        )}

                        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            Artifacts in this epoch
                        </p>
                        {artifacts.length === 0 ? (
                            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                                The artifact list for this epoch is not published here. Only the
                                count and the root digest are recorded on the public plane.
                            </p>
                        ) : (
                            <ul className="mt-2 space-y-2">
                                {artifacts.map((a, i) => (
                                    <li key={a?.id || i} className="border border-border bg-secondary/20 p-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <span className="font-evidence text-[12px] text-foreground">
                                                {a?.id || `artifact ${i + 1}`}
                                            </span>
                                            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                                {a?.kind || 'unclassified'}
                                            </span>
                                        </div>
                                        <MerklePath artifact={a} rootDigest={epoch.root_digest} />
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </div>
        </li>
    );
}

/**
 * Timeline of evidence epochs, newest first.
 *
 * The rail between rows is the epoch hash chain: each epoch records its
 * parent's root, so a removed or reordered epoch is detectable. Rows report
 * only what the record contains.
 */
export default function EpochTimeline({
    epochs = [],
    anchors = [],
    selectedId,
    onSelect,
    className,
}) {
    const [expandedId, setExpandedId] = useState(null);

    const anchorFor = (epoch) =>
        anchors.find((a) => a.epoch === epoch.id) || null;

    const toggle = (epoch) => {
        setExpandedId((prev) => (prev === epoch.id ? null : epoch.id));
        if (onSelect) onSelect(epoch);
    };

    if (epochs.length === 0) return null;

    return (
        <ol className={cn('space-y-3', className)}>
            {epochs.map((epoch, i) => (
                <EpochRow
                    key={epoch.id}
                    epoch={epoch}
                    anchor={anchorFor(epoch)}
                    isLast={i === epochs.length - 1}
                    expanded={expandedId === epoch.id}
                    selected={selectedId === epoch.id}
                    onToggle={toggle}
                />
            ))}
        </ol>
    );
}
