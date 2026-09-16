// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/web/src/components/workspace/missions/MissionBuilder.jsx
// Stage:        07_BUILD
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-15
// Depends:      apps/web/src/lib/missionLearning.js, apps/pocketbase/pb_migrations/data/government-submissions.json
// EnumType:     Widget
// EnumEdges:    DEPENDS_ON apps/web/src/lib/missionLearning.js; CONSUMES apps/pocketbase/pb_migrations/data/government-submissions.json
// DAG Node:     none
// Intent:       Help operators author purpose, permission boundaries and TEVV methods while preserving incomplete drafts and rejected saves.
// ───────────────────────────────────────────────────────────────

import React, { useId, useRef, useState } from 'react';
import { Button } from '@/components/site/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PLAN_FIELDS, planIssues, readPlan } from '@/lib/missionLearning';
import government from '../../../../../pocketbase/pb_migrations/data/government-submissions.json';

const STEPS = [
    {
        name: 'Purpose',
        group: 'scope',
        why: 'A measurable target and explicit limits let a reviewer distinguish improvement from activity.',
    },
    {
        name: 'Safety',
        group: 'security',
        why: 'OWASP practices belong in the plan: preserve authorization, check untrusted inputs, protect data and prepare recovery.',
    },
    {
        name: 'TEVV',
        group: 'tevv',
        why: 'NIST risk management uses evidence across the lifecycle. Plan testing, evaluation, verification and validation before observing the result.',
    },
    {
        name: 'Review draft',
        group: null,
        why: 'Saving preserves your work. Approval is a separate decision on the saved plan; it does not run an automation.',
    },
];

/** Guide a learner through a saved proposal without inventing measurements or approvals. */
export default function MissionBuilder({ mission, onSave, onCancel, disabled = false }) {
    const uid = useId();
    const [step, setStep] = useState(0);
    const [plan, setPlan] = useState(() => readPlan(mission?.mission_plan));
    const [form, setForm] = useState({
        title: mission?.title || '',
        description: mission?.description || '',
        priority: mission?.priority || 'normal',
        due_date: mission?.due_date?.slice(0, 10) || '',
    });
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const pending = useRef(false);
    const heading = useRef(null);
    const changeStep = (next) => {
        setStep(next);
        requestAnimationFrame(() => heading.current?.focus());
    };
    const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
    const issues = planIssues(plan);
    const submit = async (event) => {
        event.preventDefault();
        if (pending.current || disabled) return;
        if (!form.title.trim()) {
            setError('Give the mission a clear goal.');
            changeStep(0);
            return;
        }
        pending.current = true;
        setSaving(true);
        setError('');
        try {
            const result = await onSave({
                title: form.title.trim(),
                description: form.description.trim(),
                priority: form.priority,
                due_date: form.due_date || '',
                status: 'proposed',
                mission_plan: {
                    ...plan,
                    ...Object.fromEntries(PLAN_FIELDS.map(({ id }) => [id, plan[id].trim()])),
                },
            });
            if (!result.ok)
                setError(
                    result.error || 'The draft could not be saved. Your answers are still here.',
                );
        } catch {
            setError('The draft could not be saved. Your answers are still here.');
        } finally {
            pending.current = false;
            setSaving(false);
        }
    };
    const locked = disabled || saving;
    return (
        <form onSubmit={submit} className="space-y-5" aria-label="Mission plan" aria-busy={saving}>
            {!mission && !form.title && <div className="space-y-2 border border-border bg-secondary/30 p-4">
                <h3 className="font-display text-lg">Government submission mission</h3>
                <p className="text-sm text-muted-foreground">Start with a preparation plan, eight practical lessons and the mission suite. Review the plan before saving it as proposed.</p>
                <Button type="button" variant="secondary" disabled={locked} onClick={() => {
                    setForm({ ...government.mission, due_date: '' });
                    setPlan(readPlan(government.mission.mission_plan)); changeStep(0);
                }}>Use government submission starter</Button>
            </div>}
            <nav
                aria-label="Mission builder steps"
                className="grid grid-cols-2 gap-2 sm:grid-cols-4"
            >
                {STEPS.map((item, index) => (
                    <button
                        key={item.name}
                        type="button"
                        disabled={saving}
                        onClick={() => changeStep(index)}
                        aria-current={step === index ? 'step' : undefined}
                        className={`min-h-11 border px-3 py-2 text-sm ${step === index ? 'border-foreground bg-secondary font-semibold' : 'border-border'}`}
                    >
                        {index + 1}. {item.name}
                    </button>
                ))}
            </nav>
            <div key={step} className="mission-step space-y-4">
                <h3 ref={heading} tabIndex={-1} className="font-display text-xl font-semibold">
                    {STEPS[step].name}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{STEPS[step].why}</p>
                {step === 0 && (
                    <>
                        <div className="grid gap-2">
                            <Label htmlFor={`${uid}-title`}>Goal</Label>
                            <Input
                                id={`${uid}-title`}
                                value={form.title}
                                maxLength={200}
                                onChange={(e) => set('title', e.target.value)}
                                disabled={locked}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor={`${uid}-description`}>Short description</Label>
                            <Textarea
                                id={`${uid}-description`}
                                value={form.description}
                                maxLength={2000}
                                onChange={(e) => set('description', e.target.value)}
                                rows={2}
                                disabled={locked}
                            />
                        </div>
                    </>
                )}
                {PLAN_FIELDS.filter((field) => field.group === STEPS[step].group).map((field) => (
                    <div className="grid gap-2" key={field.id}>
                        <Label htmlFor={`${uid}-${field.id}`}>{field.label}</Label>
                        <p
                            id={`${uid}-${field.id}-help`}
                            className="text-xs leading-relaxed text-muted-foreground"
                        >
                            {field.how}
                        </p>
                        <Textarea
                            id={`${uid}-${field.id}`}
                            value={plan[field.id]}
                            maxLength={1200}
                            rows={2}
                            aria-describedby={`${uid}-${field.id}-help`}
                            disabled={locked}
                            onChange={(e) =>
                                setPlan((current) => ({ ...current, [field.id]: e.target.value }))
                            }
                        />
                    </div>
                ))}
                {step === 1 && (
                    <div className="grid gap-2">
                        <Label htmlFor={`${uid}-risk`}>Risk tier</Label>
                        <select
                            id={`${uid}-risk`}
                            value={plan.risk}
                            disabled={locked}
                            onChange={(e) =>
                                setPlan((current) => ({ ...current, risk: e.target.value }))
                            }
                            className="min-h-11 w-full border border-input bg-background p-2 text-sm"
                        >
                            <option value="A0">A0 — read or plan</option>
                            <option value="A1">A1 — local, reversible source work</option>
                            <option value="A2">A2 — bounded integration work</option>
                        </select>
                        <p className="text-xs text-muted-foreground">
                            Shared/staging changes or higher risk require separate owner approval.
                            Learning points never authorize them.
                        </p>
                    </div>
                )}
                {step === 3 && (
                    <>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor={`${uid}-priority`}>Priority</Label>
                                <select
                                    id={`${uid}-priority`}
                                    value={form.priority}
                                    disabled={locked}
                                    onChange={(e) => set('priority', e.target.value)}
                                    className="min-h-11 border border-input bg-background p-2 text-sm"
                                >
                                    {['low', 'normal', 'high', 'urgent'].map((priority) => (
                                        <option key={priority} value={priority}>
                                            {priority[0].toUpperCase() + priority.slice(1)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor={`${uid}-due`}>Due date (optional)</Label>
                                <Input
                                    id={`${uid}-due`}
                                    type="date"
                                    value={form.due_date}
                                    disabled={locked}
                                    onChange={(e) => set('due_date', e.target.value)}
                                />
                            </div>
                        </div>
                        <p className="font-semibold text-sm">
                            {issues.length
                                ? `${issues.length} plan items still need an answer before approval.`
                                : 'All plan sections are filled. Review the content before approving.'}
                        </p>
                        {issues.length > 0 && (
                            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                                {issues.map((issue) => (
                                    <li key={issue}>{issue}</li>
                                ))}
                            </ul>
                        )}
                        <p className="text-sm text-muted-foreground">
                            A draft can be incomplete. Saving a revised approved or paused mission
                            returns it to Proposed and clears its earlier approval and review.
                        </p>
                    </>
                )}
            </div>
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                {step > 0 && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={saving}
                        onClick={() => changeStep(step - 1)}
                    >
                        Back
                    </Button>
                )}
                {step < STEPS.length - 1 && (
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={saving}
                        onClick={() => changeStep(step + 1)}
                    >
                        Next: {STEPS[step + 1].name}
                    </Button>
                )}
                <Button type="submit" size="sm" disabled={locked}>
                    {saving ? 'Saving draft…' : 'Save draft'}
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={saving}
                    onClick={onCancel}
                >
                    Cancel
                </Button>
            </div>
        </form>
    );
}
