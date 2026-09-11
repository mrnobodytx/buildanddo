// Deterministic layout helpers for BuildAndDo Living Rooms.
const TYPE_LEVEL = {
    organization: 0, guild: 1, team: 2, seat: 3, agent: 3, capability: 4,
    requirement: 0, srs: 1, dispatch: 2, branch: 3, commit: 4, pull_request: 5,
    test_run: 6, candidate: 7, staging: 8, deployment: 9, release: 10, repository: 0,
};

export function indexProjection(projection) {
    const nodes = Array.isArray(projection?.nodes) ? projection.nodes : [];
    const edges = Array.isArray(projection?.edges) ? projection.edges : [];
    return { nodes, edges, byId: new Map(nodes.map((n) => [n.id, n])) };
}

function layered(nodes, direction = 'TB') {
    const groups = new Map();
    nodes.forEach((node) => {
        const level = TYPE_LEVEL[node.type] ?? 2;
        const bucket = groups.get(level) || [];
        bucket.push(node); groups.set(level, bucket);
    });
    const positions = new Map();
    [...groups.keys()].sort((a, b) => a - b).forEach((level) => {
        const bucket = groups.get(level).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
        bucket.forEach((node, i) => {
            const across = (i - (bucket.length - 1) / 2) * 230;
            const depth = level * 155;
            positions.set(node.id, direction === 'LR' ? { x: depth + 70, y: across + 300 } : { x: across + 640, y: depth + 70 });
        });
    });
    return positions;
}

function capabilityShell(nodes, edges) {
    const caps = nodes.filter((n) => n.type === 'capability').sort((a, b) => String(a.id).localeCompare(String(b.id)));
    if (!caps.length) return layered(nodes);
    const positions = new Map();
    caps.forEach((n, i) => positions.set(n.id, { x: 520 + (i % 3) * 220, y: 180 + Math.floor(i / 3) * 170 }));
    const rest = nodes.filter((n) => n.type !== 'capability').sort((a, b) => String(a.id).localeCompare(String(b.id)));
    rest.forEach((n, i) => positions.set(n.id, { x: 90 + (i % 2) * 240, y: 90 + Math.floor(i / 2) * 130 }));
    return positions;
}

export function layoutProjection(projection) {
    const { nodes, edges } = indexProjection(projection);
    if (projection?.projection === 'development') return layered(nodes, 'LR');
    if (projection?.projection === 'capability') return capabilityShell(nodes, edges);
    return layered(nodes, 'TB');
}

export function projectionStats(projection) {
    const { nodes, edges } = indexProjection(projection);
    return {
        nodes: nodes.length,
        edges: edges.length,
        verified: edges.filter((e) => e.state === 'verified').length,
        observed: edges.filter((e) => e.state === 'observed').length,
        declared: edges.filter((e) => e.state === 'declared').length,
        unmeasured: nodes.filter((n) => n.state === 'UNMEASURED').length,
    };
}
