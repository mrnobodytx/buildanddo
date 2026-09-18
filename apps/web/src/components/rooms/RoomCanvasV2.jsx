import React, { useMemo, useState } from 'react';
import { deterministicLayout, ROOM_LAYOUT_VERSION } from '@/lib/roomLayouts';

const EDGE_STYLE = {
    VERIFIED: 'stroke-foreground',
    OBSERVED: 'stroke-primary',
    HYPOTHESIS: 'stroke-muted-foreground stroke-dasharray-[6_6]',
    INFERRED: 'stroke-muted-foreground stroke-dasharray-[3_5]',
    UNMEASURED: 'stroke-muted-foreground/40 stroke-dasharray-[2_6]',
};

function nodeLabel(n) { return n.title || n.label || n.id; }

export default function RoomCanvasV2({ projection, roomKind = 'organization', onSelect }) {
    const nodes = projection?.nodes || [];
    const edges = (projection?.edges || []).map((e) => ({ ...e, from: e.from || e.source, to: e.to || e.target, type: e.type || e.relation, status: e.status || String(e.state || '').toUpperCase() }));
    const positions = useMemo(() => deterministicLayout(nodes, edges, roomKind), [nodes, edges, roomKind]);
    const [selected, setSelected] = useState(null);
    const width = Math.max(1000, ...Object.values(positions).map((p) => p.x + 240), 1000);
    const height = Math.max(620, ...Object.values(positions).map((p) => p.y + 130), 620);
    const choose = (n) => { setSelected(n); onSelect?.(n); };
    return (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="overflow-auto rounded-lg border bg-card">
                <svg width={width} height={height} role="img" aria-label={`${roomKind} graph`}>
                    <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" className="fill-muted-foreground" /></marker></defs>
                    {edges.map((e) => {
                        const a = positions[e.from]; const b = positions[e.to];
                        if (!a || !b) return null;
                        return <g key={e.id || `${e.from}-${e.to}-${e.type}`}>
                            <line x1={a.x+160} y1={a.y+42} x2={b.x} y2={b.y+42} markerEnd="url(#arrow)" className={`stroke-2 ${EDGE_STYLE[e.status] || 'stroke-muted-foreground/50'}`} />
                            <text x={(a.x+b.x+160)/2} y={(a.y+b.y+84)/2-6} textAnchor="middle" className="fill-muted-foreground text-[10px]">{e.type}</text>
                        </g>;
                    })}
                    {nodes.map((n) => {
                        const p = positions[n.id] || {x:0,y:0};
                        const active = selected?.id === n.id;
                        return <g key={n.id} transform={`translate(${p.x},${p.y})`} onClick={() => choose(n)} className="cursor-pointer">
                            <rect width="160" height="84" rx="9" className={`${active ? 'fill-primary/15 stroke-primary' : 'fill-background stroke-border'} stroke-2`} />
                            <text x="12" y="23" className="fill-foreground text-[12px] font-semibold">{nodeLabel(n).slice(0,24)}</text>
                            <text x="12" y="43" className="fill-muted-foreground text-[10px]">{n.type}</text>
                            <text x="12" y="62" className="fill-muted-foreground text-[10px]">{n.state?.verification || n.verification || 'UNMEASURED'}</text>
                            <text x="12" y="76" className="fill-muted-foreground text-[9px]">A{String(n.authority?.required || n.authority || '0').replace(/^A/,'')}</text>
                        </g>;
                    })}
                </svg>
            </div>
            <aside className="rounded-lg border bg-card p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Inspector</p>
                {selected ? <div className="mt-3 space-y-3">
                    <h3 className="font-display text-lg font-semibold">{nodeLabel(selected)}</h3>
                    <dl className="space-y-2 text-sm">
                        <div><dt className="text-muted-foreground">Type</dt><dd>{selected.type}</dd></div>
                        <div><dt className="text-muted-foreground">Verification</dt><dd>{selected.state?.verification || 'UNMEASURED'}</dd></div>
                        <div><dt className="text-muted-foreground">Source</dt><dd className="break-all">{selected.provenance?.source_ref || selected.provenance?.source || 'not supplied'}</dd></div>
                    </dl>
                    <pre className="max-h-80 overflow-auto rounded bg-secondary/40 p-3 text-[11px]">{JSON.stringify(selected.attributes || {}, null, 2)}</pre>
                </div> : <p className="mt-3 text-sm text-muted-foreground">Select a node to inspect its measured state and provenance.</p>}
                <p className="mt-6 text-[10px] text-muted-foreground">Deterministic layout {ROOM_LAYOUT_VERSION}</p>
            </aside>
        </div>
    );
}
