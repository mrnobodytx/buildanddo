import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Loader2, AlertCircle, CheckCircle2, Mail } from 'lucide-react';
import AuthLayout from '@/components/auth/AuthLayout';
import { Button } from '@/components/site/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import pb from '@/lib/pocketbaseClient';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [status, setStatus] = useState('idle'); // idle | submitting | success | error

    const validate = () => {
        if (!email.trim()) {
            setError('Enter your account email address.');
            return false;
        }
        if (!EMAIL_RE.test(email.trim())) {
            setError('That email address doesn\u2019t look right.');
            return false;
        }
        setError('');
        return true;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (status === 'submitting') return;
        if (!validate()) return;
        setStatus('submitting');
        try {
            await pb.collection('users').requestPasswordReset(email.trim());
            setStatus('success');
        } catch (err) {
            // PocketBase returns 400 if the email isn't found. Treat it
            // neutrally so we don't leak which addresses exist.
            setStatus('success');
        }
    };

    if (status === 'success') {
        return (
            <AuthLayout
                title="Check your email"
                subtitle="If an account exists for that address, a reset link is on its way."
                footer={
                    <>
                        Remembered it?{' '}
                        <Link
                            to="/login"
                            className="font-semibold text-primary hover:brightness-125"
                        >
                            Back to sign in
                        </Link>
                    </>
                }
            >
                <div className="rounded-[var(--radius)] border border-border bg-card p-6">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--teal))]/15">
                        <Mail className="h-6 w-6 text-teal" />
                    </span>
                    <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                        We sent a password-reset link to{' '}
                        <span className="font-medium text-foreground">
                            {email.trim()}
                        </span>
                        . The link expires after a short window. If you
                        don’t see the message within a few minutes, check
                        your spam folder.
                    </p>
                    <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal" />
                        For your security, BuildAndDo never displays your
                        password and can’t recover it for you — only you
                        can reset it from the link in that email.
                    </p>
                </div>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout
            title="Reset your password"
            subtitle="Enter the email tied to your BuildAndDo account and we’ll send a secure reset link."
            footer={
                <>
                    Remembered your password?{' '}
                    <Link
                        to="/login"
                        className="font-semibold text-primary hover:brightness-125"
                    >
                        Sign in
                    </Link>
                </>
            }
        >
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
                <div className="grid gap-2">
                    <Label htmlFor="fp-email">Email address</Label>
                    <Input
                        id="fp-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@business.com"
                        autoComplete="email"
                        autoFocus
                        aria-invalid={Boolean(error)}
                    />
                    {error && (
                        <p className="text-sm text-destructive" role="alert">
                            {error}
                        </p>
                    )}
                </div>

                {status === 'error' && (
                    <p
                        className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
                        role="alert"
                    >
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        Something went wrong sending the reset link. Please try
                        again in a moment.
                    </p>
                )}

                <Button
                    type="submit"
                    size="lg"
                    disabled={status === 'submitting'}
                    className="w-full"
                >
                    {status === 'submitting' ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Sending link…
                        </>
                    ) : (
                        <>
                            Send reset link
                            <ArrowRight className="h-4 w-4" />
                        </>
                    )}
                </Button>
            </form>
        </AuthLayout>
    );
}
