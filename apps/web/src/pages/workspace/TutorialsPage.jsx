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
// Depends:     apps/web/src/components/workspace/TutorialCatalog.jsx, apps/web/src/components/workspace/ComponentCatalog.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/components/workspace/TutorialCatalog.jsx; CONSUMES apps/web/src/components/workspace/ComponentCatalog.jsx
// DAG Node:    none
// Intent:      Use the same saved lesson progress as Docs and the front page while loading the component reference separately.
// ───────────────────────────────────────────────────────────────

import React, { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';
import TutorialCatalog from '@/components/workspace/TutorialCatalog';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import { Card } from '@/components/site/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// The catalogue imports most of components/ui, so it is code-split: a reader
// who only wants a lesson does not download every Radix primitive.
const ComponentCatalog = lazy(() => import('@/components/workspace/ComponentCatalog'));

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
                    <TutorialCatalog />
                </TabsContent>
            </Tabs>
        </div>
    );
}
