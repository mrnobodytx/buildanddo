// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/ClassroomLandingPage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-16
// Depends:     apps/web/src/components/site/PublicPage.jsx, apps/web/src/components/workspace/TutorialCatalog.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/components/site/PublicPage.jsx; CONSUMES apps/web/src/components/workspace/TutorialCatalog.jsx
// DAG Node:    none
// Intent:      Give visitors a visible route into shared workspace classes and the existing educational lessons.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { BookOpen, MessageCircle, Users } from 'lucide-react';
import PublicPage from '@/components/site/PublicPage';
import { Button, Card } from '@/components/site/ui';
import TutorialCatalog from '@/components/workspace/TutorialCatalog';

export default function ClassroomLandingPage() {
    return <PublicPage path="/classrooms" eyebrow="Learn together" title="A classroom for the work ahead."
        intro="Bring your workspace into the same lesson. A host guides the reading, members follow along, and questions stay with the class.">
        <section aria-label="Open classrooms" className="space-y-5">
            <div className="flex flex-wrap gap-3"><Button href="/app/classrooms">Open your classrooms</Button><Button href="#classroom-lessons" variant="secondary">Explore the lessons</Button></div>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">Sign in to see your workspace's scheduled, live and ended classes. Room links are for workspace members; creating an account does not grant access to someone else's class.</p>
            <div className="grid gap-4 md:grid-cols-3">{[
                { icon: BookOpen, title: 'One shared lesson', text: 'Choose a Field Manual lesson, then follow the section selected by the host. Exercises and personal progress remain yours.' },
                { icon: Users, title: 'Join when the host starts', text: 'See who is attending and leave at any time. A scheduled class becomes live only when a host starts the session.' },
                { icon: MessageCircle, title: 'Keep the discussion', text: 'Ask questions during the session and return to the saved discussion afterward. Viewer seats can follow along.' },
            ].map(({ icon: Icon, title, text }) => <Card key={title} className="space-y-3 p-6"><Icon className="h-5 w-5 text-primary" aria-hidden="true" /><h2 className="font-display text-xl font-semibold">{title}</h2><p className="text-sm leading-6 text-muted-foreground">{text}</p></Card>)}</div>
            <p className="text-sm leading-6 text-muted-foreground">Classes currently use shared reading and text discussion. Voice and video are not connected.</p>
        </section>
        <section id="classroom-lessons" aria-labelledby="classroom-lessons-title" className="scroll-mt-20 space-y-5">
            <h2 id="classroom-lessons-title" className="font-display text-3xl font-semibold">Start with a lesson</h2>
            <p className="text-sm leading-6 text-muted-foreground">Business planning, accountable missions and government-submission learning use the same curriculum inside and outside a classroom.</p>
            <TutorialCatalog limit={4} />
        </section>
        <p className="text-xs text-muted-foreground">Powered by Citadel Nexus Inc. · <a className="underline underline-offset-4" href="https://citadel-nexus.com/status">Service status</a></p>
    </PublicPage>;
}
