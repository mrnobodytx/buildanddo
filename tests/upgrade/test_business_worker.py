# ─── CGRF Header ───────────────────────────────────────────────
# File:         tests/upgrade/test_business_worker.py
# Stage:        08_TEST
# SRS:          SRS-BUILDANDDO-UPGRADE-001
# CAPS:         pending
# CK:           pending
# Dispatch:     VCC-BUILDANDDO-UPGRADE-001
# Seat:         BITS-CODEGEN
# Owner:        Citadel Nexus Inc.
# Created:      2026-09-20
# Depends:      apps/mission_suite/business_worker.py
# EnumType:     Test
# EnumEdges:    DEPENDS_ON apps/mission_suite/business_worker.py
# DAG Node:     none
# Intent:       Exercise provider ordering, timeout ambiguity, source provenance and read-only reconciliation without contacting an external service.
# ───────────────────────────────────────────────────────────────

"""Exercise bounded provider effects with explicit transport doubles."""

from __future__ import annotations

import copy
from datetime import datetime, timedelta, timezone
import json
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from apps.mission_suite import business_worker
from apps.mission_suite.business_worker import Binding, BusinessWorker
from apps.research.contracts import ResearchError


class Transport:
    def __init__(self, responder):
        self.responder, self.calls = responder, []

    async def json(self, path, *, body=None, method="POST"):
        self.calls.append((path, copy.deepcopy(body), method))
        return self.responder(path, body, method)


class WorkerTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.binding = Binding.parse(
            {
                "workspace": "workspace1",
                "provider": "n8n",
                "binding": "shop-actions",
                "health_path": "/healthz",
                "operations": {"prepare-report": "/webhook/prepare-report"},
                "reconcile_path": "/receipts",
            }
        )
        self.job = {
            "id": "job1",
            "workspace": "workspace1",
            "provider": "n8n",
            "binding": "shop-actions",
            "status": "queued",
            "revision": 1,
            "effect_key": "a" * 64,
            "mission": "mission1",
            "run": "run1",
            "input": {
                "provider": "n8n",
                "binding": "shop-actions",
                "max_seconds": 5,
                "parameters": {
                    "operation": "prepare-report",
                    "input": {"message": "Synthetic example"},
                },
            },
        }
        self.receipt = {
            "effect_key": "a" * 64,
            "status": "succeeded",
            "execution_id": "provider1",
            "summary": "Synthetic provider outcome",
        }
        self.backend = Transport(self.backend_response)
        self.provider = Transport(lambda _p, _b, _m: self.receipt)
        self.worker = BusinessWorker(self.backend, self.provider, self.binding)

    def backend_response(self, path, body, method):
        if method == "GET" and path.endswith("/integrations"):
            return {
                "workspace": "workspace1",
                "items": [
                    {
                        "provider": "n8n",
                        "configuration": {"binding": "shop-actions"},
                        "desired_enabled": True,
                        "revision": 2,
                    }
                ],
            }
        if method == "GET":
            return {"workspace": "workspace1", "items": [self.job], "has_more": False}
        action = body["action"]
        if action == "action.claim":
            return {
                **self.job,
                "status": "claimed",
                "revision": 2,
                "lease_id": "lease1",
            }
        if action == "action.begin":
            return {
                **self.job,
                "status": "dispatched",
                "revision": 3,
                "lease_id": "lease1",
            }
        return {**self.job, "status": "succeeded", "revision": 4}

    async def test_persists_dispatch_before_one_provider_effect(self):
        def provider(path, body, method):
            self.assertEqual(self.backend.calls[-1][1]["action"], "action.begin")
            self.assertEqual(body["effect_key"], self.job["effect_key"])
            self.assertEqual(body["release_context"], self.job.get("release_context"))
            self.assertEqual(path, "/webhook/prepare-report")
            return self.receipt

        self.provider.responder = provider
        self.assertEqual(await self.worker.run(self.job), "succeeded")
        self.assertEqual(len(self.provider.calls), 1)
        self.assertEqual(self.backend.calls[-1][1]["action"], "action.complete")

    async def test_uncertain_provider_result_is_held_without_retry(self):
        def timeout(*_args):
            raise ResearchError("timeout")

        self.provider.responder = timeout
        self.assertEqual(await self.worker.run(self.job), "hold")
        self.assertEqual(len(self.provider.calls), 1)
        self.assertEqual(self.backend.calls[-1][1]["action"], "action.hold")

    async def test_lost_completion_response_never_reissues_effect(self):
        original = self.backend.responder

        def backend(path, body, method):
            if body and body["action"] in {"action.complete", "action.hold"}:
                raise ResearchError("unavailable")
            return original(path, body, method)

        self.backend.responder = backend
        self.assertEqual(await self.worker.run(self.job), "hold")
        self.assertEqual(len(self.provider.calls), 1)

    async def test_reconciliation_only_reads_bound_provider_receipt(self):
        job = {**self.job, "status": "hold", "revision": 4, "lease_id": "lease1"}
        self.assertEqual(await self.worker.reconcile(job), "succeeded")
        self.assertEqual(self.provider.calls[0][2], "GET")
        self.assertTrue(self.provider.calls[0][0].endswith("/" + job["effect_key"]))
        self.assertEqual(self.backend.calls[-1][1]["action"], "action.reconcile")

    async def test_substituted_receipt_stays_on_hold(self):
        self.provider.responder = lambda *_: {**self.receipt, "effect_key": "b" * 64}
        self.assertEqual(await self.worker.run(self.job), "hold")
        self.assertFalse(
            any(call[1]["action"] == "action.complete" for call in self.backend.calls)
        )

    async def test_foreign_or_unregistered_actions_never_reach_provider(self):
        for job in [
            {**self.job, "workspace": "foreign"},
            {
                **self.job,
                "input": {
                    **self.job["input"],
                    "parameters": {"operation": "delete-everything"},
                },
            },
        ]:
            with self.assertRaises(ResearchError):
                await self.worker.run(job)
        self.assertEqual(self.provider.calls, [])

    async def test_claim_denial_precedes_external_call(self):
        def denied(*_):
            raise ResearchError("forbidden")

        self.backend.responder = denied
        with self.assertRaises(ResearchError):
            await self.worker.run(self.job)
        self.assertEqual(self.provider.calls, [])

    async def test_health_requires_probe_and_records_current_revision(self):
        self.provider.responder = lambda *_: {"status": "ok"}
        await self.worker.health()
        command = self.backend.calls[-1][1]
        self.assertEqual(command["revision"], 2)
        self.assertEqual(command["payload"]["state"], "healthy")
        self.assertTrue(command["payload"]["receipt_ref"].startswith("probe-sha256:"))

    async def test_disabled_connector_is_not_probed(self):
        self.backend.responder = lambda *_: {
            "workspace": "workspace1",
            "items": [
                {
                    "provider": "n8n",
                    "configuration": {"binding": "shop-actions"},
                    "desired_enabled": False,
                    "revision": 3,
                }
            ],
        }
        await self.worker.health()
        self.assertEqual(self.provider.calls, [])
        self.assertEqual(self.backend.calls[-1][1]["payload"]["state"], "disabled")

    async def test_partial_job_scan_fails_instead_of_claiming_empty_queue(self):
        self.backend.responder = lambda *_: {
            "workspace": "workspace1",
            "items": [self.job],
            "has_more": True,
        }
        with self.assertRaisesRegex(ResearchError, "scan_limit"):
            await self.worker.jobs()
        self.assertEqual(len(self.backend.calls), 10)

    async def test_firecrawl_reuses_processor_and_retains_exact_source_bytes(self):
        binding = Binding.parse(
            {
                "workspace": "workspace1",
                "provider": "firecrawl",
                "binding": "public-read",
                "health_path": "/health",
                "operations": {},
                "reconcile_path": "",
            }
        )

        class Extractor:
            async def process(self, job, data=None, name=""):
                return {
                    "text": "Observed public text",
                    "citations": [{"url": job["input"], "title": "Source"}],
                    "truncated": False,
                }

        worker = BusinessWorker(
            self.backend, self.provider, binding, processor=Extractor()
        )
        job = {
            **self.job,
            "provider": "firecrawl",
            "binding": "public-read",
            "input": {"parameters": {"url": "https://www.python.org/"}},
        }
        result = await worker.execute(job)
        self.assertEqual(result["output"]["url"], "https://www.python.org/")
        self.assertEqual(result["output"]["text"], "Observed public text")
        self.assertEqual(len(result["output"]["content_sha256"]), 64)
        self.assertEqual(self.provider.calls, [])

    def test_operator_binding_rejects_injected_paths_or_missing_reconciliation(self):
        value = {
            "workspace": "workspace1",
            "provider": "n8n",
            "binding": "shop-actions",
            "health_path": "/health",
            "operations": {"prepare-report": "//foreign/path"},
            "reconcile_path": "/receipts",
        }
        with self.assertRaises(ResearchError):
            Binding.parse(value)
        value["operations"] = {"prepare-report": "/webhook/report"}
        value["reconcile_path"] = ""
        with self.assertRaises(ResearchError):
            Binding.parse(value)


class OperatorLoopTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.binding = {
            "workspace": "workspace1",
            "provider": "n8n",
            "binding": "shop-actions",
            "health_path": "/health",
            "operations": {"prepare-report": "/report"},
            "reconcile_path": "/receipts",
        }
        self.environment = {
            "BUILDANDDO_BUSINESS_WORKER": json.dumps(self.binding),
            "BUILDANDDO_POCKETBASE_URL": "https://backend.example.org",
            "BUILDANDDO_BUSINESS_PROVIDER_URL": "https://provider.example.org",
            "BUILDANDDO_WORKER_TOKEN": "synthetic-test-identity",
        }

    async def test_polling_selects_expired_leases_and_requires_explicit_reconciliation(
        self,
    ):
        now = datetime.now(timezone.utc)
        jobs = [
            {"id": "queued", "status": "queued"},
            {
                "id": "expired",
                "status": "claimed",
                "lease_until": (now - timedelta(minutes=1)).isoformat(),
            },
            {
                "id": "active",
                "status": "claimed",
                "lease_until": (now + timedelta(hours=1)).isoformat(),
            },
            {"id": "uncertain", "status": "hold", "lease_id": "issued"},
            {"id": "dispatched", "status": "dispatched", "lease_id": "issued"},
            {"id": "unclaimed", "status": "hold", "lease_id": ""},
            {"id": "terminal", "status": "succeeded"},
        ]
        for reconcile in (False, True):
            worker = SimpleNamespace(
                health=AsyncMock(),
                jobs=AsyncMock(return_value=jobs),
                run=AsyncMock(return_value="succeeded"),
                reconcile=AsyncMock(return_value="succeeded"),
            )
            transport = SimpleNamespace(close=AsyncMock())
            with (
                patch.dict(business_worker.os.environ, self.environment, clear=True),
                patch.object(business_worker, "BoundedIO", return_value=transport),
                patch.object(business_worker, "HttpClient"),
                patch.object(business_worker, "BusinessWorker", return_value=worker),
                patch.object(
                    business_worker.asyncio, "sleep", new_callable=AsyncMock
                ) as sleep,
            ):
                await business_worker.serve(True, reconcile)
            self.assertEqual(
                [call.args[0]["id"] for call in worker.run.await_args_list],
                ["queued", "expired"],
            )
            self.assertEqual(
                [call.args[0]["id"] for call in worker.reconcile.await_args_list],
                ["uncertain", "dispatched"] if reconcile else [],
            )
            sleep.assert_not_awaited()
            transport.close.assert_awaited_once()

    async def test_failure_isolated_to_one_job_and_poll_interval_is_bounded(self):
        jobs = [
            {"id": "denied", "status": "queued"},
            {"id": "next", "status": "queued"},
        ]
        worker = SimpleNamespace(
            health=AsyncMock(),
            jobs=AsyncMock(return_value=jobs),
            run=AsyncMock(side_effect=[ResearchError("forbidden"), "succeeded"]),
        )
        transport = SimpleNamespace(close=AsyncMock())
        with (
            patch.dict(business_worker.os.environ, self.environment, clear=True),
            patch.object(business_worker, "BoundedIO", return_value=transport),
            patch.object(business_worker, "HttpClient"),
            patch.object(business_worker, "BusinessWorker", return_value=worker),
            patch.object(
                business_worker.asyncio,
                "sleep",
                new_callable=AsyncMock,
                side_effect=business_worker.asyncio.CancelledError,
            ) as sleep,
        ):
            with self.assertRaises(business_worker.asyncio.CancelledError):
                await business_worker.serve(False, False)
        self.assertEqual(worker.run.await_count, 2)
        sleep.assert_awaited_once_with(10)
        transport.close.assert_awaited_once()

    async def test_provider_health_failure_closes_both_firecrawl_resources(self):
        self.binding.update(provider="firecrawl", operations={}, reconcile_path="")
        self.environment["BUILDANDDO_BUSINESS_WORKER"] = json.dumps(self.binding)
        transport = SimpleNamespace(close=AsyncMock())
        processor = SimpleNamespace(io=SimpleNamespace(close=AsyncMock()))
        worker = SimpleNamespace(
            health=AsyncMock(side_effect=ResearchError("unavailable")), jobs=AsyncMock()
        )
        with (
            patch.dict(business_worker.os.environ, self.environment, clear=True),
            patch.object(business_worker, "BoundedIO", return_value=transport),
            patch.object(business_worker, "HttpClient"),
            patch.object(business_worker, "Processor", return_value=processor),
            patch.object(
                business_worker, "BusinessWorker", return_value=worker
            ) as factory,
        ):
            with self.assertRaises(ResearchError):
                await business_worker.serve(True, False)
        self.assertIs(factory.call_args.kwargs["processor"], processor)
        worker.jobs.assert_not_awaited()
        transport.close.assert_awaited_once()
        processor.io.close.assert_awaited_once()

    async def test_missing_or_malformed_runtime_configuration_prevents_transport(self):
        for values in (
            {},
            {**self.environment, "BUILDANDDO_BUSINESS_WORKER": "{"},
            {**self.environment, "BUILDANDDO_WORKER_TOKEN": ""},
            {
                key: value
                for key, value in self.environment.items()
                if key != "BUILDANDDO_POCKETBASE_URL"
            },
        ):
            with (
                patch.dict(business_worker.os.environ, values, clear=True),
                patch.object(business_worker, "HttpClient") as client,
            ):
                with self.assertRaises(ResearchError):
                    await business_worker.serve(True, False)
                client.assert_not_called()


class EntrypointTests(unittest.TestCase):
    def test_command_line_reports_startup_failure_and_requires_explicit_flags(self):
        for failure in (False, True):
            with (
                patch.object(business_worker, "serve", new_callable=AsyncMock) as serve,
                patch("sys.argv", ["business_worker", "--once", "--reconcile"]),
            ):
                if failure:
                    serve.side_effect = ResearchError("configuration")
                self.assertEqual(business_worker.main(), 1 if failure else 0)
                serve.assert_awaited_once_with(True, True)


if __name__ == "__main__":
    unittest.main()
