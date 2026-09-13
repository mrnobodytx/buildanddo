// CGRF: SRS=SRS-BUILDANDDO-PUBLIC-RECORD-001 | CAPS=B | Seat=C-ONE
import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
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
import { Badge, Button, Card } from '@/components/site/ui';
import EmptyState from '@/components/workspace/EmptyState';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    integrationsStateOf,
    isIntegrationsStale,
    tutorialsOf,
    useIntegrationsStatus,
} from '@/lib/integrationsStatus';
import { timeAgo } from '@/lib/format';

// The catalogue imports most of components/ui, so it is code-split: a reader
// who only wants a lesson does not download every Radix primitive.
const ComponentCatalog = lazy(() =>
    import('@/components/workspace/ComponentCatalog'),
);

const PROGRESS_TONE = {
    not_started: { label: 'Not started', tone: 'neutral' },
    in_progress: { label: 'In progress', tone: 'violet' },
    completed: { label: 'Completed', tone: 'teal' },
};

function LessonsTab() {
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
        <div className="space-y-6">
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

/* Failure tutorials --------------------------------------------------------- */
/* Public-safe lessons the estate wrote from real staging/production failures, */
/* read from the build-time projection. A lesson links to its wiki page only   */
/* when the estate's delivery receipts prove that page was published.         */

const SEVERITY_TONE = { P0: 'red', P1: 'amber', P2: 'neutral' };

function FailureTutorialsTab() {
    const { status, error } = useIntegrationsStatus();
    const tutorials = tutorialsOf(status);
    const stale = isIntegrationsStale(status);

    if (!status && !error) {
        return (
            <Card className="p-8 text-center text-sm text-muted-foreground">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" aria-label="Loading failure tutorials" />
            </Card>
        );
    }

    if (!tutorials) {
        const reason = error
            ? 'integrations-status.json was not served with this build.'
            : `The estate's tutorial corpus was ${status?.sections?.tutorials?.reason || (integrationsStateOf(status) === 'MEASURED' ? 'not projected' : 'not readable')} at build time.`;
        return (
            <EmptyState
                icon={GraduationCap}
                title="Failure tutorials UNMEASURED"
                description={`${reason} Nothing is invented in its place.`}
            />
        );
    }

    return (
        <section className="space-y-6" aria-labelledby="failure-tutorials-heading">
            <div>
                <h2 id="failure-tutorials-heading" className="font-display text-lg font-semibold tracking-tight">
                    Failures on staging become documented lessons
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    When a gate fails on staging or production, the estate records the error class, what it
                    probed, and how to verify the fix, then publishes the public-safe version to the wiki
                    and forum. Only lessons marked public-safe appear here.
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                    Projected {timeAgo(status.generated_at)}
                    {stale && <span className="ml-2 font-semibold text-amber-warm">· DATA MAY BE STALE</span>}
                </p>
            </div>

            {tutorials.length === 0 ? (
                <EmptyState
                    icon={GraduationCap}
                    title="No public-safe failure tutorials yet"
                    description="The estate has not published a lesson it considers safe to read. That is the measured answer, not a placeholder."
                />
            ) : (
                <ul className="grid gap-4 sm:grid-cols-2" aria-label="Failure tutorials">
                    {tutorials.map((t) => (
                        <li key={t.lesson_id}>
                            <Card className="flex h-full flex-col p-5">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                                            {t.env || 'env unknown'}
                                        </p>
                                        <h3 className="mt-1 break-words font-display text-base font-semibold tracking-tight">
                                            {t.error_class || t.lesson_id}
                                        </h3>
                                    </div>
                                    <Badge tone={SEVERITY_TONE[t.severity] || 'neutral'}>
                                        <span className="sr-only">Severity </span>
                                        {t.severity || '—'}
                                    </Badge>
                                </div>

                                <dl className="mt-4 space-y-1.5 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                                    <div className="flex items-start gap-2">
                                        <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                        <span>{t.lesson_id}</span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                        <span>Channels: {(t.channels || []).join(', ') || 'none'}</span>
                                    </div>
                                </dl>

                                <div className="mt-4 text-sm">
                                    {t.wiki_url ? (
                                        <a
                                            href={t.wiki_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-primary underline-offset-2 hover:underline"
                                        >
                                            Read the wiki lesson
                                        </a>
                                    ) : (
                                        <span className="text-muted-foreground">Wiki page not yet published</span>
                                    )}
                                </div>
                            </Card>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

export default function TutorialsPage() {
    return (
        <div className="space-y-8">
            <PageHeader
                title="Field Manual"
                description="Two references in one place: the live catalogue of every UI primitive this codebase already ships, and the task-based lessons that teach the Observe → Understand → Act → Verify loop. Start from the catalogue before writing a component; start from the lessons before running a mission."
            />

            <Tabs defaultValue="catalog">
                <TabsList>
                    <TabsTrigger value="catalog">Component catalogue</TabsTrigger>
                    <TabsTrigger value="lessons">Lessons</TabsTrigger>
                    <TabsTrigger value="failures">Failure tutorials</TabsTrigger>
                </TabsList>
                <TabsContent value="catalog" className="mt-6">
                    <Suspense
                        fallback={
                            <Card className="p-8 text-center text-sm text-muted-foreground">
                                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                            </Card>
                        }
                    >
                        <ComponentCatalog />
                    </Suspense>
                </TabsContent>
                <TabsContent value="lessons" className="mt-6">
                    <LessonsTab />
                </TabsContent>
                <TabsContent value="failures" className="mt-6">
                    <FailureTutorialsTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}
