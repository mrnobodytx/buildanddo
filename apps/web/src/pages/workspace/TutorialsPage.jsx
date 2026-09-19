// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/TutorialsPage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/components/workspace/TutorialCatalog.jsx, apps/web/src/components/workspace/ComponentCatalog.jsx, apps/web/src/components/workspace/missions/MissionGuide.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/components/workspace/TutorialCatalog.jsx; CONSUMES apps/web/src/components/workspace/ComponentCatalog.jsx; CONSUMES apps/web/src/components/workspace/missions/MissionGuide.jsx
// DAG Node:    none
// Intent:      Use the same saved lesson progress as Docs and the front page while loading the component reference separately.
// ───────────────────────────────────────────────────────────────

import React, { Suspense, lazy } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import TutorialCatalog from '@/components/workspace/TutorialCatalog';
import MissionGuide from '@/components/workspace/missions/MissionGuide';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import { Card } from '@/components/site/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// The catalogue imports most of components/ui, so it is code-split: a reader
// who only wants a lesson does not download every Radix primitive.
const ComponentCatalog = lazy(() => import('@/components/workspace/ComponentCatalog'));

export default function TutorialsPage() {
    const [search] = useSearchParams();
    return (
        <div className="space-y-8">
            <PageHeader
                title="Field Manual"
                description="Build your skills with interactive tutorials. Resume saved checkpoints, practice what you learn and earn completion certificates as your learning journey grows."
            />
            <div className="flex flex-wrap gap-4 text-sm"><Link className="underline underline-offset-4" to="/app/classrooms">Learn together in Classrooms</Link><Link className="underline underline-offset-4" to="/app/missions">Create a government submission mission</Link><Link className="underline underline-offset-4" to="/app/suite">Open mission suite</Link></div>

            <Tabs defaultValue="lessons">
                <TabsList className="h-auto flex-wrap justify-start">
                    <TabsTrigger value="lessons">Lessons</TabsTrigger>
                    <TabsTrigger value="missions">Build a mission</TabsTrigger>
                    <TabsTrigger value="catalog">Component catalogue</TabsTrigger>
                </TabsList>
                <TabsContent value="missions" className="mt-6">
                    <MissionGuide />
                </TabsContent>
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
                    <TutorialCatalog initialCategory={search.get('path') === 'government' ? 'Government submissions' : 'all'} initialLesson={search.get('lesson') || ''} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
