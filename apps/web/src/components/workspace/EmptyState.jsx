import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Shared empty-state block for the workspace. Tells the user what's missing,
 * why it matters, and the next action to take.
 */
export default function EmptyState({
    icon: Icon,
    title,
    description,
    action,
    className,
}) {
    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center rounded-[var(--radius)] border border-dashed border-border bg-secondary/20 px-6 py-12 text-center',
                className,
            )}
        >
            {Icon && (
                <span className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
                    <Icon className="h-5 w-5" strokeWidth={2} />
                </span>
            )}
            <h3 className="mt-4 font-display text-lg font-semibold tracking-tight">
                {title}
            </h3>
            {description && (
                <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                    {description}
                </p>
            )}
            {action && <div className="mt-5">{action}</div>}
        </div>
    );
}
