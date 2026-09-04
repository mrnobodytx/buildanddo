import React, { useCallback, useEffect, useState } from 'react';
import {
    GraduationCap,
    Clock,
    CheckCircle2,
    PlayCircle,
    Loader2,
    Info,
    BookOpen,
} from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useRecords } from '@/hooks/useWorkspaceRecords';
import {
    PageHeader,
    StatusBadge,
} from '@/components/workspace/workspaceHelpers';
import { Button, Card } from '@/components/site/ui';

const PROGRESS_TONE = {
    not_started: { label: 'Not started', tone: 'neutral' },
    in_progress: { label: 'In progress', tone: 'violet' },
    completed: { label: 'Completed', tone: 'teal' },
};

export default function TutorialsPage() {
    const { records: tutorials, loading } = useRecords('tutorials', {
        sort: 'order',
    });
    const [progress, setProgress] = useState([]);
    const [busyId, setBusyId] = useState(null);

    const loadProgress = useCallback(async () => {
        try {
            const list = await pb
                .collection('tutorial_progress')
                .getFullList({ sort: '-created' });
            setProgress(list);
        } catch (err) {
            console.error('load tutorial_progress failed', err);
            setProgress([]);
        }
    }, []);

    useEffect(() => {
        loadProgress();
    }, [loadProgress]);

    const progressFor = (tutorialId) =>
        progress.find((p) => p.tutorial === tutorialId);

    const upsertProgress = async (tutorial, status) => {
        setBusyId(tutorial.id);
        const existing = progressFor(tutorial.id);
        try {
            if (existing) {
                await pb.collection('tutorial_progress').update(existing.id, {
                    status,
                    progress: status === 'completed' ? 100 : status === 'in_progress' ? 50 : 0,
                });
            } else {
                await pb.collection('tutorial_progress').create({
                    tutorial: tutorial.id,
                    status,
                    progress: status === 'completed' ? 100 : 50,
                    owner: pb.authStore.record.id,
                });
            }
            await loadProgress();
        } catch (err) {
            console.error('save progress failed', err);
        }
        setBusyId(null);
    };

    const completedCount = progress.filter((p) => p.status === 'completed').length;

    return (
        <div className="space-y-8">
            <PageHeader
                title="Tutorials"
                description="Short, task-based lessons that teach the Observe → Understand → Act → Verify loop and each part of your workspace. Your progress is saved per account."
            />

            <Card className="flex items-center gap-4 p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-secondary text-primary">
                    <BookOpen className="h-5 w-5" />
                </span>
                <div className="text-sm">
                    <p className="font-medium">
                        {completedCount} of {tutorials.length} lessons completed
                    </p>
                    <p className="text-muted-foreground">
                        Lessons take roughly 8–14 minutes each.
                    </p>
                </div>
            </Card>

            {loading ? (
                <Card className="p-8 text-center text-sm text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </Card>
            ) : tutorials.length === 0 ? (
                <Card className="p-8 text-center text-sm text-muted-foreground">
                    No lessons available yet.
                </Card>
            ) : (
                <ul className="grid gap-4 sm:grid-cols-2">
                    {tutorials.map((t) => {
                        const prog = progressFor(t.id);
                        const status = prog?.status || 'not_started';
                        const isDone = status === 'completed';
                        const isInProgress = status === 'in_progress';
                        return (
                            <li key={t.id}>
                                <Card className="flex h-full flex-col p-5">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                                                {t.category}
                                            </p>
                                            <p className="mt-1 font-display text-base font-semibold tracking-tight">
                                                {t.title}
                                            </p>
                                        </div>
                                        <StatusBadge
                                            map={PROGRESS_TONE}
                                            value={status}
                                        />
                                    </div>

                                    {t.summary && (
                                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                            {t.summary}
                                        </p>
                                    )}

                                    <dl className="mt-4 space-y-1.5 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                                        <div className="flex items-center gap-2">
                                            <Clock className="h-3.5 w-3.5 shrink-0" />
                                            <span>~{t.effort_minutes} min</span>
                                        </div>
                                        {t.prerequisites && (
                                            <div className="flex items-start gap-2">
                                                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                                <span>Prerequisite: {t.prerequisites}</span>
                                            </div>
                                        )}
                                    </dl>

                                    <div className="mt-4 flex gap-2">
                                        {isDone ? (
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => upsertProgress(t, 'in_progress')}
                                                disabled={busyId === t.id}
                                            >
                                                {busyId === t.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <PlayCircle className="h-4 w-4" />
                                                )}
                                                Review again
                                            </Button>
                                        ) : (
                                            <>
                                                <Button
                                                    size="sm"
                                                    onClick={() => upsertProgress(t, 'in_progress')}
                                                    disabled={busyId === t.id}
                                                >
                                                    {busyId === t.id ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <PlayCircle className="h-4 w-4" />
                                                    )}
                                                    {isInProgress ? 'Continue' : 'Start'}
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() => upsertProgress(t, 'completed')}
                                                    disabled={busyId === t.id}
                                                >
                                                    <CheckCircle2 className="h-4 w-4" />
                                                    Mark complete
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </Card>
                            </li>
                        );
                    })}
                </ul>
            )}

            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground/70">
                <GraduationCap className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                The tutorial system is a foundation — guided lessons live here
                and your progress is tracked. Deeper interactive walkthroughs
                arrive as the product grows.
            </p>
        </div>
    );
}
