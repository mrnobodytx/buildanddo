import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2, AlertCircle, ShieldCheck } from 'lucide-react';
import AuthLayout from '@/components/auth/AuthLayout';
import { Button } from '@/components/site/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function passwordStrength(pw) {
    let score = 0;
    if (pw.length >= 10) score += 1;
    if (/[a-z]/.test(pw)) score += 1;
    if (/[A-Z]/.test(pw)) score += 1;
    if (/[0-9]/.test(pw)) score += 1;
    if (/[^A-Za-z0-9]/.test(pw)) score += 1;
    return score; // 0..5
}

const STRENGTH_LABEL = ['Too short', 'Weak', 'Fair', 'Good', 'Strong', 'Strong'];
const STRENGTH_TONE = [
    'bg-muted-foreground/40',
    'bg-destructive/70',
    'bg-amber-warm',
    'bg-primary',
    'bg-teal',
    'bg-teal',
];

export default function SignupPage() {
    const { signup } = useAuth();
    const navigate = useNavigate();
    const [form, setForm] = useState({ name: '', email: '', password: '' });
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
        if (!form.name.trim()) next.name = 'Tell us what to call you.';
        if (!form.email.trim()) next.email = 'Enter your email address.';
        else if (!EMAIL_RE.test(form.email.trim()))
            next.email = 'That email address doesn\u2019t look right.';
        const pw = form.password;
        if (!pw) next.password = 'Choose a password.';
        else if (pw.length < 10)
            next.password = 'Use at least 10 characters.';
        else if (passwordStrength(pw) < 3)
            next.password =
                'Add upper- and lower-case letters, a number, and a symbol.';
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
            await signup(form.email.trim(), form.password, {
                name: form.name.trim(),
            });
            // New accounts always go through onboarding first.
            navigate('/onboarding');
        } catch (err) {
            const data = err?.response?.data;
            if (data?.email) {
                setServerError(
                    'That email is already registered. Try signing in instead.',
                );
            } else {
                setServerError(
                    err?.response?.message ||
                        'We couldn\u2019t create your account. Please try again.',
                );
            }
            setStatus('error');
        }
    };

    const strength = passwordStrength(form.password);

    return (
        <AuthLayout
            title="Create your BuildAndDo account"
            subtitle="One account, one workspace to start. You’ll set up your business next."
            footer={
                <>
                    Already have an account?{' '}
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
                    <Label htmlFor="su-name">Your name</Label>
                    <Input
                        id="su-name"
                        value={form.name}
                        onChange={(e) => setField('name', e.target.value)}
                        placeholder="Maya Chen"
                        autoComplete="name"
                        autoFocus
                        aria-invalid={Boolean(errors.name)}
                    />
                    {errors.name && (
                        <p className="text-sm text-destructive" role="alert">
                            {errors.name}
                        </p>
                    )}
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="su-email">Email address</Label>
                    <Input
                        id="su-email"
                        type="email"
                        value={form.email}
                        onChange={(e) => setField('email', e.target.value)}
                        placeholder="you@business.com"
                        autoComplete="email"
                        aria-invalid={Boolean(errors.email)}
                    />
                    {errors.email && (
                        <p className="text-sm text-destructive" role="alert">
                            {errors.email}
                        </p>
                    )}
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="su-password">Password</Label>
                    <Input
                        id="su-password"
                        type="password"
                        value={form.password}
                        onChange={(e) => setField('password', e.target.value)}
                        placeholder="At least 10 characters"
                        autoComplete="new-password"
                        aria-invalid={Boolean(errors.password)}
                    />
                    {form.password && (
                        <div className="flex items-center gap-2">
                            <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                                <div
                                    className={`h-full transition-all ${STRENGTH_TONE[strength]}`}
                                    style={{ width: `${(strength / 5) * 100}%` }}
                                />
                            </div>
                            <span className="text-xs text-muted-foreground">
                                {STRENGTH_LABEL[strength]}
                            </span>
                        </div>
                    )}
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
                            Creating account…
                        </>
                    ) : (
                        <>
                            Create account
                            <ArrowRight className="h-4 w-4" />
                        </>
                    )}
                </Button>

                <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    BuildAndDo uses its own sign-in. No external provider is
                    connected, and we never ask for credentials to other
                    services here.
                </p>
            </form>
        </AuthLayout>
    );
}
