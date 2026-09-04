import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import AuthLayout from '@/components/auth/AuthLayout';
import { Button } from '@/components/site/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import pb from '@/lib/pocketbaseClient';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [form, setForm] = useState({ email: '', password: '' });
    const [errors, setErrors] = useState({});
    const [status, setStatus] = useState('idle');
    const [serverError, setServerError] = useState('');

    const setField = (field, value) => {
        setForm((p) => ({ ...p, [field]: value }));
        setErrors((p) => ({ ...p, [field]: undefined }));
        setServerError('');
    };

    const validate = () => {
        const next = {};
        if (!form.email.trim()) next.email = 'Enter your email address.';
        else if (!EMAIL_RE.test(form.email.trim()))
            next.email = 'That email address doesn\u2019t look right.';
        if (!form.password) next.password = 'Enter your password.';
        setErrors(next);
        return Object.keys(next).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (status === 'submitting') return;
        setServerError('');
        if (!validate()) return;
        setStatus('submitting');
        try {
            await login(form.email.trim(), form.password);
            // Route based on whether the user already has a workspace.
            let hasWorkspace = false;
            try {
                const list = await pb
                    .collection('workspaces')
                    .getFullList({ sort: '-created' });
                hasWorkspace = list.length > 0;
            } catch (_) {
                /* ignore — default to app */
            }
            navigate(hasWorkspace ? '/app' : '/onboarding');
        } catch (err) {
            const msg =
                err?.response?.message ||
                'We couldn\u2019t sign you in. Check your email and password and try again.';
            setServerError(msg);
            setStatus('error');
        }
    };

    return (
        <AuthLayout
            title="Sign in to BuildAndDo"
            subtitle="Welcome back. Pick up where you left off in your workspace."
            footer={
                <>
                    New to BuildAndDo?{' '}
                    <Link
                        to="/signup"
                        className="font-semibold text-primary hover:brightness-125"
                    >
                        Create an account
                    </Link>
                </>
            }
        >
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
                <div className="grid gap-2">
                    <Label htmlFor="login-email">Email address</Label>
                    <Input
                        id="login-email"
                        type="email"
                        value={form.email}
                        onChange={(e) => setField('email', e.target.value)}
                        placeholder="you@business.com"
                        autoComplete="email"
                        autoFocus
                        aria-invalid={Boolean(errors.email)}
                    />
                    {errors.email && (
                        <p className="text-sm text-destructive" role="alert">
                            {errors.email}
                        </p>
                    )}
                </div>

                <div className="grid gap-2">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="login-password">Password</Label>
                        <Link
                            to="/forgot-password"
                            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                        >
                            Forgot password?
                        </Link>
                    </div>
                    <Input
                        id="login-password"
                        type="password"
                        value={form.password}
                        onChange={(e) => setField('password', e.target.value)}
                        placeholder="Your password"
                        autoComplete="current-password"
                        aria-invalid={Boolean(errors.password)}
                    />
                    {errors.password && (
                        <p className="text-sm text-destructive" role="alert">
                            {errors.password}
                        </p>
                    )}
                </div>

                {serverError && (
                    <p
                        className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
                        role="alert"
                    >
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        {serverError}
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
                            Signing in…
                        </>
                    ) : (
                        <>
                            Sign in
                            <ArrowRight className="h-4 w-4" />
                        </>
                    )}
                </Button>
            </form>
        </AuthLayout>
    );
}
