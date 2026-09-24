// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/TutorialCatalog.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-TRUST-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001, VCC-BUILDANDDO-TRUST-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/hooks/useWorkspaceRecords.js, apps/web/src/lib/observability/mutations.js,
//              apps/web/src/lib/observability/runtime.js, apps/web/src/lib/navigationIntent.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/hooks/useWorkspaceRecords.js; CONSUMES apps/web/src/lib/observability/mutations.js;
//              CONSUMES apps/web/src/lib/tutorialCurriculum.js; CONSUMES apps/web/src/components/workspace/TutorialReader.jsx;
//              CONSUMES apps/pocketbase/pb_migrations/data/starter-tutorials.json; CONSUMES apps/pocketbase/pb_migrations/data/broadcast-classroom-lessons.json;
//              CONSUMES apps/web/src/lib/tutorialLearning.js; CONSUMES apps/web/src/components/workspace/TutorialGrowth.jsx; CONSUMES apps/web/src/components/workspace/InteractiveTutorial.jsx;
//              CONSUMES apps/web/src/lib/observability/runtime.js; CONSUMES apps/web/src/lib/navigationIntent.js
// DAG Node:    none
// Intent:      Reuse real lessons and recoverable per-account progress on the home page, Docs and workspace Field Manual.
// ───────────────────────────────────────────────────────────────

import { MotionList } from '@/components/motion/MotionPrimitives';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Clock } from 'lucide-react';
import curriculum from '../../../../pocketbase/pb_migrations/data/starter-tutorials.json?public-lessons';
import broadcastCurriculum from '../../../../pocketbase/pb_migrations/data/broadcast-classroom-lessons.json?public-lessons';
import authorityCurriculum from '../../../../pocketbase/pb_migrations/data/authority-repairs-lessons.json?public-lessons';
import { Button, Card, StatePill } from '@/components/site/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DegradedNotice, ListSkeleton } from '@/components/workspace/WorkspaceNotices';
import TutorialReader from '@/components/workspace/TutorialReader';
import InteractiveTutorial from '@/components/workspace/InteractiveTutorial';
import TutorialGrowth from '@/components/workspace/TutorialGrowth';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useRecords } from '@/hooks/useWorkspaceRecords';
import { observeMutation } from '@/lib/observability/mutations';
import { readFailed } from '@/lib/observability/runtime';
import { telemetrySection } from '@/lib/navigationIntent';
import { lessonProgress, mergeTutorials, selectTutorials, validLesson } from '@/lib/tutorialCurriculum';
import { createTutorialLearningClient } from '@/lib/tutorialLearning';
import pb from '@/lib/pocketbaseClient';
import { PUBLIC_ACTIONS, trackPublicAction } from '@/lib/publicActions';

const authoredLessons = [...curriculum.lessons, ...broadcastCurriculum.lessons, ...authorityCurriculum.lessons];
function CatalogView({ lessons, progress = [], readingHistory = [], historyKnown = false, progressKnown = false, onGuided, limit = 0, initialCategory = 'all', initialLesson = '', onLinkedLesson }) {
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState(initialCategory);
    const [selected, setSelected] = useState(null);
    const opener = useRef(null);
    const origin = useRef(null);
    const openedLink = useRef('');
    useEffect(() => {
        if (!initialLesson || openedLink.current === initialLesson) return;
        const lesson = lessons.find((item) => item.persistedId === initialLesson || item.catalogueKey === initialLesson);
        if (lesson) { openedLink.current = initialLesson; setSelected(lesson.catalogueKey); onLinkedLesson?.(initialLesson); }
    }, [initialLesson, lessons, onLinkedLesson]);
    const categories = [...new Set(lessons.map((lesson) => lesson.category).filter(Boolean))];
    const matches = selectTutorials(lessons, { query, category });
    const visible = limit ? matches.slice(0, limit) : matches;
    const completed = lessons.filter((lesson) => lesson.persistedId && progress.find((row) => row.tutorial === lesson.persistedId)?.status === 'completed').length;
    const current = selected && lessons.find((lesson) => lesson.catalogueKey === selected);
    const openReader = (tutorial, event) => {
        opener.current = event.currentTarget;
        const bounds = event.currentTarget.closest('li')?.getBoundingClientRect();
        origin.current = bounds ? { left: bounds.left, top: bounds.top } : null;
        setSelected(tutorial.catalogueKey);
        trackPublicAction(PUBLIC_ACTIONS.LESSON_OPEN, 'opened', 'user_requested', undefined, { mode: 'reader' });
    };
    return <div className="space-y-5">
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><BookOpen className="h-4 w-4" aria-hidden="true" />
            {progressKnown ? `${completed} of ${lessons.length} guided tutorials completed` : `${lessons.length} lessons to explore`}
        </p>
        {!limit && <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label htmlFor="lesson-search">Search lessons</Label><Input id="lesson-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Topic or skill" /></div>
            <div className="space-y-1"><Label htmlFor="lesson-category">Learning path</Label><select id="lesson-category" value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"><option value="all">All paths</option>{categories.map((name) => <option key={name}>{name}</option>)}</select></div>
        </div>}
        {!visible.length ? <p role="status" className="text-sm text-muted-foreground">No lessons match these filters.</p> : <MotionList as="ul" itemsKey={visible.map((item) => item.catalogueKey).join(':')} className="grid gap-4 sm:grid-cols-2">
            {visible.map((tutorial) => {
                const status = progressKnown && tutorial.persistedId ? progress.find((row) => row.tutorial === tutorial.persistedId)?.status || 'not_started' : 'preview';
                const historical = historyKnown && { not_started: 'not started', in_progress: 'in progress', completed: 'completed' }[
                    lessonProgress(readingHistory, tutorial.persistedId)?.status];
                const action = status === 'completed' ? 'Review' : status === 'in_progress' ? 'Continue' : 'Read';
                return <li key={tutorial.catalogueKey} data-motion-key={tutorial.catalogueKey} className="min-w-0"><Card className="flex h-full flex-col gap-3 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-wider text-primary">{tutorial.category || 'Field Manual'}</p><StatePill state={status} /></div>
                    <h3 className="break-words font-display text-lg font-semibold">{tutorial.title}</h3>
                    <p className="text-sm leading-6 text-muted-foreground">{tutorial.summary}</p>
                    <p className="flex items-center gap-2 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" aria-hidden="true" />About {tutorial.effort_minutes || 10} minutes</p>
                    {tutorial.prerequisites && <p className="text-xs leading-5 text-muted-foreground">Prerequisite: {tutorial.prerequisites}</p>}
                    {historical && <p className="text-xs leading-5 text-muted-foreground">Historical reading: {historical} (self-reported, not guided completion).</p>}
                    <div className="mt-auto flex flex-wrap gap-2">
                        {onGuided && tutorial.persistedId && validLesson(tutorial.lesson) && <Button size="sm" aria-label={`Start interactive tutorial: ${tutorial.title}`} onClick={(event) => onGuided(tutorial.persistedId, event.currentTarget)}>Interactive tutorial</Button>}
                        <Button size="sm" variant="secondary" aria-label={`${action} ${tutorial.title}`} onClick={(event) => openReader(tutorial, event)}>{action} lesson</Button>
                    </div>
                </Card></li>;
            })}
        </MotionList>}
        {limit > 0 && matches.length > limit && <Button href="/docs#workspace-lessons" variant="secondary" size="sm">View all lessons</Button>}
        {current && <TutorialReader key={current.catalogueKey} tutorial={current}
            completed={progressKnown && progress.find((row) => row.tutorial === current.persistedId)?.status === 'completed'}
            onGuided={onGuided && current.persistedId ? () => { setSelected(null); onGuided(current.persistedId, opener.current); } : undefined}
            onClose={() => setSelected(null)} opener={opener.current} origin={origin.current} />}
    </div>;
}

function SignedInCatalog({ userId, limit, initialCategory, initialLesson, providedLessons = null }) {
    const tutorials = useRecords('tutorials', { sort: 'order' });
    const history = useRecords('tutorial_progress', { sort: '-created' });
    const [openedLink, setOpenedLink] = useState('');
    const [guided, setGuided] = useState(null);
    const [growth, setGrowth] = useState({ data: null, loading: true, error: '', requestedPage: 1 });
    const [states, setStates] = useState({ items: [], loading: true, error: '' });
    const growthRequest = useRef(0);
    const statesRequest = useRef(0);
    const mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const learning = useMemo(() => createTutorialLearningClient({ client: pb, accountId: userId,
        isCurrent: () => mounted.current, observe: observeMutation }), [userId]);
    const refreshGrowth = useCallback(async (page = 1) => {
        const request = ++growthRequest.current;
        setGrowth({ data: null, loading: true, error: '', requestedPage: page });
        const pathname = globalThis.window?.location?.pathname;
        const section = telemetrySection(pathname);
        const result = await learning.read('', page);
        if (!mounted.current || request !== growthRequest.current || result.reason === 'scope_changed') return;
        if (!result.ok && pathname === globalThis.window?.location?.pathname)
            readFailed(section, 'tutorial_catalog', result.reason === 'wait' ? 'rate_limited' : result.reason);
        setGrowth(result.ok ? { data: result.data, loading: false, error: '', requestedPage: page } :
            { data: null, loading: false, error: result.error, requestedPage: page });
    }, [learning]);
    const refreshStates = useCallback(async () => {
        const request = ++statesRequest.current;
        setStates({ items: [], loading: true, error: '' });
        const pathname = globalThis.window?.location?.pathname;
        const section = telemetrySection(pathname);
        const result = await learning.readStates();
        if (!mounted.current || request !== statesRequest.current || result.reason === 'scope_changed') return;
        if (!result.ok && pathname === globalThis.window?.location?.pathname)
            readFailed(section, 'tutorial_catalog', result.reason === 'wait' ? 'rate_limited' : result.reason);
        setStates(result.ok ? { items: result.data.items, loading: false, error: '' } : { items: [], loading: false, error: result.error });
    }, [learning]);
    useEffect(() => {
        refreshGrowth(); refreshStates();
        return () => { growthRequest.current++; statesRequest.current++; };
    }, [refreshGrowth, refreshStates]);
    const openGuided = (tutorialId, opener) => {
        setGuided({ tutorialId, opener, client: createTutorialLearningClient({ client: pb, accountId: userId,
            isCurrent: () => mounted.current, observe: observeMutation }) });
        trackPublicAction(PUBLIC_ACTIONS.LESSON_OPEN, 'opened', 'user_requested', undefined, { mode: 'guided' });
    };
    const lessons = mergeTutorials(providedLessons || tutorials.records, providedLessons ? [] : authoredLessons);
    const progressKnown = !states.loading && !states.error && !tutorials.loading && !tutorials.degraded;
    return <div className="ph-no-capture space-y-5" data-dd-privacy="mask">
        <TutorialGrowth {...growth} onRefresh={refreshGrowth} onOpen={openGuided} />
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{providedLessons ? 'Government member learning' : `${authoredLessons.length} authored lessons plus your shared catalogue.`}</p><Button size="sm" variant="secondary" disabled={tutorials.loading || states.loading} onClick={() => { tutorials.refresh(); history.refresh(); refreshStates(); refreshGrowth(); }}>Refresh lessons</Button></div>
        {tutorials.degraded && <DegradedNotice message="The lesson catalogue is unavailable. Showing the bundled public curriculum; guided progress is unavailable." onRetry={tutorials.refresh} />}
        {states.error && <DegradedNotice message={`Guided completion is unknown. ${states.error}`} onRetry={refreshStates} />}
        {history.degraded && <DegradedNotice message="Historical reading records are unavailable. They do not establish guided completion." onRetry={history.refresh} />}
        {!tutorials.loading && !tutorials.degraded && lessons.some((lesson) => !lesson.persistedId) && <p className="text-sm leading-6 text-muted-foreground">Bundled previews are ready to read. Apply the tutorial catalogue migration to use guided learning for lessons not yet installed.</p>}
        {tutorials.loading ? <ListSkeleton label="Loading lessons…" /> : <CatalogView lessons={lessons} progress={states.items} progressKnown={progressKnown}
            readingHistory={history.records.filter((row) => row.owner === userId)} historyKnown={!history.loading && !history.degraded}
            onGuided={openGuided} limit={limit} initialCategory={initialCategory}
            initialLesson={openedLink === initialLesson ? '' : initialLesson} onLinkedLesson={setOpenedLink} />}
        {guided && <InteractiveTutorial key={guided.tutorialId} tutorialId={guided.tutorialId} client={guided.client} opener={guided.opener}
            onClose={() => setGuided(null)} onSaved={() => { refreshGrowth(); refreshStates(); }} />}
    </div>;
}

/** Render only lessons supplied by the protected government endpoint. */
export function GovernmentTutorialCatalog({ lessons, initialLesson = '' }) {
    const { isAuthed, user } = useAuth(); const { demo } = useDemoMode();
    if (!isAuthed || !user?.id || demo || !Array.isArray(lessons)) return null;
    return <SignedInCatalog key={user.id} userId={user.id} providedLessons={lessons} initialCategory="Government submissions" initialLesson={initialLesson} />;
}

/** @param {{limit?: number, initialCategory?: string, initialLesson?: string}} props Preview length, learning path and optional saved lesson link. @returns {React.ReactElement} Authored lessons and account-scoped progress. */
export default function TutorialCatalog({ limit = 0, initialCategory = 'all', initialLesson = '' }) {
    const { isAuthed, user } = useAuth();
    const { demo } = useDemoMode();
    if (!isAuthed || !user?.id || demo) return <div className="space-y-5">
        <p className="text-sm leading-6 text-muted-foreground">{demo ? 'Demo mode: read the bundled lessons without writing progress.' : 'Explore the bundled lessons. Sign in to keep progress on installed lessons.'}</p>
        {!demo && <Button href="/login" size="sm">Sign in for lessons</Button>}
        <CatalogView key={`${demo ? 'demo' : 'public'}:${initialCategory}`} lessons={mergeTutorials([], authoredLessons)} limit={limit} initialCategory={initialCategory} initialLesson={initialLesson} />
    </div>;
    return <SignedInCatalog key={`${user.id}:${initialCategory}`} userId={user.id} limit={limit} initialCategory={initialCategory} initialLesson={initialLesson} />;
}
