// ─── CGRF Header ─────────────────────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1790800000_signal_mission_link.js
// Stage:       05_DATA
// SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
// CAPS:        B
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-20
// Depends:     apps/pocketbase/pb_migrations/1788474000_create_workspace_collections.js (signals, missions)
// EnumType:    Migration
// EnumEdges:   PRODUCES signals.mission relation;
//              VERIFIED_BY scripts/ci/ocn_signal_lifecycle.py reporting can_promote_signal_to_mission
// Intent:      Let a signal name the mission it became, because the platform's whole claim is that
//              observation turns into governed work and nothing in the schema recorded that.
// ─────────────────────────────────────────────────────────────────────────────
//
// MEASURED 2026-09-20 on staging, from a fleet box with a real account: three signals of every type
// raise and triage correctly, and then stop. `signals` has no mission field and `missions` has no
// signal field, in either direction, so a signal that deserves work leaves no trace of the work it
// caused. Criterion D15-2 records the same gap from the other side - "no mission/signal-to-ERP
// relation or customer wiring was established".
//
// The relation is deliberately ONE-WAY and OPTIONAL. One-way because the back-relation is free in
// PocketBase (missions can be read through `signals_via_mission`) and a second stored field would be
// a second thing to keep true. Optional because most signals never become missions, and a required
// relation would make raising a signal impossible until someone invented a mission for it - which
// is exactly backwards for an observation.
//
// cascadeDelete is FALSE on purpose. Deleting a mission must not delete the signal that prompted it;
// the observation outlives the work, and losing it would destroy the only record that the work had a
// cause.
//
// Cross-workspace linking is NOT policed here. A relation field cannot express "must be in the same
// workspace as this record", and the honest place for that is the request hook that already governs
// these collections (workspace-record-policy.js RELATIONS). This migration adds the field it is
// missing; the hook is where the constraint belongs.
//
// Reversible: down removes exactly this field and nothing else. Existing signals keep every other
// value because removing a field does not touch the rest of the record.
// ─────────────────────────────────────────────────────────────────────────────
migrate(
  (app) => {
    const signals = app.findCollectionByNameOrId('signals');
    if (signals.fields.getByName('mission')) return; // idempotent re-run
    const missions = app.findCollectionByNameOrId('missions');
    signals.fields.add(new RelationField({
      name: 'mission',
      required: false,
      collectionId: missions.id,
      maxSelect: 1,
      cascadeDelete: false,
    }));
    app.save(signals);
  },
  (app) => {
    const signals = app.findCollectionByNameOrId('signals');
    const field = signals.fields.getByName('mission');
    if (!field) return;
    signals.fields.removeById(field.id);
    app.save(signals);
  }
);
