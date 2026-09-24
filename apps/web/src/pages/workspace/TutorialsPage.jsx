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
// Depends:     apps/web/src/components/workspace/TutorialCatalog.jsx, apps/web/src/components/workspace/missions/MissionGuide.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/components/workspace/TutorialCatalog.jsx; CONSUMES apps/web/src/components/workspace/missions/MissionGuide.jsx
// DAG Node:    none
// Intent:      Use the same saved lesson progress as Docs and the front page, and show a learner nothing that was written for a contributor.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import TutorialCatalog from '@/components/workspace/TutorialCatalog';
import MissionGuide from '@/components/workspace/missions/MissionGuide';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// The component catalogue used to sit here as a third tab. It inventories this
// repository's own components/ui directory and tells the reader to run the web
// lint script before opening a pull request: that is written for someone working
// ON BuildAndDo, and a learner who opened the Field Manual reads it as a lesson
// that trails off into someone else's build instructions.
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
                </TabsList>
                <TabsContent value="missions" className="mt-6">
                    <MissionGuide />
                </TabsContent>
                <TabsContent value="lessons" className="mt-6">
                    <TutorialCatalog initialCategory={search.get('path') === 'government' ? 'Government submissions' : 'all'} initialLesson={search.get('lesson') || ''} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
