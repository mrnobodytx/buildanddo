import React from 'react';
import { cn } from '@/lib/utils';

/**
 * BuildAndDo editorial design system — broadsheet primitives.
 * Warm paper, black ink, restrained editorial red, muted green, ochre.
 * Serif headlines, sans utility, monospace evidence. Thin + double rules.
 */

const TONES = {
    neutral: 'border-border bg-secondary/60 text-muted-foreground',
    violet: 'border-primary/30 bg-primary/5 text-primary',
    red: 'border-primary/40 bg-primary/10 text-primary',
    amber: 'border-[hsl(var(--amber))]/40 bg-[hsl(var(--amber))]/10 text-amber-warm',
    ochre: 'border-[hsl(var(--amber))]/40 bg-[hsl(var(--amber))]/10 text-amber-warm',
    teal: 'border-[hsl(var(--teal))]/40 bg-[hsl(var(--teal))]/10 text-teal',
    green: 'border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/10 text-success',
    paper: 'border-[hsl(var(--paper-border))] bg-[hsl(var(--paper-subtle))] text-[hsl(var(--paper-muted))]',
    ink: 'border-foreground/80 bg-foreground text-background',
};

const DOT_TONES = {
    violet: 'bg-primary',
    red: 'bg-primary',
    amber: 'bg-[hsl(var(--amber))]',
    ochre: 'bg-[hsl(var(--amber))]',
    teal: 'bg-[hsl(var(--teal))]',
    green: 'bg-[hsl(var(--success))]',
    neutral: 'bg-muted-foreground',
    paper: 'bg-[hsl(var(--paper-muted))]',
};

/* Button ------------------------------------------------------------------ */
export function Button({
    variant = 'primary',
    size = 'md',
    href,
    className,
    children,
    ...props
}) {
    const base =
        'inline-flex items-center justify-center gap-2 font-semibold transition-all active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))] disabled:cursor-not-allowed disabled:opacity-60';
    const sizes = {
        sm: 'h-9 px-4 text-sm',
        md: 'h-11 px-5 text-sm',
        lg: 'h-12 px-6 text-sm',
    };
    const variants = {
        primary: 'bg-primary text-primary-foreground hover:brightness-110',
        secondary:
            'border border-foreground/70 bg-transparent text-foreground hover:bg-secondary/70',
        ghost: 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
        ink: 'bg-foreground text-background hover:brightness-110',
        outlinePaper:
            'border border-[hsl(var(--paper-border))] bg-transparent text-[hsl(var(--paper-foreground))] hover:bg-[hsl(var(--paper-subtle))]',
    };
    const cls = cn(base, sizes[size], variants[variant], className);
    if (href) {
        return (
            <a href={href} className={cls} {...props}>
                {children}
            </a>
        );
    }
    return (
        <button className={cls} {...props}>
            {children}
        </button>
    );
}

/* Badge / pill ------------------------------------------------------------ */
export function Badge({ tone = 'neutral', className, children }) {
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em]',
                TONES[tone] || TONES.neutral,
                className,
            )}
        >
            {children}
        </span>
    );
}

/* Status dot (with optional pulse) ---------------------------------------- */
export function StatusDot({ tone = 'neutral', pulse = false, className }) {
    return (
        <span className={cn('relative inline-flex h-2 w-2', className)}>
            {pulse && (
                <span
                    aria-hidden="true"
                    className={cn(
                        'absolute inline-flex h-full w-full animate-ping rounded-full opacity-60',
                        DOT_TONES[tone] || DOT_TONES.neutral,
                    )}
                />
            )}
            <span
                className={cn(
                    'relative inline-flex h-2 w-2 rounded-full',
                    DOT_TONES[tone] || DOT_TONES.neutral,
                )}
            />
        </span>
    );
}

/* Eyebrow / section label (kicker) ---------------------------------------- */
export function SectionLabel({ icon: Icon, children, className }) {
    return (
        <p
            className={cn(
                'flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary',
                className,
            )}
        >
            {Icon && <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />}
            {children}
        </p>
    );
}

/* Card (paper panel with thin rule) --------------------------------------- */
export function Card({ className, children, ...props }) {
    return (
        <div
            className={cn('border border-border bg-card', className)}
            {...props}
        >
            {children}
        </div>
    );
}

/* Warm paper surface (kept for compatibility) ----------------------------- */
export function PaperCard({ className, children, ...props }) {
    return (
        <div
            className={cn(
                'border border-[hsl(var(--paper-border))] bg-paper text-paper-fg',
                className,
            )}
            {...props}
        >
            {children}
        </div>
    );
}

/* Editorial rules --------------------------------------------------------- */
export function Rule({ className, double = false, thick = false }) {
    return (
        <hr
            aria-hidden="true"
            className={cn(
                double ? 'rule-double' : thick ? 'rule-thick' : 'rule-thin',
                'border-0',
                className,
            )}
        />
    );
}

/* State pill — the provenance/state vocabulary ----------------------------- */
const STATE_TONE = {
    observed: 'neutral',
    'user-provided': 'violet',
    inferred: 'amber',
    proposed: 'neutral',
    approved: 'violet',
    executed: 'amber',
    verified: 'green',
    failed: 'red',
    unavailable: 'neutral',
    pending: 'amber',
    'not-connected': 'neutral',
    connected: 'green',
    syncing: 'violet',
    healthy: 'green',
    degraded: 'amber',
    error: 'red',
    blocked: 'red',
    idle: 'neutral',
    active: 'violet',
};

export function StatePill({ state, className }) {
    const tone = STATE_TONE[state] || 'neutral';
    const label = (state || '—').replace(/_/g, ' ');
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]',
                TONES[tone] || TONES.neutral,
                className,
            )}
        >
            <span
                className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    DOT_TONES[tone] || DOT_TONES.neutral,
                )}
            />
            {label}
        </span>
    );
}

/* Provenance tag — source + timestamp + freshness ------------------------- */
export function ProvenanceTag({ source, timestamp, freshness, className }) {
    const hasData = source || timestamp;
    if (!hasData) {
        return (
            <span
                className={cn(
                    'font-evidence inline-flex items-center gap-1.5 border border-dashed border-border px-2 py-1 text-[11px] text-muted-foreground',
                    className,
                )}
            >
                No source · not connected
            </span>
        );
    }
    return (
        <span
            className={cn(
                'font-evidence inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 border border-border bg-secondary/40 px-2 py-1 text-[11px] text-muted-foreground',
                className,
            )}
        >
            {source && <span>src: {source}</span>}
            {timestamp && <span>· {timestamp}</span>}
            {freshness && <span>· {freshness}</span>}
        </span>
    );
}

/* Labeled state row ------------------------------------------------------- */
export function StateRow({
    icon: Icon,
    label,
    tone = 'neutral',
    badge,
    children,
    className,
}) {
    const labelTone = {
        violet: 'text-primary',
        red: 'text-primary',
        amber: 'text-amber-warm',
        teal: 'text-teal',
        green: 'text-success',
        neutral: 'text-muted-foreground',
        paper: 'text-[hsl(var(--paper-muted))]',
    }[tone];
    return (
        <div className={cn('flex gap-3', className)}>
            <span
                className={cn(
                    'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center border',
                    tone === 'paper'
                        ? 'border-[hsl(var(--paper-border))] bg-[hsl(var(--paper-subtle))] text-[hsl(var(--paper-foreground))]'
                        : 'border-border bg-secondary text-foreground',
                )}
            >
                <Icon className="h-4 w-4" strokeWidth={2.1} />
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span
                        className={cn(
                            'text-[11px] font-semibold uppercase tracking-[0.14em]',
                            labelTone,
                        )}
                    >
                        {label}
                    </span>
                    {badge}
                </div>
                <div className="mt-1.5">{children}</div>
            </div>
        </div>
    );
}

/* Evidence chip (monospace receipt) --------------------------------------- */
export function EvidenceChip({ icon: Icon, children, tone = 'paper' }) {
    return (
        <span
            className={cn(
                'font-evidence inline-flex items-center gap-1.5 border px-2 py-1 text-[11px]',
                tone === 'paper'
                    ? 'border-[hsl(var(--paper-border))] bg-[hsl(var(--paper-subtle))] text-[hsl(var(--paper-muted))]'
                    : 'border-border bg-secondary/50 text-muted-foreground',
            )}
        >
            {Icon && <Icon className="h-3 w-3" strokeWidth={2.2} />}
            {children}
        </span>
    );
}

/* Section shell ----------------------------------------------------------- */
export function Section({
    id,
    className,
    containerClassName,
    children,
    ...props
}) {
    return (
        <section
            id={id}
            className={cn('scroll-mt-20 py-14 sm:py-20', className)}
            {...props}
        >
            <div
                className={cn(
                    'mx-auto max-w-6xl px-4 sm:px-6',
                    containerClassName,
                )}
            >
                {children}
            </div>
        </section>
    );
}
