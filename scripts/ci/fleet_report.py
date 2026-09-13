#!/usr/bin/env python3
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/ci/fleet_report.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-WORKSPACE-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-11
# Depends:     scripts/deploy/roadmap_status.py
# EnumType:    Service
# EnumEdges:   USES_TEMPLATE scripts/deploy/roadmap_status.py;
#              PRODUCES apps/web/public/fleet-status.json;
#              PRODUCES apps/web/public/platform-health.json;
#              VERIFIED_BY apps/web/src/pages/workspace/FleetPage.jsx;
#              VERIFIED_BY apps/web/src/pages/workspace/PlatformHealthPage.jsx
# Intent:      Project the recorded NNC fleet snapshot and platform assessment
#              into the two files the workspace pages read, carrying the
#              measurement timestamp so the pages can state staleness instead
#              of implying the numbers are live.
# ───────────────────────────────────────────────────────────────
"""fleet_report.py - writes the two static JSON files the Fleet and Platform
Health workspace pages read.

Same pattern as ``scripts/deploy/roadmap_status.py``: run before the build,
write into ``apps/web/public/``, let Vite copy ``public/`` verbatim into
``dist``. No separate publish step, no runtime backend dependency.

What this script is NOT: a live poller. The host, container and platform
figures below are a *recorded observation* of the Citadel NNC taken from
Datadog on ``OBSERVED_AT``, transcribed here by hand. ``observed_at`` travels
with the payload so the pages can label the age of the reading rather than
present a transcription as a live gauge. When the assessment tooling in the
private plane is reachable from CI, replace the two ``_snapshot`` functions
with reads against it - the emitted schema is the contract, not the constants.

stdlib only, by design: this runs in the build image before ``npm ci`` has
necessarily finished, and a report generator that can fail the build on a
dependency resolution is worse than no report.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PUBLIC_DIR = ROOT / "apps" / "web" / "public"
FLEET_OUT = PUBLIC_DIR / "fleet-status.json"
PLATFORM_OUT = PUBLIC_DIR / "platform-health.json"

SCHEMA_VERSION = 1

# Wall-clock of the Datadog reading transcribed below. Bump this and the
# figures together, never one without the other - a fresh timestamp over stale
# numbers is the one failure mode this field exists to prevent.
OBSERVED_AT = "2026-09-11T00:00:00+00:00"
OBSERVED_VIA = "datadog:infrastructure-list"

# Container type taxonomy. The pages colour by this, so it is defined once,
# here, next to the data it classifies.
AGENT = "agent"
APPLICATION = "application"
DATABASE = "database"
INFRASTRUCTURE = "infrastructure"


def _c(name: str, image: str, kind: str) -> dict:
    """Build one container record.

    Args:
        name: Container name as reported by the Datadog agent.
        image: Image reference, short form.
        kind: One of agent, application, database, infrastructure.

    Returns:
        A container entry for the fleet payload.
    """
    return {"name": name, "image": image, "kind": kind, "state": "running"}


PLANES = [
    {
        "id": "control",
        "label": "Control plane",
        "region": "DigitalOcean NYC3",
        "summary": "Guild seats, orchestration, and the NATS hub the mesh leaves dial into.",
    },
    {
        "id": "operations",
        "label": "Operations plane",
        "region": "Hostinger KOE",
        "summary": "Production services, CI runner, and the public-facing estate.",
    },
    {
        "id": "intelligence",
        "label": "Intelligence plane",
        "region": "DigitalOcean TOR1",
        "summary": "Small-model mesh, retrieval, and the data generation flywheel.",
    },
]

HOSTS = [
    {
        "hostname": "CNI-SERVICE-BOX-ONE",
        "short": "BOX-ONE",
        "plane": "control",
        "provider": "DigitalOcean",
        "region": "nyc3",
        "role": "ops-panel / ray-head / nats-hub",
        "env": "production",
        "agent_version": "7.79.2",
        "cpu_pct": 14.1,
        "memory_gb": 7.0,
        "nats_role": "hub",
        "containers": [
            _c("guild-mcp-forge", "guild-mcp:latest", AGENT),
            _c("guild-mcp-anvil", "guild-mcp:latest", AGENT),
            _c("guild-mcp-scholar", "guild-mcp:latest", AGENT),
            _c("guild-mcp-quill", "guild-mcp:latest", AGENT),
            _c("guild-mcp-muse", "guild-mcp:latest", AGENT),
            _c("guild-mcp-finance", "guild-mcp:latest", AGENT),
            _c("guild-mcp-director", "guild-mcp:latest", AGENT),
            _c("guild-mcp-oracle", "guild-mcp:latest", AGENT),
            _c("nats-hub", "nats:2.10", INFRASTRUCTURE),
            _c("guild-comms-bridge", "guild-comms:latest", AGENT),
            _c("guild-comms-webhook", "guild-comms:latest", AGENT),
            _c("n8n", "n8nio/n8n", APPLICATION),
            _c("ollama", "ollama/ollama", APPLICATION),
            _c("cloudflared", "cloudflare/cloudflared", INFRASTRUCTURE),
            _c("code-server", "codercom/code-server", APPLICATION),
            _c("dd-agent", "datadog/agent:7.79.2", AGENT),
        ],
    },
    {
        "hostname": "CNI-SERVICE-BOX-TWO",
        "short": "BOX-TWO",
        "plane": "control",
        "provider": "DigitalOcean",
        "region": "nyc3",
        "role": "memory-store / gnn-dkg",
        "env": "production",
        "agent_version": "7.79.2",
        "cpu_pct": 44.4,
        "memory_gb": 7.2,
        "nats_role": "leaf",
        "containers": [
            _c("supabase-db", "postgres:17", DATABASE),
            _c("supabase-auth", "supabase/gotrue", APPLICATION),
            _c("supabase-storage", "supabase/storage-api", APPLICATION),
            _c("supabase-studio", "supabase/studio", APPLICATION),
            _c("supabase-kong", "kong:2.8", INFRASTRUCTURE),
            _c("supabase-edge-runtime", "supabase/edge-runtime", APPLICATION),
            _c("supabase-imgproxy", "darthsim/imgproxy", APPLICATION),
            _c("supabase-meta", "supabase/postgres-meta", APPLICATION),
            _c("supabase-realtime", "supabase/realtime", APPLICATION),
            _c("firecrawl-api", "firecrawl/api", APPLICATION),
            _c("firecrawl-playwright", "firecrawl/playwright", APPLICATION),
            _c("firecrawl-redis", "redis:7", DATABASE),
            _c("firecrawl-rabbitmq", "rabbitmq:3", INFRASTRUCTURE),
            _c("firecrawl-postgres", "postgres:16", DATABASE),
            _c("firecrawl-searxng", "searxng/searxng", APPLICATION),
            _c("ollama", "ollama/ollama", APPLICATION),
            _c("nats-leaf", "nats:2.10", INFRASTRUCTURE),
            _c("guild-comms-bridge", "guild-comms:latest", AGENT),
            _c("guild-comms-webhook", "guild-comms:latest", AGENT),
            _c("cloudflared", "cloudflare/cloudflared", INFRASTRUCTURE),
            _c("dd-agent", "datadog/agent:7.79.2", AGENT),
        ],
    },
    {
        "hostname": "citadel-vps-hq",
        "short": "vps-hq",
        "plane": "operations",
        "provider": "Hostinger",
        "region": "koe",
        "role": "vps-hq",
        "env": "production",
        "agent_version": "7.78.1",
        "cpu_pct": 7.3,
        "memory_gb": 30.0,
        "nats_role": "hub",
        "containers": [
            _c("gitlab-runner", "gitlab/gitlab-runner", INFRASTRUCTURE),
            _c("n8n", "n8nio/n8n", APPLICATION),
            _c("twenty-server", "twentycrm/twenty", APPLICATION),
            _c("nats", "nats:2.10", INFRASTRUCTURE),
            _c("livekit", "livekit/livekit-server", APPLICATION),
            _c("stalwart-mail", "stalwartlabs/mail-server", APPLICATION),
            _c("silverbullet", "silverbulletmd/silverbullet", APPLICATION),
            _c("halo-site", "halohub/halo", APPLICATION),
            _c("imtb-d-relay", "imtb-d/relay", APPLICATION),
            _c("twenty-postgres", "postgres:16", DATABASE),
            _c("calcom-postgres", "postgres:16", DATABASE),
            _c("redis", "redis:7", DATABASE),
            _c("cloudflared", "cloudflare/cloudflared", INFRASTRUCTURE),
            _c("dd-agent", "datadog/agent:7.78.1", AGENT),
        ],
    },
    {
        "hostname": "ubuntu-s-4vcpu-8gb-240gb-intel-tor1",
        "short": "tor1",
        "plane": "intelligence",
        "provider": "DigitalOcean",
        "region": "tor1",
        "role": "small-model-mesh",
        "env": "production",
        "agent_version": "7.79.2",
        "cpu_pct": 64.7,
        "memory_gb": 7.3,
        "nats_role": "leaf",
        "containers": [
            _c("ollama", "ollama/ollama", APPLICATION),
            _c("nats-leaf", "nats:2.10", INFRASTRUCTURE),
            _c("guild-comms-bridge", "guild-comms:latest", AGENT),
            _c("guild-comms-webhook", "guild-comms:latest", AGENT),
            _c("dd-agent", "datadog/agent:7.79.2", AGENT),
        ],
    },
    {
        "hostname": "ubuntu-s-4vcpu-8gb-240gb-intel-tor1-02",
        "short": "tor1-02",
        "plane": "intelligence",
        "provider": "DigitalOcean",
        "region": "tor1",
        "role": "small-model-mesh",
        "env": "production",
        "agent_version": "7.79.2",
        "cpu_pct": 3.0,
        "memory_gb": 5.9,
        "nats_role": "leaf",
        "containers": [
            _c("ollama", "ollama/ollama", APPLICATION),
            _c("nats-leaf", "nats:2.10", INFRASTRUCTURE),
            _c("guild-comms-bridge", "guild-comms:latest", AGENT),
            _c("guild-comms-webhook", "guild-comms:latest", AGENT),
            _c("dd-agent", "datadog/agent:7.79.2", AGENT),
        ],
    },
    {
        "hostname": "ubuntu-s-4vcpu-8gb-240gb-intel-tor1-03",
        "short": "tor1-03",
        "plane": "intelligence",
        "provider": "DigitalOcean",
        "region": "tor1",
        "role": "rag-retrieval",
        "env": "production",
        "agent_version": "7.79.2",
        "cpu_pct": 7.1,
        "memory_gb": 6.7,
        "nats_role": "leaf",
        "containers": [
            _c("ollama", "ollama/ollama", APPLICATION),
            _c("nats-leaf", "nats:2.10", INFRASTRUCTURE),
            _c("guild-comms-bridge", "guild-comms:latest", AGENT),
            _c("guild-comms-webhook", "guild-comms:latest", AGENT),
            _c("workshop-redis", "redis:7", DATABASE),
            _c("cloudflared", "cloudflare/cloudflared", INFRASTRUCTURE),
            _c("dd-agent", "datadog/agent:7.79.2", AGENT),
        ],
    },
    {
        "hostname": "ubuntu-s-4vcpu-8gb-240gb-intel-tor1-04",
        "short": "tor1-04",
        "plane": "intelligence",
        "provider": "DigitalOcean",
        "region": "tor1",
        "role": "data-gen-flywheel",
        "env": "production",
        "agent_version": "7.79.2",
        "cpu_pct": 6.4,
        "memory_gb": 6.6,
        "nats_role": "leaf",
        "containers": [
            _c("ollama", "ollama/ollama", APPLICATION),
            _c("nats-leaf", "nats:2.10", INFRASTRUCTURE),
            _c("guild-comms-bridge", "guild-comms:latest", AGENT),
            _c("guild-comms-webhook", "guild-comms:latest", AGENT),
            _c("twenty-server", "twentycrm/twenty", APPLICATION),
            _c("twenty-worker", "twentycrm/twenty", APPLICATION),
            _c("mautic-app", "mautic/mautic", APPLICATION),
            _c("mautic-cron", "mautic/mautic", APPLICATION),
            _c("mariadb", "mariadb:11", DATABASE),
            _c("postgres", "postgres:16", DATABASE),
            _c("redis", "redis:7", DATABASE),
            _c("cloudflared", "cloudflare/cloudflared", INFRASTRUCTURE),
            _c("dd-agent", "datadog/agent:7.79.2", AGENT),
        ],
    },
]

# Monitors in the alert state at OBSERVED_AT. Monitors reporting "no data" are
# deliberately excluded: an unfired aspirational monitor is not an alert, and
# counting it as one inflates the number the operator triages against.
ALERTS = [
    {
        "monitor": "System load high",
        "severity": "high",
        "scope": "ubuntu-s-4vcpu-8gb-240gb-intel-tor1",
        "detail": "Load driven by Ollama inference on the tor1 small-model mesh.",
    },
    {
        "monitor": "BuildAndDo front door",
        "severity": "critical",
        "scope": "synthetics",
        "detail": "Public site probe failing.",
    },
    {
        "monitor": "Creator Floor silent",
        "severity": "medium",
        "scope": "citadel.creator.activity",
        "detail": "No creator activity events recorded in the last hour.",
    },
    {
        "monitor": "Cloudflare cache hit rate below 5 percent",
        "severity": "medium",
        "scope": "cloudflare",
        "detail": "Origin is serving requests the edge should be caching.",
    },
]

# Platform feature assessment. `unknown` is not `unused`: a 403 from an
# unentitled plan says nothing about whether the feature would be used, so
# unknown is excluded from the utilization denominator below.
STATUS_CONFIGURED = "configured"
STATUS_UNDERUSED = "underused"
STATUS_UNUSED = "unused"
STATUS_UNKNOWN = "unknown"

PLATFORMS = [
    {
        "id": "datadog",
        "label": "Datadog",
        "state": "connected",
        "verified": True,
        "detail": "Agents reporting on all 7 hosts; application layer partially dark.",
        "first_detected": "2026-08-14",
        "features": [
            {"name": "Infrastructure metrics", "status": STATUS_CONFIGURED,
             "recommendation": "None. Agents report on every host."},
            {"name": "Live containers", "status": STATUS_CONFIGURED,
             "recommendation": "None. All 81 containers visible."},
            {"name": "Log management", "status": STATUS_UNDERUSED,
             "recommendation": "Add com.datadoghq.tags.service and .env labels so logs correlate."},
            {"name": "APM tracing", "status": STATUS_UNUSED,
             "recommendation": "Add ddtrace to the guild-mcp image and set DD_SERVICE per seat."},
            {"name": "RUM", "status": STATUS_CONFIGURED,
             "recommendation": "None. Browser SDK initialised with PII scrubbing."},
            {"name": "Error Tracking", "status": STATUS_UNDERUSED,
             "recommendation": "Backend error grouping needs APM before it reports."},
            {"name": "Synthetics", "status": STATUS_CONFIGURED,
             "recommendation": "None. Front door probe is live and currently alerting."},
            {"name": "Database monitoring", "status": STATUS_UNUSED,
             "recommendation": "Enable dbm on the six Postgres instances with per-host credentials."},
            {"name": "NATS integration", "status": STATUS_UNUSED,
             "recommendation": "Drop conf.d/nats.d/conf.yaml; autodiscovery already sees the containers."},
            {"name": "Redis integration", "status": STATUS_UNUSED,
             "recommendation": "Enable conf.d/redis.d for the three Redis instances."},
            {"name": "Continuous profiler", "status": STATUS_UNUSED,
             "recommendation": "Blocked on APM. Sequence after tracing lands."},
            {"name": "CI Visibility", "status": STATUS_UNDERUSED,
             "recommendation": "DORA workflow reports; test events from the GitLab runner do not."},
            {"name": "LLM Observability", "status": STATUS_UNUSED,
             "recommendation": "Instrument the Ollama call path on the intelligence plane."},
            {"name": "Cloud SIEM", "status": STATUS_UNKNOWN,
             "recommendation": "Entitlement not readable from the current key."},
            {"name": "Workflow automation", "status": STATUS_CONFIGURED,
             "recommendation": "None. Monitor-triggered workflows in place."},
            {"name": "Service catalog", "status": STATUS_UNUSED,
             "recommendation": "Bulk register the services with owners and runbooks."},
        ],
    },
    {
        "id": "posthog",
        "label": "PostHog",
        "state": "connected",
        "verified": True,
        "detail": "Product analytics live; correlation keys not yet shared with Datadog.",
        "first_detected": "2026-08-20",
        "features": [
            {"name": "Event capture", "status": STATUS_CONFIGURED,
             "recommendation": "None. Web client initialises telemetry at startup."},
            {"name": "Session replay", "status": STATUS_UNUSED,
             "recommendation": "Enable with masking before recording authenticated sessions."},
            {"name": "Feature flags", "status": STATUS_UNUSED,
             "recommendation": "No flag system is wired to the web app yet."},
            {"name": "Experiments", "status": STATUS_UNUSED,
             "recommendation": "Blocked on feature flags."},
            {"name": "Cohorts", "status": STATUS_UNDERUSED,
             "recommendation": "Define the cohorts Datadog incident enrichment would query."},
            {"name": "Webhooks", "status": STATUS_UNUSED,
             "recommendation": "Point product events at the Datadog Events API for correlation."},
            {"name": "Surveys", "status": STATUS_UNUSED,
             "recommendation": "Low priority until the workspace has recurring users."},
            {"name": "Data warehouse export", "status": STATUS_UNKNOWN,
             "recommendation": "Plan entitlement not readable from the current key."},
        ],
    },
    {
        "id": "gitlab",
        "label": "GitLab CE",
        "state": "connected",
        "verified": True,
        "detail": "Self-hosted CE with a runner on citadel-vps-hq; scanners not enabled.",
        "first_detected": "2026-07-02",
        "features": [
            {"name": "Projects API", "status": STATUS_CONFIGURED,
             "recommendation": "None."},
            {"name": "Pipelines", "status": STATUS_CONFIGURED,
             "recommendation": "None. Candidate mirror pipeline runs on push."},
            {"name": "Runners", "status": STATUS_CONFIGURED,
             "recommendation": "None. One runner registered on citadel-vps-hq."},
            {"name": "Merge request automation", "status": STATUS_UNDERUSED,
             "recommendation": "Mirror the public actor-label gate onto the private plane."},
            {"name": "Container registry", "status": STATUS_UNDERUSED,
             "recommendation": "Images are built but not retained with digests."},
            {"name": "Security scanners", "status": STATUS_UNUSED,
             "recommendation": "Enable SAST and dependency scanning on the CE templates."},
        ],
    },
    {
        "id": "hostinger",
        "label": "Hostinger",
        "state": "hold",
        "verified": False,
        "detail": "API bridge written but never exercised. Every reading below is unverified.",
        "first_detected": "2026-09-01",
        "features": [
            {"name": "VPS inventory API", "status": STATUS_UNKNOWN,
             "recommendation": "Awaiting an API token; the bridge cannot be exercised without one."},
            {"name": "SSH readback", "status": STATUS_UNKNOWN,
             "recommendation": "Awaiting credentials. Access remains unproven, not assumed."},
            {"name": "Snapshot management", "status": STATUS_UNKNOWN,
             "recommendation": "Blocked on the same token."},
            {"name": "DNS management", "status": STATUS_UNKNOWN,
             "recommendation": "Blocked on the same token."},
        ],
    },
]

# Ranked remediation list. `impact` is the operator-facing reason, `effort` is
# one of config, code, infrastructure - the three buckets that decide who
# picks the item up.
RECOMMENDATIONS = [
    {"rank": 1, "platform": "datadog", "action": "Add ddtrace to the guild-mcp image and set DD_SERVICE per seat",
     "effort": "code", "impact": "Eight agent seats stop being dark in APM."},
    {"rank": 2, "platform": "datadog", "action": "Tag containers with com.datadoghq.tags.service and .env",
     "effort": "config", "impact": "Logs, metrics and traces correlate on one service key."},
    {"rank": 3, "platform": "hostinger", "action": "Issue an API token and run the bridge readback",
     "effort": "infrastructure", "impact": "Removes the last unverified platform from the estate."},
    {"rank": 4, "platform": "datadog", "action": "Enable the NATS integration on every leaf",
     "effort": "config", "impact": "Consumer lag across the seven-host mesh becomes measurable."},
    {"rank": 5, "platform": "datadog", "action": "Enable Database Monitoring on the six Postgres instances",
     "effort": "config", "impact": "Query-level visibility on the memory plane's hottest host."},
    {"rank": 6, "platform": "posthog", "action": "Forward product events to the Datadog Events API",
     "effort": "config", "impact": "Product truth and operational truth land on one timeline."},
    {"rank": 7, "platform": "gitlab", "action": "Enable SAST and dependency scanning on the CE templates",
     "effort": "config", "impact": "Supply-chain findings surface before the candidate mirror runs."},
    {"rank": 8, "platform": "datadog", "action": "Register the running services in the service catalog",
     "effort": "config", "impact": "Ownership and runbooks resolve from an alert."},
    {"rank": 9, "platform": "datadog", "action": "Instrument the Ollama call path for LLM Observability",
     "effort": "code", "impact": "Inference cost and latency on the intelligence plane become attributable."},
    {"rank": 10, "platform": "posthog", "action": "Enable session replay with input masking",
     "effort": "config", "impact": "Failed workspace sessions become reviewable without guessing."},
]

# When each integration was first observed reporting. Drives the adoption
# timeline; counts are cumulative platforms live at that date.
INTEGRATION_TIMELINE = [
    {"date": "2026-07-02", "platforms": 1, "event": "GitLab CE runner registered"},
    {"date": "2026-08-14", "platforms": 2, "event": "Datadog agents deployed fleet-wide"},
    {"date": "2026-08-20", "platforms": 3, "event": "PostHog capture initialised in the web client"},
    {"date": "2026-09-01", "platforms": 3, "event": "Hostinger bridge written, unverified"},
    {"date": "2026-09-11", "platforms": 3, "event": "Fleet and platform assessment projected to the workspace"},
]


def _utilization(features: list[dict]) -> dict:
    """Score one platform's feature utilization.

    Unknown features are counted but excluded from the denominator: a feature
    whose entitlement cannot be read is not evidence of disuse.

    Args:
        features: Feature entries for a single platform.

    Returns:
        Per-status counts, the scored denominator, and a percentage or None
        when nothing is knowable.
    """
    counts = {
        STATUS_CONFIGURED: 0,
        STATUS_UNDERUSED: 0,
        STATUS_UNUSED: 0,
        STATUS_UNKNOWN: 0,
    }
    for feature in features:
        counts[feature["status"]] = counts.get(feature["status"], 0) + 1

    scored = counts[STATUS_CONFIGURED] + counts[STATUS_UNDERUSED] + counts[STATUS_UNUSED]
    # Underused counts as half: the feature is on, but not carrying its weight.
    earned = counts[STATUS_CONFIGURED] + (counts[STATUS_UNDERUSED] * 0.5)
    return {
        "counts": counts,
        "assessed": len(features),
        "scored": scored,
        "pct": round((earned / scored) * 100, 1) if scored else None,
    }


def _fleet_snapshot() -> dict:
    """Build the fleet-status payload.

    Returns:
        The full fleet document, including per-plane rollups and totals.
    """
    hosts = []
    for host in HOSTS:
        containers = host["containers"]
        by_kind: dict[str, int] = {}
        for container in containers:
            by_kind[container["kind"]] = by_kind.get(container["kind"], 0) + 1
        hosts.append({**host, "container_count": len(containers), "containers_by_kind": by_kind})

    planes = []
    for plane in PLANES:
        members = [h for h in hosts if h["plane"] == plane["id"]]
        planes.append({
            **plane,
            "host_count": len(members),
            "container_count": sum(h["container_count"] for h in members),
            "hostnames": [h["hostname"] for h in members],
        })

    total_containers = sum(h["container_count"] for h in hosts)
    running = sum(
        1 for h in hosts for c in h["containers"] if c["state"] == "running"
    )

    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "observed_at": OBSERVED_AT,
        "observed_via": OBSERVED_VIA,
        "state": "MEASURED",
        "totals": {
            "hosts": len(hosts),
            "containers": total_containers,
            "containers_running": running,
            "containers_not_running": total_containers - running,
            "planes": len(planes),
            "alerts": len(ALERTS),
            "agent_versions": sorted({h["agent_version"] for h in hosts}),
        },
        "planes": planes,
        "hosts": hosts,
        "alerts": ALERTS,
    }


def _platform_snapshot() -> dict:
    """Build the platform-health payload.

    Returns:
        The full platform document, including per-platform utilization.
    """
    platforms = []
    for platform in PLATFORMS:
        platforms.append({**platform, "utilization": _utilization(platform["features"])})

    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "observed_at": OBSERVED_AT,
        "observed_via": "platform-assessment:read-only-discovery",
        "state": "MEASURED",
        "totals": {
            "platforms": len(platforms),
            "connected": sum(1 for p in platforms if p["state"] == "connected"),
            "unverified": sum(1 for p in platforms if not p["verified"]),
            "features_assessed": sum(len(p["features"]) for p in platforms),
        },
        "platforms": platforms,
        "recommendations": RECOMMENDATIONS,
        "integration_timeline": INTEGRATION_TIMELINE,
    }


def _write(path: Path, payload: dict) -> None:
    """Write one JSON document, creating the public directory if needed.

    Args:
        path: Destination file.
        payload: Document to serialise.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    """Write both reports and print a one-line summary of each.

    Args:
        argv: Command line arguments, or None to read from sys.argv.

    Returns:
        Process exit code. 0 on success, 1 when --check finds a drifted total.
    """
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--check",
        action="store_true",
        help="Validate the snapshot totals without writing any file.",
    )
    args = parser.parse_args(argv)

    fleet = _fleet_snapshot()
    platform = _platform_snapshot()

    # The one invariant worth guarding: the recorded reading is 7 hosts and 81
    # containers. If an edit to HOSTS moves either, the transcription no longer
    # matches the observation it claims to be.
    expected = {"hosts": 7, "containers": 81}
    actual = {k: fleet["totals"][k] for k in expected}
    drifted = actual != expected

    if args.check:
        print(json.dumps({
            "state": "FAIL" if drifted else "PASS",
            "expected": expected,
            "actual": actual,
        }, indent=2))
        return 1 if drifted else 0

    if drifted:
        # A warning, not a failure: the fleet is allowed to change. The build
        # must not break because a host was added, but the operator should see
        # that OBSERVED_AT now describes a different estate.
        print(json.dumps({
            "warning": "fleet totals differ from the recorded observation",
            "expected": expected,
            "actual": actual,
        }, indent=2))

    _write(FLEET_OUT, fleet)
    _write(PLATFORM_OUT, platform)

    print(json.dumps({
        "fleet_status": str(FLEET_OUT.relative_to(ROOT)),
        "platform_health": str(PLATFORM_OUT.relative_to(ROOT)),
        "observed_at": OBSERVED_AT,
        "fleet_totals": fleet["totals"],
        "platform_totals": platform["totals"],
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
