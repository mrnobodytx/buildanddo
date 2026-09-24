// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/web/src/pages/OnboardingPage.jsx
// Stage:        07_BUILD
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-21
// Depends:      apps/web/src/lib/onboarding.js, apps/web/src/contexts/AuthContext.jsx
// EnumType:     Widget
// EnumEdges:    DEPENDS_ON apps/web/src/lib/onboarding.js; DEPENDS_ON apps/web/src/contexts/AuthContext.jsx
// DAG Node:     none
// Intent:       Start a recoverable workspace from an explicit intent and objective, with optional business context scoped to the current account.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Activity, AlertCircle, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { Button, PaperCard, SectionLabel } from '@/components/site/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import pb from '@/lib/pocketbaseClient';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useAuth } from '@/contexts/AuthContext';
import { workspaceDestination } from '@/lib/navigationIntent';
import { createWorkspace as saveWorkspace, ONBOARDING_INTENTS } from '@/lib/onboarding';

const INPUT_STYLE = 'h-11 border-paper bg-paper-subtle text-paper-fg placeholder:text-paper-muted/70';

function OnboardingDesk() {
    const navigate = useNavigate();
    const location = useLocation();
    const { refresh } = useWorkspace();
    const [step, setStep] = useState(0);
    const [intent, setIntent] = useState('');
    const [objective, setObjective] = useState('');
    const [name, setName] = useState('');
    const [domain, setDomain] = useState('');
    const [business, setBusiness] = useState('');
    const [creating, setCreating] = useState(false);
    const [receipt, setReceipt] = useState(null);
    const [error, setError] = useState('');
    const alive = useRef(true);
    const pending = useRef(false);
    const heading = useRef(null);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    useEffect(() => { heading.current?.focus(); }, [step]);

    const next = (event) => {
        event.preventDefault();
        setError('');
        if (step === 0 && !intent) { setError('Choose what you want to do.'); return; }
        if (step === 1) {
            if (!objective.trim()) { setError('Describe an outcome you want to achieve.'); return; }
            if (!name.trim()) setName(objective.trim().slice(0, 120));
        }
        setStep((value) => value + 1);
    };
    const createWorkspace = async (event) => {
        event.preventDefault();
        if (pending.current) return;
        if (!intent || !objective.trim() || !name.trim()) { setError('Choose an intent, objective and workspace name.'); return; }
        const account = pb.authStore.record?.id;
        pending.current = true;
        setCreating(true);
        setError('');
        try {
            const result = receipt || await saveWorkspace(pb, account, {
                name: name.trim(), domain: domain.trim(), intent,
                objective: objective.trim(), business_context: business.trim(),
            });
            if (!alive.current || pb.authStore.record?.id !== account) return;
            if (!result.ok) { setError(result.error || 'Workspace setup could not be confirmed. Retry the same details.'); return; }
            setReceipt(result);
            const workspaces = await refresh(result.workspace);
            if (!alive.current || pb.authStore.record?.id !== account) return;
            if (!workspaces?.some((workspace) => workspace.id === result.workspace)) {
                setError('Workspace saved. We could not load it yet. Retry opening it without creating another workspace.');
                return;
            }
            navigate(workspaceDestination(location.state?.returnTo), { replace: true });
        } catch {
            if (alive.current && pb.authStore.record?.id === account)
                setError('We could not open your workspace. Retry to recover the saved setup.');
        } finally {
            pending.current = false;
            if (alive.current) setCreating(false);
        }
    };
    const choice = ONBOARDING_INTENTS.find((item) => item.value === intent);
    const titles = ['What do you want to do?', 'What do you want to achieve?', 'Make room for your objective'];
    const descriptions = [
        'Start with your intent. You do not need a business or a website.',
        'Name one outcome you can work toward and check. You can break it into smaller tasks in your workspace.',
        'Your workspace keeps your objective, lessons, tasks and evidence together.',
    ];

    return <div className="min-h-screen bg-background text-foreground">
        <Helmet>
            <title>Set up your workspace · BuildAndDo</title>
            <meta name="description" content="Choose what you want to do, save an objective, and start with a recommended lesson in your workspace." />
        </Helmet>
        <main id="main-content" tabIndex={-1} className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
            <div className="flex items-center gap-2.5">
                <Activity className="h-6 w-6 text-primary" aria-hidden="true" />
                <span className="font-display text-lg font-semibold tracking-tight">BuildAndDo</span>
            </div>
            <div className="mt-10">
                <SectionLabel>Onboarding · Step {step + 1} of 3</SectionLabel>
                <h1 ref={heading} tabIndex={-1} className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{titles[step]}</h1>
                <p className="mt-4 text-base leading-relaxed text-muted-foreground">{descriptions[step]}</p>
            </div>
            <PaperCard className="ph-no-capture mt-8 p-6 sm:p-7" data-dd-privacy="mask">
                <form onSubmit={step === 2 ? createWorkspace : next} className="space-y-6">
                    <fieldset disabled={creating || Boolean(receipt)} className="space-y-5">
                        {step === 0 && <>
                            <legend className="mb-3 text-sm font-semibold text-paper-fg">Choose your intent</legend>
                            <div className="grid gap-3 sm:grid-cols-2">
                                {ONBOARDING_INTENTS.map((item) => <label key={item.value}
                                    className={`flex cursor-pointer items-center gap-3 rounded-md border p-4 text-paper-fg ${intent === item.value ? 'border-primary bg-paper-subtle' : 'border-paper bg-paper'}`}>
                                    <input type="radio" name="intent" value={item.value} checked={intent === item.value}
                                        onChange={() => setIntent(item.value)} required className="accent-primary" />
                                    <span>{item.label}</span>
                                </label>)}
                            </div>
                        </>}
                        {step === 1 && <>
                            <p className="text-sm text-paper-muted">Your intent: {choice?.label}</p>
                            <div className="space-y-2">
                                <Label htmlFor="ob-objective" className="text-paper-fg">Your objective</Label>
                                <Input id="ob-objective" value={objective} onChange={(event) => setObjective(event.target.value)}
                                    required maxLength={160} placeholder="e.g. Deploy my first website" aria-describedby="ob-objective-help" className={INPUT_STYLE} />
                                <p id="ob-objective-help" className="text-xs leading-5 text-paper-muted">Describe the result you want. Up to 160 characters.</p>
                            </div>
                        </>}
                        {step === 2 && <>
                            <div className="rounded-md border border-paper bg-paper-subtle p-4 text-paper-fg">
                                <p className="text-xs font-semibold uppercase tracking-wider text-paper-muted">{choice?.label}</p>
                                <p className="mt-2 break-words font-medium">{objective}</p>
                                <p className="mt-2 text-sm text-paper-muted">We will save this as your first objective and suggest a starting path.</p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="ob-name" className="text-paper-fg">Workspace name</Label>
                                <Input id="ob-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} className={INPUT_STYLE} />
                            </div>
                            <details className="rounded-md border border-paper p-4">
                                <summary className="cursor-pointer text-sm font-medium text-paper-fg">Add business or website context (optional)</summary>
                                <div className="mt-4 space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="ob-business" className="text-paper-fg">Business or organization (optional)</Label>
                                        <Input id="ob-business" value={business} onChange={(event) => setBusiness(event.target.value)} maxLength={120} className={INPUT_STYLE} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="ob-domain" className="text-paper-fg">Website domain (optional)</Label>
                                        <Input id="ob-domain" value={domain} onChange={(event) => setDomain(event.target.value)} maxLength={253}
                                            placeholder="example.com" aria-describedby="ob-domain-help" className={INPUT_STYLE} />
                                        <p id="ob-domain-help" className="text-xs leading-5 text-paper-muted">Context only. No DNS, website, traffic or SEO lookup is performed. Saving a domain does not verify ownership or grant access.</p>
                                    </div>
                                </div>
                            </details>
                        </>}
                    </fieldset>
                    {error && <p role="alert" className="flex items-start gap-2 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{error}</p>}
                    <div className="flex flex-wrap items-center gap-3">
                        {step > 0 && <Button type="button" variant="ghost" disabled={creating || Boolean(receipt)}
                            onClick={() => { setError(''); setStep((value) => value - 1); }}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Back</Button>}
                        <Button type="submit" variant="ink" size="lg" disabled={creating}>
                            {creating ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Opening workspace…</> :
                                step === 2 ? <>{receipt ? 'Open saved workspace' : 'Create workspace'}<ArrowRight className="h-4 w-4" aria-hidden="true" /></> :
                                    <>Continue<ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
                        </Button>
                        {receipt && <Button type="button" variant="ghost" disabled={creating} onClick={() => navigate('/app', { replace: true })}>Workspace recovery</Button>}
                    </div>
                </form>
            </PaperCard>
        </main>
    </div>;
}

export default function OnboardingPage() {
    const { user } = useAuth();
    return <OnboardingDesk key={user?.id || 'anonymous'} />;
}
