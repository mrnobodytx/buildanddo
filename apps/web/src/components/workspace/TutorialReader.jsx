// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/TutorialReader.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-TRUST-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001, VCC-BUILDANDDO-TRUST-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/lib/tutorialCurriculum.js, apps/web/src/components/ui/dialog.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/tutorialCurriculum.js; CONSUMES apps/web/src/components/ui/dialog.jsx
// DAG Node:    none
// Intent:      Keep read-only lessons and keyless question previews separate from saved guided learning completion.
// ───────────────────────────────────────────────────────────────

import ReadingProgress from '@/components/motion/ReadingProgress';
import StepSequence from '@/components/motion/StepSequence';
import { useMotionCategory } from '@/contexts/MotionContext';
import { animateElement, continuityFrames } from '@/lib/motion/runtime';
import React, { useLayoutEffect, useRef } from 'react';
import { Button, Card } from '@/components/site/ui';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { lessonLink, validLesson } from '@/lib/tutorialCurriculum';

/** @param {{tutorial: object, completed: boolean, onGuided?: Function, onClose: Function, opener: HTMLElement|null, origin?: object}} props Reader state. @returns {React.ReactElement} Read-only open-book lesson dialog. */
export default function TutorialReader({ tutorial, completed, onGuided, onClose, opener, origin }) {
    const heading = useRef(null);
    const article = useRef(null);
    const { enabled, motion } = useMotionCategory('layout');
    useLayoutEffect(() => animateElement(heading.current, continuityFrames(origin, heading.current?.getBoundingClientRect()), {
        duration: motion.duration.layout, easing: motion.ease,
    }, enabled && Boolean(origin)), [origin, enabled, motion.duration.layout, motion.ease]);
    const lesson = tutorial.lesson;
    const available = validLesson(lesson);
    return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
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
                    </section>
                    {/* The answer is graded on the server; the reader only previews the question. */}
                    <section className="space-y-3" aria-label="Knowledge check">
                        <h3 className="font-display text-xl font-semibold">Check your understanding</h3>
                        <p className="text-sm leading-7">{lesson.check.question}</p>
                        <ul className="list-disc space-y-2 pl-5 text-sm leading-6">{lesson.check.choices.map((choice, index) => <li key={index}>{choice}</li>)}</ul>
                        <p className="text-sm leading-6 text-muted-foreground">{onGuided ? 'Answer this knowledge check in the interactive tutorial.' : 'Sign in and open the interactive tutorial to answer this knowledge check.'}</p>
                    </section>
                    <nav aria-label="Lesson references" className="space-y-2">
                        <h3 className="font-display text-lg font-semibold">Continue learning</h3>
                        <ul className="space-y-2 text-sm">{lesson.references.map((reference) => <li key={reference.url}>
                            <a href={lessonLink(reference.url)} target="_blank" rel="noreferrer" className="break-words text-primary underline underline-offset-4">{reference.label}<span className="sr-only"> (opens in a new tab)</span></a>
                        </li>)}</ul>
                    </nav>
                </>}
                <div className="space-y-3 border-t border-border pt-4">
                    <p className="text-sm text-muted-foreground">Open-book reading and practice preview only. Reading and self-reported practice here are not saved and do not award guided completion, certificates or learning points.</p>
                    {completed && <p className="text-sm text-success">Guided tutorial completed. Reading practice does not change your saved completion.</p>}
                    <p className="text-xs leading-6 text-muted-foreground">Grading keys remain public in the authored source, not in browser previews. Finish the interactive tutorial to complete this lesson with saved checkpoints, not independently verified mastery.</p>
                    {onGuided && available && <Button size="sm" onClick={onGuided}>Start interactive tutorial</Button>}
                    <Button size="sm" variant="ghost" onClick={onClose}>Close lesson</Button>
                </div>
            </div>
        </DialogContent>
    </Dialog>;
}
