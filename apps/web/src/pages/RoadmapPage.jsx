// CGRF: SRS=SRS-BUILDANDDO-ROADMAP-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/RoadmapPage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-ROADMAP-001, SRS-BUILDANDDO-SIGNALS-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN, C-ONE (live sources panel, interaction layer,
//              2026-09-11 sprint-day-3 replay of what actually landed)
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     scripts/ci/sprint_cycle.py,
//              scripts/deploy/roadmap_status.py,
//              apps/web/src/components/roadmap/*,
//              apps/web/src/lib/roadmapStatus.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/public/roadmap-status.json;
//              VALIDATES scripts/ci/sprint_cycle.py
// Intent:      Draw the sprint plan and, separately, whatever the projection
//              actually measured - including saying it measured nothing. The
//              live sources panel shows SIGNALS from each connected system,
//              never results, and says UNMEASURED per tile when it must.
//              Every milestone marker is a real button: mouse, touch and
//              keyboard can pin one, and the ledger and chart point at each
//              other by day.
// ───────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { Gauge, ArrowRight, ArrowUp, Info, TrendingUp, GitCommit } from 'lucide-react';
import Header from '@/components/site/Header';
import Footer from '@/components/site/Footer';
import Seo from '@/components/Seo';
import { Section, SectionLabel, Card, StatePill, Button } from '@/components/site/ui';
import LiveSourcesPanel from '@/components/roadmap/LiveSourcesPanel';
import MilestoneDetailCard from '@/components/roadmap/MilestoneDetailCard';
import StatusLegendFilter from '@/components/roadmap/StatusLegendFilter';
import { dayForKey, ledgerId, markerId, milestoneLabel } from '@/components/roadmap/milestoneA11y';
import { useRoadmapStatus } from '@/lib/roadmapStatus';
import { trackEvent } from '@/lib/telemetry';
import { cn } from '@/lib/utils';

const STATUSES = ['proposed', 'planned', 'in_progress', 'blocked', 'verified', 'archived'];

const FIELDS = [
    { label: 'Owner', value: 'The desk or person accountable.' },
    { label: 'Status', value: 'Proposed → Planned → In progress → Blocked → Verified → Archived.' },
    { label: 'Evidence link', value: 'A real record or receipt backing the item.' },
    { label: 'Timestamp', value: 'When the item was created and last updated.' },
    { label: 'Dependency', value: 'What must happen first.' },
    { label: 'Next action', value: 'The concrete step that moves it forward.' },
];

/**
 * 21-day development sprint — the planned defaults.
 *
 * These entries mirror MILESTONES in scripts/ci/sprint_cycle.py, which is the
 * canonical plan. They exist here as the fallback the page renders before, or
 * instead of, roadmap-status.json: day, title, planned percentage and copy.
 *
 * Status is `planned` for every entry on purpose. A milestone only renders as
 * verified when the projection says so — see mergeLiveStatus below. Nothing on
 * this page can promote a milestone by editing this array.
 */
const SPRINT_DAYS = 21;

const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

const HIGHLIGHT_MS = 2500;

export const PLANNED_MILESTONES = [
    {
        day: 1, title: 'Sprint kickoff — foundations', status: 'planned', value: 5,
        description: 'Repo, self-hosted deploy target, and the staging→production pipeline itself. '
            + 'Nothing downstream works without a real, provable way to ship a change. '
            + 'What landed: staging and production on one self-hosted KVM behind nginx, and ship.py running '
            + 'build → gate → staging sync → staging probe → promote, writing a release manifest the staging '
            + 'readback gate checks (commit d2d5f83). The rail keeps its receipts in the controller estate, '
            + 'outside this repository.',
        deliverables: ['Self-hosted domain + TLS (no third-party site builder)', 'Staging environment, separate from production',
            'Automated build → gate → staging-probe → promote pipeline, with a release manifest per build (ship.py)',
            'Public GitHub repo + private release mirror'],
    },
    {
        day: 3, title: 'Auth & onboarding hardening', status: 'planned', value: 12,
        description: 'A person — or a Citadel Nexus seat — can sign in and reach a workspace without the flow '
            + 'silently failing, on the real backend (not a mock) the rest of the platform is built on. '
            + 'What landed: PocketBase auth, and seat sign-in over OCN — a CitadelKey Ed25519 envelope posted to '
            + '/api/ocn/login, verified by the rooms sidecar on loopback, never a shared password '
            + '(pb_hooks/ocn-login.pb.js, apps/web/src/lib/ocnLogin.js, docs/architecture/BUILDANDDO_OCN_LOGIN.md). '
            + 'Measured on staging 2026-09-11: seat c-one signed in and could read 23 of 24 collections. '
            + 'Not yet measured: a workspace created end-to-end through onboarding — the staging audit shows zero workspaces.',
        deliverables: ['Real backend auth (PocketBase)', 'Seat sign-in over OCN with a CitadelKey, so guilds and agents log in the same way people do',
            'Team roles per workspace (owner/admin/editor/viewer) as a migration; multi-user behaviour still to be measured',
            'Workspace creation through onboarding, end-to-end — open'],
    },
    {
        day: 5, title: 'Workspace collections live', status: 'planned', value: 20,
        description: 'The actual data model behind every workspace panel — evidence, missions, signals, '
            + 'workflows, roadmap items — backed by a real database with real access rules, not placeholders. '
            + 'What landed: 35 migrations reconciled against the production disk and made safe for a fresh install '
            + '(docs/architecture/POCKETBASE_MIGRATION_DRIFT_2026-09-11.md, apps/pocketbase/tools/check_migration_order.mjs, '
            + 'commit 2510ac6), and a staging backend proxied on its own path and isolated from production data.',
        deliverables: ['Backend deployed for real, on staging and production, from the same migration set',
            'Migration order checked by a tool, not by hoping production applied them first',
            'Public/private boundary scan wired into CI (scripts/ci/verify_public_boundary.py)',
            'Role-aware access rules verified with real multi-user accounts — open'],
    },
    {
        day: 7, title: 'Signals pipeline MVP', status: 'planned', value: 30,
        description: 'Turning outside noise (community feedback, engagement, research gaps) into something '
            + 'the product can act on, without letting one comment directly trigger a change.',
        deliverables: ['A typed evidence/claim model with epistemic states (asserted → sourced → corroborated → verified)',
            'A research-quest compiler: a disputed or stale signal becomes a tracked request for more evidence, never an auto-edit',
            'Community audit actions with real reputation (XP/TP) settlement — never from self-review or raw volume'],
    },
    {
        day: 9, title: 'Missions — bounded-action engine', status: 'planned', value: 40,
        description: 'A concrete, boundable unit of work: a scoped edit contract, an isolated change, '
            + 'independent verification, and a real rollback path — not an agent given unbounded authority.',
        deliverables: ['A target/capability graph so an edit is scoped to one file and one mutation class',
            'A first real, dogfooded end-to-end edit through that pipeline, verified live in production',
            'Rollback strategy tracked as declared vs. materialized vs. verified — not assumed complete'],
    },
    {
        day: 11, title: 'Workflows editor', status: 'planned', value: 50,
        description: 'Letting a user compose a repeatable automation from the same building blocks the '
            + 'platform itself uses, instead of a one-off script per project.',
        deliverables: ['Workflow records with a real owner/workspace scope', 'A visual builder for the common cases',
            'Steps that reuse the same evidence/audit model as everything else, so a learner’s workflow is verified the same way the platform’s own is'],
    },
    {
        day: 13, title: 'Living Rooms and public-record bridges', status: 'planned', value: 60,
        description: 'Where people and Citadel Nexus guilds actually work together: Living Rooms that project '
            + 'live guild activity into a workspace, and bridges that carry the verified record out to the public '
            + 'surfaces (wiki, forum, Discord, Reddit) — each with a stated data boundary, not blanket credential access. '
            + 'The rooms sidecar and RoomsPage exist in the repository, but the projection route is not mounted on '
            + 'staging, so nothing here is verified yet.',
        deliverables: ['Living Rooms reading live projections on staging (route mounted and probed, not just present in the repo)',
            'Public-record bridges: wiki, forum, Discord, Reddit — one canonical event, projected outward',
            'Bounded authority per bridge, not a generic admin key'],
    },
    {
        day: 15, title: 'Objectives, tasks and guild contacts', status: 'planned', value: 70,
        description: 'The unglamorous backbone of learning by doing — the objective a learner picks, the bounded tasks '
            + 'it breaks into, and the guild members and agents working it — so missions, signals and evidence '
            + 'point at something real rather than a disconnected module.',
        deliverables: ['Objectives, tasks and guild contacts with the same RBAC model as the rest of the workspace',
            'Cross-links from missions and signals into those records, so a receipt always names the objective it served'],
    },
    {
        day: 17, title: 'Evidence ledger & verification', status: 'planned', value: 80,
        description: 'A claim is never true just because it was written down. Sources, audits, disputes, and '
            + 'a promotion ladder from asserted to independently verified — the same discipline applied to the product itself.',
        deliverables: ['Source-lineage collapsing (100 copies of one origin ≠ 100 independent sources)',
            'Real self-audit rejection by actual authorship, not a caller-honesty flag',
            'Per-dimension knowledge health — never one averaged fake score'],
    },
    {
        day: 19, title: 'Daily edition & specialist desks', status: 'planned', value: 88,
        description: 'Surfacing what actually happened — real commits, real deploys, real verified claims — '
            + 'as a readable daily record, not a marketing summary.',
        deliverables: ['A canonical release event compiled once, projected consistently to wiki/Discord/community channels',
            'Self-hosted wiki as the durable public record', 'Specialist desk views scoped by role, not one firehose'],
    },
    {
        day: 21, title: 'Sprint review — verified replay', status: 'planned', value: 100,
        description: 'Every milestone above gets replayed against its own stated evidence bar, in public — '
            + 'not summarized as "done," but shown with what was actually verified and what wasn’t. '
            + 'The first replay happened on sprint day 3 (2026-09-11): days 1, 3 and 5 recorded with evidence, '
            + 'everything else left as the plan it still is.',
        deliverables: ['Public test suite results, not just a green checkmark', 'An honest list of what remains open',
            'This roadmap updated to reflect what actually happened, not the original plan'],
    },
];

// The plan curve is exactly the milestone points, joined by straight segments.
// It used to carry a deterministic per-day "wiggle" so it read like a market
// plot; that drew variance nobody measured and this page tells readers the
// curve is a plan. A dashed straight line says "planned, interpolated" without
// implying a daily reading exists.
const TRAJECTORY = PLANNED_MILESTONES.map((m) => ({ day: m.day, value: m.value }));

/**
 * Overlays projection status onto the planned milestones.
 *
 * The plan owns which milestones exist and what they are worth; the projection
 * may only report status and evidence for a day already in the plan. A live
 * entry for an unknown day is ignored rather than inventing a milestone.
 *
 * @param {Array<object>} live Milestone entries from roadmap-status.json.
 * @returns {Array<object>} Planned milestones with live status merged in.
 */
function mergeLiveStatus(live) {
    if (!Array.isArray(live) || live.length === 0) return PLANNED_MILESTONES;
    const byDay = new Map(live.filter((m) => m && typeof m.day === 'number').map((m) => [m.day, m]));
    return PLANNED_MILESTONES.map((m) => {
        const entry = byDay.get(m.day);
        if (!entry) return m;
        const evidence = String(entry.evidence || '').trim();
        // Same rule as _actual_pct in sprint_cycle.py: verified without an
        // evidence reference is an assertion, and this page does not render
        // assertions as verified.
        const claimsVerified = entry.status === 'verified';
        return {
            ...m,
            status: claimsVerified && !evidence ? m.status : (entry.status || m.status),
            evidence,
            verifiedAt: entry.verified_at || null,
        };
    });
}

const CHART_W = 1040;
const CHART_H = 440;
const PAD_L = 64;
const PAD_R = 32;
const PAD_T = 36;
const PAD_B = 52;

// Invisible hit circle around each marker. At the chart's native width one
// viewBox unit is one CSS pixel, so r=22 is a 44px touch target; the visible
// dot stays small because the size of the dot is not data.
const HIT_R = 22;

const xFor = (day) => PAD_L + ((day - 1) / (SPRINT_DAYS - 1)) * (CHART_W - PAD_L - PAD_R);
const yFor = (value) => PAD_T + (1 - value / 100) * (CHART_H - PAD_T - PAD_B);

/**
 * The market-style plot. Markers are focusable buttons: hover previews,
 * click / tap / Enter / Space pins, arrow keys walk between milestones,
 * Escape unpins (handled by the page).
 */
function MarketPlot({ activeDay, pinnedDay, onHover, onPin, live, milestones, actual }) {
    const linePath = TRAJECTORY.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(p.day).toFixed(1)} ${yFor(p.value).toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L ${xFor(SPRINT_DAYS).toFixed(1)} ${yFor(0).toFixed(1)} L ${xFor(1).toFixed(1)} ${yFor(0).toFixed(1)} Z`;

    const yTicks = [0, 25, 50, 75, 100];
    const xTicks = [1, 5, 9, 13, 17, 21];
    const days = milestones.map((m) => m.day);

    const handleKeyDown = (event, day) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onPin(day, 'keyboard');
            return;
        }
        const next = dayForKey(event.key, days, day);
        if (next === null) return;
        event.preventDefault();
        document.getElementById(markerId(next))?.focus();
        onPin(next, 'keyboard');
    };

    return (
        <svg
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            className="block h-auto w-full"
            role="group"
            aria-label="Planned 21-day development sprint trajectory, plotted as a market-style line chart. Each milestone marker is a button."
        >
            {/* paper background */}
            <rect x="0" y="0" width={CHART_W} height={CHART_H} fill="hsl(var(--card))" />

            {/* grid */}
            {yTicks.map((t) => (
                <g key={`y${t}`} aria-hidden="true">
                    <line x1={PAD_L} y1={yFor(t)} x2={CHART_W - PAD_R} y2={yFor(t)} stroke="hsl(var(--border))" strokeWidth="1" />
                    <text x={PAD_L - 10} y={yFor(t) + 4} textAnchor="end" className="font-evidence" fontSize="11" fill="hsl(var(--muted-foreground))">
                        {t}
                    </text>
                </g>
            ))}
            {xTicks.map((t) => (
                <g key={`x${t}`} aria-hidden="true">
                    <line x1={xFor(t)} y1={PAD_T} x2={xFor(t)} y2={CHART_H - PAD_B} stroke="hsl(var(--border))" strokeWidth="1" strokeDasharray="2 4" />
                    <text x={xFor(t)} y={CHART_H - PAD_B + 20} textAnchor="middle" className="font-evidence" fontSize="11" fill="hsl(var(--muted-foreground))">
                        D{t}
                    </text>
                </g>
            ))}

            {/* axis labels */}
            <text aria-hidden="true" x={PAD_L - 44} y={PAD_T - 14} className="font-evidence" fontSize="10" fill="hsl(var(--muted-foreground))" letterSpacing="1.5">
                % PLAN
            </text>
            <text aria-hidden="true" x={CHART_W - PAD_R} y={CHART_H - PAD_B + 20} textAnchor="end" className="font-evidence" fontSize="10" fill="hsl(var(--muted-foreground))" letterSpacing="1.5">
                SPRINT DAY →
            </text>

            {/* area fill */}
            <path d={areaPath} fill="hsl(var(--primary) / 0.06)" stroke="none" />

            {/* trajectory line - dashed, because every point between two
                milestones is interpolated plan, not a daily reading */}
            <path
                d={linePath}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="2"
                strokeDasharray="6 4"
                strokeLinejoin="round"
                strokeLinecap="round"
            />

            {/* milestone markers - filled only where the projection says verified */}
            {milestones.map((m) => {
                const x = xFor(m.day);
                const y = yFor(m.value);
                const isActive = activeDay === m.day;
                const isPinned = pinnedDay === m.day;
                const isVerified = m.status === 'verified';
                return (
                    <g
                        key={m.day}
                        id={markerId(m.day)}
                        role="button"
                        tabIndex={0}
                        aria-label={milestoneLabel(m)}
                        aria-pressed={isPinned}
                        data-testid={`milestone-marker-${m.day}`}
                        onPointerEnter={(e) => { if (e.pointerType !== 'touch') onHover(m.day); }}
                        onPointerLeave={() => onHover(null)}
                        onFocus={() => onHover(m.day)}
                        onBlur={() => onHover(null)}
                        onClick={() => onPin(m.day, 'chart')}
                        onKeyDown={(e) => handleKeyDown(e, m.day)}
                        className="cursor-pointer outline-none [&:focus-visible>.marker-ring]:stroke-[hsl(var(--ring))]"
                        style={{ touchAction: 'manipulation' }}
                    >
                        {/* hit target - invisible, but it is what receives the tap */}
                        <circle cx={x} cy={y} r={HIT_R} fill="transparent" stroke="none" />
                        {/* focus ring / active halo */}
                        <circle
                            className="marker-ring"
                            cx={x} cy={y} r="11"
                            fill={isActive || isPinned ? 'hsl(var(--primary) / 0.18)' : 'transparent'}
                            stroke={isPinned ? 'hsl(var(--primary))' : 'transparent'}
                            strokeWidth="1.5"
                            strokeDasharray={isPinned ? '3 2' : undefined}
                        />
                        <circle
                            cx={x}
                            cy={y}
                            r={isVerified ? 5.5 : 4.5}
                            fill={isVerified ? 'hsl(var(--primary))' : 'hsl(var(--card))'}
                            stroke="hsl(var(--primary))"
                            strokeWidth="2"
                        />
                        <text x={x} y={y - 16} textAnchor="middle" className="font-evidence" fontSize="10" fill="hsl(var(--foreground))" aria-hidden="true">
                            D{m.day}
                        </text>
                    </g>
                );
            })}

            {/* actual progress marker - drawn only from a fresh, measured
                projection. An UNMEASURED or missing file draws nothing at all
                rather than a marker at a number nobody computed. */}
            {actual && (
                <g aria-label={`Actual measured progress ${actual.pct}% on day ${actual.day}`} role="img">
                    <line
                        x1={xFor(actual.day)} y1={PAD_T}
                        x2={xFor(actual.day)} y2={CHART_H - PAD_B}
                        stroke="hsl(var(--foreground) / 0.35)" strokeWidth="1" strokeDasharray="3 3"
                    />
                    <circle
                        cx={xFor(actual.day)} cy={yFor(actual.pct)}
                        r="5.5" fill="hsl(var(--destructive, 0 84% 60%))" stroke="hsl(var(--card))" strokeWidth="1.5"
                    />
                    <text
                        x={xFor(actual.day)} y={yFor(actual.pct) - 14}
                        textAnchor="middle" className="font-evidence" fontSize="10" fill="hsl(var(--foreground))"
                    >
                        ACTUAL {actual.pct}%
                    </text>
                </g>
            )}

            {/* live data unavailable - say so on the chart itself */}
            {live && !actual && (
                <text
                    x={CHART_W - PAD_R} y={PAD_T - 14} textAnchor="end"
                    className="font-evidence" fontSize="10" fill="hsl(var(--muted-foreground))" letterSpacing="1.5"
                >
                    ACTUAL: UNKNOWN
                </text>
            )}

            {/* frame */}
            <rect x="0.5" y="0.5" width={CHART_W - 1} height={CHART_H - 1} fill="none" stroke="hsl(var(--foreground) / 0.7)" strokeWidth="1" />
        </svg>
    );
}

function TickerChip({ href, children, className, ...props }) {
    return (
        <a
            href={href}
            className={cn('inline-flex min-h-[32px] items-center hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))]', className)}
            {...props}
        >
            {children}
        </a>
    );
}

export default function RoadmapPage() {
    // pinnedDay persists until another marker is pinned or Escape; hoverDay is
    // a transient preview from mouse hover or keyboard focus.
    const [pinnedDay, setPinnedDay] = useState(null);
    const [hoverDay, setHoverDay] = useState(null);
    const [highlightedDay, setHighlightedDay] = useState(null);
    const [statusFilter, setStatusFilter] = useState(() => new Set());
    const chartRef = useRef(null);
    const { status: live, error: liveError } = useRoadmapStatus();

    const milestones = useMemo(() => mergeLiveStatus(live?.milestones), [live]);
    const verifiedCount = useMemo(
        () => milestones.filter((m) => m.status === 'verified').length,
        [milestones],
    );
    const statusCounts = useMemo(
        () => milestones.reduce((acc, m) => ({ ...acc, [m.status]: (acc[m.status] || 0) + 1 }), {}),
        [milestones],
    );

    const activeDay = hoverDay ?? pinnedDay;
    const activeMilestone = useMemo(
        () => milestones.find((m) => m.day === activeDay) || null,
        [milestones, activeDay],
    );
    const detailMode = activeMilestone ? (hoverDay !== null && hoverDay !== pinnedDay ? 'preview' : 'pinned') : null;

    const visibleMilestones = useMemo(
        () => (statusFilter.size ? milestones.filter((m) => statusFilter.has(m.status)) : milestones),
        [milestones, statusFilter],
    );

    // A projection is only quoted when it says it measured something. An
    // UNMEASURED file is a deliberate signal from ship.py that the projection
    // failed, and must not be read as "zero progress".
    const measured = Boolean(live) && live.state !== 'UNMEASURED';

    const generatedAt = useMemo(() => {
        const parsed = live?.generated_at ? new Date(live.generated_at) : null;
        return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
    }, [live]);

    const stale = Boolean(generatedAt) && Date.now() - generatedAt.getTime() > STALE_AFTER_MS;

    // sprint_day is clamped here as well as in sprint_cycle.py: a status file
    // written after D21, or by an older projection, must not plot off-chart.
    const actual = useMemo(() => {
        if (!measured) return null;
        if (!Number.isFinite(live.sprint_day) || !Number.isFinite(live.actual_pct)) return null;
        return {
            day: Math.max(1, Math.min(live.sprint_day, SPRINT_DAYS)),
            pct: Math.max(0, Math.min(live.actual_pct, 100)),
        };
    }, [measured, live]);

    const handleHover = (day) => {
        setHoverDay(day);
        if (day && day !== pinnedDay) {
            const m = milestones.find((x) => x.day === day);
            trackEvent('roadmap_milestone_hover', { day, title: m?.title });
        }
    };

    const handlePin = useCallback((day, via) => {
        setPinnedDay(day);
        const m = milestones.find((x) => x.day === day);
        trackEvent('roadmap_milestone_pin', { day, title: m?.title, status: m?.status, via });
    }, [milestones]);

    const handleUnpin = useCallback(() => {
        setPinnedDay(null);
        setHoverDay(null);
    }, []);

    // Escape anywhere on the page releases the pin.
    useEffect(() => {
        if (pinnedDay === null) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') handleUnpin(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [pinnedDay, handleUnpin]);

    // The ledger highlight is a short flash, not a state the reader has to clear.
    useEffect(() => {
        if (highlightedDay === null) return undefined;
        const t = setTimeout(() => setHighlightedDay(null), HIGHLIGHT_MS);
        return () => clearTimeout(t);
    }, [highlightedDay]);

    const handleJumpToLedger = (day) => {
        setHighlightedDay(day);
        trackEvent('roadmap_ledger_jump', { day });
        document.getElementById(ledgerId(day))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    const handleShowOnChart = (day) => {
        handlePin(day, 'ledger');
        chartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        document.getElementById(markerId(day))?.focus({ preventScroll: true });
    };

    const toggleStatus = (s) => {
        setStatusFilter((prev) => {
            const next = new Set(prev);
            if (next.has(s)) next.delete(s); else next.add(s);
            trackEvent('roadmap_status_filter', { statuses: [...next].sort() });
            return next;
        });
    };
    const clearStatus = () => {
        setStatusFilter(new Set());
        trackEvent('roadmap_status_filter', { statuses: [] });
    };

    return (
        <div className="min-h-screen bg-background text-foreground">
            <Helmet>
                <title>BuildAndDo — 21-day development sprint roadmap</title>
                <meta
                    name="description"
                    content="BuildAndDo's roadmap plotted as an old-school market chart: a planned 21-day development sprint with milestone markers. Every milestone is a plan, not a verified result — Verified still requires an evidence record."
                />
            </Helmet>
            <Seo
                title="BuildAndDo — 21-day development sprint roadmap"
                description="A planned 21-day development sprint plotted as a market-style chart with milestone markers. Plans, not verified results."
                siteName="BuildAndDo"
                type="website"
            />

            <Header />

            <main id="main-content" tabIndex={-1} className="pt-14 outline-none">
            <div className="rule-double" />
            <Section className="py-14 sm:py-20">
                <SectionLabel icon={Gauge}>Operational Roadmap</SectionLabel>
                <h1 className="mt-3 font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
                    A 21-day sprint, plotted like a market chart.
                </h1>
                <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                    BuildAndDo is an educational, collaborative platform built in
                    public, and this is its near-term roadmap: a planned development
                    sprint, drawn as an old-school stock-market plot. Each marker
                    is a milestone in the sprint. The curve is a plan, not
                    telemetry — it shows intended cumulative completion, not real
                    results. An item is never marked Verified from a prompt
                    alone; Verified still requires an evidence record. The
                    red ACTUAL marker on the chart, where present, is live
                    build/deploy telemetry, not another plan line.
                </p>

                <div className="mt-8">
                    <p className="mb-2 font-evidence text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        Status legend · select to filter the ledger
                    </p>
                    <StatusLegendFilter
                        statuses={STATUSES}
                        selected={statusFilter}
                        counts={statusCounts}
                        onToggle={toggleStatus}
                        onClear={clearStatus}
                    />
                </div>
            </Section>

            {/* Market plot */}
            <Section id="sprint-chart" className="border-t border-foreground/80 py-12 sm:py-16">
                <div ref={chartRef} className="scroll-mt-24 flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <SectionLabel icon={TrendingUp}>Dev trajectory · planned</SectionLabel>
                        <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                            21-day sprint — milestone plot
                        </h2>
                    </div>
                    <div className="font-evidence text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        BND · SPRINT 01 · PLAN
                    </div>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-12">
                    <Card className="overflow-hidden p-0 lg:col-span-8">
                        <MarketPlot
                            activeDay={activeDay}
                            pinnedDay={pinnedDay}
                            onHover={handleHover}
                            onPin={handlePin}
                            live={live}
                            milestones={milestones}
                            actual={actual}
                        />
                    </Card>
                    {/* persistent detail card - pinned milestone, or a hover preview */}
                    <div className="lg:col-span-4">
                        <MilestoneDetailCard
                            milestone={activeMilestone}
                            mode={detailMode}
                            stateSource={live?.milestone_state_source || 'Unknown'}
                            onUnpin={handleUnpin}
                            onJump={handleJumpToLedger}
                        />
                    </div>
                </div>

                {/* ticker / readout strip - each chip is a link to its section */}
                <nav aria-label="Roadmap sections" className="mt-4 border border-border bg-secondary/40 px-4 py-2">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 font-evidence text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        <TickerChip href="#sprint-chart">SPRINT 01</TickerChip>
                        <span>· {SPRINT_DAYS} DAYS</span>
                        <TickerChip href="#milestone-ledger">· {milestones.length} MILESTONES</TickerChip>
                        <TickerChip href="#milestone-ledger" data-testid="ticker-verified">· {verifiedCount} VERIFIED</TickerChip>
                        <span className="text-primary">· CURVE = PLAN, NOT RESULTS</span>
                        {actual && (
                            <span>· LIVE ACTUAL: {actual.pct}% (day {actual.day})</span>
                        )}
                        {live && !measured && <span>· LIVE DATA UNAVAILABLE</span>}
                        {live?.gate_state && (
                            <TickerChip href="#build-activity">· LAST GATE: {live.gate_state}</TickerChip>
                        )}
                        {stale && (
                            <span className="text-amber-warm">
                                · DATA MAY BE STALE (GENERATED {generatedAt.toISOString().slice(0, 10)})
                            </span>
                        )}
                        {liveError && <span>· LIVE DATA: UNKNOWN (FETCH FAILED)</span>}
                    </div>
                </nav>

                {/* live source signals - one tile per connected system, never a result */}
                <LiveSourcesPanel
                    signals={live?.signals || null}
                    signalsState={live?.signals_state || 'UNMEASURED'}
                    generatedAt={live?.signals_generated_at || null}
                />
            </Section>

            {/* Milestone ledger */}
            <Section id="milestone-ledger" className="border-t border-foreground/80 py-12 sm:py-16">
                <SectionLabel>Milestone ledger</SectionLabel>
                <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                    Every milestone, with provenance fields.
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    No invented results, no fake progress bars, no illustrative dates
                    presented as real. If a field is unknown, it says Unknown.
                </p>
                {statusFilter.size > 0 && (
                    <p className="mt-3 font-evidence text-[11px] uppercase tracking-[0.14em] text-muted-foreground" data-testid="ledger-filter-note">
                        Showing {visibleMilestones.length} of {milestones.length} · filtered by {[...statusFilter].map((s) => s.replace(/_/g, ' ')).join(', ')}
                        {' '}·{' '}
                        <button type="button" onClick={clearStatus} className="underline hover:text-foreground">clear</button>
                    </p>
                )}

                <Card className="mt-6 divide-y divide-border" data-testid="milestone-ledger">
                    {visibleMilestones.length === 0 && (
                        <p className="p-4 text-sm text-muted-foreground">No milestones carry the selected status.</p>
                    )}
                    {visibleMilestones.map((m) => {
                        const isPinned = pinnedDay === m.day;
                        const isHighlighted = highlightedDay === m.day;
                        return (
                            <article
                                key={m.day}
                                id={ledgerId(m.day)}
                                data-testid={`ledger-entry-${m.day}`}
                                data-pinned={isPinned ? 'true' : undefined}
                                aria-labelledby={`${ledgerId(m.day)}-title`}
                                className={cn(
                                    'scroll-mt-24 p-4 transition-colors',
                                    isHighlighted && 'bg-primary/10',
                                    isPinned && !isHighlighted && 'bg-secondary/40',
                                )}
                            >
                                <div className="grid grid-cols-12 items-center gap-3">
                                    <div className="col-span-2 font-evidence text-[11px] uppercase tracking-[0.14em] text-primary sm:col-span-1">
                                        D{m.day}
                                    </div>
                                    <h3 id={`${ledgerId(m.day)}-title`} className="col-span-10 text-sm font-medium sm:col-span-6">{m.title}</h3>
                                    <div className="col-span-12 flex flex-wrap items-center justify-end gap-2 sm:col-span-5">
                                        <span className="font-evidence text-[11px] text-muted-foreground">{m.value}%</span>
                                        <StatePill state={m.status} />
                                        <button
                                            type="button"
                                            onClick={() => handleShowOnChart(m.day)}
                                            aria-pressed={isPinned}
                                            aria-label={`Show day ${m.day} on chart`}
                                            className="inline-flex min-h-[36px] items-center gap-1 border border-border px-2 font-evidence text-[11px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))]"
                                        >
                                            <ArrowUp className="h-3 w-3" /> {isPinned ? 'On chart' : 'Show on chart'}
                                        </button>
                                    </div>
                                </div>
                                {m.status === 'verified' && m.evidence && (
                                    <p className="font-evidence mt-2 pl-0 text-[11px] text-muted-foreground sm:pl-[calc(8.33%+0.75rem)]">
                                        Evidence: {m.evidence}
                                        {m.verifiedAt ? ` · verified ${m.verifiedAt}` : ''}
                                    </p>
                                )}
                                {m.description && (
                                    <p className="mt-2 pl-0 text-sm leading-relaxed text-muted-foreground sm:pl-[calc(8.33%+0.75rem)]">
                                        {m.description}
                                    </p>
                                )}
                                {m.deliverables?.length > 0 && (
                                    <ul className="mt-2 space-y-1 pl-0 sm:pl-[calc(8.33%+0.75rem)]">
                                        {m.deliverables.map((d) => (
                                            <li key={d} className="flex gap-2 text-xs text-foreground/80">
                                                <span className="text-primary">·</span>
                                                <span>{d}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </article>
                        );
                    })}
                </Card>
            </Section>

            {/* Recent build activity - real GitHub commit log, refreshed every deploy */}
            <Section id="build-activity" className="border-t border-foreground/80 py-12 sm:py-16">
                <SectionLabel icon={GitCommit}>Build in public</SectionLabel>
                <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                    Recent build activity.
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    Pulled live from the public GitHub repository at build time. Not
                    a summary or a curated highlight reel — the real commit log.
                    {live?.gate_state ? ` Last deploy gate: ${live.gate_state}` : ''}
                    {live?.gate_checked_at ? ` (checked ${live.gate_checked_at.slice(0, 16).replace('T', ' ')} UTC).` : ''}
                </p>
                <Card className="mt-6 divide-y divide-border">
                    {live?.recent_commits?.length ? (
                        live.recent_commits.map((c) => (
                            c.error ? (
                                <div key="err" className="p-4 text-sm text-muted-foreground">Unknown — {c.error}</div>
                            ) : (
                                <a
                                    key={c.sha}
                                    href={c.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={() => trackEvent('roadmap_commit_click', { sha: c.sha })}
                                    className="flex flex-wrap items-center gap-3 p-4 text-sm hover:bg-secondary/40"
                                >
                                    <span className="font-evidence text-[11px] text-primary">{c.sha}</span>
                                    <span className="flex-1 truncate">{c.message}</span>
                                    <span className="font-evidence text-[11px] text-muted-foreground">{c.date}</span>
                                </a>
                            )
                        ))
                    ) : (
                        <div className="p-4 text-sm text-muted-foreground">
                            {liveError ? 'Unknown — live commit feed unavailable.' : 'Loading…'}
                        </div>
                    )}
                </Card>
            </Section>

            {/* Provenance fields reference */}
            <Section className="border-t border-foreground/80 py-12 sm:py-16">
                <div className="grid gap-8 lg:grid-cols-12">
                    <div className="lg:col-span-5">
                        <SectionLabel>What each item contains</SectionLabel>
                        <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                            Full provenance, by default.
                        </h2>
                        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                            No invented milestones, no fake progress bars, no illustrative
                            dates presented as real. If a field is unknown, it says Unknown.
                        </p>
                    </div>
                    <div className="lg:col-span-7">
                        <Card className="divide-y divide-border">
                            {FIELDS.map((f) => (
                                <div key={f.label} className="flex gap-4 p-4">
                                    <p className="w-32 shrink-0 font-evidence text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                                        {f.label}
                                    </p>
                                    <p className="text-sm text-foreground/90">{f.value}</p>
                                </div>
                            ))}
                        </Card>
                    </div>
                </div>
            </Section>

            <Section className="border-t border-foreground/80 py-12 sm:py-16">
                <Card className="p-8 text-center">
                    <p className="font-display text-xl font-semibold">
                        The live, editable roadmap lives in your workspace.
                    </p>
                    <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                        The dashed curve is the planned sprint. A milestone renders as
                        verified here only when the sprint projection reports it verified
                        with an evidence reference — never from this page&rsquo;s own defaults.
                    </p>
                    <div className="mt-5 flex justify-center gap-2">
                        <Link to="/app/roadmap"><Button size="sm">Open workspace roadmap <ArrowRight className="h-4 w-4" /></Button></Link>
                        <Link to="/signup"><Button variant="secondary" size="sm">Create account</Button></Link>
                    </div>
                </Card>
            </Section>

            <p className="mx-auto flex max-w-6xl items-start gap-2 px-4 pb-10 text-xs leading-relaxed text-muted-foreground/70 sm:px-6">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                    How to read this page: hover a marker to preview it; click, tap, or
                    press Enter on a marker to pin it in the detail card; arrow keys move
                    between markers and Escape unpins. Legend chips filter the ledger, and
                    every ledger entry can show its marker on the chart. The curve is a
                    planned sprint trajectory, not verified results or live telemetry.
                    BuildAndDo does not present illustrative numbers as real; no cost
                    markers or growth metrics are shown.
                </span>
            </p>
            </main>

            <Footer />
        </div>
    );
}
