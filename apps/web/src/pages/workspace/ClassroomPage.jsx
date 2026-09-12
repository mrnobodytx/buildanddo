// CGRF: SRS=SRS-BUILDANDDO-LIVE-UTILIZATION-001 | CAPS=B | Seat=VCC
// Dispatch: VCC-20260911-BND-LIVE-001
//
// Live classroom over Cloudflare Realtime. The page holds no credential: every SFU
// call is proxied by /api/classroom/*, which owns the app secret and decides who may
// publish. Joining is an explicit operator action — nothing connects on mount, and
// the default rendered state is UNCONNECTED rather than an optimistic "live".
import React from 'react';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import { Card } from '@/components/site/ui';
import { joinClassroom, classroomHealth } from '@/lib/classroomRealtime';

export default function ClassroomPage() {
    const [health, setHealth] = React.useState(null);
    const [state, setState] = React.useState('UNCONNECTED');
    const [detail, setDetail] = React.useState('');
    const [error, setError] = React.useState('');
    const [handle, setHandle] = React.useState(null);
    const localVideo = React.useRef(null);

    // Health is configuration metadata only; it exposes no secret and starts nothing.
    React.useEffect(() => {
        let alive = true;
        classroomHealth()
            .then((h) => { if (alive) setHealth(h); })
            .catch(() => { if (alive) setHealth({ ok: false, reason: 'health route unreachable' }); });
        return () => { alive = false; };
    }, []);

    React.useEffect(() => () => { if (handle) handle.close(); }, [handle]);

    async function join(role) {
        setError('');
        setState('CONNECTING');
        try {
            const h = await joinClassroom({ role, onState: setDetail });
            setHandle(h);
            setState('CONNECTED');
            if (h.stream && localVideo.current) {
                localVideo.current.srcObject = h.stream;
            }
        } catch (err) {
            setState('FAILED');
            setError(err.message || String(err));
        }
    }

    function leave() {
        if (handle) handle.close();
        setHandle(null);
        setState('UNCONNECTED');
        setDetail('');
    }

    const configured = health && health.ok;
    const publishers = health ? health.publishers_configured : null;

    return <div className="space-y-6">
        <PageHeader
            title="Classroom"
            description="Live teaching over the Cloudflare Realtime SFU. Sessions are brokered server-side; this page never holds a provider credential."
        />

        <Card className="p-6">
            <p className="font-evidence text-sm">CLASSROOM = {state}</p>
            {detail && <p className="mt-1 text-sm text-muted-foreground">{detail}</p>}
            {error && <p className="mt-2 text-sm text-red-600">Failed: {error}</p>}

            {health && !configured && (
                <p className="mt-3 text-sm text-amber-700">
                    Backend not configured{health.reason ? `: ${health.reason}` : ''}. The room cannot open
                    until the signalling route reports ok.
                </p>
            )}
            {configured && publishers === 0 && (
                <p className="mt-3 text-sm text-amber-700">
                    No publishers are configured, so nobody may broadcast yet. Watching still works.
                    This is deliberate: an unconfigured room does not let every participant publish.
                </p>
            )}

            <div className="mt-4 flex gap-3">
                <button
                    type="button"
                    onClick={() => join('teach')}
                    disabled={!configured || state === 'CONNECTING' || state === 'CONNECTED'}
                    className="rounded border px-4 py-2 text-sm disabled:opacity-50"
                >
                    Start teaching
                </button>
                <button
                    type="button"
                    onClick={() => join('watch')}
                    disabled={!configured || state === 'CONNECTING' || state === 'CONNECTED'}
                    className="rounded border px-4 py-2 text-sm disabled:opacity-50"
                >
                    Join as student
                </button>
                <button
                    type="button"
                    onClick={leave}
                    disabled={state !== 'CONNECTED'}
                    className="rounded border px-4 py-2 text-sm disabled:opacity-50"
                >
                    Leave
                </button>
            </div>
        </Card>

        {state === 'CONNECTED' && handle && (
            <Card className="p-6">
                <p className="font-evidence text-sm">
                    SESSION {String(handle.sessionId).slice(0, 12)}… · ROLE {handle.role.toUpperCase()} ·
                    {handle.mayPublish ? ' PUBLISH ALLOWED' : ' SUBSCRIBE ONLY'}
                </p>
                {handle.role === 'teach' && (
                    <video
                        ref={localVideo}
                        autoPlay
                        muted
                        playsInline
                        className="mt-4 w-full max-w-xl rounded border"
                    />
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                    Publish authority is enforced by the backend on every track push; the flag shown here
                    is advisory for this interface only.
                </p>
            </Card>
        )}
    </div>;
}
