# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/discordbot/doctor.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-QUIZ-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001, VCC-BUILDANDDO-QUIZ-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-15
# Depends:     scripts/discordbot/contracts.py, scripts/discordbot/research.py, scripts/discordbot/dossier.py, apps/research/contracts.py
# EnumType:    Service
# EnumEdges:   CONSUMES scripts/discordbot/contracts.py; CONSUMES scripts/discordbot/research.py; CONSUMES scripts/discordbot/dossier.py; CONSUMES apps/research/contracts.py
# DAG Node:    none
# Intent:      Report actual local bot and worker prerequisites without exposing configuration values, contacting services or implying runtime activation.
# ───────────────────────────────────────────────────────────────

"""Inspect local startup prerequisites without launching or contacting a service."""
from __future__ import annotations

import argparse
from collections.abc import Callable, Mapping
import importlib.util
import json
import os
from pathlib import Path
import sys

from apps.research.contracts import Endpoint, ProcessorSettings, ResearchError, identifier
from scripts.discordbot.contracts import ConfigurationError, Settings
from scripts.discordbot.dossier import DOSSIER_COMMANDS
from scripts.discordbot.grading import MINIMUM_TOKEN, TOKEN_VARIABLE
from scripts.discordbot.research import RESEARCH_COMMANDS, bindings_from_env
from scripts.discordbot.service import COMMANDS

ROOT = Path(__file__).resolve().parents[2]


def installed(name: str) -> bool:
    """Check module availability without importing the Discord adapter."""
    try:
        return importlib.util.find_spec(name) is not None
    except (ImportError, ValueError):
        return False


def inspect_startup(component: str, env: Mapping[str, str], *, root: Path = ROOT,
                    available: Callable[[str], bool] = installed, python_version: tuple[int, int] | None = None) -> dict[str, object]:
    """Validate source and startup settings without reading dotenv files or printing values."""
    checks: list[dict[str, str]] = []

    def check(name: str, valid: bool, explanation: str) -> None:
        checks.append({"check": name, "state": "PASS" if valid else "FAIL", "detail": explanation})

    version = python_version or (sys.version_info.major, sys.version_info.minor)
    check("python", version >= (3, 11), "Python 3.11 or later is required; CI uses Python 3.12.")
    files = ["apps/research/contracts.py", "apps/research/transport.py"]
    if component == "bot":
        files += [f"scripts/discordbot/{name}.py" for name in ("bot", "contracts", "catalogue", "public_data", "service", "research", "dossier", "grading")]
    elif component == "worker":
        files += [f"apps/research/{name}.py" for name in ("worker", "documents", "processing")]
    else:
        raise ValueError("Choose bot or worker.")
    check("source_bundle", all((root / name).is_file() for name in files), "Use the complete source package, not a single copied script.")
    count = 0
    if component == "bot":
        check("discord_sdk", available("discord"), "The declared Discord.py runtime must be installed in the service's Python environment.")
        check("bot_token_binding", bool(env.get("BAD_DISCORD", "").strip()), "The existing BAD_DISCORD binding must be present in this process; its value is never reported.")
        grading = env.get(TOKEN_VARIABLE, "").strip()
        if not grading:
            checks.append({"check": "quiz_grading", "state": "DISABLED", "detail":
                           "No community bot token is configured; the quiz asks questions and reports grading as unavailable."})
        else:
            try:
                Endpoint(env.get("BUILDANDDO_POCKETBASE_URL", ""))
                usable = len(grading) >= MINIMUM_TOKEN
            except ResearchError:
                usable = False
            check("quiz_grading", usable, f"Quiz grading needs BUILDANDDO_POCKETBASE_URL and a {TOKEN_VARIABLE} of at least {MINIMUM_TOKEN} characters; values are never reported.")
        try:
            settings = Settings.from_env(env)
            bindings = bindings_from_env(env)
            count = len(COMMANDS) + (len(RESEARCH_COMMANDS) + len(DOSSIER_COMMANDS) if bindings else 0)
            if bindings:
                Endpoint(env.get("BUILDANDDO_POCKETBASE_URL", ""))
                if not env.get("BUILDANDDO_DISCORD_PB_TOKEN", "").strip():
                    raise ResearchError("configuration")
                if any((settings.guild_ids and row.guild not in settings.guild_ids) or
                       (settings.channel_ids and row.channel not in settings.channel_ids) for row in bindings):
                    raise ResearchError("configuration")
            check("bot_configuration", True, "Scope, sync mode and optional private bridge configuration are locally valid.")
            checks.append({"check": "registration", "state": "UNVERIFIED", "detail":
                           "Startup is configured to synchronize commands; the runtime owner must authorize that action." if settings.sync != "none" else
                           "Startup will not synchronize commands. Existing Discord registration must be verified separately."})
            checks.append({"check": "private_backend", "state": "UNVERIFIED" if bindings else "DISABLED", "detail":
                           "Native OAuth, current membership, enabled integration and server-side dossier encryption need backend acceptance." if bindings else
                           "Only public teaching commands are configured; private research and dossier commands are disabled."})
        except (ConfigurationError, ResearchError):
            check("bot_configuration", False, "Review server/channel allowlists, sync mode and the existing native PocketBase bridge binding. No values are included here.")
    else:
        check("research_token_binding", bool(env.get("BUILDANDDO_RESEARCH_TOKEN", "").strip()), "The existing research worker auth binding must be present; its value is never reported.")
        check("pdf_parser", available("pypdf"), "The declared native PDF parser is required for document processing acceptance.")
        try:
            Endpoint(env.get("BUILDANDDO_POCKETBASE_URL", ""))
            identifier(env.get("BUILDANDDO_RESEARCH_WORKSPACE", ""))
            settings_worker = ProcessorSettings.from_env(env)
            if settings_worker.firecrawl and env.get("BUILDANDDO_FIRECRAWL_EGRESS_GUARDED") != "1":
                raise ResearchError("configuration")
            check("worker_configuration", True, "The existing workspace, backend and optional parser settings are locally valid.")
            for name, configured in [("firecrawl", settings_worker.firecrawl is not None), ("transcription", settings_worker.transcription is not None)]:
                checks.append({"check": name, "state": "UNVERIFIED" if configured else "DISABLED",
                               "detail": "Configured provider needs live contract and egress verification." if configured else "This provider is not configured in this process."})
        except ResearchError:
            check("worker_configuration", False, "Review the worker workspace, native backend, parser configuration and crawler egress assertion.")
    ready = all(row["state"] != "FAIL" for row in checks)
    return {"component": component, "local_prerequisites": "PASS" if ready else "FAIL", "defined_command_count": count,
            "checks": checks, "runtime_state": "UNVERIFIED", "service_launcher": "UNVERIFIED",
            "scope": "Local inspection only: no network requests, authentication, command synchronization, messages or process startup."}


def main(argv: list[str] | None = None) -> int:
    """Print redacted prerequisites and return failure when a local dependency is missing."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--component", choices=("bot", "worker"), default="bot")
    args = parser.parse_args(argv)
    report = inspect_startup(args.component, os.environ)
    print(json.dumps(report, indent=2))
    return 0 if report["local_prerequisites"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
