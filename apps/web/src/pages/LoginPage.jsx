import React, { useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import AuthLayout from '@/components/auth/AuthLayout';
import { Button } from '@/components/site/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { workspaceDestination } from '@/lib/navigationIntent';
import { OCN_MESSAGES, ocnLogin, ocnRequested, readOcnHeader } from '@/lib/ocnLogin';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const returnTo = workspaceDestination(location.state?.returnTo);
    const [form, setForm] = useState({ email: '', password: '' });
    const [errors, setErrors] = useState({});
    const [status, setStatus] = useState('idle');
    const [serverError, setServerError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const emailRef = useRef(null);
    const passwordRef = useRef(null);
    // A seat affordance, not a person's: it renders only when the runtime injected
    // a CitadelKey envelope or the page was opened with ?ocn=1, and the envelope is
    // never persisted anywhere a later reader could find it.
    const ocnHeader = readOcnHeader();
    const ocnVisible = ocnRequested(location.search);
    const [ocnBusy, setOcnBusy] = useState(false);
    const [ocnError, setOcnError] = useState('');
    const handleOcnLogin = async () => {
        setOcnError('');
        setOcnBusy(true);
        try {
            await ocnLogin();
            navigate('/app', { replace: true });
        } catch (error) {
            setOcnError(error?.message || 'Seat sign-in failed. Nothing was signed in.');
        } finally {
            setOcnBusy(false);
        }
    };
    const busy = status === 'submitting';

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
        if (next.email) emailRef.current?.focus();
        else if (next.password) passwordRef.current?.focus();
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
            // WorkspaceGate distinguishes missing workspaces from failed reads.
            navigate(returnTo, { replace: true });
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
            title="Welcome back."
            pageTitle="Sign in"
            subtitle="Sign in to learn, build and pick up where you left off."
            footer={
                <>
                    New to BuildAndDo?{' '}
                    <Link
                        to="/signup"
                        state={{ returnTo }}
                        className="font-semibold text-primary hover:brightness-125"
                    >
                        Create an account
                    </Link>
                </>
            }
        >
            <form onSubmit={handleSubmit} noValidate aria-label="Sign in" aria-busy={busy} className="space-y-5">
                <div className="grid gap-2">
                    <Label htmlFor="login-email">Email address</Label>
                    <Input
                        id="login-email"
                        name="email"
                        ref={emailRef}
                        type="email"
                        value={form.email}
                        onChange={(e) => setField('email', e.target.value)}
                        placeholder="you@example.com"
                        autoComplete="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        disabled={busy}
                        aria-invalid={Boolean(errors.email)}
                        aria-describedby={errors.email ? 'login-email-hint login-email-error' : 'login-email-hint'}
                    />
                    <p id="login-email-hint" className="auth-email-hint">Use your account email, not your display name.</p>
                    {errors.email && (
                        <p id="login-email-error" className="text-sm text-destructive" role="alert">
                            {errors.email}
                        </p>
                    )}
                </div>

                <div className="grid gap-2">
                    <div className="auth-password-label">
                        <Label htmlFor="login-password">Password</Label>
                        <Link
                            to="/forgot-password"
                            className="auth-recovery-link"
                        >
                            Forgot password?
                        </Link>
                    </div>
                    <div className="auth-password-field">
                        <Input
                            id="login-password"
                            name="password"
                            ref={passwordRef}
                            type={showPassword ? 'text' : 'password'}
                            value={form.password}
                            onChange={(e) => setField('password', e.target.value)}
                            placeholder="Your password"
                            autoComplete="current-password"
                            disabled={busy}
                            aria-invalid={Boolean(errors.password)}
                            aria-describedby={errors.password ? 'login-password-error' : undefined}
                        />
                        <button
                            type="button"
                            className="auth-password-toggle"
                            onClick={() => setShowPassword((visible) => !visible)}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                            aria-controls="login-password"
                            aria-pressed={showPassword}
                            disabled={busy}
                        >
                            {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                        </button>
                    </div>
                    {errors.password && (
                        <p id="login-password-error" className="text-sm text-destructive" role="alert">
                            {errors.password}
                        </p>
                    )}
                </div>

                {serverError && (
                    <p
                        className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
                        role="alert"
                    >
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        {serverError}
                    </p>
                )}

                <Button
                    type="submit"
                    size="lg"
                    disabled={busy}
                    className="w-full"
                >
                    {busy ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            Signing in…
                        </>
                    ) : (
                        <>
                            Sign in
                            <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </>
                    )}
                </Button>
            </form>
            {ocnVisible ? (
                <section data-testid="ocn-login" aria-labelledby="ocn-login-title" className="mt-6 border-t border-border pt-5">
                    <h2 id="ocn-login-title" className="font-display text-sm font-semibold">Citadel seat sign-in</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                        For an agent seat whose runtime supplies a signed CitadelKey envelope. People sign in above.
                    </p>
                    <Button
                        type="button"
                        className="mt-3 w-full"
                        onClick={handleOcnLogin}
                        disabled={!ocnHeader || ocnBusy}
                    >
                        {ocnBusy ? 'Verifying the seat key…' : 'Sign in with CitadelKey'}
                    </Button>
                    {!ocnHeader ? (
                        <p role="status" className="mt-2 text-xs text-muted-foreground">{OCN_MESSAGES.no_header}</p>
                    ) : null}
                    {ocnError ? (
                        <p role="alert" className="mt-2 text-xs text-destructive">{ocnError}</p>
                    ) : null}
                </section>
            ) : null}
        </AuthLayout>
    );
}
