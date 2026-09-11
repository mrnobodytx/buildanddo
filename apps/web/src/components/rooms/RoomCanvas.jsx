import React, { useMemo } from 'react';
import { layoutProjection } from '@/lib/roomGraph';

const EDGE_CLASS = {
    verified: 'stroke-emerald-500', observed: 'stroke-sky-500', declared: 'stroke-muted-foreground/55',
    inferred: 'stroke-amber-500 stroke-dasharray-[6_5]', stale: 'stroke-muted-foreground stroke-dasharray-[3_5]', broken: 'stroke-destructive',
};

function nodeTone(state) {
    if (state === 'VERIFIED') return 'border-emerald-500/50 bg-emerald-500/5';
    if (state === 'UNMEASURED') return 'border-dashed border-muted-foreground/45 bg-secondary/20';
    if (state === 'BROKEN') return 'border-destructive/60 bg-destructive/5';
    return 'border-border bg-card';
}

export default function RoomCanvas({ projection, selectedId, onSelect }) {
    const positions = useMemo(() => layoutProjection(projection), [projection]);
    const width = 1450; const height = 760;
    const nodes = projection?.nodes || []; const edges = projection?.edges || [];
    return (
        <div className="overflow-auto rounded-lg border border-border bg-secondary/10">
            <svg viewBox={`0 0 ${width} ${height}`} className="min-h-[560px] min-w-[980px] w-full" role="img" aria-label={`${projection?.projection || 'room'} graph`}>
                <defs>
                    <marker id="room-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" className="fill-muted-foreground/60" /></marker>
                </defs>
                {edges.map((e) => {
                    const a = positions.get(e.source); const b = positions.get(e.target); if (!a || !b) return null;
                    return <line key={e.id || `${e.source}-${e.relation}-${e.target}`} x1={a.x + 85} y1={a.y + 34} x2={b.x + 85} y2={b.y + 34} markerEnd="url(#room-arrow)" className={`stroke-[1.5] ${EDGE_CLASS[e.state] || EDGE_CLASS.declared}`}><title>{e.relation} · {e.state || 'declared'}</title></line>;
                })}
                {nodes.map((n) => {
                    const p = positions.get(n.id) || { x: 0, y: 0 }; const selected = selectedId === n.id;
                    return (
                        <foreignObject key={n.id} x={p.x} y={p.y} width="180" height="90">
                            <button type="button" onClick={() => onSelect?.(n.id)} className={`h-[72px] w-[170px] rounded-md border px-3 py-2 text-left shadow-sm transition ${nodeTone(n.state)} ${selected ? 'ring-2 ring-primary' : 'hover:border-primary/50'}`}>
                                <span className="block truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{n.type}</span>
                                <span className="mt-0.5 block line-clamp-2 text-xs font-medium text-foreground">{n.title || n.id}</span>
                                <span className="mt-1 block truncate font-evidence text-[10px] text-muted-foreground">{n.state || 'UNMEASURED'}</span>
                            </button>
                        </foreignObject>
                    );
                })}
            </svg>
        </div>
    );
}
