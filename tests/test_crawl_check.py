# ─── CGRF Header ──────────────────────────────
# File:        tests/test_crawl_check.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-CRAWL-001
# CAPS:        pending
# CK:          pending
# Dispatch:    USO-BUILDANDDO-CRAWL-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     scripts/crawl_check.py
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/crawl_check.py; CONSUMES apps/web/src/lib/publicPages.js
# DAG Node:    public.crawl.check.tests
# Intent:      Prove public-page crawl contracts and failure exits with controlled Firecrawl responses and no network access.
# ───────────────────────────────

"""Exercise the public crawl checker without contacting Firecrawl or the site."""

from __future__ import annotations

from contextlib import redirect_stdout
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

from apps.research.contracts import Endpoint, ProcessorSettings, ResearchError
from scripts import crawl_check


def response(
    page: crawl_check.PublicPage, content: str | None = None, **metadata: object
) -> dict[str, object]:
    """Build a representative Firecrawl scrape response."""
    body = content or (
        ("Rendered public content with evidence and useful detail. " * 8).strip()
    )
    values: dict[str, object] = {
        "statusCode": 200,
        "title": page.title,
        "description": page.description,
    }
    values.update(metadata)
    return {"success": True, "data": {"markdown": body, "metadata": values}}


class CrawlCheckTests(unittest.IsolatedAsyncioTestCase):
    """Verify inventory, request, validation and report behavior."""

    def setUp(self) -> None:
        self.origin = "https://buildanddo.com"
        self.home = crawl_check.PublicPage(
            "/", "BuildAndDo test title", "A useful description.", "WebPage"
        )
        self.classrooms = crawl_check.PublicPage(
            "/classrooms",
            "Classrooms & shared lessons | BuildAndDo",
            "Learn together.",
            "CollectionPage",
        )
        self.settings = ProcessorSettings(Endpoint("http://firecrawl:3002"), "v2")

    def test_canonical_inventory_is_read_from_public_pages(self) -> None:
        origin, pages = crawl_check.load_public_pages()
        self.assertEqual(origin, self.origin)
        # 11, not 10: the Day-21 closure pack added the public /hostinger-challenge judge page
        # to PUBLIC_PAGES. This asserts the count of canonical public pages, so it moves with them.
        self.assertEqual(len(pages), 11)
        self.assertEqual(pages[0].path, "/")
        self.assertEqual(
            next(page for page in pages if page.path == "/classrooms").title,
            self.classrooms.title,
        )

    def test_malformed_or_duplicate_inventory_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory(prefix="buildanddo-crawl-") as directory:
            path = Path(directory) / "publicPages.js"
            path.write_text(
                "export const SITE_ORIGIN='https://buildanddo.com'; export const PUBLIC_PAGES=[{path:'/',title:'One',description:'D',type:'WebPage'},{path:'/',title:'Two',description:'D',type:'WebPage'}]",
                encoding="utf-8",
            )
            with self.assertRaises(ResearchError):
                crawl_check.load_public_pages(path)
            path.write_text("export const PUBLIC_PAGES=[]", encoding="utf-8")
            with self.assertRaises(ResearchError):
                crawl_check.load_public_pages(path)

    async def test_scrape_uses_versioned_endpoint_payload_and_egress_guard(
        self,
    ) -> None:
        client = AsyncMock()
        client.json.return_value = response(self.home)
        guarded: list[object] = []

        def guard(value: object) -> str:
            guarded.append(value)
            return str(value)

        report = await crawl_check.crawl_pages(
            [self.home], self.origin, self.settings, client, guard=guard
        )
        self.assertEqual(
            report["summary"], {"status": "pass", "total": 1, "passed": 1, "failed": 0}
        )
        self.assertEqual(guarded, [self.origin + "/"])
        client.json.assert_awaited_once_with(
            "/v2/scrape",
            body={
                "url": self.origin + "/",
                "formats": ["markdown"],
                "onlyMainContent": True,
                "timeout": 30000,
            },
        )

    def test_metadata_http_error_content_and_error_shell_fail_independently(
        self,
    ) -> None:
        result = crawl_check.validate_page(
            self.home,
            self.origin,
            {
                "markdown": "# Application error",
                "metadata": {"statusCode": 503, "title": "Wrong", "description": ""},
            },
            200,
        )
        self.assertFalse(result["passed"])
        self.assertEqual(
            set(result["failures"]),
            {
                "http_status",
                "title_matches",
                "meta_description",
                "error_state_absent",
                "minimum_content",
            },
        )
        missing_title = crawl_check.validate_page(
            self.home,
            self.origin,
            {
                "markdown": "Enough useful content. " * 20,
                "metadata": {"statusCode": "200", "description": "Present"},
            },
            200,
        )
        self.assertIn("title_present", missing_title["failures"])
        self.assertIn("title_matches", missing_title["failures"])

    def test_classrooms_requires_lesson_content_and_both_calls_to_action(self) -> None:
        generic = response(self.classrooms, "Generic classroom information. " * 20)[
            "data"
        ]
        failed = crawl_check.validate_page(self.classrooms, self.origin, generic, 200)
        self.assertIn("classrooms_lesson_content", failed["failures"])
        self.assertIn("classrooms_ctas", failed["failures"])
        content = (
            "Start with a lesson. Choose a Field Manual topic. 33 lessons to explore. "
            "Open your classrooms. Explore the lessons. "
            + "Public learning detail. "
            * 12
        )
        passed = crawl_check.validate_page(
            self.classrooms,
            self.origin,
            response(self.classrooms, content)["data"],
            200,
        )
        self.assertTrue(passed["passed"])

    async def test_provider_failure_is_reported_per_page_and_sets_nonzero_exit(
        self,
    ) -> None:
        client = AsyncMock()
        client.json.side_effect = [
            {"success": False},
            response(
                self.classrooms,
                (
                    "Start with a lesson and use the Field Manual. Many lessons to explore. "
                    "Open your classrooms or explore the lessons. "
                    + "Learning content. "
                    * 20
                ),
            ),
        ]
        report = await crawl_check.crawl_pages(
            [self.home, self.classrooms],
            self.origin,
            self.settings,
            client,
            guard=lambda value: str(value),
        )
        self.assertEqual(
            report["summary"], {"status": "fail", "total": 2, "passed": 1, "failed": 1}
        )
        self.assertEqual(report["pages"][0]["failures"], ["scrape_success"])
        self.assertEqual(crawl_check.report_exit_code(report), 1)
        self.assertEqual(
            crawl_check.report_exit_code({"summary": {"status": "pass"}}), 0
        )

    def test_configuration_uses_existing_settings_endpoint_and_http_client(
        self,
    ) -> None:
        settings, client = crawl_check.configured_firecrawl(
            {
                "BUILDANDDO_FIRECRAWL_URL": "http://firecrawl:3002",
                "BUILDANDDO_FIRECRAWL_KEY": "test-binding",
                "BUILDANDDO_FIRECRAWL_VERSION": "v1",
            }
        )
        self.assertEqual(settings.firecrawl, Endpoint("http://firecrawl:3002"))
        self.assertEqual(settings.firecrawl_version, "v1")
        self.assertIsInstance(client, crawl_check.HttpClient)
        with self.assertRaises(ResearchError):
            crawl_check.configured_firecrawl(
                {"BUILDANDDO_FIRECRAWL_URL": "http://firecrawl:3002"}
            )

    def test_report_writer_persists_structured_json(self) -> None:
        report = crawl_check.fatal_report("configuration")
        with tempfile.TemporaryDirectory(prefix="buildanddo-crawl-") as directory:
            output = Path(directory) / "nested/report.json"
            crawl_check.write_report(report, output)
            self.assertEqual(json.loads(output.read_text(encoding="utf-8")), report)
            self.assertEqual(crawl_check.report_exit_code(report), 1)

    def test_cli_writes_all_page_failures_and_exits_nonzero_without_network(
        self,
    ) -> None:
        client = AsyncMock()
        client.json.return_value = {"success": False}
        with tempfile.TemporaryDirectory(prefix="buildanddo-crawl-") as directory:
            output = Path(directory) / "report.json"
            with (
                patch.object(
                    crawl_check,
                    "configured_firecrawl",
                    return_value=(self.settings, client),
                ),
                patch.object(
                    crawl_check,
                    "public_url",
                    side_effect=lambda value, **_options: str(value),
                ),
                redirect_stdout(io.StringIO()),
            ):
                code = crawl_check.main(["--output", str(output)])
            report = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(code, 1)
            self.assertEqual(report["summary"]["total"], 11)
            self.assertEqual(report["summary"]["failed"], 11)
            self.assertEqual(client.json.await_count, 11)
            client.close.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
