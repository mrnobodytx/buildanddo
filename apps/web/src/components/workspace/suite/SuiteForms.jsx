// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/suite/SuiteForms.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-16
// Depends:     apps/web/src/lib/missionSuite.js, apps/web/src/components/workspace/ControlPrimitives.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/missionSuite.js; DEPENDS_ON apps/web/src/components/workspace/ControlPrimitives.jsx
// DAG Node:    none
// Intent:      Collect permitted observations and source-backed submission requirements with explicit human review boundaries.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from 'react';
import { Button, Card } from '@/components/site/ui';
import { controlInput } from '@/components/workspace/ControlPrimitives';
import { fingerprintPdf } from '@/lib/missionSuite';

function Field({ label, children }) { return <label className="block min-w-0 space-y-1 text-sm"><span>{label}</span>{children}</label>; }
function Text({ label, value, onChange, disabled, maxLength = 1200, ...rest }) {
    return <Field label={label}><input className={controlInput} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} maxLength={maxLength} {...rest} /></Field>;
}
const blankRight = () => ({ source_id: '', rights_id: '', license_ref: '', classification: 'PUBLIC', processing_allowed: false,
    export_allowed: false, expires_at: '', independence_group: '' });

/** @param {object} props Saved controls and mutation state. @returns {React.ReactElement} Administrator configuration. */
export function SuiteConfiguration({ config, disabled, onSave }) {
    const [draft, setDraft] = useState(() => ({ enabled: config.enabled, rights: structuredClone(config.rights), parameters: { ...config.parameters } }));
    const editRight = (index, field, value) => setDraft((old) => ({ ...old, rights: old.rights.map((right, i) => i === index ? { ...right, [field]: value } : right) }));
    return <Card className="p-5"><details>
        <summary className="cursor-pointer py-2 font-display text-lg">Mission settings and source rights</summary>
        <form className="mt-4 space-y-4" aria-label="Configure mission suite" onSubmit={(event) => { event.preventDefault(); onSave(draft); }}>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" disabled={disabled} checked={draft.enabled} onChange={(e) => setDraft((old) => ({ ...old, enabled: e.target.checked }))} />Enable suite analysis for this mission</label>
            <p className="text-sm text-muted-foreground">Submission review can run without observation sources. Maritime analysis requires current processing rights for every source. Changing settings invalidates unfinished runs.</p>
            {draft.rights.map((right, index) => <fieldset key={index} className="space-y-3 border border-border p-4" disabled={disabled}>
                <legend className="px-2 text-sm font-semibold">Source {index + 1}</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                    {[['source_id', 'Source identifier'], ['rights_id', 'Rights record identifier'], ['license_ref', 'License or permission reference'], ['independence_group', 'Upstream source group']].map(([field, label]) =>
                        <Text key={field} label={label} value={right[field]} required maxLength={field === 'license_ref' ? 2048 : 80} onChange={(value) => editRight(index, field, value)} />)}
                    <Text label="Rights expire at (UTC)" value={right.expires_at} required placeholder="YYYY-MM-DDTHH:MM:SSZ" maxLength={40} onChange={(value) => editRight(index, 'expires_at', value)} />
                    <Field label="Classification"><select className={controlInput} value={right.classification} onChange={(e) => editRight(index, 'classification', e.target.value)}><option value="PUBLIC">Public</option><option value="COMMERCIAL">Licensed commercial</option></select></Field>
                </div>
                <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={right.processing_allowed} onChange={(e) => editRight(index, 'processing_allowed', e.target.checked)} />The referenced rights permit processing in this workspace</label>
                <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={right.export_allowed} onChange={(e) => editRight(index, 'export_allowed', e.target.checked)} />The referenced rights permit export (no export service is enabled here)</label>
                <Button type="button" variant="secondary" size="sm" onClick={() => setDraft((old) => ({ ...old, rights: old.rights.filter((_, i) => i !== index) }))}>Remove source {index + 1}</Button>
            </fieldset>)}
            <Button type="button" variant="secondary" disabled={disabled || draft.rights.length >= 32} onClick={() => setDraft((old) => ({ ...old, rights: [...old.rights, blankRight()] }))}>Add source rights</Button>
            <details><summary className="cursor-pointer py-2 text-sm">Detection thresholds</summary><div className="grid gap-3 sm:grid-cols-2">
                {[['gap_seconds', 'Observation gap (seconds)', 60, 86400], ['max_speed_knots', 'Apparent speed (knots)', 1, 100],
                    ['position_tolerance_m', 'Position conflict distance (metres)', 10, 100000], ['stale_seconds', 'Stale after (seconds)', 60, 604800]].map(([key, label, min, max]) =>
                    <Text key={key} label={label} type="number" required min={min} max={max} disabled={disabled} value={draft.parameters[key]} onChange={(value) => setDraft((old) => ({ ...old, parameters: { ...old.parameters, [key]: Number(value) } }))} />)}
            </div></details>
            <Button type="submit" disabled={disabled}>Save mission settings</Button>
        </form>
    </details></Card>;
}

/** @param {object} props Permitted sources and enqueue operation. @returns {React.ReactElement} Observation entry. */
export function MaritimeForm({ rights, disabled, onRun }) {
    const empty = { observation_id: '', source_id: '', source_record_id: '', entity_id: '', event_time: '', latitude: '', longitude: '' };
    const [form, setForm] = useState(empty); const [error, setError] = useState(''); const live = useRef(true);
    useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
    const set = (field, value) => setForm((old) => ({ ...old, [field]: value }));
    const submit = async (e) => {
        e.preventDefault(); setError('');
        if (!form.source_id || !form.latitude.trim() || !form.longitude.trim()) { setError('Choose a permitted source and both coordinates.'); return; }
        const result = await onRun({ observations: [{ ...form, latitude: Number(form.latitude), longitude: Number(form.longitude) }] });
        if (live.current && result.ok) setForm(empty);
    };
    return <Card className="p-5"><form className="space-y-4" aria-label="Analyze maritime observation" onSubmit={submit}>
        <h2 className="font-display text-xl">Maritime observation</h2>
        <p className="text-sm text-muted-foreground">Add an authorized observation to this mission’s retained history. Entity identifiers are association claims supplied by you. Resulting candidates wait for NNC admission.</p>
        <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-2">
            <legend className="sr-only">Observation fields</legend>
            <Field label="Source"><select className={controlInput} required value={form.source_id} onChange={(e) => set('source_id', e.target.value)}><option value="">Choose a source</option>{rights.filter((right) => right.processing_allowed).map((right) => <option key={right.source_id} value={right.source_id}>{right.source_id}</option>)}</select></Field>
            {[['observation_id', 'Observation identifier'], ['source_record_id', 'Source record identifier'], ['entity_id', 'Claimed vessel identifier']].map(([key, label]) =>
                <Text key={key} label={label} value={form[key]} required maxLength={80} pattern="[A-Za-z0-9_:.-]+" onChange={(value) => set(key, value)} />)}
            <Text label="Observation time (UTC)" value={form.event_time} required maxLength={40} placeholder="YYYY-MM-DDTHH:MM:SSZ" onChange={(value) => set('event_time', value)} />
            <Text label="Latitude (WGS84)" type="number" required min={-90} max={90} step="any" value={form.latitude} onChange={(value) => set('latitude', value)} />
            <Text label="Longitude (WGS84)" type="number" required min={-180} max={180} step="any" value={form.longitude} onChange={(value) => set('longitude', value)} />
        </fieldset>
        {error && <p role="alert" className="text-sm">{error}</p>}
        <Button type="submit" disabled={disabled}>Queue observation analysis</Button>
    </form></Card>;
}

const requirement = (n) => ({ id: `requirement-${n}`, criterion: '', source_url: '', source_revision: '', evidence_ids: [], status: 'open', justification: '' });

/** @param {object} props Mission evidence and enqueue operation. @returns {React.ReactElement} Document and requirement review. */
export function SubmissionForm({ evidence, evidenceAvailable, disabled, onRun }) {
    const [requirements, setRequirements] = useState([requirement(1)]); const [artifact, setArtifact] = useState({ name: '', sha256: '', format: 'paper', pages: '', max_pages: '', rule_url: '', rule_revision: '', deadline: '' });
    const [error, setError] = useState(''); const [hashing, setHashing] = useState(false); const request = useRef(0); const nextRequirement = useRef(2);
    useEffect(() => () => { request.current++; }, []);
    const set = (key, value) => setArtifact((old) => ({ ...old, [key]: value }));
    const edit = (index, key, value) => setRequirements((old) => old.map((row, i) => i === index ? { ...row, [key]: value } : row));
    const selectFile = async (e) => {
        const attempt = ++request.current; const file = e.target.files?.[0]; setHashing(Boolean(file)); setArtifact((old) => ({ ...old, name: '', sha256: '' })); setError('');
        if (!file) return;
        try { const value = await fingerprintPdf(file); if (attempt === request.current) setArtifact((old) => ({ ...old, ...value })); }
        catch { if (attempt === request.current) setError('Could not fingerprint this PDF. Select a valid file of at most 20 MiB in a browser with Web Crypto.'); }
        finally { if (attempt === request.current) setHashing(false); }
    };
    const locked = disabled || hashing;
    return <Card className="p-5"><form aria-label="Check government submission" className="space-y-5" onSubmit={(e) => {
        e.preventDefault(); setError('');
        if (!artifact.sha256) { setError('Select the rendered PDF before reviewing readiness.'); return; }
        onRun({ requirements, document: { ...artifact, pages: Number(artifact.pages), max_pages: Number(artifact.max_pages) } });
    }}>
        <h2 className="font-display text-xl">Submission readiness</h2>
        <p className="text-sm text-muted-foreground">Use the current US government opportunity and amendments. The check reviews your declarations and saved evidence; a human must confirm the actual rules and decide whether to submit.</p>
        <Field label="Rendered PDF (fingerprinted here; document bytes are not uploaded)"><input className={controlInput} type="file" accept=".pdf,application/pdf" disabled={disabled} onChange={selectFile} /></Field>
        {hashing && <p role="status" className="text-sm">Fingerprinting PDF…</p>}
        {artifact.sha256 && <p role="status" className="break-all text-xs">{artifact.name} · SHA-256 {artifact.sha256}</p>}
        <fieldset className="grid gap-3 sm:grid-cols-2" disabled={locked}><legend className="sr-only">Final document declarations</legend>
            <Field label="Permitted format"><select className={controlInput} value={artifact.format} onChange={(e) => set('format', e.target.value)}><option value="paper">White paper</option><option value="deck">Slide deck</option></select></Field>
            <Text label="Measured page or slide count" type="number" required min={1} max={1000} value={artifact.pages} onChange={(value) => set('pages', value)} />
            <Text label="Limit in the current notice" type="number" required min={1} max={1000} value={artifact.max_pages} onChange={(value) => set('max_pages', value)} />
            <Text label="Official format rule URL" type="url" maxLength={2048} value={artifact.rule_url} onChange={(value) => set('rule_url', value)} />
            <Text label="Rule amendment or revision" maxLength={200} value={artifact.rule_revision} onChange={(value) => set('rule_revision', value)} />
            <Text label="Submission deadline converted to UTC" required maxLength={40} placeholder="YYYY-MM-DDTHH:MM:SSZ" value={artifact.deadline} onChange={(value) => set('deadline', value)} />
        </fieldset>
        {requirements.map((row, index) => <fieldset key={row.id} disabled={locked} className="space-y-3 border border-border p-4">
            <legend className="px-2 text-sm font-semibold">Requirement {index + 1}</legend>
            <Text label="Required outcome or criterion" required value={row.criterion} onChange={(value) => edit(index, 'criterion', value)} />
            <div className="grid gap-3 sm:grid-cols-2">
                <Text label="Official requirement URL" type="url" maxLength={2048} value={row.source_url} onChange={(value) => edit(index, 'source_url', value)} />
                <Text label="Requirement amendment or revision" maxLength={200} value={row.source_revision} onChange={(value) => edit(index, 'source_revision', value)} />
                <Field label="Requirement status"><select className={controlInput} value={row.status} onChange={(e) => edit(index, 'status', e.target.value)}><option value="open">Open</option><option value="satisfied">Evidence supplied</option><option value="not_applicable">Not applicable (explain)</option></select></Field>
                <Field label="Supporting mission evidence"><select className={controlInput} disabled={!evidenceAvailable} value={row.evidence_ids[0] || ''} onChange={(e) => edit(index, 'evidence_ids', e.target.value ? [e.target.value] : [])}><option value="">No evidence linked</option>{evidence.map((item) => <option key={item.id} value={item.id}>{item.title || item.id} ({item.type})</option>)}</select></Field>
            </div>
            <Text label="Non-applicability explanation or reviewer note" value={row.justification} onChange={(value) => edit(index, 'justification', value)} />
            {requirements.length > 1 && <Button type="button" variant="secondary" size="sm" onClick={() => setRequirements((old) => old.filter((_, i) => i !== index))}>Remove requirement {index + 1}</Button>}
        </fieldset>)}
        {!evidenceAvailable && <p role="status" className="text-sm">Mission evidence is unavailable. Reload it before linking verification records.</p>}
        <div className="flex flex-wrap gap-3"><Button type="button" variant="secondary" disabled={locked || requirements.length >= 50} onClick={() => setRequirements((old) => [...old, requirement(nextRequirement.current++)])}>Add requirement</Button><Button type="submit" disabled={locked}>Queue readiness review</Button></div>
        {error && <p role="alert" className="text-sm">{error}</p>}
    </form></Card>;
}
