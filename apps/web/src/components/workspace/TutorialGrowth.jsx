// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/TutorialGrowth.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-19
// Depends:     apps/web/src/lib/tutorialLearning.js, apps/web/src/components/site/ui.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/tutorialLearning.js; CONSUMES apps/web/src/components/site/ui.jsx
// DAG Node:    none
// Intent:      Make saved learning credit, earned milestones and recoverable completion certificates visible across the Field Manual.
// ───────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Award, BookOpen, Check } from 'lucide-react';
import { Badge, Button, Card } from '@/components/site/ui';
import { certificateDocument } from '@/lib/tutorialLearning';

/** @param {{certificate: object}} props Persisted certificate. @returns {React.ReactElement} Explicit personal certificate export. */
export function CertificateDownload({ certificate }) {
    const [error, setError] = useState('');
    const download = () => {
        setError('');
        let url;
        try {
            url = URL.createObjectURL(new Blob([certificateDocument(certificate)], { type: 'text/html;charset=utf-8' }));
            const link = document.createElement('a');
            link.href = url; link.download = `${certificate.id}.html`;
            document.body.appendChild(link); link.click(); link.remove();
        } catch { setError('The certificate could not be downloaded. Try again.'); }
        finally {
            if (url) {
                const revoke = URL.revokeObjectURL.bind(URL);
                setTimeout(() => revoke(url), 1000);
            }
        }
    };
    return <div className="space-y-2">
        <Button size="sm" variant="secondary" onClick={download} aria-label={`Download certificate for ${certificate.title}`}>Download certificate</Button>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>;
}

/** @param {{certificate: object}} props Issued completion certificate. @returns {React.ReactElement} Learner-facing earned certificate. */
export function LearningCertificate({ certificate }) {
    return <Card className="space-y-5 border-double border-4 p-5 sm:p-8">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary"><Award className="h-5 w-5" aria-hidden="true" />BuildAndDo learning</p>
        <h3 className="font-display text-3xl font-semibold">Certificate of completion</h3>
        <p className="text-sm text-muted-foreground">Awarded to <strong className="text-foreground">{certificate.learner}</strong></p>
        <p className="font-display text-xl font-semibold">{certificate.title}</p>
        <p className="text-sm leading-6">{certificate.achievement}</p>
        <p className="text-sm text-muted-foreground">Issued {new Date(certificate.issued_at).toLocaleDateString(undefined, { timeZone: 'UTC' })} · {certificate.learning_points} learning points</p>
        <p className="break-all font-mono text-xs text-muted-foreground">{certificate.id}</p>
        <CertificateDownload certificate={certificate} />
        <p className="text-xs leading-6 text-muted-foreground">{certificate.issuer}. {certificate.scope}</p>
        <p className="text-xs text-muted-foreground">Open the downloaded certificate to print it or save it as a PDF.</p>
    </Card>;
}

/** @param {{data: object|null, loading: boolean, error: string, onRefresh: Function, onOpen: Function}} props Account growth snapshot. @returns {React.ReactElement} Personal learning summary. */
export default function TutorialGrowth({ data, loading, error, onRefresh, onOpen }) {
    const levelProgress = data ? (data.level.next === null ? 100 : Math.min(100, Math.round((data.points - data.level.floor) * 100 / (data.level.next - data.level.floor)))) : 0;
    return <section aria-label="Your learning journey" className="ph-no-capture" data-dd-privacy="mask">
        <Card className="space-y-5 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary"><BookOpen className="h-4 w-4" aria-hidden="true" />Keep building your skills</p>
                    <h2 className="font-display text-2xl font-semibold">Your learning journey</h2></div>
                <Button size="sm" variant="ghost" disabled={loading} onClick={() => onRefresh(data?.certificates.page || 1)}>Refresh growth</Button>
            </div>
            {loading && <p role="status" className="text-sm text-muted-foreground">Loading saved learning…</p>}
            {error ? <p role="status" className="text-sm text-muted-foreground">{error}</p> : data && <>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                    <Badge tone="green">Level {data.level.number} · {data.level.name}</Badge>
                    <p className="text-sm"><strong>{data.points}</strong> learning points</p>
                    <p className="text-sm"><strong>{data.completed}</strong> {data.completed === 1 ? 'certificate' : 'certificates'} earned</p>
                </div>
                <div className="space-y-2">
                    <div role="progressbar" aria-label="Learning level progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={levelProgress}
                        aria-valuetext={data.level.next === null ? 'Guide level earned' : `${data.level.next - data.points} points to the next level`} className="h-2 overflow-hidden bg-secondary">
                        <div className="h-full bg-primary motion-safe:transition-[width]" style={{ width: `${levelProgress}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground">{data.level.next === null ? 'Guide level earned. Keep exploring and help someone practice.' : `${data.level.next - data.points} points to the next level. Earn 100 points for each completed interactive tutorial.`}</p>
                </div>
                <ul aria-label="Learning milestones" className="flex flex-wrap gap-2">{data.milestones.map((milestone) => <li key={milestone.id}>
                    <Badge tone={milestone.earned ? 'green' : 'neutral'}>{milestone.earned && <Check className="h-3 w-3" aria-hidden="true" />}{milestone.title} · {milestone.earned ? 'earned' : `${milestone.target} completions`}</Badge>
                </li>)}</ul>
                {data.resume && <Button variant="secondary" className="h-auto min-h-11 whitespace-normal py-2 text-left" onClick={(event) => onOpen(data.resume.tutorial, event.currentTarget)}>Continue {data.resume.title} · {data.resume.progress}%</Button>}
                {data.completed >= 1 && <details className="border-t border-border pt-3"><summary className="cursor-pointer py-2 text-sm font-semibold">Unlocked: reflection practice</summary><p className="mt-2 text-sm leading-6">Name one decision you would now make differently, one piece of evidence you would seek, and one small next action. At five completions, try explaining an example to another learner.</p>
                    {data.completed >= 5 && <p className="mt-3 text-sm leading-6">Peer teaching challenge: invite someone to work through a lesson with you. Ask them to explain their choice before showing the feedback, then compare what you both learned.</p>}</details>}
                {data.completed > 0 && <details className="border-t border-border pt-3"><summary className="cursor-pointer py-2 text-sm font-semibold">My certificates ({data.completed})</summary>
                    <ul className="divide-y divide-border">{data.certificates.items.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                        <div className="min-w-0"><p className="break-words text-sm font-semibold">{item.certificate.title}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(item.certificate.issued_at).toLocaleDateString(undefined, { timeZone: 'UTC' })}</p></div>
                        <CertificateDownload certificate={item.certificate} />
                    </li>)}</ul>
                    <div className="mt-3 flex items-center gap-3"><Button size="sm" variant="ghost" disabled={loading || data.certificates.page === 1} onClick={() => onRefresh(data.certificates.page - 1)}>Previous certificates</Button><span className="text-xs">Page {data.certificates.page}</span><Button size="sm" variant="ghost" disabled={loading || !data.certificates.has_more} onClick={() => onRefresh(data.certificates.page + 1)}>More certificates</Button></div>
                </details>}
                <p className="text-xs leading-6 text-muted-foreground">Checkpoints and certificates stay with your account. Reviewing a tutorial keeps your credit; repeating it adds no extra points.</p>
            </>}
        </Card>
    </section>;
}
