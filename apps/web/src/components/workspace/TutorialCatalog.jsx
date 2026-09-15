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
// EnumEdges:   CONSUMES apps/web/src/hooks/useWorkspaceRecords.js; CONSUMES apps/web/src/lib/observability/mutations.js
// DAG Node:    none
// Intent:      Reuse real lessons and recoverable per-account progress on the home page, Docs and workspace Field Manual.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, CheckCircle2, Clock, Loader2, PlayCircle } from 'lucide-react';
import { Button, Card, StatePill } from '@/components/site/ui';
import {
    DemoModeBanner,
    DegradedNotice,
    ListSkeleton,
    WriteErrorNotice,
} from '@/components/workspace/WorkspaceNotices';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { describeWriteError, useRecords } from '@/hooks/useWorkspaceRecords';
import { workspaceCollection } from '@/lib/observability/mutations';
import pb from '@/lib/pocketbaseClient';

function SignedInCatalog({ userId, limit }) {
    const tutorials = useRecords('tutorials', { sort: 'order' });
    const progress = useRecords('tutorial_progress', { sort: '-created' });
    const [busyId, setBusyId] = useState('');
    const [writeError, setWriteError] = useState('');
    const [saved, setSaved] = useState('');
    const savingRef = useRef(false);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const progressFor = (id) => progress.records.find((record) => record.tutorial === id);
    const completedCount = tutorials.records.filter(
        (tutorial) => progressFor(tutorial.id)?.status === 'completed',
    ).length;
    const visible = limit ? tutorials.records.slice(0, limit) : tutorials.records;

    const saveProgress = async (tutorial, status) => {
        // A failed progress read cannot distinguish a new row from an existing
        // one. Wait for recovery so a retry never blindly creates a duplicate.
        if (
            savingRef.current ||
            progress.loading ||
            progress.degraded ||
            pb.authStore.record?.id !== userId
        )
            return;
        savingRef.current = true;
        setBusyId(tutorial.id);
        setWriteError('');
        setSaved('');
        const existing = progressFor(tutorial.id);
        const fields = { status, progress: status === 'completed' ? 100 : 50 };
        try {
            if (existing) {
                await workspaceCollection('tutorial_progress').update(existing.id, fields);
            } else {
                await workspaceCollection('tutorial_progress').create({
                    ...fields,
                    tutorial: tutorial.id,
                    owner: userId,
                });
            }
            if (!mountedRef.current || pb.authStore.record?.id !== userId) return;
            setSaved(`Progress saved for ${tutorial.title}.`);
            await progress.refresh();
        } catch (error) {
            if (mountedRef.current)
                setWriteError(
                    describeWriteError(error, 'Could not save your progress. Try again.'),
                );
        } finally {
            savingRef.current = false;
            if (mountedRef.current) setBusyId('');
        }
    };

    return (
        <div className="ph-no-capture space-y-5" data-dd-privacy="mask">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <BookOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {!tutorials.loading &&
                    !tutorials.degraded &&
                    !progress.loading &&
                    !progress.degraded
                        ? `${completedCount} of ${tutorials.records.length} lessons completed`
                        : 'Your lesson catalogue and saved progress'}
                </p>
                <Button
                    variant="secondary"
                    size="sm"
                    disabled={tutorials.loading || progress.loading}
                    onClick={() => {
                        tutorials.refresh();
                        progress.refresh();
                    }}
                >
                    Refresh lessons
                </Button>
            </div>
            {tutorials.degraded && (
                <DegradedNotice
                    message="The lesson catalogue is unavailable."
                    onRetry={tutorials.refresh}
                />
            )}
            {progress.degraded && (
                <DegradedNotice
                    message="Your saved progress is unavailable. Retry before updating a lesson."
                    onRetry={progress.refresh}
                />
            )}
            {writeError && (
                <WriteErrorNotice message={writeError} onDismiss={() => setWriteError('')} />
            )}
            {saved && (
                <p role="status" className="text-sm text-success">
                    {saved}
                </p>
            )}
            {tutorials.loading ? (
                <ListSkeleton label="Loading lessons…" />
            ) : (
                !tutorials.degraded &&
                (visible.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No lessons available yet.</p>
                ) : (
                    <ul className="grid gap-4 sm:grid-cols-2">
                        {visible.map((tutorial) => {
                            const stateKnown = !progress.loading && !progress.degraded;
                            const status = stateKnown
                                ? progressFor(tutorial.id)?.status || 'not_started'
                                : 'unavailable';
                            const done = status === 'completed';
                            const busy = busyId === tutorial.id;
                            return (
                                <li key={tutorial.id} className="min-w-0">
                                    <Card className="flex h-full flex-col gap-3 p-5">
                                        <div className="flex flex-wrap items-start justify-between gap-2">
                                            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                                                {tutorial.category || 'Field Manual'}
                                            </p>
                                            <StatePill state={status} />
                                        </div>
                                        <h3 className="font-display text-lg font-semibold">
                                            {tutorial.title}
                                        </h3>
                                        {tutorial.summary && (
                                            <p className="text-sm leading-relaxed text-muted-foreground">
                                                {tutorial.summary}
                                            </p>
                                        )}
                                        {tutorial.effort_minutes > 0 && (
                                            <p className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                                                About {tutorial.effort_minutes} minutes
                                            </p>
                                        )}
                                        {tutorial.prerequisites && (
                                            <p className="text-xs text-muted-foreground">
                                                Prerequisite: {tutorial.prerequisites}
                                            </p>
                                        )}
                                        <div className="mt-auto flex flex-wrap gap-2 pt-2">
                                            <Button
                                                size="sm"
                                                variant={done ? 'secondary' : 'primary'}
                                                disabled={Boolean(busyId) || !stateKnown}
                                                aria-label={`${done ? 'Review' : status === 'in_progress' ? 'Continue' : 'Start'} ${tutorial.title}`}
                                                onClick={() =>
                                                    saveProgress(tutorial, 'in_progress')
                                                }
                                            >
                                                {busy ? (
                                                    <Loader2
                                                        className="h-4 w-4 animate-spin"
                                                        aria-hidden="true"
                                                    />
                                                ) : (
                                                    <PlayCircle
                                                        className="h-4 w-4"
                                                        aria-hidden="true"
                                                    />
                                                )}
                                                {done
                                                    ? 'Review again'
                                                    : status === 'in_progress'
                                                      ? 'Continue'
                                                      : 'Start'}
                                            </Button>
                                            {!done && (
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    disabled={Boolean(busyId) || !stateKnown}
                                                    aria-label={`Mark ${tutorial.title} complete`}
                                                    onClick={() =>
                                                        saveProgress(tutorial, 'completed')
                                                    }
                                                >
                                                    <CheckCircle2
                                                        className="h-4 w-4"
                                                        aria-hidden="true"
                                                    />
                                                    Mark complete
                                                </Button>
                                            )}
                                        </div>
                                    </Card>
                                </li>
                            );
                        })}
                    </ul>
                ))
            )}
            {limit > 0 && tutorials.records.length > limit && (
                <Button href="/docs#workspace-lessons" variant="secondary" size="sm">
                    View all lessons
                </Button>
            )}
            <p className="text-xs leading-relaxed text-muted-foreground">
                Progress records your own learning activity. Marking a lesson complete does not
                verify a business outcome.
            </p>
        </div>
    );
}

/** @param {{limit?: number}} props Optional preview length. @returns {React.ReactElement} Authenticated lessons. */
export default function TutorialCatalog({ limit = 0 }) {
    const { isAuthed, user } = useAuth();
    const { demo } = useDemoMode();
    if (!isAuthed || !user?.id) {
        return (
            <Card className="space-y-4 p-5">
                <p className="text-sm text-muted-foreground">
                    Sign in to read the Field Manual and keep your lesson progress.
                </p>
                <Button href="/login" size="sm">
                    Sign in for lessons
                </Button>
            </Card>
        );
    }
    if (demo) return <DemoModeBanner />;
    return <SignedInCatalog key={user.id} userId={user.id} limit={limit} />;
}
