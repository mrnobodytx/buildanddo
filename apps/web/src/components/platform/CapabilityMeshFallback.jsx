// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/platform/CapabilityMeshFallback.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-PLATFORM-001
// CAPS:        pending
// CK:          pending
// Dispatch:    USO-BUILDANDDO-PLATFORM-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-13
// Depends:     apps/web/src/components/platform/platformData.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/components/platform/platformData.js;
//              EXTENDS apps/web/src/components/platform/MetaFunctionOrb.jsx
// Intent:      Preserve the capability-mesh explanation without motion or WebGL.
// ───────────────────────────────────────────────────────────────

import React, { useId } from 'react';
import { PROVIDERS } from '@/components/platform/platformData';

const POSITIONS = [
    { x: 118, y: 78 },
    { x: 382, y: 78 },
    { x: 410, y: 240 },
    { x: 92, y: 240 },
    { x: 250, y: 292 },
];

export default function CapabilityMeshFallback({ className = '' }) {
    const titleId = useId();
    const captionId = useId();
    const descriptionId = useId();
    return (
        <figure
            className={`relative overflow-hidden border border-foreground/70 bg-card ${className}`}
            aria-labelledby={`${titleId} ${captionId}`}
        >
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
                <span className="font-evidence text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    Figure 01 · static mesh
                </span>
                <span className="font-evidence text-[10px] text-teal">Static view</span>
            </div>
            <svg
                viewBox="0 0 500 340"
                className="block aspect-[5/3.4] w-full"
                role="img"
                aria-labelledby={`${titleId} ${descriptionId}`}
            >
                <title id={titleId}>MetaFunction capability provider mesh</title>
                <desc id={descriptionId}>
                    Five providers connect through capability namespaces to one deterministic registry.
                </desc>
                <rect width="500" height="340" fill="hsl(var(--card))" />
                <g stroke="hsl(var(--border))" strokeWidth="1" strokeDasharray="3 5">
                    {POSITIONS.map((position, index) => (
                        <line
                            key={PROVIDERS[index].id}
                            x1="250"
                            y1="170"
                            x2={position.x}
                            y2={position.y}
                        />
                    ))}
                </g>
                <circle cx="250" cy="170" r="55" fill="hsl(var(--background))" stroke="hsl(var(--foreground))" />
                <circle cx="250" cy="170" r="42" fill="none" stroke="hsl(var(--foreground) / 0.35)" strokeDasharray="2 4" />
                <text x="250" y="166" textAnchor="middle" fontSize="11" fontWeight="700" fill="hsl(var(--foreground))" letterSpacing="1.8">
                    REGISTRY
                </text>
                <text x="250" y="183" textAnchor="middle" fontSize="9" fill="hsl(var(--muted-foreground))" letterSpacing="1">
                    DETERMINISTIC
                </text>
                {PROVIDERS.map((provider, index) => {
                    const position = POSITIONS[index];
                    return (
                        <g key={provider.id}>
                            <circle cx={position.x} cy={position.y} r="22" fill={provider.color} opacity="0.12" />
                            <circle cx={position.x} cy={position.y} r="10" fill={provider.color} />
                            <text
                                x={position.x}
                                y={position.y + 34}
                                textAnchor="middle"
                                fontSize="10"
                                fontWeight="600"
                                fill="hsl(var(--foreground))"
                            >
                                {provider.name.toUpperCase()}
                            </text>
                            <text
                                x={position.x}
                                y={position.y + 47}
                                textAnchor="middle"
                                fontSize="8"
                                fill="hsl(var(--muted-foreground))"
                                letterSpacing="1"
                            >
                                {provider.namespace}
                            </text>
                        </g>
                    );
                })}
            </svg>
            <figcaption id={captionId} className="border-t border-border px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                Provider APIs remain behind named capability and authority boundaries.
            </figcaption>
        </figure>
    );
}
