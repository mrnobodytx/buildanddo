// ─── CGRF Header ─────────────────────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1790900000_signal_evidence_link.js
// Stage:       05_DATA
// SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
// CAPS:        B
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-20
// Depends:     apps/pocketbase/pb_migrations/1790800000_signal_mission_link.js (signals.mission)
// EnumType:    Migration
// EnumEdges:   PRODUCES signals.evidence relation;
//              VERIFIED_BY scripts/ci/ocn_signal_lifecycle.py chain readback
// Intent:      Let a signal point at the evidence it rests on, so an opinion carries its grounds in
//              the schema rather than in a sentence someone has to read and trust.
// ─────────────────────────────────────────────────────────────────────────────
//
// MEASURED 2026-09-20: signals recorded by OCN seats named their evidence record inside the
// `description` text - "Evidence record: 1f7z753e0ydykne". That is a string, not a link. Nothing
// stops it going stale, nothing resolves it, nothing can query "which signals rest on this
// evidence", and deleting the evidence leaves the sentence behind claiming it exists.
//
// A signal is an opinion. The whole reason to keep evidence separate from signal is that the
// grounds can be inspected apart from the judgement, and that only works if the link is real.
//
// maxSelect is 8, not 1: an inference usually rests on several observations, and forcing one would
// push the rest back into prose, which is the thing being fixed. Optional, because a `user` signal
// someone types by hand legitimately has no evidence yet and must still be raisable - requiring
// evidence would make the honest case impossible and the dishonest case (invent a record) easy.
//
// cascadeDelete is FALSE. Removing an evidence record must not silently delete the signals that
// cited it; a signal whose grounds were withdrawn is exactly the thing a reviewer needs to see.
//
// Reversible: down removes only this field.
// ─────────────────────────────────────────────────────────────────────────────
migrate(
  (app) => {
    const signals = app.findCollectionByNameOrId('signals');
    if (signals.fields.getByName('evidence')) return; // idempotent re-run
    const evidence = app.findCollectionByNameOrId('evidence');
    signals.fields.add(new RelationField({
      name: 'evidence',
      required: false,
      collectionId: evidence.id,
      maxSelect: 8,
      cascadeDelete: false,
    }));
    app.save(signals);
  },
  (app) => {
    const signals = app.findCollectionByNameOrId('signals');
    const field = signals.fields.getByName('evidence');
    if (!field) return;
    signals.fields.removeById(field.id);
    app.save(signals);
  }
);
