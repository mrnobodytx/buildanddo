# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/shared/federal_foundry/execution.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/shared/federal_foundry/interfaces.py, foundry/shared/federal_foundry/validation.py, apps/mission_suite/bundle.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON foundry/shared/federal_foundry/interfaces.py; DEPENDS_ON foundry/shared/federal_foundry/validation.py; DEPENDS_ON apps/mission_suite/bundle.py
# DAG Node:    none
# Intent:      Execute bounded local workloads and retain reproducible inputs, actual outcomes and checked artifact bytes.
# ───────────────────────────────────────────────────────────────

"""Execute isolated local workloads and verify their retained receipts."""

from __future__ import annotations

import asyncio
from contextlib import suppress
from datetime import datetime, timezone
import os
from pathlib import Path
import platform
import signal
import sys
import time
from typing import BinaryIO

from apps.mission_suite.bundle import SOURCE_FILES
from .interfaces import ExperimentResult, ExperimentSpec
from .models import EvidenceRecord, FoundryValidationError
from .validation import (
    canonical,
    decode,
    digest,
    finite,
    integer,
    mapping,
    read_bytes,
    read_json,
    relative_path,
    strings,
    verify_manifest,
    write_json,
)

RUN_VERSION = "foundry.run/v1"


def source_manifest(repository: Path) -> dict[str, str]:
    """Fingerprint the executable foundry and its reused maritime source closure."""
    paths = {
        path.relative_to(repository).as_posix()
        for path in (repository / "foundry/shared/federal_foundry").glob("*.py")
    }
    if not paths:
        raise FoundryValidationError("missing foundry source")
    paths.update(SOURCE_FILES)
    paths.update({"foundry/__init__.py", "foundry/shared/__init__.py"})
    return {name: digest(read_bytes(repository, name)) for name in sorted(paths)}


def computational_digest(measurement: dict[str, object]) -> str:
    """Fingerprint domain results separately from elapsed time and allocation peaks."""
    return digest(
        canonical(
            {key: value for key, value in measurement.items() if key != "resources"}
        )
    )


def _measurement(value: object, spec: ExperimentSpec) -> dict[str, object]:
    document = mapping(value, "measurement")
    if "metrics" not in document:
        raise FoundryValidationError("measurement lacks metrics")
    metrics = mapping(document["metrics"], "metrics")
    if not metrics:
        raise FoundryValidationError("measurement metrics are empty")
    for name, value in metrics.items():
        if not name.strip():
            raise FoundryValidationError("measurement name is empty")
        finite(value, name)
    for field in ("lane_id", "candidate_id"):
        if field in spec.inputs and document.get(field) != spec.inputs[field]:
            raise FoundryValidationError(f"measurement {field} differs from input")
    if "seed" in document and document["seed"] != spec.seed:
        raise FoundryValidationError("measurement seed differs from request")
    if "resources" in document:
        resources = mapping(document["resources"], "resources")
        for field in ("elapsed_ms", "peak_python_bytes"):
            if finite(resources.get(field), field) < 0:
                raise FoundryValidationError("resource measurement cannot be negative")
    return document


class LocalExperimentRunner:
    """Run explicit argv without a shell, with wall-clock and output bounds.

    This is a local execution boundary for reviewed code, not an OS security
    sandbox. It supplies a minimal environment and never executes registry text.
    """

    def __init__(
        self,
        repository_root: Path,
        *,
        timeout_seconds: float = 30.0,
        log_limit: int = 65536,
    ) -> None:
        self.repository = repository_root.resolve()
        self.timeout = finite(timeout_seconds, "timeout_seconds")
        if not 0 < self.timeout <= 300:
            raise FoundryValidationError("timeout_seconds must be in (0, 300]")
        self.log_limit = integer(log_limit, 256, 4 * 1024 * 1024, "log_limit")

    async def run(self, spec: ExperimentSpec, workspace: Path) -> ExperimentResult:
        """Run one attempt and preserve a receipt even when it fails or is cancelled."""
        workspace = workspace.absolute()
        if workspace.is_relative_to(self.repository / "foundry"):
            raise FoundryValidationError(
                "run workspace must be outside authored foundry source"
            )
        for parent in (workspace, *workspace.parents):
            if parent.is_symlink():
                raise FoundryValidationError("run workspace cannot contain symlinks")
        for name in spec.expected_artifacts:
            relative_path(name)
            if name in {
                "input.json",
                "request.json",
                "receipt.json",
                "stdout.log",
                "stderr.log",
            }:
                raise FoundryValidationError("expected artifact uses a reserved name")
        if not spec.expected_artifacts:
            raise FoundryValidationError("at least one expected artifact is required")
        inputs = decode(canonical(dict(spec.inputs)))
        before = source_manifest(self.repository)
        try:
            workspace.mkdir(parents=True, exist_ok=False)
        except FileExistsError as error:
            raise FoundryValidationError("run workspace already exists") from error
        request: dict[str, object] = {
            "experiment_id": spec.experiment_id,
            "seed": spec.seed,
            "command": list(spec.command),
            "expected_artifacts": list(spec.expected_artifacts),
            "timeout_seconds": self.timeout,
            "log_limit": self.log_limit,
            "source": before,
            "python": platform.python_version(),
            "input_sha256": digest(canonical(inputs)),
        }
        write_json(workspace / "input.json", inputs)
        write_json(workspace / "request.json", request)
        started = datetime.now(timezone.utc).isoformat()
        clock = time.perf_counter()
        status, reason = "failed", "not_started"
        measurement: dict[str, object] | None = None
        evidence: list[EvidenceRecord] = []
        process: asyncio.subprocess.Process | None = None
        tasks: list[asyncio.Task[object]] = []
        cancelled = False
        returncode: int | None = None

        async def collect(stream: asyncio.StreamReader, output: BinaryIO) -> None:
            total = 0
            while chunk := await stream.read(8192):
                remaining = max(0, self.log_limit - total)
                output.write(chunk[:remaining])
                total += len(chunk)
                if total > self.log_limit:
                    raise FoundryValidationError("output_limit")

        def terminate() -> None:
            if process is not None:
                with suppress(ProcessLookupError):
                    if os.name == "posix":
                        os.killpg(process.pid, signal.SIGKILL)
                    else:
                        process.kill()

        try:
            environment = {
                "PATH": os.defpath,
                "PYTHONPATH": str(self.repository),
                "PYTHONHASHSEED": "0",
                "PYTHONDONTWRITEBYTECODE": "1",
                "PYTHONIOENCODING": "utf-8",
                "LANG": "C.UTF-8",
            }
            if os.name == "nt" and "SYSTEMROOT" in os.environ:
                environment["SYSTEMROOT"] = os.environ["SYSTEMROOT"]
            with (
                (workspace / "stdout.log").open("xb") as stdout,
                (workspace / "stderr.log").open("xb") as stderr,
            ):
                process = await asyncio.create_subprocess_exec(
                    *spec.command,
                    cwd=workspace,
                    env=environment,
                    stdin=asyncio.subprocess.DEVNULL,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    start_new_session=os.name == "posix",
                )
                assert process.stdout is not None and process.stderr is not None
                tasks = [
                    asyncio.create_task(process.wait()),
                    asyncio.create_task(collect(process.stdout, stdout)),
                    asyncio.create_task(collect(process.stderr, stderr)),
                ]
                try:
                    await asyncio.wait_for(asyncio.gather(*tasks), timeout=self.timeout)
                finally:
                    if any(not task.done() for task in tasks):
                        terminate()
                        for task in tasks:
                            task.cancel()
                        await asyncio.gather(*tasks, return_exceptions=True)
                        await process.wait()
            returncode = process.returncode
            reason = "nonzero_exit" if returncode != 0 else ""
            if returncode == 0:
                for index, name in enumerate(spec.expected_artifacts):
                    data = read_bytes(workspace, name)
                    evidence.append(
                        EvidenceRecord(
                            evidence_id=f"{spec.experiment_id.upper()}-ART-{index + 1}",
                            title=f"Observed output for {spec.experiment_id}",
                            state="observed",
                            locator=name,
                            digest=digest(data),
                        )
                    )
                measurement = _measurement(
                    read_json(workspace, spec.expected_artifacts[0]), spec
                )
                if read_bytes(workspace, "input.json") != canonical(
                    inputs
                ) or read_bytes(workspace, "request.json") != canonical(request):
                    raise FoundryValidationError("frozen_input_changed_during_run")
                if source_manifest(self.repository) != before:
                    raise FoundryValidationError("source_changed_during_run")
                status = "succeeded"
        except asyncio.CancelledError:
            cancelled, status, reason = True, "cancelled", "caller_cancelled"
            terminate()
            if process is not None:
                await process.wait()
        except TimeoutError:
            reason = "timeout"
            terminate()
            if process is not None:
                await process.wait()
        except (OSError, FoundryValidationError) as error:
            reason = (
                str(error)
                if isinstance(error, FoundryValidationError)
                else "process_unavailable"
            )
            terminate()
            if process is not None:
                await process.wait()
        finally:
            if process is not None:
                returncode = process.returncode
            # On rejected links/unbounded files retain the failure receipt without
            # incorporating the rejected artifact into its evidence manifest.
            safe_files: dict[str, str] = {}
            for name in (
                "input.json",
                "request.json",
                "stdout.log",
                "stderr.log",
                *spec.expected_artifacts,
            ):
                try:
                    safe_files[name] = digest(read_bytes(workspace, name))
                except FoundryValidationError:
                    pass
            receipt: dict[str, object] = {
                "schema_version": RUN_VERSION,
                "experiment_id": spec.experiment_id,
                "status": status,
                "reason": reason,
                "seed": spec.seed,
                "started_at": started,
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "elapsed_ms": round((time.perf_counter() - clock) * 1000, 6),
                "returncode": returncode,
                "artifacts": safe_files,
                "computational_sha256": computational_digest(measurement)
                if status == "succeeded" and measurement
                else None,
                "evidence_state": "observed",
                "authority": "local_execution_receipt",
            }
            write_json(workspace / "receipt.json", receipt)
        if cancelled:
            raise asyncio.CancelledError
        metrics = (
            mapping(measurement["metrics"])
            if status == "succeeded" and measurement
            else {}
        )
        return ExperimentResult(
            spec.experiment_id,
            status,
            {name: finite(value) for name, value in metrics.items()},
            tuple(evidence) if status == "succeeded" else (),
            reason,
        )


def verify_run(
    directory: Path, repository_root: Path | None = None
) -> dict[str, object]:
    """Recheck a retained run against its exact inputs, output and source closure."""
    receipt = read_json(directory, "receipt.json")
    if (
        receipt.get("schema_version") != RUN_VERSION
        or receipt.get("evidence_state") != "observed"
        or receipt.get("authority") != "local_execution_receipt"
    ):
        raise FoundryValidationError("unknown run receipt schema")
    verify_manifest(directory, receipt.get("artifacts"), exclude=("receipt.json",))
    request = read_json(directory, "request.json")
    inputs = read_json(directory, "input.json")
    if receipt.get("status") == "succeeded" and request.get("input_sha256") != digest(
        canonical(inputs)
    ):
        raise FoundryValidationError("run input differs from frozen request")
    if receipt.get("experiment_id") != request.get("experiment_id") or receipt.get(
        "seed"
    ) != request.get("seed"):
        raise FoundryValidationError("run receipt identity mismatch")
    if receipt.get("status") not in {"succeeded", "failed", "cancelled"}:
        raise FoundryValidationError("invalid run status")
    if repository_root is not None and request.get("source") != source_manifest(
        repository_root.resolve()
    ):
        raise FoundryValidationError("run source differs from current source")
    if receipt["status"] == "succeeded":
        if receipt.get("returncode") != 0 or receipt.get("reason"):
            raise FoundryValidationError("successful run has a failure outcome")
        artifacts = strings(request.get("expected_artifacts"), "artifacts")
        if not artifacts:
            raise FoundryValidationError("successful run requires expected artifacts")
        command = request.get("command")
        if not isinstance(command, list) or not all(
            isinstance(part, str) for part in command
        ):
            raise FoundryValidationError("run command must be an argv list")
        spec = ExperimentSpec(
            str(request["experiment_id"]),
            tuple(str(part) for part in command),
            integer(request["seed"], 0, 2**32 - 1, "seed"),
            inputs,
            artifacts,
        )
        measurement = _measurement(
            read_json(directory, spec.expected_artifacts[0]), spec
        )
        if computational_digest(measurement) != receipt.get("computational_sha256"):
            raise FoundryValidationError("run computational output changed")
    elif receipt.get("computational_sha256") is not None:
        raise FoundryValidationError("failed run cannot claim a computational result")
    return receipt


async def replay_run(
    directory: Path, destination: Path, repository_root: Path
) -> dict[str, object]:
    """Reexecute a retained built-in workload and compare only its computational bytes."""
    receipt = verify_run(directory, repository_root)
    if receipt["status"] != "succeeded":
        raise FoundryValidationError("only successful built-in runs can be replayed")
    request = read_json(directory, "request.json")
    inputs = read_json(directory, "input.json")
    command = builtin_command()
    if request.get("command") != list(command):
        raise FoundryValidationError(
            "replay only executes the built-in workload entry point"
        )
    spec = ExperimentSpec(
        str(request["experiment_id"]),
        command,
        integer(request["seed"], 0, 2**32 - 1, "seed"),
        inputs,
        strings(request["expected_artifacts"], "artifacts"),
    )
    runner = LocalExperimentRunner(
        repository_root,
        timeout_seconds=finite(request["timeout_seconds"]),
        log_limit=integer(request["log_limit"], 256, 4 * 1024 * 1024, "log_limit"),
    )
    await runner.run(spec, destination)
    actual = verify_run(destination, repository_root)
    return {
        "state": "MATCH"
        if actual["status"] == "succeeded"
        and actual["computational_sha256"] == receipt["computational_sha256"]
        else "DIVERGED",
        "original": receipt["computational_sha256"],
        "replayed": actual["computational_sha256"],
        "comparison": "computational bytes; timing and Python allocation peaks excluded",
        "evidence_state": "observed",
    }


def builtin_command() -> tuple[str, ...]:
    """Return the sole command a data-only experiment plan can select."""
    return (sys.executable, "-m", "foundry.shared.federal_foundry.baselines")
