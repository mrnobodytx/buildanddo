import React from 'react';

const LEVELS = ['EXISTS','CONFIGURED','CONNECTED','USED','VERIFIED','REPEATED'];

export default function UtilizationPanel({ items = [] }) {
    return <div className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex items-end justify-between gap-4"><div><h3 className="font-display text-lg font-semibold">Runtime utilization</h3><p className="text-sm text-muted-foreground">Presence is not usage. Usage is not verification.</p></div></div>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="py-2 pr-4">Capability</th>{LEVELS.map(x=><th key={x} className="px-2 py-2 text-center text-[10px]">{x}</th>)}<th className="pl-4">Evidence</th></tr></thead>
        <tbody>{items.map((item)=><tr key={item.id} className="border-b last:border-0"><td className="py-3 pr-4 font-medium">{item.title}</td>{LEVELS.map((level)=><td key={level} className="px-2 text-center">{item.levels?.includes(level) ? '●' : '—'}</td>)}<td className="pl-4 font-evidence text-xs">{item.evidence_ref || 'UNMEASURED'}</td></tr>)}</tbody></table></div>
    </div>;
}
