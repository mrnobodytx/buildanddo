// BndClassroom — Broadcast Classroom components. window.BndClassroom.<Name>. React 18.
import * as React from 'react';

export type IconName = 'activity' | 'antenna' | 'badge-check' | 'book-open' | 'bot' | 'circle-dot' | 'eye' | 'file-search' | 'globe' | 'hand' | 'message-circle' | 'mic' | 'mic-off' | 'monitor-up' | 'pen-line' | 'phone-off' | 'radar' | 'radio' | 'rss' | 'search-check' | 'share-2' | 'shield-check' | 'signal' | 'triangle-alert' | 'tv-minimal' | 'undo-2' | 'user-round' | 'users' | 'video' | 'video-off' | 'waypoints' | 'wifi-off';
export type Tone = 'neutral' | 'red' | 'amber' | 'teal' | 'green' | 'ink';
export type RoomStatus = 'scheduled' | 'live' | 'ended';
export type SignalState = 'not-configured' | 'not-connected' | 'measuring' | 'silent' | 'weak' | 'receiving' | 'interrupted';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'ink';
  size?: 'sm' | 'md' | 'lg';
  /** Renders an <a> when set. */
  href?: string;
  icon?: IconName;
}
export declare const Button: React.ForwardRefExoticComponent<ButtonProps & React.RefAttributes<HTMLButtonElement>>;
export declare function Badge(props: { tone?: Tone; className?: string; children: React.ReactNode }): JSX.Element;
/** State vocabulary: observed, user-provided, inferred, proposed, approved, executed, verified, failed, unavailable, pending, not-connected, connected, syncing, healthy, degraded, error, blocked, idle, active. */
export declare function StatePill(props: { state: string; className?: string }): JSX.Element;
export declare function SectionLabel(props: { icon?: IconName; className?: string; children: React.ReactNode }): JSX.Element;
export declare function Card(props: React.HTMLAttributes<HTMLDivElement> & { padding?: 'md' | 'lg' }): JSX.Element;
export declare function Rule(props: { thick?: boolean; double?: boolean; className?: string }): JSX.Element;
export declare function Icon(props: { name: IconName; size?: number; className?: string }): JSX.Element;

export declare function SessionStatus(props: { status: RoomStatus; /** Override the word, e.g. "On air" for a channel. */ label?: string; onStage?: boolean; className?: string }): JSX.Element;
export declare function SignalMeter(props: {
  state: SignalState;
  /** inbound-rtp packetsReceived. Never infer from an HTTP status. */
  packets?: number;
  /** Unit for the count: 'packets' (SFU inbound-rtp, default) or 'objects' (MoQ). */
  unit?: string;
  label?: string;
  onStage?: boolean;
  className?: string;
}): JSX.Element;
export declare function BroadcastStage(props: {
  status: RoomStatus;
  /** A <video autoPlay playsInline> bound to the pulled host track. */
  children?: React.ReactNode;
  hostName?: string;
  /** e.g. "Section 2 of 6" */
  section?: string;
  signal?: SignalState;
  packets?: number;
  /** Replace the picture with a stated reason. */
  empty?: 'camera-off' | 'silent' | 'not-configured' | 'agents';
  /** With empty: 'agents' — how many agents are working on the channel's content. */
  agents?: number;
  className?: string;
}): JSX.Element;
export declare function ParticipantTile(props: {
  name: string;
  isHost?: boolean;
  own?: boolean;
  mic?: 'on' | 'off';
  /** From measured audio level, not from mic-on. */
  speaking?: boolean;
  children?: React.ReactNode;
  className?: string;
}): JSX.Element;
export declare function MediaControls(props: {
  /** The server's advisory may_publish flag; the server re-checks every publish. */
  canPublish?: boolean;
  isHost?: boolean;
  mic?: boolean;
  camera?: boolean;
  sharing?: boolean;
  hand?: boolean;
  disabled?: boolean;
  onToggle?: (kind: 'mic' | 'camera' | 'share' | 'hand' | 'leave') => void;
  className?: string;
}): JSX.Element;
export declare function AttendanceList(props: {
  /** Room live AND connection live. */
  live: boolean;
  participants?: { id?: string | number; name: string; isHost?: boolean; hand?: boolean }[];
}): JSX.Element;
export declare function DiscussionMessage(props: { name: string; own?: boolean; time: string; body: string }): JSX.Element;

// ── Feed and broadcast platform ─────────────────────────────────────────
export type UtilizationLevel = 'EXISTS' | 'CONFIGURED' | 'CONNECTED' | 'USED' | 'VERIFIED' | 'REPEATED';

/** SFU is primary; MoQ is always marked Experimental. `level` is the measured utilization rung; omitted = UNMEASURED. */
export declare function TransportBadge(props: { transport: 'sfu' | 'moq'; level?: UtilizationLevel; onStage?: boolean; className?: string }): JSX.Element;
/** Measured latency. A missing `ms` renders "Unmeasured", never 0. */
export declare function LatencyReadout(props: { ms?: number; targetMs?: number; label?: string; source?: string; onStage?: boolean; className?: string }): JSX.Element;
export declare function UtilizationLadder(props: {
  title?: string;
  items: { id?: string; title: string; levels?: UtilizationLevel[]; evidence?: string }[];
}): JSX.Element;
export declare function RelayPath(props: {
  label?: string;
  hops: { role: 'publisher' | 'relay' | 'subscribers'; name: string; state?: 'measured' | 'unmeasured' | 'down'; latencyMs?: number; count?: number }[];
  className?: string;
}): JSX.Element;
/** A MoQ catalog: one row per track. Subscription changes go through onToggle; the relay decides. */
export declare function TrackCatalog(props: {
  namespace?: string;
  tracks: { name: string; label?: string; kind: 'video' | 'audio' | 'captions' | 'feed' | 'slides'; rendition?: string; subscribed?: boolean; state?: 'receiving' | 'stalled' | 'idle' | 'ended'; group?: number; object?: number }[];
  onToggle?: (name: string) => void;
  note?: string;
  disabled?: boolean;
}): JSX.Element;
export declare function ChannelCard(props: {
  title: string; host: string; status: RoomStatus; transport: 'sfu' | 'moq'; level?: UtilizationLevel;
  summary?: string; href?: string;
  /** Measured concurrent subscribers; omitted = "Audience unmeasured". */
  viewers?: number;
  /** For scheduled channels, e.g. "Thursday 14:00". */
  when?: string;
  className?: string;
}): JSX.Element;
export interface FeedItemProps {
  id?: string;
  kind: 'observation' | 'inferred' | 'judgment' | 'broadcast' | 'post' | 'correction';
  title: string; body?: string; href?: string;
  /** Sentinel cue lifecycle. RETRACTED strikes the item but keeps it readable. */
  status?: 'OPEN' | 'UNDER_REVIEW' | 'DISPOSITIONED' | 'RETRACTED';
  priority?: 'high' | 'medium' | 'low';
  /** Only with a scale and method. Missing = "Confidence unknown", never zero. */
  confidence?: { value: number; scale?: string; method?: string };
  /** Linked correction text shown under a revised or retracted item. */
  correction?: string;
  source?: string; evidence?: number;
  time: string; datetime?: string; unread?: boolean;
}
export declare function FeedItem(props: FeedItemProps): JSX.Element;
export declare function LiveFeed(props: {
  state: 'live' | 'paused' | 'degraded' | 'not-connected';
  items?: FeedItemProps[];
  kicker?: string; title?: string;
  /** Items that arrived while reading; shown only when the person asks. */
  newCount?: number; onShowNew?: () => void; onPause?: () => void;
  emptyText?: string; footer?: string | false; className?: string;
}): JSX.Element;

// ── Broadcaster, world and agent stats ──────────────────────────────────
export type Series = 'human' | 'agent';
export interface StatTileProps {
  label: string;
  /** Omitted = "Unmeasured", never 0. Auto-compacted (12.9K). */
  value?: number;
  unit?: string;
  delta?: { value: number; period: string; percent?: boolean; goodWhenUp?: boolean };
  /** 12 points, oldest first. */
  trend?: number[];
  series?: Series; icon?: IconName; note?: string; className?: string;
}
export declare function StatTile(props: StatTileProps): JSX.Element;
export type KestrelLabel = 'CANONICAL' | 'VERIFIED' | 'SOURCED' | 'RECALLED' | 'INFERRED' | 'UNVERIFIED' | 'DISPUTED' | 'REFUTED' | 'UNKNOWN';
/** VERIFIED/SOURCED without evidence render as UNVERIFIED. */
export declare function TrustLabel(props: { label: KestrelLabel; evidence?: string; className?: string }): JSX.Element;
export declare function BroadcasterCard(props: {
  name: string; handle?: string; role?: string; kicker?: string;
  status?: RoomStatus; verified?: boolean; bio?: string;
  stats?: StatTileProps[];
  /** An <img> avatar; initials otherwise. */
  children?: React.ReactNode; className?: string;
}): JSX.Element;
export declare function WorldAudience(props: {
  /** People (not sessions) per region. */
  regions: { name: string; value: number }[];
  total?: number;
  /** People whose region isn't shared; counted in words, not charted. */
  unknown?: number;
  /** Regions below this many people fold into "Region not shared" (default 5). */
  minCount?: number;
  period?: string; title?: string; note?: string; className?: string;
}): JSX.Element;
export declare function PresenceTimeline(props: {
  /** 24 entries, oldest first. */
  hours: { t: string; humans: number; agents: number }[];
  title?: string; className?: string;
}): JSX.Element;
export declare function ContentUse(props: {
  items: { title: string; humans: number; agents: number; how?: string }[];
  period?: string; title?: string; note?: string; className?: string;
}): JSX.Element;
export declare function AgentActivity(props: {
  tasks: {
    id?: string | number;
    kind: 'research' | 'improve' | 'verify';
    agent: string;
    status: 'running' | 'queued' | 'proposed' | 'accepted' | 'rejected' | 'blocked';
    target: string; result?: string;
    label?: KestrelLabel; evidence?: number; evidenceRef?: string; time?: string;
  }[];
  /** True while no people are watching. */
  unattended?: boolean;
  /** Agents active now; defaults to the number of running tasks. */
  working?: number;
  /** Proposals awaiting a person's review; defaults to the proposed tasks listed. */
  awaiting?: number;
  stats?: StatTileProps[];
  title?: string; footer?: string; className?: string;
}): JSX.Element;
