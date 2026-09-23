// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/ResetPasswordPage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-TRUST-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-TRUST-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/lib/pocketbaseClient.js, apps/web/src/lib/authErrors.js, apps/pocketbase/pb_migrations/1791500000_password_reset_app_url.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/pocketbaseClient.js; CONSUMES apps/web/src/lib/authErrors.js; DEPENDS_ON apps/pocketbase/pb_migrations/1791500000_password_reset_app_url.js
// DAG Node:    none
// Intent:      Let a member finish a password reset from the emailed link, with honest outcomes.
// ───────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { ArrowRight, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import AuthLayout from '@/components/auth/AuthLayout';
import { Button } from '@/components/site/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import pb from '@/lib/pocketbaseClient';
import { PASSWORD_MIN_LENGTH, authFailureKind } from '@/lib/authErrors';

const FAILURE_MESSAGE = {
    rejected:
        'This reset link is invalid or has expired. Request a new link and try again.',
    rate_limited:
        'Too many attempts. Wait a few minutes before trying again.',
    network:
        'We couldn’t reach BuildAndDo. Check your connection and try again.',
    server:
        'BuildAndDo couldn’t reset your password right now. Please try again shortly.',
};

export default function ResetPasswordPage() {
    // The token stays in memory only: never logged, stored or sent anywhere but PocketBase.
    const { token = '' } = useParams();
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [errors, setErrors] = useState({});
    const [status, setStatus] = useState('idle'); // idle | submitting | success | error
    const [failure, setFailure] = useState('');

    const validate = () => {
        const next = {};
        if (!password) next.password = 'Choose a new password.';
        else if (password.length < PASSWORD_MIN_LENGTH)
            next.password = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
        if (!next.password && confirm !== password)
            next.confirm = 'The two passwords don’t match.';
        setErrors(next);
        return Object.keys(next).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (status === 'submitting') return;
        setFailure('');
        if (!validate()) return;
        setStatus('submitting');
        try {
            await pb.collection('users').confirmPasswordReset(token, password, confirm);
            setPassword('');
            setConfirm('');
            setStatus('success');
        } catch (err) {
            const kind = authFailureKind(err);
            setFailure(FAILURE_MESSAGE[kind === 'not_found' ? 'rejected' : kind]);
            setStatus('error');
        }
    };

    const head = (
        <Helmet>
            {/* Keep the token in this URL out of Referer headers. */}
            <meta name="referrer" content="no-referrer" />
        </Helmet>
    );

    if (!token) {
        return (
            <AuthLayout
                title="Reset link incomplete"
                subtitle="This page needs the full link from your reset email."
                footer={
                    <Link to="/forgot-password" className="font-semibold text-primary hover:brightness-125">
                        Request a new reset link
                    </Link>
                }
            >
                {head}
            </AuthLayout>
        );
    }

    if (status === 'success') {
        return (
            <AuthLayout
                title="Password updated"
                subtitle="Your new password is set. Sign in with it to continue."
            >
                {head}
                <div className="rounded-[var(--radius)] border border-border bg-card p-6">
                    <p className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground" role="status">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal" />
                        This reset link has now been used and won’t work again.
                    </p>
                    <Link
                        to="/login"
                        className="mt-5 inline-flex items-center gap-2 font-semibold text-primary hover:brightness-125"
                    >
                        Sign in
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                </div>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout
            title="Choose a new password"
            subtitle="Set the password you’ll use to sign in to BuildAndDo."
            footer={
                <>
                    Link not working?{' '}
                    <Link to="/forgot-password" className="font-semibold text-primary hover:brightness-125">
                        Request a new one
                    </Link>
                </>
            }
        >
            {head}
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
                <div className="grid gap-2">
                    <Label htmlFor="rp-password">New password</Label>
                    <Input
                        id="rp-password"
                        type="password"
                        value={password}
                        onChange={(e) => {
                            setPassword(e.target.value);
                            setErrors((p) => ({ ...p, password: undefined }));
                        }}
                        autoComplete="new-password"
                        autoFocus
                        aria-invalid={Boolean(errors.password)}
                        aria-describedby="rp-password-hint"
                    />
                    <p id="rp-password-hint" className="text-xs text-muted-foreground">
                        At least {PASSWORD_MIN_LENGTH} characters.
                    </p>
                    {errors.password && (
                        <p className="text-sm text-destructive" role="alert">
                            {errors.password}
                        </p>
                    )}
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="rp-confirm">Confirm new password</Label>
                    <Input
                        id="rp-confirm"
                        type="password"
                        value={confirm}
                        onChange={(e) => {
                            setConfirm(e.target.value);
                            setErrors((p) => ({ ...p, confirm: undefined }));
                        }}
                        autoComplete="new-password"
                        aria-invalid={Boolean(errors.confirm)}
                    />
                    {errors.confirm && (
                        <p className="text-sm text-destructive" role="alert">
                            {errors.confirm}
                        </p>
                    )}
                </div>

                {status === 'error' && failure && (
                    <p
                        className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
                        role="alert"
                    >
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        {failure}
                    </p>
                )}

                <Button type="submit" size="lg" disabled={status === 'submitting'} className="w-full">
                    {status === 'submitting' ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Saving password…
                        </>
                    ) : (
                        <>
                            Save new password
                            <ArrowRight className="h-4 w-4" />
                        </>
                    )}
                </Button>
            </form>
        </AuthLayout>
    );
}
