// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/web/src/components/workspace/missions/MissionLearning.jsx
// Stage:        07_BUILD
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-15
// Depends:      apps/web/src/lib/missionLearning.js
// EnumType:     Widget
// EnumEdges:    DEPENDS_ON apps/web/src/lib/missionLearning.js
// DAG Node:     none
// Intent:       Use saved knowledge checks and evidence to unlock educational examples, with finite non-monetary rewards and an explicitly unsigned record.
// ───────────────────────────────────────────────────────────────

import React, { useId, useRef, useState } from 'react';
import { Award, BookOpen, CheckCircle2, Circle } from 'lucide-react';
import { Button } from '@/components/site/ui';
import { LESSONS, TEVV, learningRecord, learningRewards } from '@/lib/missionLearning';

/** Award bounded learning feedback only for persisted answers and observations. */
export default function MissionLearning({ mission, evidence, onSave, disabled = false }) {
    const uid = useId();
    const [choices, setChoices] = useState(mission.mission_learning || {});
    const [feedback, setFeedback] = useState({});
    const [saving, setSaving] = useState(false);
    const pending = useRef(false);
    const rewards = learningRewards(mission, evidence);
    const check = async (event, lesson) => {
        event.preventDefault();
        if (pending.current || disabled || !choices[lesson.id]) return;
        pending.current = true;
        setSaving(true);
        try {
            const result = await onSave({
                ...mission.mission_learning,
                [lesson.id]: choices[lesson.id],
            });
            setFeedback((current) => ({
                ...current,
                [lesson.id]: result.ok
                    ? `${choices[lesson.id] === lesson.answer ? 'Answer saved. ' : 'Try another answer. '}${lesson.explanation}`
                    : result.error || 'Could not save this answer. Try again.',
            }));
        } catch {
            setFeedback((current) => ({
                ...current,
                [lesson.id]: 'Could not save this answer. Try again.',
            }));
        } finally {
            pending.current = false;
            setSaving(false);
        }
    };
    const download = () => {
        const url = URL.createObjectURL(
            new Blob([JSON.stringify(learningRecord(mission, evidence), null, 2)], {
                type: 'application/json',
            }),
        );
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `mission-${mission.id}-learning.json`;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    return (
        <section className="space-y-5" aria-labelledby={`${uid}-title`}>
            <div className="border border-border bg-secondary/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3
                        id={`${uid}-title`}
                        className="inline-flex items-center gap-2 font-display text-xl font-semibold"
                    >
                        <Award className="h-5 w-5" aria-hidden="true" />
                        Mission learning
                    </h3>
                    <p
                        key={rewards.points}
                        role="status"
                        className="mission-reward font-evidence text-sm"
                    >
                        {rewards.points} / {rewards.max} learning points
                    </p>
                </div>
                <div
                    role="progressbar"
                    aria-label="Saved learning progress"
                    aria-valuenow={rewards.points}
                    aria-valuemin={0}
                    aria-valuemax={rewards.max}
                    className="mt-3 h-2 overflow-hidden bg-muted"
                >
                    <div
                        className="mission-progress h-full bg-primary"
                        style={{ width: `${rewards.points}%` }}
                    />
                </div>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    Points belong to this mission and come from saved plans, knowledge checks and
                    honest review. Repeating a check adds no extra points. Failed and successful
                    experiments earn the same review credit. These points have no monetary value or
                    approval authority.
                </p>
                <div className="mt-3 flex flex-wrap gap-2" aria-label="Learning milestones">
                    {rewards.milestones.map((item) => (
                        <span
                            key={item.id}
                            className={`inline-flex items-center gap-1 border px-2 py-1 text-xs ${item.earned ? 'border-foreground' : 'border-border text-muted-foreground'}`}
                        >
                            {item.earned ? (
                                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                            ) : (
                                <Circle className="h-3 w-3" aria-hidden="true" />
                            )}
                            {item.label}:{' '}
                            {item.earned ? 'earned' : `${item.points} points available`}
                        </span>
                    ))}
                </div>
            </div>
            {LESSONS.map((lesson) => (
                <details key={lesson.id} className="border border-border bg-card p-4">
                    <summary className="min-h-8 cursor-pointer font-semibold">
                        {lesson.title} · 15 points
                    </summary>
                    <p className="mt-3 text-xs uppercase tracking-wider text-muted-foreground">
                        {lesson.framework}
                    </p>
                    <p className="mt-3 text-sm">
                        <strong>Why:</strong> {lesson.why}
                    </p>
                    <p className="mt-2 text-sm">
                        <strong>How:</strong> {lesson.how}
                    </p>
                    <form onSubmit={(event) => check(event, lesson)} className="mt-4 space-y-3">
                        <fieldset disabled={disabled || saving} className="space-y-2">
                            <legend className="mb-3 text-sm font-semibold">
                                {lesson.question}
                            </legend>
                            {lesson.choices.map((choice) => (
                                <label
                                    key={choice.id}
                                    className="flex min-h-11 cursor-pointer items-start gap-3 border border-border p-3 text-sm"
                                >
                                    <input
                                        className="mt-1"
                                        type="radio"
                                        name={`${uid}-${lesson.id}`}
                                        value={choice.id}
                                        checked={choices[lesson.id] === choice.id}
                                        onChange={() =>
                                            setChoices((current) => ({
                                                ...current,
                                                [lesson.id]: choice.id,
                                            }))
                                        }
                                    />
                                    <span>{choice.text}</span>
                                </label>
                            ))}
                        </fieldset>
                        <Button
                            type="submit"
                            variant="secondary"
                            size="sm"
                            disabled={
                                disabled ||
                                saving ||
                                !choices[lesson.id] ||
                                mission.mission_learning?.[lesson.id] === choices[lesson.id]
                            }
                        >
                            {saving ? 'Saving…' : 'Check and save answer'}
                        </Button>
                        {feedback[lesson.id] && (
                            <p role="status" className="text-sm leading-relaxed">
                                {feedback[lesson.id]}
                            </p>
                        )}
                    </form>
                </details>
            ))}
            <div className="grid gap-3 md:grid-cols-2">
                <div className="border border-border p-4">
                    <h4 className="flex items-center gap-2 font-semibold">
                        <BookOpen className="h-4 w-4" aria-hidden="true" />
                        Worked example bonus
                    </h4>
                    {rewards.exampleUnlocked ? (
                        <details className="mt-3">
                            <summary className="min-h-8 cursor-pointer text-sm font-semibold">
                                Unlocked: a reminder mission’s TEVV plan
                            </summary>
                            <p className="mt-2 text-xs text-muted-foreground">
                                Illustrative methods, not performed work. Adapt them to your
                                context.
                            </p>
                            <dl className="mt-3 space-y-3 text-sm">
                                {TEVV.map((step) => (
                                    <div key={step.id}>
                                        <dt className="font-semibold">{step.label}</dt>
                                        <dd>{step.example}</dd>
                                    </div>
                                ))}
                            </dl>
                        </details>
                    ) : (
                        <p className="mt-3 text-sm text-muted-foreground">
                            Unlock at 30 points through saved planning or knowledge checks. Core
                            guidance remains available above.
                        </p>
                    )}
                </div>
                <div className="border border-border p-4">
                    <h4 className="font-semibold">Review coach bonus</h4>
                    {rewards.coachUnlocked ? (
                        <details className="mt-3">
                            <summary className="min-h-8 cursor-pointer text-sm font-semibold">
                                Unlocked: five questions before you verify
                            </summary>
                            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
                                <li>Was the target fixed before measuring?</li>
                                <li>Which boundary or failure case did you test?</li>
                                <li>Can someone inspect and reproduce the evidence?</li>
                                <li>Did the intended user find the result useful?</li>
                                <li>
                                    What uncertainty remains, and what would change the decision?
                                </li>
                            </ol>
                        </details>
                    ) : (
                        <p className="mt-3 text-sm text-muted-foreground">
                            Unlock at 60 points. The coach helps you question the result; it never
                            approves it.
                        </p>
                    )}
                </div>
            </div>
            <div className="border-t border-border pt-4">
                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={download}
                    disabled={disabled}
                >
                    Download unsigned learning record
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">
                    A local JSON record of saved progress and evidence IDs. It is not a W3C
                    Verifiable Credential, signed proof, or certification.
                </p>
            </div>
        </section>
    );
}
