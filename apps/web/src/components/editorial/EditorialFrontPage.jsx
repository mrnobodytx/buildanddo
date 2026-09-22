// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/editorial/EditorialFrontPage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     apps/web/src/lib/editorialContent.js, apps/web/src/lib/workspaceSummary.js, apps/web/src/components/editorial/VerticalNewsReel.jsx, apps/web/src/components/editorial/AndroidPhoneFrame.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/editorialContent.js; CONSUMES apps/web/src/lib/workspaceSummary.js; CONSUMES apps/web/src/components/editorial/VerticalNewsReel.jsx; CONSUMES apps/web/src/components/editorial/AndroidPhoneFrame.jsx
// DAG Node:    none
// Intent:      Bring independent research and platform reels around a dated workspace edition without mixing public reading with private evidence.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { activeMissions, isToday, latestPublishedEdition, verifiedEvidence } from '@/lib/workspaceSummary';
import { dailyHighlights, editorialDate, PLATFORM_AREAS, RESEARCH_READING, researchReelItems } from '@/lib/editorialContent';
import VerticalNewsReel from './VerticalNewsReel';
import AndroidPhoneFrame from './AndroidPhoneFrame';
import './editorial.css';

function ResearchDesk({ research, workspaceId, now }) {
    const [source, setSource] = useState('public');
    const selectId = useId();
    const workspaceItems = useMemo(() => researchReelItems(research, workspaceId, now), [research, workspaceId, now]);
    const privateView = source === 'workspace' && Boolean(research);
    return (
        <aside className="frontpage-rail frontpage-rail--news" aria-labelledby="research-desk-title">
            <div className="frontpage-rail__sticky">
                <header className="frontpage-rail__heading">
                    <p className="editorial-eyebrow">The research desk</p>
                    <h2 id="research-desk-title">Modern <br />advances.</h2>
                    <p>Ideas worth a closer look.</p>
                </header>
                {research ? <div className="frontpage-source">
                    <label className="editorial-sr-only" htmlFor={selectId}>Research source</label>
                    <select id={selectId} value={privateView ? 'workspace' : 'public'} onChange={(event) => setSource(event.target.value)}>
                        <option value="public">Research reading</option>
                        <option value="workspace">Workspace research</option>
                    </select>
                </div> : <p className="frontpage-rail__edition">Selected research · original sources</p>}
                {privateView && research.loading ? <p role="status" className="news-reel__empty">Reading your research desk…</p>
                    : privateView && research.error ? <div className="news-reel__empty" role="status">
                        <p>{research.demo ? 'Workspace research is unavailable in demonstration mode.' : 'Your research desk could not be read.'}</p>
                        {!research.demo && <button type="button" className="editorial-text-link" onClick={research.refresh}>Try again</button>}
                    </div> : <VerticalNewsReel key={privateView ? 'workspace' : 'public'}
                        items={privateView ? workspaceItems : RESEARCH_READING} label="Research news" interval={9000} visibleCount={3}
                        emptyMessage="No completed research in this page of your workspace. Open the research desk to continue." />}
                <div className="frontpage-rail__foot">
                    {privateView ? <>
                        <p>{research.data?.has_more ? 'More research is available in the workspace.' : 'Saved research keeps its original review status.'}</p>
                        <Link to="/app/research" className="editorial-text-link">Open the research desk <ArrowUpRight size={13} aria-hidden="true" /></Link>
                    </> : <p>Research reading from the archive. Publication dates stay with each source.</p>}
                </div>
            </div>
        </aside>
    );
}

function PlatformDesk() {
    return (
        <aside className="frontpage-rail frontpage-rail--platform" aria-labelledby="platform-desk-title">
            <div className="frontpage-rail__sticky">
                <header className="frontpage-rail__heading">
                    <p className="editorial-eyebrow">Around the platform</p>
                    <h2 id="platform-desk-title">Popular <br />areas.</h2>
                    <p>Find your next place to begin.</p>
                </header>
                <p className="frontpage-rail__edition">The editor’s selection</p>
                <VerticalNewsReel items={PLATFORM_AREAS} label="Platform areas" interval={11200} visibleCount={3} />
                <div className="frontpage-rail__foot">
                    <p>Learn a little. Make something. Keep the evidence.</p>
                    <Link to="/docs" className="editorial-text-link">Read the Field Manual <ArrowUpRight size={13} aria-hidden="true" /></Link>
                </div>
            </div>
        </aside>
    );
}

function DayHighlights({ sources, now, isAuthed }) {
    const highlights = dailyHighlights(sources, now);
    const desks = [sources.editions, sources.evidence, sources.signals].filter(Boolean);
    const loading = desks.some((source) => source.loading);
    const unavailable = desks.some((source) => source.degraded);
    const demo = desks.some((source) => source.demo);
    return (
        <section className="frontpage-highlights" aria-labelledby="day-highlights-title">
            <div className="frontpage-section-heading">
                <h2 id="day-highlights-title">Highlights for today</h2>
                <span className="editorial-eyebrow">{now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>
            {highlights.length > 0 ? <ol className="frontpage-highlights__list">
                {highlights.map((item, index) => <li key={item.id}>
                    <span className="frontpage-highlights__number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                    <div>
                        <p className="editorial-eyebrow">{item.kicker}</p>
                        <a href={item.href} className="frontpage-highlight-title">{item.title}<ArrowUpRight size={15} aria-hidden="true" /></a>
                        <time dateTime={item.date}>{editorialDate(item.date)}</time>
                    </div>
                </li>)}
            </ol> : <div className="frontpage-highlights__empty">
                <p className="frontpage-highlights__invitation">
                    {demo ? 'A place to try the daily edition.'
                        : loading ? 'Gathering today’s highlights…'
                            : unavailable ? 'Today’s highlights are unavailable.'
                                : desks.length ? 'The day is still yours to write.' : 'A little learning. A real next step.'}
                </p>
                <p>
                    {demo ? 'Demonstration records stay separate from your real daily highlights.'
                        : loading ? 'Reading the current workspace edition, signals and evidence.'
                            : unavailable ? 'Refresh your workspace data to try the affected desks again.'
                                : desks.length ? 'No highlights have been recorded for today. Earlier work is still available in the desks below.'
                                    : 'Read something useful, bring it into a mission, and see what you can build. Your workspace keeps the record.'}
                </p>
                {!desks.length && <Link to={isAuthed ? '/app' : '/signup'} className="editorial-text-link">
                    {isAuthed ? 'Visit your workspace' : 'Start your own edition'} <ArrowRight size={14} aria-hidden="true" />
                </Link>}
            </div>}
            {highlights.length > 0 && (loading || unavailable) && <p className="frontpage-note" role="status">
                {loading ? 'Some desks are still loading.' : 'Some desks could not be read. Refresh workspace data to try again.'}
            </p>}
        </section>
    );
}

function PocketEdition() {
    const [tab, setTab] = useState('platform');
    const tabsId = useId();
    return (
        <section className="frontpage-pocket" aria-labelledby="pocket-edition-title">
            <div className="frontpage-pocket__copy">
                <p className="editorial-eyebrow">The pocket edition</p>
                <h2 id="pocket-edition-title">And it goes<br /><em>with you.</em></h2>
                <p>A research note over coffee. A lesson on the way. Your next piece of work, wherever you begin.</p>
                <p className="frontpage-note">Try the web edition here. The stories and links are interactive.</p>
                <Link to="/classrooms" className="editorial-text-link">Find a classroom <ArrowUpRight size={14} aria-hidden="true" /></Link>
            </div>
            <AndroidPhoneFrame title="The Daily Edition">
                <div className="pocket-edition">
                    <p className="editorial-eyebrow">Read. Learn. Do.</p>
                    <h3>Your next<br /><em>good idea.</em></h3>
                    <div className="pocket-edition__tabs" aria-label="Phone preview content">
                        <button type="button" aria-pressed={tab === 'platform'} aria-controls={tabsId} onClick={() => setTab('platform')}>Explore</button>
                        <button type="button" aria-pressed={tab === 'research'} aria-controls={tabsId} onClick={() => setTab('research')}>Research</button>
                    </div>
                    <div id={tabsId}>
                        <VerticalNewsReel key={tab} items={tab === 'platform' ? PLATFORM_AREAS : RESEARCH_READING}
                            label="Pocket edition" visibleCount={1} interval={13000} height={344} className="news-reel--pocket" />
                    </div>
                </div>
            </AndroidPhoneFrame>
        </section>
    );
}

function accountCount(source, count) {
    return !source || source.loading || source.degraded ? '—' : count;
}

/** Place independent reels around the current day's readable workspace edition.
 * @param {object} props Existing scoped sources and workspace controls.
 * @returns {React.ReactElement} A responsive three-column front page.
 */
export default function EditorialFrontPage({ sources = {}, workspaceControls, workspaceId = '' }) {
    const { isAuthed } = useAuth();
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const update = () => { if (!document.hidden) setNow(new Date()); };
        const timer = window.setInterval(update, 60000);
        document.addEventListener('visibilitychange', update);
        return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', update); };
    }, []);
    const edition = sources.editions && !sources.editions.loading && !sources.editions.degraded && !sources.editions.demo
        ? latestPublishedEdition(sources.editions.records, now) : null;
    return (
        <div className="editorial-frontpage">
            <div className="frontpage-dateline">
                <span>Curiosity into practice.</span>
                <time dateTime={now.toLocaleDateString('en-CA')}>{now.toLocaleDateString('en-US', {
                    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
                })}</time>
                <span>A Citadel Nexus Inc. publication</span>
            </div>
            <div className="frontpage-columns">
                <div className="frontpage-center">
                    <header className="frontpage-masthead">
                        <div className="frontpage-masthead__top">
                            <span className="frontpage-edition-stamp">Learn<br />Build<br />Verify</span>
                            <span className="frontpage-monogram" aria-hidden="true">B<span>&amp;</span>D</span>
                            <span className="frontpage-edition-stamp">The daily<br />learning<br />edition</span>
                        </div>
                        <h1>BUILDANDDO</h1>
                        <p><span aria-hidden="true">◆</span> Learn by doing real work. <span aria-hidden="true">◆</span></p>
                    </header>
                    <div className="frontpage-running-line">
                        <span className="editorial-eyebrow">{edition ? 'From your workspace' : 'The front page'}</span>
                        <span>{edition ? `Published ${editorialDate(edition.edition_date || edition.created)}` : 'Learn with people and AI. Build together. Keep the evidence.'}</span>
                    </div>
                    <section className="frontpage-lead">
                        <h2>{edition ? edition.title : <>Learn by doing.<br />Build something<br /><em>real. Together.</em></>}</h2>
                        <p className="frontpage-lead__summary">{edition
                            ? edition.summary || 'Read the published edition and inspect its supporting records in your workspace.'
                            : 'Choose something to build or accomplish. Learn with people and AI, work through a real project, inspect what happened, and share what you learned.'}</p>
                        <div className="frontpage-actions">
                            <a href="#challenge-desk" className="frontpage-button">Submit a challenge <ArrowRight size={14} aria-hidden="true" /></a>
                            <a href="#evidence-ledger" className="frontpage-button frontpage-button--outline">View evidence</a>
                            <a href="#daily-edition" className="frontpage-button frontpage-button--outline">Read the edition</a>
                        </div>
                    </section>
                    <DayHighlights sources={sources} now={now} isAuthed={isAuthed} />
                    <div className="frontpage-account">
                        <section aria-label="Account state">
                            <h2 className="editorial-eyebrow">Your workspace, at a glance</h2>
                            <dl>
                                <div><dt>Signed in</dt><dd>{isAuthed ? 'Yes' : 'No'}</dd></div>
                                <div><dt>Sources marked connected</dt><dd>{accountCount(sources.services, (sources.services?.records || []).filter((record) => record.status === 'connected').length)}</dd></div>
                                <div><dt>Active missions</dt><dd>{accountCount(sources.missions, activeMissions(sources.missions?.records || []).length)}</dd></div>
                                <div><dt>Marked verified today</dt><dd>{accountCount(sources.evidence, verifiedEvidence(sources.evidence?.records || []).filter((record) => isToday(record.created, now)).length)}</dd></div>
                                <div><dt>Published edition</dt><dd>{accountCount(sources.editions, edition ? editorialDate(edition.edition_date || edition.created) : 'None yet')}</dd></div>
                            </dl>
                            <Link className="editorial-text-link" to={isAuthed ? '/app' : '/login'}>
                                {isAuthed ? 'Open your workspace' : 'Sign in to your workspace'} <ArrowRight size={13} aria-hidden="true" />
                            </Link>
                        </section>
                        {workspaceControls && <div className="frontpage-workspace">{workspaceControls}</div>}
                    </div>
                    <PocketEdition />
                </div>
                <ResearchDesk research={sources.research} workspaceId={workspaceId} now={now} />
                <PlatformDesk />
            </div>
            <div className="frontpage-colophon"><span aria-hidden="true">◆</span><p>Good questions. Real work. A record worth keeping.</p><span aria-hidden="true">◆</span></div>
        </div>
    );
}
