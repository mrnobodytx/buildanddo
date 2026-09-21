// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/InteractiveTutorial.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-19
// Depends:     apps/web/src/lib/tutorialLearning.js, apps/web/src/components/workspace/TutorialGrowth.jsx, apps/web/src/components/ui/dialog.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/tutorialLearning.js; CONSUMES apps/web/src/components/workspace/TutorialGrowth.jsx; CONSUMES apps/web/src/components/ui/dialog.jsx
// DAG Node:    none
// Intent:      Guide learners through recoverable checkpoints and practice before revealing their saved completion certificate.
// ───────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { Button, Card } from '@/components/site/ui';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LearningCertificate } from '@/components/workspace/TutorialGrowth';

function currentStep(data) {
    if (!data.enrollment) return -1;
    if (data.enrollment.certificate) return data.tutorial.lesson.sections.length + 2;
    return data.enrollment.next_section + (data.enrollment.practiced ? 1 : 0);
}

/** @param {{tutorialId: string, client: object, onSaved: Function, onClose: Function, opener: HTMLElement|null}} props Account-bound learning client. @returns {React.ReactElement} Resumable guided tutorial dialog. */
export default function InteractiveTutorial({ tutorialId, client, onSaved, onClose, opener }) {
    const [data, setData] = useState(null);
    const [step, setStep] = useState(-1);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [uncertain, setUncertain] = useState(false);
    const [feedback, setFeedback] = useState(null);
    const [checks, setChecks] = useState([]);
    const [answer, setAnswer] = useState(null);
    const [notice, setNotice] = useState('');
    const alive = useRef(false), sequence = useRef(0), saving = useRef(false);
    const heading = useRef(null);
    const focus = useRef(null);
    const load = useCallback(async () => {
        const request = ++sequence.current;
        setLoading(true); setError('');
        const result = await client.read(tutorialId);
        if (!alive.current || request !== sequence.current || result.reason === 'scope_changed') return;
        setLoading(false);
        if (result.ok) { setData(result.data); setStep(currentStep(result.data)); }
        else setError(result.error);
    }, [client, tutorialId]);
    useEffect(() => {
        alive.current = true; load();
        return () => { alive.current = false; sequence.current++; };
    }, [load]);
    useEffect(() => { if (!loading) focus.current?.focus(); }, [step, loading]);
    const save = async (action, payload = {}, retry = false) => {
        if (saving.current || !data) return;
        saving.current = true; setBusy(true); setError(''); setNotice('');
        const result = await (retry ? client.retry() : client.command(tutorialId, action, data.tutorial.content_digest, payload));
        saving.current = false;
        if (!alive.current || result.reason === 'scope_changed') return;
        setBusy(false);
        if (!result.ok) { setError(result.error); setUncertain(result.reason === 'uncertain'); return; }
        setUncertain(false); setData(result.data); setFeedback(result.data.feedback); setStep(currentStep(result.data));
        setNotice(result.data.feedback?.correct === false ? '' : result.data.enrollment.certificate ? 'Tutorial complete. Your certificate and 100 learning points are saved.' : 'Checkpoint saved. You can leave and continue later.');
        onSaved?.();
    };
    const tutorial = data?.tutorial, lesson = tutorial?.lesson, enrollment = data?.enrollment;
    const sectionCount = lesson?.sections.length || 0;
    const total = sectionCount + 2;
    const completed = Boolean(enrollment?.certificate);
    const activeStep = data ? currentStep(data) : -1;
    const section = step >= 0 && step < sectionCount ? lesson.sections[step] : null;
    const headingText = completed && step === total ? 'You finished the tutorial' : step < 0 ? 'Your next learning milestone' :
        section ? section.heading : step === sectionCount ? 'Put it into practice' : 'Check your understanding';
    return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
        <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto" data-dd-privacy="mask"
            onOpenAutoFocus={(event) => { event.preventDefault(); heading.current?.focus(); }}
            onCloseAutoFocus={(event) => { event.preventDefault(); opener?.focus(); }}>
            <div className="ph-no-capture min-w-0 space-y-6 break-words">
                <DialogHeader><p className="text-xs font-semibold uppercase tracking-wider text-primary">Interactive Field Manual</p>
                    <DialogTitle ref={heading} tabIndex={-1} className="font-display text-2xl">{tutorial?.title || 'Interactive tutorial'}</DialogTitle>
                    <DialogDescription>Learn one step at a time. Your saved checkpoints lead to a completion certificate.</DialogDescription>
                </DialogHeader>
                {loading && <p role="status" className="text-sm text-muted-foreground">Loading your saved tutorial…</p>}
                {error && <div role="alert" className="space-y-3 border border-destructive/40 p-4"><p className="text-sm">{error}</p>
                    {uncertain ? <Button size="sm" disabled={busy} onClick={() => save('', {}, true)}>Retry checkpoint save</Button> : <Button size="sm" variant="secondary" disabled={busy} onClick={load}>Reload saved tutorial</Button>}
                </div>}
                {!loading && data && <>
                    <div className="space-y-2"><div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>{completed ? 'All checkpoints complete' : step < 0 ? `${total} checkpoints · about ${tutorial.effort_minutes} minutes` : `Checkpoint ${Math.min(step + 1, total)} of ${total}`}</span><span>{enrollment?.progress || 0}% saved</span></div>
                        <div role="progressbar" aria-label="Saved tutorial progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={enrollment?.progress || 0} className="h-2 overflow-hidden bg-secondary"><div className="h-full bg-primary motion-safe:transition-[width]" style={{ width: `${enrollment?.progress || 0}%` }} /></div>
                    </div>
                    {enrollment && <nav aria-label="Tutorial checkpoints" className="flex flex-wrap gap-2">{[...lesson.sections.map((item) => item.heading), 'Practice', 'Knowledge check'].map((title, index) => <button key={index} type="button" disabled={busy || uncertain || index > activeStep} aria-current={step === index ? 'step' : undefined}
                        aria-label={`${index + 1}. ${title}${index < activeStep ? ', saved' : ''}`} onClick={() => { setStep(index); setFeedback(null); }}
                        className={`flex min-h-10 min-w-10 items-center justify-center gap-1 border px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40 ${step === index ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>
                        {index < activeStep ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}{index + 1}
                    </button>)}</nav>}
                    <h3 ref={focus} tabIndex={-1} className="font-display text-xl font-semibold">{headingText}</h3>
                    {step < 0 ? <div className="space-y-5"><p className="text-sm leading-7">{lesson.why}</p><ul className="list-disc space-y-2 pl-5 text-sm leading-6">{lesson.outcomes.map((outcome) => <li key={outcome}>{outcome}</li>)}</ul>
                        <Card className="space-y-3 p-4"><h4 className="font-semibold">Before you start</h4><ul className="list-disc space-y-2 pl-5 text-sm leading-6">{lesson.preparation.map((item) => <li key={item}>{item}</li>)}</ul></Card>
                        <p className="text-sm leading-6 text-muted-foreground">Finish each section, work through the practice checklist, and pass the final question to earn your certificate and 100 learning points.</p>
                        <Button disabled={busy || uncertain} onClick={() => save('start')}>{busy ? 'Saving…' : 'Start and save my progress'}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Button>
                    </div> : section ? <div className="space-y-5">{section.paragraphs?.map((paragraph, index) => <p className="whitespace-pre-wrap text-sm leading-7" key={index}>{paragraph}</p>)}
                        {section.steps && <ol className="list-decimal space-y-3 pl-6 text-sm leading-7">{section.steps.map((item, index) => <li key={index}>{item}</li>)}</ol>}
                        <Button disabled={busy || uncertain} onClick={() => step < activeStep ? setStep(step + 1) : save('section', { index: step })}>{busy ? 'Saving…' : step < activeStep ? 'Next checkpoint' : 'Save checkpoint and continue'}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Button>
                    </div> : step === sectionCount ? <div className="space-y-5"><p className="text-sm leading-7">{lesson.exercise.prompt}</p><p className="text-xs leading-6 text-muted-foreground">Use your own practice example or the illustrative lesson example. Check each item after you have worked through it.</p>
                        <fieldset className="space-y-3"><legend className="mb-3 text-sm font-semibold">Practice checklist</legend>{lesson.exercise.checklist.map((item, index) => <label key={index} className="flex cursor-pointer items-start gap-3 border border-border p-3 text-sm leading-6"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-primary" checked={enrollment.practiced || Boolean(checks[index])} disabled={busy || uncertain || enrollment.practiced}
                            onChange={(event) => setChecks((before) => { const next = [...before]; next[index] = event.target.checked; return next; })} /><span>{item}</span></label>)}</fieldset>
                        <Button disabled={busy || uncertain || !enrollment.practiced && !lesson.exercise.checklist.every((_, index) => checks[index])} onClick={() => enrollment.practiced ? setStep(sectionCount + 1) : save('practice', { checks })}>{busy ? 'Saving…' : enrollment.practiced ? 'Next checkpoint' : 'Save practice and continue'}</Button>
                    </div> : step === sectionCount + 1 ? <div className="space-y-5"><fieldset className="space-y-3" disabled={busy || uncertain || completed}><legend className="mb-3 text-sm leading-7">{lesson.check.question}</legend>{lesson.check.choices.map((choice, index) => <label key={index} className="flex cursor-pointer items-start gap-3 border border-border p-3 text-sm leading-6"><input type="radio" name={`guided-answer-${tutorialId}`} checked={answer === index} className="mt-1 h-4 w-4 shrink-0 accent-primary" onChange={() => { setAnswer(index); setFeedback(null); }} /><span>{choice}</span></label>)}</fieldset>
                        {feedback && <div role="status" className="space-y-2 border border-border p-4 text-sm leading-6"><p className="font-semibold">{feedback.correct ? 'That’s right.' : 'Not quite. Read the feedback and try again.'}</p><p>{feedback.explanation}</p></div>}
                        {completed ? <Button onClick={() => setStep(total)}>View my certificate</Button> : <Button disabled={busy || uncertain || answer === null} onClick={() => save('answer', { choice: answer })}>{busy ? 'Checking…' : 'Check answer and finish'}</Button>}
                    </div> : completed && <LearningCertificate certificate={enrollment.certificate} />}
                    {notice && <p role="status" className="text-sm text-success">{notice}</p>}
                    <div className="flex flex-wrap justify-between gap-3 border-t border-border pt-4">{step > 0 ? <Button size="sm" variant="ghost" disabled={busy || uncertain} onClick={() => setStep(step - 1)}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Previous checkpoint</Button> : <span />}
                        <Button size="sm" variant="secondary" disabled={busy} onClick={onClose}>{completed ? 'Back to my learning journey' : 'Close and continue later'}</Button></div>
                    {!completed && <p className="text-xs leading-6 text-muted-foreground">Your last completed checkpoint is saved. Finish a checkpoint to keep its progress.</p>}
                </>}
                {(!data || loading) && <Button size="sm" variant="ghost" onClick={onClose}>Close tutorial</Button>}
            </div>
        </DialogContent>
    </Dialog>;
}
