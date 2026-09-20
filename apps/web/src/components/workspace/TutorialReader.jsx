// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/TutorialReader.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/lib/tutorialCurriculum.js, apps/web/src/components/ui/dialog.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/tutorialCurriculum.js; CONSUMES apps/web/src/components/ui/dialog.jsx
// DAG Node:    none
// Intent:      Let learners read complete lessons, practice and check understanding with accessible focus and explicit progress persistence.
// ───────────────────────────────────────────────────────────────

import ReadingProgress from '@/components/motion/ReadingProgress';
import StepSequence from '@/components/motion/StepSequence';
import { useMotionCategory } from '@/contexts/MotionContext';
import { animateElement, continuityFrames } from '@/lib/motion/runtime';
import React, { useLayoutEffect, useRef, useState } from 'react';
import { Button, Card } from '@/components/site/ui';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { lessonLink, validLesson } from '@/lib/tutorialCurriculum';

/** @param {{tutorial: object, completed: boolean, canSave: boolean, busy: boolean, error: string, saved: string, onSave: Function, onClose: Function, opener: HTMLElement|null}} props Reader state. @returns {React.ReactElement} Lesson dialog. */
export default function TutorialReader({ tutorial, completed, canSave, busy, error, saved, onSave, onGuided, onClose, opener, origin }) {
    const [answer, setAnswer] = useState(null);
    const [checked, setChecked] = useState(false);
    const [practiced, setPracticed] = useState(false);
    const heading = useRef(null);
    const article = useRef(null);
    const { enabled, motion } = useMotionCategory('layout');
    useLayoutEffect(() => animateElement(heading.current, continuityFrames(origin, heading.current?.getBoundingClientRect()), {
        duration: motion.duration.layout, easing: motion.ease,
    }, enabled && Boolean(origin)), [origin, enabled, motion.duration.layout, motion.ease]);
    const lesson = tutorial.lesson;
    const available = validLesson(lesson);
    const correct = available && checked && answer === lesson.check.answer;
    return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
        <DialogContent data-reading-scroll className="max-h-[92dvh] max-w-3xl overflow-y-auto"
            data-dd-privacy="mask" onOpenAutoFocus={(event) => { event.preventDefault(); heading.current?.focus(); }}
            onCloseAutoFocus={(event) => { event.preventDefault(); opener?.focus(); }}>
            <div ref={article} className="ph-no-capture min-w-0 space-y-6 break-words">
                <ReadingProgress targetRef={article} label="Lesson reading position" />
                <DialogHeader>
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">{tutorial.category} · about {tutorial.effort_minutes || 10} minutes</p>
                    <DialogTitle ref={heading} tabIndex={-1} className="font-display text-2xl">{tutorial.title}</DialogTitle>
                    <DialogDescription>{tutorial.summary}</DialogDescription>
                </DialogHeader>
                {!available ? <p role="status" className="text-sm text-muted-foreground">The lesson body is unavailable or uses an unsupported format. You can read its summary; completion is unavailable.</p> : <>
                    <section className="space-y-3" aria-label="Learning outcomes">
                        <h3 className="font-display text-xl font-semibold">What you will learn</h3>
                        <ul className="list-disc space-y-2 pl-5 text-sm leading-6">{lesson.outcomes.map((item) => <li key={item}>{item}</li>)}</ul>
                    </section>
                    <Card className="space-y-2 p-4">
                        <h3 className="font-display text-lg font-semibold">Why this matters</h3>
                        <p className="text-sm leading-7">{lesson.why}</p>
                    </Card>
                    <section className="space-y-3">
                        <h3 className="font-display text-xl font-semibold">Before you begin</h3>
                        <ul className="list-disc space-y-2 pl-5 text-sm leading-6">{lesson.preparation.map((item) => <li key={item}>{item}</li>)}</ul>
                    </section>
                    {lesson.sections.map((section, index) => <section key={index} className="space-y-3">
                        <h3 className="font-display text-xl font-semibold">{section.heading}</h3>
                        {section.paragraphs?.map((paragraph, i) => <p key={i} className="whitespace-pre-wrap text-sm leading-7">{paragraph}</p>)}
                        {section.steps && <ol className="list-decimal space-y-3 pl-6 text-sm leading-7">{section.steps.map((step, i) => <li key={i}>{step}</li>)}</ol>}
                    </section>)}
                    <details className="border border-border p-4">
                        <summary className="cursor-pointer py-2 text-sm font-semibold">Walk through this lesson</summary>
                        <div className="mt-4"><StepSequence title={tutorial.title} steps={lesson.sections.slice(0, 5).map((section) => ({ title: section.heading, body: [...(section.paragraphs || []), ...(section.steps || [])].join(' ') }))} /></div>
                    </details>
                    <section className="space-y-3 rounded-md border border-border p-4">
                        <h3 className="font-display text-xl font-semibold">Practice</h3>
                        <p className="text-sm leading-7">{lesson.exercise.prompt}</p>
                        <ul className="list-disc space-y-2 pl-5 text-sm leading-6">{lesson.exercise.checklist.map((item) => <li key={item}>{item}</li>)}</ul>
                        <label className="flex items-start gap-3 py-2 text-sm">
                            <input type="checkbox" checked={practiced} onChange={(event) => setPracticed(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-primary" />
                            <span>I worked through the exercise or its illustrative example.</span>
                        </label>
                    </section>
                    <fieldset className="space-y-3">
                        <legend className="font-display text-xl font-semibold">Check your understanding</legend>
                        <p className="text-sm leading-7">{lesson.check.question}</p>
                        {lesson.check.choices.map((choice, index) => <label key={index} className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 text-sm leading-6">
                            <input type="radio" name={`lesson-answer-${tutorial.catalogueKey}`} checked={answer === index}
                                onChange={() => { setAnswer(index); setChecked(false); }} className="mt-1 h-4 w-4 shrink-0 accent-primary" />
                            <span>{choice}</span>
                        </label>)}
                        <Button size="sm" variant="secondary" disabled={answer === null} onClick={() => setChecked(true)}>Check answer</Button>
                        {checked && <div role="status" className="space-y-2 rounded-md border border-border p-3 text-sm leading-6">
                            <p className="font-semibold">{correct ? 'That’s right.' : 'Try another answer.'}</p>
                            <p>{lesson.check.explanation}</p>
                        </div>}
                    </fieldset>
                    <nav aria-label="Lesson references" className="space-y-2">
                        <h3 className="font-display text-lg font-semibold">Continue learning</h3>
                        <ul className="space-y-2 text-sm">{lesson.references.map((reference) => <li key={reference.url}>
                            <a href={lessonLink(reference.url)} target="_blank" rel="noreferrer" className="break-words text-primary underline underline-offset-4">{reference.label}<span className="sr-only"> (opens in a new tab)</span></a>
                        </li>)}</ul>
                    </nav>
                </>}
                <div className="space-y-3 border-t border-border pt-4">
                    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                    {saved && <p role="status" className="text-sm text-success">{saved}</p>}
                    {!canSave && <p className="text-sm text-muted-foreground">Reading preview only. Saved progress needs a signed-in account, a persisted lesson and an available backend.</p>}
                    {completed ? <p className="text-sm text-success">Completed. Reviewing keeps your saved completion.</p> : <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" disabled={!canSave || busy || !available} onClick={() => onSave('in_progress')}>Save reading progress</Button>
                        <Button size="sm" disabled={!canSave || busy || !correct || !practiced} onClick={() => onSave('completed')}>{busy ? 'Saving…' : 'Mark lesson complete'}</Button>
                    </div>}
                    <p className="text-xs leading-6 text-muted-foreground">Reading completion records your own learning activity. Finish the interactive tutorial to earn a certificate and learning points.</p>
                    {onGuided && available && <Button size="sm" disabled={busy} onClick={onGuided}>Start interactive tutorial</Button>}
                    <Button size="sm" variant="ghost" disabled={busy} onClick={onClose}>Close lesson</Button>
                </div>
            </div>
        </DialogContent>
    </Dialog>;
}
