// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/JourneyPage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-JOURNEY-001, SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/lib/journey.js, apps/web/src/hooks/useWorkspaceRecords.js, apps/web/src/components/workspace/WorkspaceAssistant.jsx, apps/web/src/components/workspace/WorkspaceLayout.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/journey.js; CONSUMES apps/web/src/hooks/useWorkspaceRecords.js; CONSUMES apps/web/src/components/workspace/WorkspaceLayout.jsx; TRIGGERS apps/web/src/components/workspace/WorkspaceAssistant.jsx
// DAG Node:    none
// Intent:      Ask one choice at a time, then hand the person a first lesson and a proposed mission draft they can save, refine with the assistant, or discard.
// ───────────────────────────────────────────────────────────────

import React, { useMemo, useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Button, Card } from '@/components/site/ui';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import { useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import { JOURNEY_QUESTIONS, assistantDraft, compileJourney, journeyComplete } from '@/lib/journey';

/** The event the workspace assistant listens for; it only fills the composer. */
export const ASSISTANT_DRAFT_EVENT = 'buildanddo:assistant-draft';

function Question({ index, question, value, onChoose }) {
    return <fieldset className="space-y-4">
        <legend className="font-headline text-2xl">{question.prompt}</legend>
        <p className="text-sm text-muted-foreground">Question {index + 1} of {JOURNEY_QUESTIONS.length}</p>
        <div className="grid gap-3 sm:grid-cols-2">{question.choices.map((item) => (
            <button key={item.id} type="button" aria-pressed={value === item.id} onClick={() => onChoose(item.id)}
                className={'rounded-md border p-4 text-left transition-colors ' + (value === item.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-secondary/60')}>
                <span className="block font-semibold">{item.label}</span>
                {item.hint && <span className="block text-sm text-muted-foreground">{item.hint}</span>}
            </button>
        ))}</div>
    </fieldset>;
}

export default function JourneyPage() {
    const { create, demo, degraded, loading } = useWorkspaceRecords('missions', { sort: '-created' });
    const { journey, setJourney } = useOutletContext();
    const { answers, step, saved, saveState } = journey;
    const [error, setError] = useState('');
    const pending = useRef(false);
    const saving = saveState === 'saving';
    const done = journeyComplete(answers) && step >= JOURNEY_QUESTIONS.length;
    const compiled = useMemo(() => (done ? compileJourney(answers) : null), [done, answers]);
    const choose = (id) => {
        const question = JOURNEY_QUESTIONS[step];
        setJourney((current) => ({ ...current, answers: { ...current.answers, [question.id]: id },
            step: step + 1, saved: null, saveState: 'idle' }));
        setError('');
    };
    const restart = () => { setJourney({ answers: {}, step: 0, saved: null, saveState: 'idle' }); setError(''); };
    const save = async () => {
        if (pending.current || saveState !== 'idle' || !compiled || demo || degraded || loading || saved) return;
        pending.current = true;
        setJourney((current) => ({ ...current, saveState: 'saving' })); setError('');
        try {
            const result = await create(compiled.mission);
            if (result.ok && result.record?.id) setJourney((current) => ({ ...current, saved: result.record, saveState: 'saved' }));
            else {
                setJourney((current) => ({ ...current, saveState: 'uncertain' }));
                if (!result.stale) setError(result.error || 'The draft save could not be confirmed.');
            }
        } catch {
            setJourney((current) => ({ ...current, saveState: 'uncertain' }));
            setError('The draft save could not be confirmed.');
        } finally { pending.current = false; }
    };
    const talk = () => window.dispatchEvent(new CustomEvent(ASSISTANT_DRAFT_EVENT, { detail: { message: assistantDraft(compiled) } }));
    return <div className="space-y-6">
        <PageHeader title="Start a journey" description="Answer five questions from the Guildmaster. You get one lesson to read and one mission to try, instead of thirty places to choose from." />
        {!done && <Card className="space-y-5 p-5">
            <Question index={step} question={JOURNEY_QUESTIONS[step]} value={answers[JOURNEY_QUESTIONS[step].id]} onChoose={choose} />
            <div className="flex gap-3">{step > 0 && <Button variant="secondary" onClick={() => setJourney((current) => ({ ...current, step: step - 1 }))}>Back</Button>}</div>
        </Card>}
        {compiled && <>
            <Card className="space-y-3 p-5">
                <h2 className="font-headline text-2xl">Build: your first lesson</h2>
                <p>{compiled.lesson.title}</p>
                <Link to={compiled.lesson.to} className="text-sm underline">Open the lesson</Link>
                <p className="text-xs text-muted-foreground">Your draft stays in this signed-in workspace while you read. It clears when you sign out, switch workspace, or reload the app.</p>
            </Card>
            <Card className="space-y-4 p-5">
                <h2 className="font-headline text-2xl">Do: your first mission</h2>
                <p className="font-semibold">{compiled.mission.title}</p>
                <p className="text-sm">{compiled.mission.mission_plan.purpose}</p>
                <p className="text-sm text-muted-foreground">The plan is drafted from your answers. Two parts are left for you, because only you can measure them:</p>
                <ul className="list-disc pl-5 text-sm">{compiled.remaining.map((item) => <li key={item}>{item}</li>)}</ul>
                <p className="text-xs text-muted-foreground">Saving creates a proposed draft. It is not approved and nothing runs until you finish the plan and approve it on the Challenge Desk.</p>
                <div className="flex flex-wrap gap-3">
                    <Button onClick={save} disabled={demo || degraded || loading || saveState !== 'idle' || Boolean(saved)}>Save mission draft</Button>
                    <Button variant="secondary" onClick={talk}>Talk it through with the Guildmaster</Button>
                    <Button variant="secondary" onClick={restart} disabled={saving}>Start over</Button>
                </div>
                {demo && <p className="text-sm">Demonstration mode is read-only. Turn it off to save this draft.</p>}
                {saving && <p role="status">Saving the draft…</p>}
                {error && <p role="alert">{error}</p>}
                {saveState === 'uncertain' && <p role="status">Check the <Link to="/app/missions" className="underline">existing mission drafts</Link> before starting again. The previous save may have succeeded; it will not be retried automatically.</p>}
                {saved && <p role="status">Draft saved. <Link to={saved.id ? `/app/missions?mission=${encodeURIComponent(saved.id)}` : '/app/missions'} className="underline">Finish the plan on the Challenge Desk</Link></p>}
                <p className="text-xs text-muted-foreground">The Guildmaster opens the workspace assistant with your answers typed in. Nothing is sent until you send it.</p>
            </Card>
        </>}
    </div>;
}
