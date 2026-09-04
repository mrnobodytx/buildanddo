import React from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Activity, ArrowLeft } from 'lucide-react';

/**
 * Shared two-column layout for the authentication screens.
 * Left: brand panel with the BuildAndDo loop. Right: the form card.
 */
export default function AuthLayout({ title, subtitle, children, footer }) {
    return (
        <div className="min-h-screen bg-background text-foreground">
            <Helmet>
                <title>{title} · BuildAndDo</title>
                <meta
                    name="description"
                    content="Sign in to your BuildAndDo workspace or create an account to start the Observe → Understand → Act → Verify loop."
                />
            </Helmet>
            <div className="grid min-h-screen lg:grid-cols-2">
                {/* Brand panel */}
                <div className="relative hidden flex-col justify-between overflow-hidden border-r border-border/60 bg-secondary/20 p-10 lg:flex">
                    <div className="absolute inset-0 bg-grid opacity-40" aria-hidden="true" />
                    <div className="relative">
                        <Link to="/" className="flex items-center gap-2.5">
                            <span className="flex h-9 w-9 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary">
                                <Activity className="h-4 w-4" strokeWidth={2.4} />
                            </span>
                            <span className="font-display text-lg font-semibold tracking-tight">
                                BuildAndDo
                            </span>
                        </Link>
                    </div>

                    <div className="relative max-w-sm">
                        <p className="font-display text-2xl font-semibold leading-snug tracking-tight">
                            Notice a change. Understand it. Approve a bounded
                            mission. Verify what happened.
                        </p>
                        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                            BuildAndDo separates observing, simulating, and
                            executing — the final say always stays with you.
                        </p>

                        <ol className="mt-8 space-y-3">
                            {['Observe', 'Understand', 'Act', 'Verify'].map(
                                (step, i) => (
                                    <li
                                        key={step}
                                        className="flex items-center gap-3 text-sm"
                                    >
                                        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-xs font-semibold text-primary">
                                            {i + 1}
                                        </span>
                                        <span className="text-muted-foreground">
                                            {step}
                                        </span>
                                    </li>
                                ),
                            )}
                        </ol>
                    </div>

                    <p className="relative text-xs text-muted-foreground/70">
                        Early access MVP · Illustrative data is always labeled.
                    </p>
                </div>

                {/* Form panel */}
                <div className="flex flex-col px-4 py-10 sm:px-6">
                    <div className="lg:hidden">
                        <Link
                            to="/"
                            className="flex items-center gap-2.5"
                        >
                            <span className="flex h-9 w-9 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary">
                                <Activity className="h-4 w-4" strokeWidth={2.4} />
                            </span>
                            <span className="font-display text-lg font-semibold tracking-tight">
                                BuildAndDo
                            </span>
                        </Link>
                    </div>

                    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
                        <Link
                            to="/"
                            className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Back to site
                        </Link>

                        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                            {title}
                        </h1>
                        {subtitle && (
                            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                {subtitle}
                            </p>
                        )}

                        <div className="mt-8">{children}</div>

                        {footer && (
                            <div className="mt-8 text-sm text-muted-foreground">
                                {footer}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
