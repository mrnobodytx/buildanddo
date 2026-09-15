// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/ThemeControls.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-14
// Depends:     apps/web/src/App.jsx
// EnumType:    Widget
// EnumEdges:   DEPENDS_ON apps/web/src/App.jsx
// DAG Node:    none
// Intent:      Let visitors and operators choose a persistent accessible color theme.
// ───────────────────────────────────────────────────────────────

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useId } from 'react';

export function ThemeToggle() {
    const { resolvedTheme, setTheme } = useTheme();
    const dark = resolvedTheme === 'dark';
    const label = `Switch to ${dark ? 'light' : 'dark'} theme`;
    return (
        <button
            type="button"
            onClick={() => setTheme(dark ? 'light' : 'dark')}
            aria-label={label}
            title={label}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center border border-border bg-background text-foreground hover:bg-secondary"
        >
            {dark ? (
                <Sun key="sun" className="motion-theme-icon h-4 w-4" aria-hidden="true" />
            ) : (
                <Moon key="moon" className="motion-theme-icon h-4 w-4" aria-hidden="true" />
            )}
        </button>
    );
}

export function ThemeSelect() {
    const { theme, setTheme } = useTheme();
    const id = useId();
    return (
        <div className="space-y-2">
            <label htmlFor={id} className="block text-sm font-medium">
                Theme
            </label>
            <select
                id={id}
                value={theme || 'system'}
                onChange={(event) => setTheme(event.target.value)}
                className="h-11 w-full max-w-xs border border-input bg-background px-3 text-sm text-foreground"
            >
                <option value="system">Use device setting</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
            </select>
            <p className="text-sm text-muted-foreground">
                Your preference applies across the site and is saved on this device.
            </p>
        </div>
    );
}
