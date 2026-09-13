// CGRF: SRS=SRS-CN-BUILDANDDO-EDUCATION-API-001 | CAPS=B | Seat=C-ONE
import React, { useCallback, useEffect, useState } from 'react';
import { PenLine, Sparkles, ShieldCheck, ClipboardCheck, Info } from 'lucide-react';
import Header from '@/components/site/Header';
import Footer from '@/components/site/Footer';
import Seo from '@/components/Seo';
import { Section, SectionLabel, Card, Button, StateRow, Badge, Rule } from '@/components/site/ui';
import { writingApi, readClaims } from '@/lib/writingEducation';

// The public educational writing journey:
//   challenge -> learner draft -> coaching -> accept/reject/defer -> revision -> complete -> evidence
//
// TWO TRACKS, AND THE LEARNER OWNS ONE OF THEM.
// Track A is the learner's prose. Track B is coaching: observations with evidence. Accepting a suggestion
// records a decision; it never writes into the learner's draft. The learner writes every revision themselves,
// which is why the accept button says "note this" and not "apply".
//
// REJECTING IS NOT FAILING. A learner who reads an observation, understands it and declines it with a reason
// has shown editorial judgement. The UI never scores agreement with the coach, and there is no completion
// metric that rises when you accept more.

const COURSE_ID = 'bad-writing-101';
const LESSON_ID = 'continuity-01';

const CLAIM_TONE = { verified: 'green', pending: 'amber', absent: 'neutral', declared: 'teal' };

function ClaimRow({ claim }) {
    return (
        <StateRow
            icon={ShieldCheck}
            label={claim.label}
            tone={CLAIM_TONE[claim.state] || 'neutral'}
            badge={<Badge tone={CLAIM_TONE[claim.state] || 'neutral'}>{claim.state}</Badge>}
        >
            <p className="text-sm">{claim.text}</p>
            {claim.detail ? <p className="mt-1 text-xs text-muted-foreground">{claim.detail}</p> : null}
        </StateRow>
    );
}

export default function WritingChallengePage() {
    const [challenge, setChallenge] = useState(null);
    const [sessionId, setSessionId] = useState(null);
    const [draft, setDraft] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [notAssessed, setNotAssessed] = useState([]);
    const [loreLane, setLoreLane] = useState(null);
    const [evidence, setEvidence] = useState(null);
    const [status, setStatus] = useState({ kind: 'idle', message: '' });
    const [busy, setBusy] = useState(false);

    const fail = useCallback((result, fallback) => {
        setStatus({
            kind: 'error',
            message: result?.unreachable
                ? 'The writing service is not reachable from here yet.'
                : `${result?.error || fallback}${result?.reason ? ` — ${result.reason}` : ''}`,
        });
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const result = await writingApi.createChallenge(COURSE_ID, LESSON_ID);
            if (cancelled) return;
            if (!result.ok) { fail(result, 'could not load the challenge'); return; }
            setChallenge(result.data.challenge);
        })();
        return () => { cancelled = true; };
    }, [fail]);

    async function startSession() {
        setBusy(true);
        const result = await writingApi.openSession({
            tenant_id: import.meta.env.VITE_BUILDANDDO_TENANT_ID || '',
            challenge_id: challenge.challenge_id,
            course_id: COURSE_ID,
            lesson_id: LESSON_ID,
            learner_id: 'me',
        });
        setBusy(false);
        if (!result.ok) { fail(result, 'could not start the session'); return; }
        setSessionId(result.data.session_id);
        setStatus({ kind: 'ok', message: 'Session started. Everything you write from here is yours.' });
    }

    async function submitDraft() {
        if (!draft.trim()) return;
        setBusy(true);
        const result = await writingApi.draft(sessionId, draft);
        setBusy(false);
        if (!result.ok) { fail(result, 'the draft was not recorded'); return; }
        setStatus({
            kind: 'ok',
            message: `Draft recorded (${result.data.evidence_state}). Evidence is admitted on the next cycle — not instantly.`,
        });
    }

    async function coach() {
        setBusy(true);
        const result = await writingApi.requestCoaching(sessionId);
        setBusy(false);
        if (!result.ok) { fail(result, 'coaching is unavailable'); return; }
        setSuggestions(result.data.suggestions || []);
        setNotAssessed(result.data.not_assessed || []);
        setLoreLane(result.data.track_b_lore_lane || null);
    }

    async function decide(suggestionId, decision) {
        setBusy(true);
        const result = await writingApi.decide(sessionId, suggestionId, decision);
        setBusy(false);
        if (!result.ok) { fail(result, 'the decision was not recorded'); return; }
        setSuggestions((rows) => rows.map((r) => (
            r.suggestion_id === suggestionId ? { ...r, decision } : r
        )));
    }

    async function finish() {
        setBusy(true);
        const completed = await writingApi.complete(sessionId);
        if (!completed.ok) { setBusy(false); fail(completed, 'could not complete the session'); return; }
        const result = await writingApi.evidence(sessionId);
        setBusy(false);
        if (!result.ok) { fail(result, 'could not build the evidence'); return; }
        setEvidence(result.data.evidence);
    }

    const claims = evidence ? readClaims(evidence) : null;

    return (
        <>
            <Seo
                title="Writing challenge — BuildAndDo"
                description="Write, get evidence-backed coaching, and keep a record of what you decided and why."
            />
            <Header />
            <main>
                <Section>
                    <SectionLabel icon={PenLine}>Writing challenge</SectionLabel>
                    {status.kind === 'error' ? (
                        <Card className="border-amber-warm p-4">
                            <p className="text-sm">{status.message}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Nothing is shown here that we could not load — this page reports what it has,
                                not what it wishes it had.
                            </p>
                        </Card>
                    ) : null}

                    {challenge ? (
                        <Card className="mt-4 p-5" data-testid="challenge-card">
                            <h1 className="text-xl font-semibold">{challenge.objective}</h1>
                            <p className="mt-3 text-sm">{challenge.prompt}</p>
                            <Rule className="my-4" />
                            <h2 className="text-sm font-semibold">Constraints</h2>
                            <ul className="mt-2 list-disc pl-5 text-sm">
                                {challenge.constraints.map((c) => <li key={c}>{c}</li>)}
                            </ul>
                            <h2 className="mt-4 text-sm font-semibold">How this is assessed</h2>
                            <ul className="mt-2 space-y-1 text-sm">
                                {challenge.rubric.map((r) => (
                                    <li key={r.criterion}>
                                        <span className="font-medium">{r.criterion}</span> — {r.asks}
                                    </li>
                                ))}
                            </ul>
                            {!sessionId ? (
                                <Button className="mt-5" onClick={startSession} disabled={busy}>
                                    Start writing
                                </Button>
                            ) : null}
                        </Card>
                    ) : status.kind === 'error' ? null : (
                        // Only ever "loading" while we are actually still waiting. A spinner left up next to an
                        // error message tells the reader something is in flight when nothing is.
                        <Card className="mt-4 p-5"><p className="text-sm">Loading the challenge…</p></Card>
                    )}
                </Section>

                {sessionId ? (
                    <Section>
                        <SectionLabel icon={PenLine}>Your writing</SectionLabel>
                        <Card className="mt-4 p-5">
                            <label htmlFor="draft" className="text-sm font-medium">
                                Your scenes — you write every word of this
                            </label>
                            <textarea
                                id="draft"
                                data-testid="draft-input"
                                className="mt-2 min-h-48 w-full border p-3 text-sm"
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                placeholder="Scene one…"
                            />
                            <div className="mt-3 flex flex-wrap gap-2">
                                <Button onClick={submitDraft} disabled={busy || !draft.trim()}>
                                    Save draft
                                </Button>
                                <Button variant="secondary" onClick={coach} disabled={busy}>
                                    <Sparkles className="mr-1 h-4 w-4" /> Ask for coaching
                                </Button>
                            </div>
                            {status.kind === 'ok' ? (
                                <p className="mt-3 text-xs text-muted-foreground">{status.message}</p>
                            ) : null}
                        </Card>
                    </Section>
                ) : null}

                {suggestions.length || notAssessed.length ? (
                    <Section>
                        <SectionLabel icon={Sparkles}>Coaching</SectionLabel>
                        <Card className="mt-4 p-5">
                            <p className="text-sm">
                                These are observations about your writing. Accepting one records that you found
                                it useful — <strong>it does not change your text</strong>. You write the revision.
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Disagreeing is a valid answer. A reasoned rejection is recorded as evidence of
                                your judgement, not as a mistake.
                            </p>
                            <Rule className="my-4" />
                            {suggestions.map((s) => (
                                <div key={s.suggestion_id} className="mb-4" data-testid="suggestion">
                                    <p className="text-sm font-medium">{s.kind}</p>
                                    <p className="text-sm">{s.observation}</p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {['accepted', 'rejected', 'deferred'].map((d) => (
                                            <Button
                                                key={d}
                                                variant={s.decision === d ? 'primary' : 'ghost'}
                                                onClick={() => decide(s.suggestion_id, d)}
                                                disabled={busy}
                                            >
                                                {{ accepted: 'Note this', rejected: 'Disagree', deferred: 'Later' }[d]}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            {notAssessed.length ? (
                                <>
                                    <Rule className="my-4" />
                                    <h3 className="text-sm font-semibold">Not assessed</h3>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        These were not scored, and are shown as unassessed rather than given a
                                        number that would look like a grade.
                                    </p>
                                    <ul className="mt-2 space-y-1 text-xs">
                                        {notAssessed.map((n) => (
                                            <li key={n.axis}>
                                                <span className="font-medium">{n.axis}</span> — {n.reason}
                                            </li>
                                        ))}
                                    </ul>
                                </>
                            ) : null}
                            {loreLane && !loreLane.applicable ? (
                                <p className="mt-4 text-xs text-muted-foreground">
                                    <Info className="mr-1 inline h-3 w-3" />
                                    Continuity-against-canon analysis does not apply to this exercise
                                    (no lore book is attached). That is not a failure.
                                </p>
                            ) : null}
                            <Button className="mt-4" onClick={finish} disabled={busy}>
                                <ClipboardCheck className="mr-1 h-4 w-4" /> Complete and see evidence
                            </Button>
                        </Card>
                    </Section>
                ) : null}

                {claims ? (
                    <Section>
                        <SectionLabel icon={ShieldCheck}>What we can and cannot prove</SectionLabel>
                        <Card className="mt-4 p-5" data-testid="evidence-card">
                            <div className="space-y-4">
                                <ClaimRow claim={claims.submission} />
                                <ClaimRow claim={claims.integrity} />
                                <ClaimRow claim={claims.witness} />
                                <ClaimRow claim={claims.contentOrigin} />
                            </div>
                            <Rule className="my-4" />
                            <p className="text-xs text-muted-foreground">
                                These are four separate claims and we keep them separate on purpose. We can show
                                that an authenticated learner submitted exactly these words and that nothing has
                                changed them since. We cannot show who composed them — anyone can paste text, and
                                no amount of cryptography can tell the difference. Content origin comes from what
                                you actually did in this session, not from a signature.
                            </p>
                            <Rule className="my-4" />
                            <dl className="grid grid-cols-2 gap-3 text-sm">
                                <div><dt className="text-xs text-muted-foreground">Words you wrote</dt>
                                    <dd>{evidence.learner.word_count}</dd></div>
                                <div><dt className="text-xs text-muted-foreground">Revisions</dt>
                                    <dd>{evidence.learner.revision_count}</dd></div>
                                <div><dt className="text-xs text-muted-foreground">Suggestions noted</dt>
                                    <dd>{evidence.track_b.suggestions_accepted}</dd></div>
                                <div><dt className="text-xs text-muted-foreground">Suggestions you disagreed with</dt>
                                    <dd>{evidence.track_b.suggestions_rejected}</dd></div>
                            </dl>
                            <p className="mt-3 text-xs text-muted-foreground">
                                Evidence id <code>{evidence.bundle_sha256?.slice(0, 16)}</code> — the same session
                                always produces the same id.
                            </p>
                        </Card>
                    </Section>
                ) : null}
            </main>
            <Footer />
        </>
    );
}
