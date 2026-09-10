// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/ListToolbar.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-WORKSPACE-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/components/ui/input.jsx,
//              apps/web/src/components/ui/select.jsx,
//              apps/web/src/hooks/use-mobile.jsx
// EnumType:    Widget
// EnumEdges:   VALIDATES apps/web/src/pages/workspace
// Intent:      One search-and-filter row shared by every workspace list, so the
//              controls sit in the same place and collapse the same way on a phone.
// ───────────────────────────────────────────────────────────────

import { Search, X } from 'lucide-react';
import React from 'react';

import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

/**
 * Search box plus a row of select filters.
 *
 * On a phone the filters become full-width stacked controls rather than
 * shrinking to unusable widths; `useIsMobile` decides, not a media query, so
 * the select trigger width can change too.
 *
 * @param {{
 *   query: string,
 *   onQueryChange: Function,
 *   placeholder?: string,
 *   filters?: Array<{key: string, value: string, label: string, options: Array<{value: string, label: string}>, onChange: Function}>,
 *   resultCount?: number,
 *   totalCount?: number,
 *   className?: string
 * }} props Toolbar state and handlers.
 * @returns {React.ReactElement} The toolbar.
 */
export default function ListToolbar({
    query,
    onQueryChange,
    placeholder = 'Search',
    filters = [],
    resultCount,
    totalCount,
    className,
}) {
    const isMobile = useIsMobile();
    const filtered =
        typeof resultCount === 'number' &&
        typeof totalCount === 'number' &&
        resultCount !== totalCount;

    return (
        <div className={cn('space-y-3', className)}>
            <div
                className={cn(
                    'flex gap-2',
                    isMobile ? 'flex-col' : 'flex-row flex-wrap items-center',
                )}
            >
                <div className={cn('relative', isMobile ? 'w-full' : 'min-w-[16rem] flex-1')}>
                    <Search
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                    />
                    <Input
                        type="search"
                        value={query}
                        onChange={(event) => onQueryChange(event.target.value)}
                        placeholder={placeholder}
                        aria-label={placeholder}
                        className="pl-9"
                    />
                    {query && (
                        <button
                            type="button"
                            onClick={() => onQueryChange('')}
                            aria-label="Clear search"
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>

                {filters.map((filter) => (
                    <Select
                        key={filter.key}
                        value={filter.value}
                        onValueChange={filter.onChange}
                    >
                        <SelectTrigger
                            className={cn('h-10', isMobile ? 'w-full' : 'w-[11rem]')}
                            aria-label={filter.label}
                        >
                            <SelectValue placeholder={filter.label} />
                        </SelectTrigger>
                        <SelectContent>
                            {filter.options.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ))}
            </div>

            {filtered && (
                <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
                    Showing {resultCount} of {totalCount}
                </p>
            )}
        </div>
    );
}
