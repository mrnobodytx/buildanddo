import React from 'react';
import { cn } from '@/lib/utils';

// Status / type metadata shared across workspace pages. Keeps labels and
// tones consistent and avoids inventing data — these are presentation maps
// over the real select values stored in PocketBase.

export const MISSION_STATUS = {
    proposed: { label: 'Proposed', tone: 'neutral' },
    approved: { label: 'Approved', tone: 'violet' },
    running: { label: 'Running', tone: 'violet' },
    needs_attention: { label: 'Needs attention', tone: 'amber' },
    verified: { label: 'Verified', tone: 'teal' },
    failed: { label: 'Failed', tone: 'amber' },
};

export const SERVICE_STATUS = {
    planned: { label: 'Planned', tone: 'neutral' },
    not_connected: { label: 'Not connected', tone: 'neutral' },
    connected: { label: 'Connected', tone: 'teal' },
    degraded: { label: 'Degraded', tone: 'amber' },
    needs_attention: { label: 'Needs attention', tone: 'amber' },
};

export const SIGNAL_TYPE = {
    fact: { label: 'Fact', tone: 'teal' },
    inference: { label: 'Inference', tone: 'amber' },
    user: { label: 'User-provided', tone: 'violet' },
};

export const EVIDENCE_TYPE = {
    observed: { label: 'Observed', tone: 'neutral' },
    decided: { label: 'Decided', tone: 'violet' },
    attempted: { label: 'Attempted', tone: 'amber' },
    verified: { label: 'Verified', tone: 'teal' },
};

export const WORKFLOW_STATUS = {
    draft: { label: 'Draft', tone: 'neutral' },
    active: { label: 'Active', tone: 'teal' },
    paused: { label: 'Paused', tone: 'amber' },
};

// Added with SRS-BUILDANDDO-WORKSPACE-001. Ordering matters for the two maps
// below: the page sorts by the key's index, so the object order is the
// priority order and reordering it changes behaviour.
export const MISSION_PRIORITY = {
    urgent: { label: 'Urgent', tone: 'amber' },
    high: { label: 'High', tone: 'amber' },
    normal: { label: 'Normal', tone: 'neutral' },
    low: { label: 'Low', tone: 'neutral' },
};

export const SIGNAL_SEVERITY = {
    critical: { label: 'Critical', tone: 'amber' },
    high: { label: 'High', tone: 'amber' },
    medium: { label: 'Medium', tone: 'violet' },
    low: { label: 'Low', tone: 'neutral' },
    info: { label: 'Info', tone: 'neutral' },
};

export const SIGNAL_STATE = {
    new: { label: 'New', tone: 'violet' },
    acknowledged: { label: 'Acknowledged', tone: 'teal' },
    dismissed: { label: 'Dismissed', tone: 'neutral' },
};

export const OPERATION_STATUS = {
    idle: { label: 'Idle', tone: 'neutral' },
    running: { label: 'Running', tone: 'violet' },
    healthy: { label: 'Healthy', tone: 'teal' },
    degraded: { label: 'Degraded', tone: 'amber' },
    blocked: { label: 'Blocked', tone: 'amber' },
};

export const RUN_RESULT = {
    succeeded: { label: 'Succeeded', tone: 'teal' },
    partial: { label: 'Partial', tone: 'amber' },
    failed: { label: 'Failed', tone: 'amber' },
    skipped: { label: 'Skipped', tone: 'neutral' },
};

export const EDITION_STATUS = {
    draft: { label: 'Draft', tone: 'neutral' },
    published: { label: 'Published', tone: 'teal' },
};

export const DOMAIN_STATUS = {
    selected: { label: 'Selected', tone: 'neutral' },
    analyzing: { label: 'Analyzing', tone: 'violet' },
    verified: { label: 'Verified', tone: 'teal' },
    needs_attention: { label: 'Needs attention', tone: 'amber' },
};

export const SEAT_EVENT = {
    joined: { label: 'Joined', tone: 'neutral' },
    progress: { label: 'Progress', tone: 'violet' },
    completed: { label: 'Completed', tone: 'teal' },
    blocked: { label: 'Blocked', tone: 'amber' },
    handoff: { label: 'Handoff', tone: 'amber' },
};

// Derived, not stored: workHistory.js collapses a seat event list into one of
// these. `blocked` sits above `in_progress` because a blocked subject is the
// one a new seat most needs to see before starting.
export const WORK_STATE = {
    not_started: { label: 'Not started', tone: 'neutral' },
    in_progress: { label: 'In progress', tone: 'violet' },
    blocked: { label: 'Blocked', tone: 'amber' },
    handed_off: { label: 'Handed off', tone: 'amber' },
    completed: { label: 'Completed', tone: 'teal' },
};

export function statusMeta(map, key) {
    return map[key] || { label: key || '—', tone: 'neutral' };
}

export function StatusBadge({ map, value, className }) {
    const meta = statusMeta(map, value);
    const tones = {
        neutral: 'border-border bg-secondary/60 text-muted-foreground',
        violet: 'border-primary/30 bg-primary/10 text-primary',
        amber: 'border-[hsl(var(--amber))]/30 bg-[hsl(var(--amber))]/10 text-amber-warm',
        teal: 'border-[hsl(var(--teal))]/30 bg-[hsl(var(--teal))]/10 text-teal',
    };
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider',
                tones[meta.tone],
                className,
            )}
        >
            <span
                className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    meta.tone === 'violet' && 'bg-primary',
                    meta.tone === 'amber' && 'bg-[hsl(var(--amber))]',
                    meta.tone === 'teal' && 'bg-[hsl(var(--teal))]',
                    meta.tone === 'neutral' && 'bg-muted-foreground',
                )}
            />
            {meta.label}
        </span>
    );
}

export function PageHeader({ title, description, actions, children }) {
    return (
        <div className="border-b border-border/60 pb-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                        {title}
                    </h1>
                    {description && (
                        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                            {description}
                        </p>
                    )}
                </div>
                {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
            </div>
            {children}
        </div>
    );
}

/**
 * A labelled progress bar. Renders nothing when there is no value to show,
 * because a zeroed bar reads as "no progress" when the truth is "not tracked".
 */
export function ProgressMeter({ value, label = 'Progress', className }) {
    if (value == null || Number.isNaN(Number(value))) return null;
    const pct = Math.max(0, Math.min(100, Math.round(Number(value))));
    return (
        <div className={cn('w-full', className)}>
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span>{label}</span>
                <span>{pct}%</span>
            </div>
            <div
                className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={label}
            >
                <div
                    className="h-full rounded-full bg-primary transition-[width] duration-300"
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
}

export function StatCard({ icon: Icon, label, value, hint, tone = 'neutral' }) {
    const toneCls = {
        neutral: 'text-muted-foreground',
        violet: 'text-primary',
        amber: 'text-amber-warm',
        teal: 'text-teal',
    }[tone];
    return (
        <div className="rounded-[var(--radius)] border border-border bg-card p-5">
            <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {label}
                </span>
                {Icon && (
                    <Icon
                        className={cn('h-4 w-4', toneCls)}
                        strokeWidth={2.1}
                    />
                )}
            </div>
            <p className="mt-3 font-display text-2xl font-semibold tracking-tight">
                {value}
            </p>
            {hint && (
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {hint}
                </p>
            )}
        </div>
    );
}
