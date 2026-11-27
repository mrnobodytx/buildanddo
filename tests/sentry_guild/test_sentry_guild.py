# ─── CGRF Header ──────────────────────────────
# File:        tests/sentry_guild/test_sentry_guild.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-SENTRY-GUILD-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SENTRY-GUILD-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-16
# Depends:     apps/sentry_guild
# EnumType:    Test
# EnumEdges:   VALIDATES apps/sentry_guild
# DAG Node:    none
# Intent:      Prove the scope guard, scrubbing, Seer intake, code-free lessons, metric verdicts, handoffs and CLI.
# ─────────────────────────────────────────────────────────────

"""Behavior tests for the Sentry guild. No network, no Sentry account, no secrets."""

from __future__ import annotations

import contextlib
import hashlib
import hmac
import io
import json
import tempfile
import unittest
from pathlib import Path

from apps.sentry_guild import handoff, lessons, scrub, seer, verify
from apps.sentry_guild.cli import main

SECRET = "test-client-secret"


def frame(filename: str, **extra: object) -> dict:
    base = {"filename": filename, "function": "build", "lineno": 12, "in_app": True,
            "vars": {"token": "x"}, "pre_context": ["a"], "post_context": ["b"],
            "context_line": "secret_line()", "abs_path": "/srv/" + filename}
    base.update(extra)
    return base


def event(*frames: dict, **extra: object) -> dict:
    data = {
        "event_id": "e1",
        "message": "failed for bob@example.com with api_key=abc123 at https://x.test/y",
        "exception": {"values": [{"type": "ValueError", "value": "Bearer abcdefghijkl from 10.0.0.4",
                                  "stacktrace": {"frames": list(frames)}}]},
        "request": {"data": "body", "cookies": "c"}, "user": {"email": "u@x.io"},
        "server_name": "host", "extra": {"k": 1}, "breadcrumbs": [1], "tags": {"service": "buildanddo-web"},
    }
    data.update(extra)
    return data


def delivery(action: str, **data: object) -> dict:
    return {"action": action, "data": {"run_id": 7, "group_id": 99, **data}}


ROOT_CAUSE = {"title": "Fleet endpoint fails", "description": "Relative URL `'/rest/v1/x'` built in apps/web/src/fleet.py:40",
              "five_whys": [{"text": "base URL unset"}, "env var missing at https://cfg.test"]}
SOLUTION = {"summary": "Use absolute URL", "steps": [{"title": "Join base", "description": "```py\nurl = base + p\n```"}]}


class ScrubTests(unittest.TestCase):
    def test_public_event_is_minimised_and_redacted(self) -> None:
        clean = scrub.scrub_event(event(frame("apps/web/fleet.py")))
        assert clean is not None
        for key in scrub.EVENT_DROP_KEYS:
            self.assertNotIn(key, clean)
        f = clean["exception"]["values"][0]["stacktrace"]["frames"][0]
        for key in scrub.FRAME_DROP_KEYS:
            self.assertNotIn(key, f)
        self.assertEqual(f["filename"], "apps/web/fleet.py")
        text = json.dumps(clean)
        for leaked in ("bob@example.com", "abc123", "abcdefghijkl", "10.0.0.4", "https://x.test"):
            self.assertNotIn(leaked, text)

    def test_private_plane_events_are_dropped(self) -> None:
        cases = [
            event(frame("apps/web/a.py"), frame("citadel/core/cnp.py")),
            event(frame("apps/web/a.py", module="nemesis.l2")),
            event(frame("vendor/x.py")),
            event(frame("apps/web/a.py"), tags={"seat": "kestrel"}),
            event(frame("apps/web/a.py"), tags=[["svc", "memory_store"]]),
            event(frame("apps/web/a.py"), logger="lazarus"),
            event(frame("apps/web/a.py"), transaction="/cnwb/chat"),
        ]
        for case in cases:
            with self.subTest(case=case):
                self.assertIsNone(scrub.scrub_event(case))
        self.assertIsNone(scrub.scrub_event("not an event"))  # type: ignore[arg-type]

    def test_threads_messages_and_logentry(self) -> None:
        data = event(frame("apps/web/a.py"), threads={"values": [{"stacktrace": {"frames": [frame("services/b.py")]}}]},
                     logentry={"formatted": "token=zzz9 failed"})
        data["message"] = {"formatted": "dsn=https://k@o.ingest", "params": ["p"]}
        clean = scrub.scrub_event(data)
        assert clean is not None
        self.assertNotIn("vars", clean["threads"]["values"][0]["stacktrace"]["frames"][0])
        self.assertNotIn("params", clean["message"])
        self.assertNotIn("zzz9", json.dumps(clean))
        self.assertTrue(scrub.in_scope(event(frame("lib/x.py", in_app=False))))
        self.assertFalse(scrub.SDK_OPTIONS["send_default_pii"])


class SeerTests(unittest.TestCase):
    def test_signature(self) -> None:
        body = b'{"action":"pr_created"}'
        sig = hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()
        self.assertTrue(seer.verify_signature(body, sig, SECRET))
        self.assertTrue(seer.verify_signature(body, " " + sig.upper() + " ", SECRET))
        self.assertFalse(seer.verify_signature(body + b" ", sig, SECRET))
        self.assertFalse(seer.verify_signature(body, sig, ""))
        self.assertFalse(seer.verify_signature(body, "", SECRET))

    def test_parse_rejects_bad_deliveries(self) -> None:
        bad = [({"action": "nope", "data": {}}, "seer"), (delivery("pr_created"), "issue"),
               ({"action": "pr_created"}, "seer"), ({"action": "pr_created", "data": {"run_id": 1}}, "seer")]
        for item, resource in bad:
            with self.subTest(item=item), self.assertRaises(seer.SeerError):
                seer.parse(item, resource)

    def test_fold_orders_stages_and_ignores_late_events(self) -> None:
        events = [seer.parse(delivery(a, **d)) for a, d in [
            ("root_cause_started", {}), ("root_cause_completed", {"root_cause": ROOT_CAUSE}),
            ("coding_completed", {"changes": {"buildanddo": [{"path": "a.py", "diff": "-x"}, {"path": "b.py"}]}}),
            ("solution_completed", {"solution": SOLUTION}),
            ("pr_created", {"pull_requests": [{"url": "https://github.com/o/r/pull/1", "number": 1}]}),
            ("coding_started", {}),
        ]]
        run = seer.fold(events)["7"]
        self.assertEqual(run.stage, "pr_created")
        self.assertTrue(run.complete)
        self.assertEqual(len(run.changes), 2)
        self.assertEqual(run.seen[0], "root_cause_started")
        self.assertEqual(run.solution, SOLUTION)
        with self.assertRaises(seer.SeerError):
            seer.apply(run, seer.SeerEvent("pr_created", "8", "99", {}))
        self.assertEqual(seer._seq("x"), ())
        self.assertEqual(seer._seq({"r": "diff"})[0]["repo"], "r")


class LessonTests(unittest.TestCase):
    def run_(self) -> seer.SeerRun:
        return seer.SeerRun("7", "99", "solution_completed", root_cause=ROOT_CAUSE, solution=SOLUTION)

    def test_lesson_is_code_free_and_inferred(self) -> None:
        lesson = lessons.from_run(self.run_())
        text = json.dumps(lesson.to_dict())
        for leaked in ("/rest/v1/x", "fleet.py", "url = base", "https://cfg.test"):
            self.assertNotIn(leaked, text)
        self.assertEqual(lesson.label, "INFERRED")
        self.assertEqual(len(lesson.why_chain), 2)
        self.assertTrue(lesson.lesson_id.startswith("lsn-"))
        self.assertEqual(lesson.lesson_id, lessons.from_run(self.run_()).lesson_id)
        self.assertLessEqual(len(lessons.plain("x" * 5000)), lessons.MAX_TEXT)

    def test_promotion_requires_recovery_and_evidence(self) -> None:
        lesson = lessons.from_run(self.run_())
        self.assertEqual(lessons.promote(lesson, "NOT_RECOVERED", "dd:q").label, "INFERRED")
        self.assertEqual(lessons.promote(lesson, "RECOVERED", "").label, "INFERRED")
        up = lessons.promote(lesson, "RECOVERED", "datadog:monitor/1")
        self.assertEqual((up.label, up.evidence), ("VERIFIED", "datadog:monitor/1"))

    def test_summary_fallback_and_missing_root_cause(self) -> None:
        run = seer.SeerRun("7", "99", "solution_completed", root_cause={"title": "T"}, solution={"summary": "S"})
        self.assertEqual(lessons.from_run(run).fix, ("S",))
        with self.assertRaises(ValueError):
            lessons.from_run(seer.SeerRun("7", "99", "root_cause_started"))


class VerifyTests(unittest.TestCase):
    def test_verdicts(self) -> None:
        self.assertEqual(verify.assess([10, 12], [1, 0, 1], 2).verdict, "RECOVERED")
        self.assertEqual(verify.assess([10], [5, 5, 5], 2).verdict, "NOT_RECOVERED")
        self.assertEqual(verify.assess([2], [1.8, 1.9, 1.7], 2).verdict, "NOT_RECOVERED")
        self.assertEqual(verify.assess([0], [0, 0, 0], 1).verdict, "RECOVERED")
        self.assertEqual(verify.assess([5], [1, None, float("nan"), True], 2).verdict, "INSUFFICIENT_DATA")  # type: ignore[list-item]
        self.assertEqual(verify.assess([], [1, 1, 1], 2).verdict, "INSUFFICIENT_DATA")
        for bad in ({"threshold": -1}, {"min_improvement": 2}, {"min_points": 0}):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                verify.assess([1], [1], **{"threshold": 1, **bad})  # type: ignore[arg-type]


class HandoffTests(unittest.TestCase):
    def test_record_and_markdown(self) -> None:
        run = seer.SeerRun("7", "99", "pr_created", root_cause=ROOT_CAUSE, solution=SOLUTION,
                           pull_requests=({"url": "https://github.com/o/r/pull/1"},))
        verdict = verify.assess([9], [0, 0, 0], 1)
        data = handoff.record(run, lessons.from_run(run), verdict)
        self.assertEqual((data["status"], data["closer"]), ("open", "human"))
        md = handoff.markdown(data)
        self.assertIn("RECOVERED", md)
        self.assertIn("Fix:", md)
        bare = handoff.markdown(handoff.record(seer.SeerRun("7", "99", "root_cause_started"), None, None))
        self.assertIn("not run", bare)
        self.assertIn("none yet", bare)


class CliTests(unittest.TestCase):
    def setUp(self) -> None:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.dir = Path(tmp.name)

    def write(self, name: str, value: object, raw: str | None = None) -> str:
        path = self.dir / name
        path.write_text(raw if raw is not None else json.dumps(value), encoding="utf-8")
        return str(path)

    def call(self, *argv: str) -> int:
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            return main(list(argv))

    def test_scrub_command(self) -> None:
        self.assertEqual(self.call("scrub", "--event", self.write("e.json", event(frame("apps/a.py")))), 0)
        self.assertEqual(self.call("scrub", "--event", self.write("p.json", event(frame("cnp/a.py")))), 1)

    def test_runs_and_verify_commands(self) -> None:
        items = [delivery("root_cause_completed", root_cause=ROOT_CAUSE), delivery("solution_completed", solution=SOLUTION),
                 {"action": "root_cause_started", "data": {"run_id": 8, "group_id": 5}}]
        jsonl = "\n".join(json.dumps(i) for i in items) + "\n"
        deliveries = self.write("d.jsonl", None, raw=jsonl)
        good = self.write("m.json", {"99": {"before": [9], "after": [0, 0, 0], "threshold": 1, "evidence": "dd:1"}})
        out = self.dir / "out"
        self.assertEqual(self.call("runs", "--deliveries", deliveries, "--output", str(out), "--metrics", good), 0)
        saved = json.loads((out / "sentry-guild-99-7.json").read_text())
        self.assertEqual(saved["lesson"]["label"], "VERIFIED")
        self.assertTrue((out / "sentry-guild-5-8.md").exists())
        bad = self.write("b.json", {"99": {"before": [9], "after": [9, 9, 9], "threshold": 1}})
        self.assertEqual(self.call("runs", "--deliveries", deliveries, "--output", str(out), "--metrics", bad), 1)
        self.assertEqual(self.call("runs", "--deliveries", deliveries, "--output", str(out)), 0)
        self.assertEqual(self.call("verify", "--metrics", good), 0)
        self.assertEqual(self.call("verify", "--metrics", bad), 1)

    def test_bad_input(self) -> None:
        self.assertEqual(self.call("scrub", "--event", str(self.dir / "missing.json")), 2)
        self.assertEqual(self.call("runs", "--deliveries", self.write("o.json", {"a": 1}), "--output", str(self.dir)), 2)
        self.assertEqual(self.call("runs", "--deliveries", self.write("x.json", [{"action": "bad"}]), "--output", str(self.dir)), 2)
        self.assertEqual(self.call("verify", "--metrics", self.write("n.json", {"g": {"before": [1]}})), 2)


if __name__ == "__main__":
    unittest.main()
