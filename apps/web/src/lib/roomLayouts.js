export const ROOM_LAYOUT_VERSION = '1.1.0';

export function deterministicLayout(nodes = [], edges = [], kind = 'organization') {
    if (kind === 'development') return developmentLayout(nodes, edges);
    if (kind === 'capability') return radialCapabilityLayout(nodes, edges);
    if (kind === 'systems') return systemsLayout(nodes, edges);
    return hierarchyLayout(nodes, edges);
}

function indexEdges(edges) {
    const incoming = new Map();
    const outgoing = new Map();
    for (const edge of edges) {
        if (!incoming.has(edge.to)) incoming.set(edge.to, []);
        if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
        incoming.get(edge.to).push(edge);
        outgoing.get(edge.from).push(edge);
    }
    return { incoming, outgoing };
}

function hierarchyLayout(nodes, edges) {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const { incoming, outgoing } = indexEdges(edges);
    const roots = nodes.filter((n) => !(incoming.get(n.id) || []).some((e) => ['OWNS','REPORTS_TO','MEMBER_OF'].includes(e.type)));
    const seed = roots.length ? roots : nodes.slice(0, 1);
    const depth = new Map(seed.map((n) => [n.id, 0]));
    const q = seed.map((n) => n.id);
    while (q.length) {
        const id = q.shift();
        const d = depth.get(id) || 0;
        for (const edge of outgoing.get(id) || []) {
            if (!byId.has(edge.to) || depth.has(edge.to)) continue;
            depth.set(edge.to, d + 1);
            q.push(edge.to);
        }
    }
    nodes.forEach((n) => { if (!depth.has(n.id)) depth.set(n.id, 99); });
    const layers = new Map();
    for (const n of nodes) {
        const d = depth.get(n.id);
        if (!layers.has(d)) layers.set(d, []);
        layers.get(d).push(n);
    }
    const pos = {};
    [...layers.entries()].sort((a,b)=>a[0]-b[0]).forEach(([d, layer]) => {
        layer.sort((a,b)=>a.id.localeCompare(b.id));
        layer.forEach((n, i) => { pos[n.id] = { x: 80 + i * 230, y: 70 + d * 150 }; });
    });
    return pos;
}

function radialCapabilityLayout(nodes) {
    const center = nodes.find((n) => n.type === 'capability') || nodes[0];
    const others = nodes.filter((n) => !center || n.id !== center.id).sort((a,b)=>a.id.localeCompare(b.id));
    const pos = {};
    if (center) pos[center.id] = { x: 430, y: 260 };
    const radius = Math.max(190, 36 * others.length);
    others.forEach((n, i) => {
        const a = (Math.PI * 2 * i) / Math.max(1, others.length) - Math.PI / 2;
        pos[n.id] = { x: 430 + Math.cos(a) * radius, y: 260 + Math.sin(a) * radius };
    });
    return pos;
}

function developmentLayout(nodes, edges) {
    const stage = { requirement:0, srs:1, dispatch:2, branch:3, commit:4, pull_request:5, test_run:6, deployment:7, release:8, capability:9, evidence_epoch:10 };
    const buckets = new Map();
    nodes.forEach((n) => {
        const s = stage[n.type] ?? 99;
        if (!buckets.has(s)) buckets.set(s, []);
        buckets.get(s).push(n);
    });
    const pos = {};
    [...buckets.entries()].sort((a,b)=>a[0]-b[0]).forEach(([s, bucket]) => {
        bucket.sort((a,b)=>a.id.localeCompare(b.id));
        bucket.forEach((n, i) => { pos[n.id] = { x: 80 + s * 190, y: 80 + i * 110 }; });
    });
    return pos;
}

function systemsLayout(nodes) {
    const order = { plane:0, host:1, container:2, service:3, endpoint:4, nats_subject:5 };
    const buckets = new Map();
    nodes.forEach((n) => {
        const s = order[n.type] ?? 99;
        if (!buckets.has(s)) buckets.set(s, []);
        buckets.get(s).push(n);
    });
    const pos = {};
    [...buckets.entries()].sort((a,b)=>a[0]-b[0]).forEach(([s, bucket]) => {
        bucket.sort((a,b)=>a.id.localeCompare(b.id));
        bucket.forEach((n, i) => { pos[n.id] = { x: 60 + s * 210, y: 70 + i * 105 }; });
    });
    return pos;
}
