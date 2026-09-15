// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/TutorialCatalog.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/hooks/useWorkspaceRecords.js, apps/web/src/lib/observability/mutations.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/hooks/useWorkspaceRecords.js; CONSUMES apps/web/src/lib/observability/mutations.js;
//              CONSUMES apps/web/src/lib/tutorialCurriculum.js; CONSUMES apps/web/src/components/workspace/TutorialReader.jsx;
//              CONSUMES apps/pocketbase/pb_migrations/data/starter-tutorials.json
// DAG Node:    none
// Intent:      Reuse real lessons and recoverable per-account progress on the home page, Docs and workspace Field Manual.
// ───────────────────────────────────────────────────────────────

import { MotionList } from '@/components/motion/MotionPrimitives';
import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, Clock } from 'lucide-react';
import curriculum from '../../../../pocketbase/pb_migrations/data/starter-tutorials.json';
import { Button, Card, StatePill } from '@/components/site/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DegradedNotice, ListSkeleton } from '@/components/workspace/WorkspaceNotices';
import TutorialReader from '@/components/workspace/TutorialReader';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { describeWriteError, useRecords } from '@/hooks/useWorkspaceRecords';
import { workspaceCollection } from '@/lib/observability/mutations';
import { lessonProgress, mergeTutorials, selectTutorials } from '@/lib/tutorialCurriculum';
import pb from '@/lib/pocketbaseClient';

function CatalogView({ lessons, progress = [], progressKnown = false, canPersist = false, onSave, busy = '', error = '', saved = '', limit = 0 }) {
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('all');
    const [selected, setSelected] = useState(null);
    const opener = useRef(null);
    const origin = useRef(null);
    const categories = [...new Set(lessons.map((lesson) => lesson.category).filter(Boolean))];
    const matches = selectTutorials(lessons, { query, category });
    const visible = limit ? matches.slice(0, limit) : matches;
    const completed = lessons.filter((lesson) => lessonProgress(progress, lesson.persistedId)?.status === 'completed').length;
    const current = selected && lessons.find((lesson) => lesson.catalogueKey === selected);
    return <div className="space-y-5">
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><BookOpen className="h-4 w-4" aria-hidden="true" />
            {progressKnown ? `${completed} of ${lessons.length} lessons completed` : `${lessons.length} lessons to explore`}
        </p>
        {!limit && <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label htmlFor="lesson-search">Search lessons</Label><Input id="lesson-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Topic or skill" /></div>
            <div className="space-y-1"><Label htmlFor="lesson-category">Learning path</Label><select id="lesson-category" value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"><option value="all">All paths</option>{categories.map((name) => <option key={name}>{name}</option>)}</select></div>
        </div>}
        {!visible.length ? <p role="status" className="text-sm text-muted-foreground">No lessons match these filters.</p> : <MotionList as="ul" itemsKey={visible.map((item) => item.catalogueKey).join(':')} className="grid gap-4 sm:grid-cols-2">
            {visible.map((tutorial) => {
                const status = progressKnown && tutorial.persistedId ? lessonProgress(progress, tutorial.persistedId)?.status || 'not_started' : 'preview';
                const action = status === 'completed' ? 'Review' : status === 'in_progress' ? 'Continue' : 'Read';
                return <li key={tutorial.catalogueKey} data-motion-key={tutorial.catalogueKey} className="min-w-0"><Card className="flex h-full flex-col gap-3 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-wider text-primary">{tutorial.category || 'Field Manual'}</p><StatePill state={status} /></div>
                    <h3 className="break-words font-display text-lg font-semibold">{tutorial.title}</h3>
                    <p className="text-sm leading-6 text-muted-foreground">{tutorial.summary}</p>
                    <p className="flex items-center gap-2 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" aria-hidden="true" />About {tutorial.effort_minutes || 10} minutes</p>
                    {tutorial.prerequisites && <p className="text-xs leading-5 text-muted-foreground">Prerequisite: {tutorial.prerequisites}</p>}
                    <Button size="sm" variant="secondary" className="mt-auto self-start" aria-label={`${action} ${tutorial.title}`} onClick={(event) => { opener.current = event.currentTarget; const bounds = event.currentTarget.closest('li')?.getBoundingClientRect(); origin.current = bounds ? { left: bounds.left, top: bounds.top } : null; setSelected(tutorial.catalogueKey); }}>{action} lesson</Button>
                </Card></li>;
            })}
        </MotionList>}
        {limit > 0 && matches.length > limit && <Button href="/docs#workspace-lessons" variant="secondary" size="sm">View all lessons</Button>}
        {current && <TutorialReader key={current.catalogueKey} tutorial={current}
            completed={lessonProgress(progress, current.persistedId)?.status === 'completed'}
            canSave={canPersist && progressKnown && Boolean(current.persistedId)} busy={Boolean(busy)} error={error} saved={saved}
            onSave={(status) => onSave?.(current, status)} onClose={() => setSelected(null)} opener={opener.current} origin={origin.current} />}
    </div>;
}

function SignedInCatalog({ userId, limit }) {
    const tutorials = useRecords('tutorials', { sort: 'order' });
    const progress = useRecords('tutorial_progress', { sort: '-created' });
    const [busy, setBusy] = useState('');
    const [writeError, setWriteError] = useState('');
    const [saved, setSaved] = useState('');
    const saving = useRef(false);
    const mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const lessons = mergeTutorials(tutorials.records, curriculum.lessons);
    const progressKnown = !progress.loading && !progress.degraded && !tutorials.loading && !tutorials.degraded;
    const saveProgress = async (tutorial, status) => {
        if (saving.current || !progressKnown || !tutorial.persistedId || pb.authStore.record?.id !== userId) return;
        const existing = lessonProgress(progress.records, tutorial.persistedId);
        if (existing?.status === 'completed') return;
        saving.current = true; setBusy(tutorial.catalogueKey); setWriteError(''); setSaved('');
        const fields = { status, progress: status === 'completed' ? 100 : 50 };
        try {
            if (existing) await workspaceCollection('tutorial_progress').update(existing.id, fields);
            else await workspaceCollection('tutorial_progress').create({ ...fields, tutorial: tutorial.persistedId, owner: userId });
            if (!mounted.current || pb.authStore.record?.id !== userId) return;
            setSaved(`Progress saved for ${tutorial.title}.`);
            await progress.refresh();
        } catch (error) {
            if (mounted.current && pb.authStore.record?.id === userId) {
                setWriteError(describeWriteError(error, 'Could not save progress. Refresh saved progress before retrying.'));
                // Reconcile an uncertain response before allowing a create retry.
                await progress.refresh();
            }
        } finally {
            saving.current = false;
            if (mounted.current) setBusy('');
        }
    };
    return <div className="ph-no-capture space-y-5" data-dd-privacy="mask">
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">25 starter lessons plus your shared catalogue.</p><Button size="sm" variant="secondary" disabled={tutorials.loading || progress.loading || Boolean(busy)} onClick={() => { tutorials.refresh(); progress.refresh(); }}>Refresh lessons</Button></div>
        {tutorials.degraded && <DegradedNotice message="The lesson catalogue is unavailable. Showing the bundled starter curriculum; progress cannot be saved." onRetry={tutorials.refresh} />}
        {progress.degraded && <DegradedNotice message="Your saved progress is unavailable. You can read lessons; retry before saving progress." onRetry={progress.refresh} />}
        {!tutorials.loading && !tutorials.degraded && lessons.some((lesson) => !lesson.persistedId) && <p className="text-sm leading-6 text-muted-foreground">Starter previews are ready to read. Apply the tutorial catalogue migration to save progress for lessons not yet installed.</p>}
        {tutorials.loading ? <ListSkeleton label="Loading lessons…" /> : <CatalogView lessons={lessons} progress={progress.records} progressKnown={progressKnown}
            canPersist onSave={saveProgress} busy={busy} error={writeError} saved={saved} limit={limit} />}
    </div>;
}

/** @param {{limit?: number}} props Optional preview length. @returns {React.ReactElement} Authored lessons and account-scoped progress. */
export default function TutorialCatalog({ limit = 0 }) {
    const { isAuthed, user } = useAuth();
    const { demo } = useDemoMode();
    if (!isAuthed || !user?.id || demo) return <div className="space-y-5">
        <p className="text-sm leading-6 text-muted-foreground">{demo ? 'Demo mode: read the starter lessons without writing progress.' : 'Explore the starter lessons. Sign in to keep progress on installed lessons.'}</p>
        {!demo && <Button href="/login" size="sm">Sign in for lessons</Button>}
        <CatalogView key={demo ? 'demo' : 'public'} lessons={mergeTutorials([], curriculum.lessons)} limit={limit} />
    </div>;
    return <SignedInCatalog key={user.id} userId={user.id} limit={limit} />;
}
