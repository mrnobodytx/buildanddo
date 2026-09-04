import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import { Section, SectionLabel, PaperCard, Button } from '@/components/site/ui';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import pb from '@/lib/pocketbaseClient';

const BUSINESS_TYPES = [
    'Nail or beauty salon',
    'Appointment-based service',
    'Consulting or freelance',
    'Local service business',
    'Retail or online shop',
    'Just an idea for now',
    'Something else',
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INITIAL = { name: '', email: '', businessType: '', task: '' };

export default function EarlyAccess() {
    const [form, setForm] = useState(INITIAL);
    const [errors, setErrors] = useState({});
    const [status, setStatus] = useState('idle'); // idle | submitting | success | error

    const setField = (field, value) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        setErrors((prev) => ({ ...prev, [field]: undefined }));
    };

    const validate = () => {
        const next = {};
        if (!form.name.trim()) next.name = 'Please tell us your name.';
        if (!form.email.trim()) next.email = 'Please enter your email address.';
        else if (!EMAIL_RE.test(form.email.trim()))
            next.email = 'That email address doesn\u2019t look right.';
        if (!form.businessType) next.businessType = 'Please pick the closest business type.';
        if (!form.task.trim())
            next.task = 'Describe the repetitive task you\u2019d want help with.';
        else if (form.task.trim().length < 10)
            next.task = 'A short sentence helps us understand the task.';
        setErrors(next);
        return Object.keys(next).length === 0;
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (status === 'submitting') return;
        if (!validate()) return;

        setStatus('submitting');
        try {
            await pb.collection('early_access').create({
                name: form.name.trim(),
                email: form.email.trim(),
                business_type: form.businessType,
                task: form.task.trim(),
            });
            setStatus('success');
        } catch (err) {
            console.error('Early access submission failed', err);
            setStatus('error');
        }
    };

    const reset = () => {
        setForm(INITIAL);
        setErrors({});
        setStatus('idle');
    };

    return (
        <Section id="early-access" className="border-t border-border/60 bg-secondary/15">
            <div className="grid items-start gap-10 lg:grid-cols-12 lg:gap-12">
                <div className="lg:col-span-5">
                    <SectionLabel>Early access</SectionLabel>
                    <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                        Describe the task you want help with
                    </h2>
                    <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                        BuildAndDo is an early MVP. The people on this list aren&rsquo;t just
                        waiting — their real problems decide what gets built first.
                    </p>

                    <div className="mt-6 rounded-[var(--radius)] border border-border bg-card p-5">
                        <p className="font-display text-sm font-semibold">The ideal early user</p>
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                            An owner or operator with one repetitive business problem they want to
                            make clearer, faster, or easier to manage — like no-shows, follow-ups,
                            schedule gaps, or end-of-week summaries. One problem is enough.
                        </p>
                    </div>

                    <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        We&rsquo;ll only use your details to contact you about BuildAndDo early
                        access. No spam, no resale of your information.
                    </p>
                </div>

                <div className="lg:col-span-7">
                    <PaperCard className="p-6 shadow-[0_30px_70px_-30px_rgba(0,0,0,0.6)] sm:p-7">
                        {status === 'success' ? (
                            <div
                                className="flex flex-col items-center py-10 text-center"
                                role="status"
                            >
                                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(var(--teal))]/15">
                                    <CheckCircle2 className="h-7 w-7 text-teal" />
                                </span>
                                <h3 className="mt-5 font-display text-2xl font-semibold text-paper-fg">
                                    You&rsquo;re on the list
                                </h3>
                                <p className="mt-2 max-w-sm text-sm leading-relaxed text-paper-muted">
                                    Thanks, {form.name.split(' ')[0] || 'there'} — we saved your
                                    task and we&rsquo;ll reach out as early access opens. Your input
                                    directly shapes what BuildAndDo learns to do next.
                                </p>
                                <button
                                    type="button"
                                    onClick={reset}
                                    className="mt-6 inline-flex h-10 items-center rounded-md border border-paper px-5 text-sm font-semibold text-paper-fg transition-colors hover:bg-[hsl(var(--paper-subtle))]"
                                >
                                    Submit another task
                                </button>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} noValidate>
                                <h3 className="font-display text-xl font-semibold text-paper-fg">
                                    Describe what you need
                                </h3>
                                <p className="mt-1.5 text-sm text-paper-muted">
                                    Four fields, two minutes. That&rsquo;s the whole form.
                                </p>

                                <div className="mt-6 space-y-5">
                                    <div className="grid gap-2">
                                        <Label htmlFor="ea-name" className="text-paper-fg">
                                            Your name
                                        </Label>
                                        <Input
                                            id="ea-name"
                                            value={form.name}
                                            onChange={(e) => setField('name', e.target.value)}
                                            placeholder="Maya Chen"
                                            autoComplete="name"
                                            aria-invalid={Boolean(errors.name)}
                                            className="h-11 border-paper bg-paper-subtle text-paper-fg placeholder:text-paper-muted/70 focus-visible:border-[hsl(var(--paper-foreground)/0.4)]"
                                        />
                                        {errors.name && (
                                            <p className="text-sm text-destructive" role="alert">
                                                {errors.name}
                                            </p>
                                        )}
                                    </div>

                                    <div className="grid gap-2">
                                        <Label htmlFor="ea-email" className="text-paper-fg">
                                            Email address
                                        </Label>
                                        <Input
                                            id="ea-email"
                                            type="email"
                                            value={form.email}
                                            onChange={(e) => setField('email', e.target.value)}
                                            placeholder="maya@lunastudio.com"
                                            autoComplete="email"
                                            aria-invalid={Boolean(errors.email)}
                                            className="h-11 border-paper bg-paper-subtle text-paper-fg placeholder:text-paper-muted/70 focus-visible:border-[hsl(var(--paper-foreground)/0.4)]"
                                        />
                                        {errors.email && (
                                            <p className="text-sm text-destructive" role="alert">
                                                {errors.email}
                                            </p>
                                        )}
                                    </div>

                                    <div className="grid gap-2">
                                        <Label htmlFor="ea-business-type" className="text-paper-fg">
                                            Business type
                                        </Label>
                                        <Select
                                            value={form.businessType}
                                            onValueChange={(value) =>
                                                setField('businessType', value)
                                            }
                                        >
                                            <SelectTrigger
                                                id="ea-business-type"
                                                aria-invalid={Boolean(errors.businessType)}
                                                className="h-11 border-paper bg-paper-subtle text-paper-fg focus-visible:border-[hsl(var(--paper-foreground)/0.4)]"
                                            >
                                                <SelectValue placeholder="Pick the closest match" />
                                            </SelectTrigger>
                                            <SelectContent className="border-paper bg-paper text-paper-fg">
                                                {BUSINESS_TYPES.map((type) => (
                                                    <SelectItem key={type} value={type}>
                                                        {type}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {errors.businessType && (
                                            <p className="text-sm text-destructive" role="alert">
                                                {errors.businessType}
                                            </p>
                                        )}
                                    </div>

                                    <div className="grid gap-2">
                                        <Label htmlFor="ea-task" className="text-paper-fg">
                                            What repetitive task would you like BuildAndDo to handle
                                            or clarify?
                                        </Label>
                                        <Textarea
                                            id="ea-task"
                                            value={form.task}
                                            onChange={(e) => setField('task', e.target.value)}
                                            placeholder="e.g. Every Friday I manually text reminders to next week's clients, and I still get no-shows."
                                            rows={4}
                                            aria-invalid={Boolean(errors.task)}
                                            className="border-paper bg-paper-subtle text-paper-fg placeholder:text-paper-muted/70 focus-visible:border-[hsl(var(--paper-foreground)/0.4)]"
                                        />
                                        {errors.task && (
                                            <p className="text-sm text-destructive" role="alert">
                                                {errors.task}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {status === 'error' && (
                                    <p
                                        className="mt-5 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
                                        role="alert"
                                    >
                                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                        Something went wrong while saving your submission. Please try
                                        again in a moment.
                                    </p>
                                )}

                                <Button
                                    type="submit"
                                    variant="ink"
                                    size="lg"
                                    disabled={status === 'submitting'}
                                    className="mt-6 w-full"
                                >
                                    {status === 'submitting' ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Saving…
                                        </>
                                    ) : (
                                        <>
                                            Describe what you need
                                            <ArrowRight className="h-4 w-4" />
                                        </>
                                    )}
                                </Button>

                                <p className="mt-3 text-center text-xs leading-relaxed text-paper-muted">
                                    Saved to your early-access list. We contact you about the
                                    product — nothing else.
                                </p>
                            </form>
                        )}
                    </PaperCard>
                </div>
            </div>
        </Section>
    );
}
