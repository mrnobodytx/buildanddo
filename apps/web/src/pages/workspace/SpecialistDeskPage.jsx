// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/SpecialistDeskPage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-WITNESS-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/components/workspace/PublicProof.jsx,
//              apps/web/src/components/workspace/EpochTimeline.jsx,
//              apps/web/src/lib/observability/runtime.js,
//              docs/architecture/CAPABILITY_PASSPORT.md
// EnumType:    Route
// EnumEdges:   CONSUMES apps/pocketbase/pb_migrations/1788940000_create_evidence_witness.js;
//              PRODUCES datadog.rum.action passport.viewed;
//              VALIDATES docs/architecture/CAPABILITY_PASSPORT.md
// Intent:      Show the verifiable provenance record behind each capability, and let
//              a reader check a root digest against a public anchor themselves.
// ───────────────────────────────────────────────────────────────
//
// The file path is retained from the former Specialist Desks page so existing
// routes and bookmarks keep working; the surface itself is now the Capability
// Passport viewer (SRS-BUILDANDDO-WITNESS-001). A file rename is a separate,
// mechanical follow-up and deliberately not bundled here.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BadgeCheck, Loader2, Info, ShieldCheck, AlertCircle } from 'lucide-react';
import { useRecords } from '@/hooks/useWorkspaceRecords';
import EmptyState from '@/components/workspace/EmptyState';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import PublicProof, { compareRoots } from '@/components/workspace/PublicProof';
import EpochTimeline, { shortDigest } from '@/components/workspace/EpochTimeline';
import { Button, Card, Rule, StatePill } from '@/components/site/ui';
import { reportAction } from '@/lib/observability/runtime';

// Layer state -> the StatePill vocabulary. ABSENT maps to 'unavailable' rather
// than to a failure: no record is a truthful value, not a negative result.
const LAYER_LABEL = {
    VERIFIED: 'verified',
    PENDING: 'pending',
    ABSENT: 'unavailable',
    FAILED: 'failed',
};

function layerState(value) {
    return LAYER_LABEL[value] || LAYER_LABEL.ABSENT;
}

function asArray(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value) {
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
 * Projects the capability rows carried by each epoch into one list.
 *
 * Epochs arrive newest first, so the first sighting of a capability is its most
 * recent record and later (older) epochs never overwrite it. Nothing is
 * inferred: a capability appears only because an epoch recorded it, and its
 * witness state comes from that epoch's anchor, not from the other layers.
 */
function projectCapabilities(epochs, anchorFor) {
    const seen = new Map();
    for (const epoch of epochs) {
        for (const cap of asArray(epoch.capabilities)) {
            const id = cap?.capability_id;
            if (!id || seen.has(id)) continue;
            const anchor = anchorFor(epoch);
            const outcome = compareRoots(epoch.root_digest, anchor?.observed_public_root);
            seen.set(id, {
                ...cap,
                capability_id: id,
                epoch,
                anchor,
                witness:
                    outcome === 'match'
                        ? 'VERIFIED'
                        : outcome === 'mismatch'
                            ? 'FAILED'
                            : 'PENDING',
            });
        }
    }
    return Array.from(seen.values());
}

export default function SpecialistDeskPage() {
    const {
        records: epochs,
        loading: epochsLoading,
        error: epochsError,
    } = useRecords('evidence_epochs', { sort: '-sealed_at' });
    const { records: anchors, error: anchorsError } = useRecords('anchor_manifests', {
        sort: '-anchored_at',
    });

    const [selectedId, setSelectedId] = useState(null);
    const [showProof, setShowProof] = useState(false);

    // Reported once the first read has settled, so the count is the real one
    // and a view is not counted twice per visit.
    const viewReported = useRef(false);
    useEffect(() => {
        if (epochsLoading || viewReported.current) return;
        viewReported.current = true;
        reportAction('passport.viewed', {
            epoch_count: epochs.length,
            anchored_count: epochs.filter((e) => e.status === 'ANCHORED').length,
            read_failed: Boolean(epochsError),
        });
    }, [epochsLoading, epochs, epochsError]);

    const anchorFor = useMemo(
        () => (epoch) => anchors.find((a) => a.epoch === epoch?.id) || null,
        [anchors],
    );

    const capabilities = useMemo(
        () => projectCapabilities(epochs, anchorFor),
        [epochs, anchorFor],
    );

    const selected = useMemo(
        () => epochs.find((e) => e.id === selectedId) || epochs[0] || null,
        [epochs, selectedId],
    );
    const selectedAnchor = selected ? anchorFor(selected) : null;

    const selectEpoch = (epoch) => {
        setSelectedId(epoch.id);
        reportAction('passport.epoch_selected', {
            epoch_id: epoch.display_id,
            epoch_status: epoch.status,
        });
    };

    const verify = () => {
        setShowProof(true);
        reportAction('passport.verify_clicked', {
            epoch_id: selected?.display_id || null,
            outcome: compareRoots(selected?.root_digest, selectedAnchor?.observed_public_root),
        });
    };

    const unavailable = Boolean(epochsError || anchorsError);

    return (
        <div className="space-y-8">
            <PageHeader
                title="Capability Passport"
                description="The verifiable provenance record behind each capability: which commit it came from, what it is built out of, whether it was actually tested, and whether that record was pinned to a public timestamp BuildAndDo does not control. Every layer is either a record or an explicit absence."
            />

            {unavailable && (
                <p className="flex items-start gap-2 text-sm text-destructive" role="alert">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    The evidence witness collections could not be read. Nothing is inferred
                    from that: no passport state is shown while the record is unavailable.
                </p>
            )}

            {/* ---- Capability layers ------------------------------------- */}
            <section className="space-y-3">
                <h2 className="font-display text-lg font-semibold tracking-tight">
                    Verified capabilities
                </h2>
                {epochsLoading ? (
                    <Card className="p-8 text-center text-sm text-muted-foreground">
                        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </Card>
                ) : capabilities.length === 0 ? (
                    <EmptyState
                        icon={BadgeCheck}
                        title="No capability has a published passport yet"
                        description="A passport appears once an evidence epoch records a capability with its source lineage, SBOM and TEVV outcome. The epoch aggregator runs on the private plane; until it publishes, this page shows nothing rather than a placeholder."
                    />
                ) : (
                    <ul className="grid gap-3 sm:grid-cols-2">
                        {capabilities.map((c) => (
                            <li key={c.capability_id}>
                                <Card className="p-5">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="font-evidence text-sm text-foreground">
                                                {c.capability_id}
                                            </p>
                                            {c.title && (
                                                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                                                    {c.title}
                                                </p>
                                            )}
                                        </div>
                                        <StatePill state={layerState(c.witness)} />
                                    </div>
                                    <Rule className="my-3" />
                                    <dl className="space-y-2 text-xs">
                                        <div className="flex items-center justify-between gap-2">
                                            <dt className="text-muted-foreground">Source lineage</dt>
                                            <dd className="flex items-center gap-2">
                                                <span className="font-evidence text-[11px] text-muted-foreground">
                                                    {c.source_commit
                                                        ? String(c.source_commit).slice(0, 10)
                                                        : 'no commit'}
                                                </span>
                                                <StatePill state={layerState(c.lineage)} />
                                            </dd>
                                        </div>
                                        <div className="flex items-center justify-between gap-2">
                                            <dt className="text-muted-foreground">SBOM linked</dt>
                                            <dd><StatePill state={layerState(c.sbom)} /></dd>
                                        </div>
                                        <div className="flex items-center justify-between gap-2">
                                            <dt className="text-muted-foreground">TEVV verification</dt>
                                            <dd><StatePill state={layerState(c.tevv)} /></dd>
                                        </div>
                                        <div className="flex items-center justify-between gap-2">
                                            <dt className="text-muted-foreground">Public witness</dt>
                                            <dd><StatePill state={layerState(c.witness)} /></dd>
                                        </div>
                                    </dl>
                                    <Rule className="my-3" />
                                    <p className="font-evidence text-[11px] text-muted-foreground">
                                        {c.epoch?.display_id || 'no epoch'} · root{' '}
                                        {shortDigest(c.epoch?.root_digest)}
                                    </p>
                                </Card>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* ---- Epoch browser ----------------------------------------- */}
            <section className="space-y-3">
                <h2 className="font-display text-lg font-semibold tracking-tight">
                    Evidence epochs
                </h2>
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    Internal events are batched into epochs and reduced to one deterministic
                    root digest. Each epoch records its parent&apos;s root, so a removed or
                    reordered epoch is detectable. Only counts and digests are published
                    here; the underlying artifacts stay on the private plane.
                </p>
                {epochsLoading ? (
                    <Card className="p-8 text-center text-sm text-muted-foreground">
                        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </Card>
                ) : epochs.length === 0 ? (
                    <EmptyState
                        icon={ShieldCheck}
                        title="No evidence epoch has been sealed yet"
                        description="An epoch appears here once it is closed and rooted. No epoch, no digest, and no anchor is displayed before one exists."
                    />
                ) : (
                    <EpochTimeline
                        epochs={epochs}
                        anchors={anchors}
                        selectedId={selected?.id}
                        onSelect={selectEpoch}
                    />
                )}
            </section>

            {/* ---- Verify independently ---------------------------------- */}
            <section className="space-y-3">
                <h2 className="font-display text-lg font-semibold tracking-tight">
                    Verify independently
                </h2>
                {!selected ? (
                    <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                        Nothing to verify yet. Once an epoch is sealed, its local root digest
                        can be compared against the digest recorded on a public network.
                    </p>
                ) : showProof ? (
                    <PublicProof
                        epochId={selected.display_id}
                        localRoot={selected.root_digest}
                        publicRoot={selectedAnchor?.observed_public_root}
                        anchorTimestamp={selectedAnchor?.anchored_at}
                        capabilities={asArray(selected.capabilities)}
                        anchorNetwork={selectedAnchor?.anchor_network}
                        anchorUrl={selectedAnchor?.anchor_url}
                    />
                ) : (
                    <Card className="p-5">
                        <p className="text-sm leading-relaxed text-muted-foreground">
                            Compare the root digest recorded for{' '}
                            <span className="font-evidence text-foreground">
                                {selected.display_id}
                            </span>{' '}
                            against the digest anchored on a public network. The comparison
                            states what it proves and, at greater length, what it does not.
                        </p>
                        <div className="mt-4">
                            <Button size="sm" onClick={verify}>
                                <ShieldCheck className="h-4 w-4" /> Verify independently
                            </Button>
                        </div>
                    </Card>
                )}
            </section>

            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground/70">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                A public anchor proves that a fingerprint existed by a given time and has
                not silently changed. It does not make any underlying claim true, and it
                grants no authority. Architecture and limits: docs/architecture/EVIDENCE_WITNESS.md.
            </p>
        </div>
    );
}
