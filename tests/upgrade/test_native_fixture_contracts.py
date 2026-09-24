# --- CGRF Header ------------------------------------------------
# File:        tests/upgrade/test_native_fixture_contracts.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     tests/upgrade/test_classroom_native.py, tests/upgrade/test_workspace_native.py, tests/upgrade/test_tutorial_learning_native.py
# EnumType:    Test
# EnumEdges:   VALIDATES tests/upgrade/test_classroom_native.py; VALIDATES tests/upgrade/test_workspace_native.py; VALIDATES tests/upgrade/test_tutorial_learning_native.py
# DAG Node:    none
# Intent:      Detect incomplete native fixtures and unsafe failure diagnostics without claiming native execution from subprocess doubles.
# ----------------------------------------------------------------

"""Source-only fixture assembly and diagnostics; never native acceptance."""

from __future__ import annotations

from contextlib import contextmanager, redirect_stderr
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from types import SimpleNamespace
from typing import Iterator
import unittest
from unittest.mock import Mock, patch

from tests.upgrade import test_classroom_native as classroom
from tests.upgrade import test_tutorial_learning_native as learning
from tests.upgrade import test_workspace_native as workspace
from scripts.ci.hostinger_checks import CHECKS, runtime_version

ROOT = Path(__file__).resolve().parents[2]


@contextmanager
def staged(
    server_type: type[classroom.DiagnosticNativeServer],
) -> Iterator[classroom.DiagnosticNativeServer]:
    """Assemble real fixture files with only process launch and startup replaced."""
    with (
        patch.object(classroom.DiagnosticNativeServer, "start"),
        patch.object(classroom.DiagnosticNativeServer, "migrate"),
    ):
        server = server_type("/fixture-only/pocketbase")
        try:
            yield server
        finally:
            server.close()


class NativeFixtureContractTests(unittest.TestCase):
    def node(self, script: str) -> None:
        """Execute production JS source locally with explicit host-API doubles."""
        self.assertIsNotNone(
            shutil.which("node"),
            "Source fixture checks require the installed Node runtime; do not skip them.",
        )
        result = subprocess.run(
            ["node", "--input-type=module", "-e", script],
            cwd=ROOT,
            env={"PATH": os.environ.get("PATH", "")},
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        self.assertEqual(
            result.returncode,
            0,
            classroom.sanitize_diagnostics(result.stdout + result.stderr),
        )

    def test_classroom_installs_all_required_hooks_migrations_and_resolved_data(
        self,
    ) -> None:
        with staged(classroom.ClassroomServer) as server:
            self.assertTrue({"metrics.pb.js", "telemetry.js"}.issubset(classroom.HOOKS))
            expected = {
                "1790400000_classroom_rooms.js",
                "1790600000_classroom_presence.js",
                "1791300000_classroom_attendance.js",
                "1791400000_classroom_media_sessions.js",
                "1791400001_broadcast_classroom_lessons.js",
                "1791500002_authority_repair_lessons.js",
            }
            self.assertEqual(set(classroom.MIGRATIONS), expected)
            self.assertEqual(
                {path.name for path in (server.root / "migrations").glob("*.js")},
                expected | {"0000000001_fixture.js"},
            )
            self.assertEqual(
                min(path.name for path in (server.root / "migrations").glob("*.js")),
                "0000000001_fixture.js",
            )
            for name in expected:
                self.assertEqual(
                    (server.root / "migrations" / name).read_bytes(),
                    (ROOT / "apps/pocketbase/pb_migrations" / name).read_bytes(),
                )
            for name in classroom.HOOKS:
                copied = (
                    "fixture-original-realtime-lib.js"
                    if name == "classroom-realtime-lib.js"
                    else name
                )
                self.assertEqual(
                    (server.root / "hooks" / copied).read_bytes(),
                    (ROOT / "apps/pocketbase/pb_hooks" / name).read_bytes(),
                )
            data_dir = (server.root / "hooks/../pb_migrations/data").resolve()
            for name in ("starter-tutorials.json", "broadcast-classroom-lessons.json", "authority-repairs-lessons.json"):
                self.assertEqual(
                    (data_dir / name).read_bytes(),
                    (ROOT / "apps/pocketbase/pb_migrations/data" / name).read_bytes(),
                )
            self.assertIn(
                "$filepath.join(__hooks, '..', 'pb_migrations', 'data')", classroom.SEED
            )
            self.assertNotIn(
                "__LESSON__",
                (server.root / "migrations/0000000001_fixture.js").read_text(),
            )

    def test_copied_classroom_module_closure_and_registered_handlers_load(self) -> None:
        with staged(classroom.ClassroomServer) as server:
            hooks = server.root / "hooks"
            for path in hooks.glob("*.js"):
                for dependency in re.findall(
                    r"require\(`\$\{__hooks\}/([^`]+)`\)", path.read_text()
                ):
                    self.assertTrue(
                        (hooks / dependency).is_file(),
                        f"Required copied dependency missing: {dependency}",
                    )
            script = r"""
                import assert from 'node:assert/strict';
                import { readFileSync } from 'node:fs';
                import vm from 'node:vm';
                const hooks = __HOOK_PATH__;
                const routes = new Map(), cache = new Map(), middleware = [], recordHooks = new Map();
                const globals = { __hooks: hooks,
                    $os: { getenv: () => '' },
                    $apis: { requireAuth: (...collections) => ({ collections }), bodyLimit: (limit) => ({ limit }) },
                    routerAdd: (method, path, handler, ...middleware) => routes.set(method + ' ' + path, { handler, middleware }),
                    routerUse: (handler) => middleware.push(handler),
                };
                for (const name of ['onRecordAfterCreateSuccess', 'onRecordAfterUpdateSuccess', 'onRecordAfterDeleteSuccess',
                    'onRecordAfterCreateError', 'onRecordAfterUpdateError', 'onRecordAfterDeleteError'])
                    globals[name] = (handler) => recordHooks.set(name, handler);
                const load = (path) => {
                    if (cache.has(path)) return cache.get(path);
                    const module = { exports: {} };
                    vm.runInNewContext(readFileSync(path, 'utf8'), { ...globals, module, require: load }, { filename: path });
                    cache.set(path, module.exports); return module.exports;
                };
                for (const file of ['classrooms.pb.js', 'classroom-realtime.pb.js', 'classroom-presence.pb.js', 'metrics.pb.js']) load(hooks + '/' + file);
                for (const key of ['POST /api/classroom/session', 'POST /api/classroom/tracks', 'PUT /api/classroom/renegotiate',
                    'POST /api/classroom/close', 'GET /api/classroom/presence', 'POST /api/classroom/presence',
                    'GET /api/buildanddo/workspaces/{workspace}/classrooms/{id}/record']) {
                    assert.equal(typeof routes.get(key)?.handler, 'function', key);
                }
                assert.equal(typeof load(hooks + '/classrooms.js').mediaAccess, 'function');
                load(hooks + '/classroom-media.js');
                assert.equal(recordHooks.size, 6);
                assert.equal(middleware.length, 1);
                assert.equal(Object.hasOwn(globals, 'onServe'), false);
                const observe = vm.runInNewContext('(' + middleware[0].toString() + ')', { __hooks: hooks, require: load });
                let calls = 0;
                assert.equal(observe({ next: () => { calls++; return 'fixture-next'; } }), 'fixture-next');
                assert.equal(calls, 1);
            """.replace("__HOOK_PATH__", json.dumps(str(hooks)))
            self.node(script)

    def test_required_classroom_module_cannot_be_silently_omitted(self) -> None:
        original = shutil.copyfile

        def missing(source: Path, destination: Path) -> str:
            if Path(source).name == "classroom-media.js":
                raise FileNotFoundError("Required classroom-media.js is absent")
            return original(source, destination)

        with (
            patch("shutil.copyfile", side_effect=missing),
            patch("subprocess.run") as run,
        ):
            with self.assertRaisesRegex(FileNotFoundError, "classroom-media.js"):
                classroom.ClassroomServer("/fixture-only/pocketbase")
            run.assert_not_called()

    def test_learning_keeps_the_original_bundle_and_installs_the_additive_lesson(
        self,
    ) -> None:
        with staged(learning.LearningServer) as server:
            data_dir = (server.root / "hooks/../pb_migrations/data").resolve()
            original = json.loads((data_dir / "starter-tutorials.json").read_text())
            addition = json.loads(
                (data_dir / "broadcast-classroom-lessons.json").read_text()
            )
            self.assertEqual(len(original["lessons"]), 25)
            self.assertEqual(len(addition["lessons"]), 1)
            self.assertEqual(addition["lessons"][0]["id"], "bdobroadcast001")
            self.assertNotIn(
                "bdobroadcast001", {item["id"] for item in original["lessons"]}
            )
            for name in ("starter-tutorials.json", "broadcast-classroom-lessons.json", "authority-repairs-lessons.json"):
                self.assertEqual(
                    (data_dir / name).read_bytes(),
                    (ROOT / "apps/pocketbase/pb_migrations/data" / name).read_bytes(),
                )
            self.assertTrue(
                (
                    server.root / "migrations/1791400001_broadcast_classroom_lessons.js"
                ).is_file()
            )
            self.assertEqual(
                min(path.name for path in (server.root / "migrations").glob("*.js")),
                "0000000001_fixture.js",
            )
            self.assertEqual(
                (server.root / "hooks/tutorial-learning.pb.js").read_bytes(),
                (
                    ROOT / "apps/pocketbase/pb_hooks/tutorial-learning.pb.js"
                ).read_bytes(),
            )
            # The seed names its own data directory: 0.28.4 has no __hooks in migrations.
            self.assertIn("const dataDir = __FIXTURE_DATA_DIR__;", learning.SEED)
            self.assertNotIn(
                "__FIXTURE_DATA_DIR__",
                (server.root / "migrations/0000000001_fixture.js").read_text(),
            )
            self.assertNotIn("new Record(progress)", learning.SEED)
            self.assertNotIn("set('certificate'", learning.SEED)
            for name in ("1791500000_learning_progress_authority.js", "1791500002_authority_repair_lessons.js"):
                self.assertEqual((server.root / "migrations" / name).read_bytes(),
                                 (ROOT / "apps/pocketbase/pb_migrations" / name).read_bytes())
            authority = json.loads((data_dir / "authority-repairs-lessons.json").read_text())
            self.assertEqual(authority["lessons"][0]["id"], "bdoauthority001")
            self.assertNotIn("new Record(progress)", (server.root / "migrations/1791500000_learning_progress_authority.js").read_text())

    def test_workspace_installs_usage_migration_and_unmodified_registered_hook(
        self,
    ) -> None:
        with staged(workspace.WorkspaceServer) as server:
            name = "1791300001_assistant_turn_usage.js"
            self.assertEqual(
                (server.root / "migrations" / name).read_bytes(),
                (ROOT / "apps/pocketbase/pb_migrations" / name).read_bytes(),
            )
            for name in ("assistant.pb.js", "workspace-assistant.js", "workspace-claims.js", "workspace-claims.pb.js"):
                self.assertEqual(
                    (server.root / "hooks" / name).read_bytes(),
                    (ROOT / "apps/pocketbase/pb_hooks" / name).read_bytes(),
                )
            migrations = sorted(
                path.name for path in (server.root / "migrations").glob("*.js")
            )
            self.assertEqual(migrations[0], "0000000001_auth.js")
            self.assertEqual(
                migrations[-2:],
                ["1791500001_workspace_claim_authority.js", "1999999000_seed.js"],
            )
            name = "1791500001_workspace_claim_authority.js"
            self.assertEqual((server.root / "migrations" / name).read_bytes(),
                             (ROOT / "apps/pocketbase/pb_migrations" / name).read_bytes())

    def test_usage_field_and_actual_assistant_hook_handle_null_missing_field(
        self,
    ) -> None:
        self.node(r"""
            import assert from 'node:assert/strict';
            import { assistantFixture } from './tests/upgrade/assistant-fixture.mjs';
            const f = assistantFixture();
            const fields = f.collections.assistant_turns.fields;
            const get = fields.getByName.bind(fields);
            // PocketBase absent field lookups are null, unlike Array.find's undefined.
            fields.getByName = (name) => get(name) ?? null;
            const migration = f.migration('apps/pocketbase/pb_migrations/1791300001_assistant_turn_usage.js');
            assert.equal(fields.getByName('usage'), null);
            migration.up(); migration.up();
            assert.equal(fields.filter((field) => field.name === 'usage').length, 1);
            assert.equal(fields.getByName('usage').type, 'json');
            assert.equal(fields.getByName('usage').maxSize, 2000);
            f.agentConfig.enabled = false;
            const session = f.start();
            const failed = f.chat(session);
            assert.equal(failed.status, 'unavailable');
            assert.equal(failed.plan, null);
            assert.equal(f.data.assistant_turns.find((row) => row.id === failed.id).usage, null);
            assert.equal(f.agentConfig.calls.length, 0);
            migration.down(); migration.down();
            assert.equal(fields.getByName('usage'), null);
            const olderSchema = f.chat(session);
            assert.equal(olderSchema.status, 'unavailable');
            assert.equal(Object.hasOwn(f.data.assistant_turns.find((row) => row.id === olderSchema.id), 'usage'), false);
            migration.up();
            assert.equal(fields.getByName('usage').type, 'json');
            assert.equal(f.data.assistant_turns.length, 2);
            assert.equal(f.agentConfig.calls.length, 0);
        """)

    def test_provider_double_overrides_only_transport_and_configuration(self) -> None:
        self.node(
            r"""
            import assert from 'node:assert/strict';
            import { readFileSync } from 'node:fs';
            import vm from 'node:vm';
            const original = { exports: {} };
            vm.runInNewContext(readFileSync('apps/pocketbase/pb_hooks/classroom-realtime-lib.js', 'utf8'), {
                module: original, $os: { getenv: () => '' },
                $http: { send: () => { throw new Error('Network is forbidden in this source fixture.'); } },
            });
            for (const enabled of [false, true]) {
                const module = { exports: {} }, files = new Map();
                vm.runInNewContext(__DOUBLE__.replaceAll('__PROVIDER_ENABLED__', String(enabled)), {
                    module, __hooks: '/fixture/hooks', require: () => original.exports,
                    $filepath: { join: (...parts) => parts.join('/') }, toString: String,
                    $os: { readFile: (name) => files.get(name) || '', writeFile: (name, value) => files.set(name, value) },
                });
                assert.deepEqual(Object.keys(module.exports).sort(), Object.keys(original.exports).sort());
                for (const key of Object.keys(original.exports).filter((key) => !['callRealtime', 'realtimeConfig'].includes(key)))
                    assert.equal(module.exports[key], original.exports[key], key);
                if (!enabled) {
                    assert.equal(module.exports.realtimeConfig, original.exports.realtimeConfig);
                    assert.throws(() => module.exports.callRealtime('/fixture/sessions/new', '', {}), /forbids provider/);
                } else {
                    assert.equal(module.exports.realtimeConfig().appId, 'fixture-only-app');
                    assert.equal(module.exports.realtimeConfig().secret, 'fixture-only-not-a-credential');
                    const response = module.exports.callRealtime('/fixture/sessions/new', '', {});
                    assert.equal(response.status, 201);
                    assert.equal(response.body.sessionId, 'fixture-session-1');
                }
                assert.equal([...files.values()].join(''), 'POST /fixture/sessions/new\n');
            }
        """.replace("__DOUBLE__", json.dumps(classroom.PROVIDER_DOUBLE))
        )

    def test_fixture_provider_echo_runs_actual_media_scope_store_and_attendance(
        self,
    ) -> None:
        self.node(
            r"""
            import assert from 'node:assert/strict';
            import vm from 'node:vm';
            import { mediaFixture } from './tests/upgrade/classroom-media-fixture.mjs';
            const f = mediaFixture({ publishers: 'owner,viewer' });
            f.migration('apps/pocketbase/pb_migrations/1791300000_classroom_attendance.js').up();
            const provider = f.load('classroom-realtime-lib.js'), original = { ...provider };
            const module = { exports: {} }, files = new Map();
            vm.runInNewContext(__DOUBLE__.replaceAll('__PROVIDER_ENABLED__', 'true'), {
                module, __hooks: '/fixture/hooks', require: () => original,
                $filepath: { join: (...parts) => parts.join('/') }, toString: String,
                $os: { readFile: (name) => files.get(name) || '', writeFile: (name, value) => files.set(name, value) },
            });
            provider.callRealtime = module.exports.callRealtime;
            provider.realtimeConfig = module.exports.realtimeConfig;
            const room = f.start();
            f.command('room.join', { id: room }, { actor: 'viewer' });
            const created = f.session(room), subscribed = f.session(room, 'viewer');
            assert.equal(created.status, 200); assert.equal(subscribed.status, 200);
            assert.equal(created.body.may_publish, true); assert.equal(subscribed.body.may_publish, false);
            const source = created.body.sessionId, target = subscribed.body.sessionId;
            const scope = f.service.mediaAccess(f.app, f.app.findRecordById('users', 'owner'), room);
            assert.equal(scope.room.id, room); assert.equal(scope.workspace, 'ws1');
            assert.equal(scope.auth.id, 'owner'); assert.equal(scope.basis, 'host'); assert.equal(scope.can_manage, true);
            const stored = f.data.classroom_media_sessions.find((row) => row.session_id === source);
            assert.equal(stored.membership, scope.member.id); assert.equal(stored.member_revision, scope.member.get('revision'));
            assert.equal(stored.protocol_version, 1); assert.equal(stored.busy, false);
            assert.equal(stored.provider_app, 'fixture-only-app');
            const before = [...files.values()].join('');
            assert.equal(f.session(room, '').status, 401);
            assert.equal(f.session(room, 'outsider').status, 403);
            assert.equal(f.publish(room, target, 'viewer').status, 403);
            assert.equal(f.publish(room, 'unbound-session').status, 403);
            assert.equal(f.request('POST', '/api/classroom/tracks', { body: {
                room, sessionId: source, action: 'push', tracks: [{ location: 'local', mid: '0', trackName: 'seat:owner/mic' }],
            } }).status, 400);
            assert.equal(f.request('PUT', '/api/classroom/renegotiate', { actor: 'viewer', body: {
                room, sessionId: source, sessionDescription: { type: 'answer', sdp: 'fixture-only-answer' },
            } }).status, 403);
            assert.equal(f.request('PUT', '/api/classroom/renegotiate', { actor: 'viewer', body: {
                room, sessionId: target, sessionDescription: { type: 'offer', sdp: 'fixture-only-offer' },
            } }).status, 400);
            assert.equal([...files.values()].join(''), before, 'Every denial precedes fixture provider I/O.');
            assert.equal(f.publish(room, source).status, 200);
            const push = f.data.classroom_media_sessions.find((row) => row.session_id === source);
            assert.deepEqual(push.tracks, [{ trackName: 'seat:owner/mic', kind: 'audio' }]);
            const pull = f.request('POST', '/api/classroom/tracks', { actor: 'viewer', body: {
                room, sessionId: target, action: 'pull', tracks: [{ location: 'remote', sessionId: source, trackName: 'seat:owner/mic' }],
            } });
            assert.equal(pull.status, 200); assert.equal(pull.body.requiresImmediateRenegotiation, true);
            assert.equal(pull.body.sessionDescription.type, 'offer'); assert.equal(pull.body.tracks[0].sessionId, source);
            assert.equal(f.request('PUT', '/api/classroom/renegotiate', { actor: 'viewer', body: {
                room, sessionId: target, sessionDescription: { type: 'answer', sdp: 'fixture-only-answer' },
            } }).status, 200);
            assert.equal(f.request('POST', '/api/classroom/close', { actor: 'viewer', body: { room, sessionId: source } }).status, 403);
            f.command('room.leave', { id: room, membership_revision: scope.member.get('revision') });
            assert.equal(f.request('POST', '/api/classroom/close', { body: { room, sessionId: source } }).status, 200);
            assert.equal(f.data.classroom_media_sessions.find((row) => row.session_id === source).active, false);
            assert.equal(f.data.classroom_media_sessions.every((row) => row.busy === false), true);
            assert.deepEqual(f.data.classroom_attendance.map((row) => row.event), ['start', 'join', 'join', 'leave']);
            assert.equal(f.data.evidence.length, 0);
            assert.equal([...files.values()].join('').trim().split('\n').length, 5);
            assert.equal(f.requests.length, 0, 'Only the two injected provider functions ran; no HTTP transport was used.');
        """.replace("__DOUBLE__", json.dumps(classroom.PROVIDER_DOUBLE))
        )

    def test_fixture_environment_does_not_inherit_provider_configuration(self) -> None:
        with patch.dict(
            os.environ,
            {
                "CLOUDFLARE_REALTIME_APP_SECRET": "synthetic-environment-only",
                "BUILDANDDO_ASSISTANT_URL": "https://fixture.invalid/inference",
                "BUILDANDDO_ASSISTANT_TOKEN": "synthetic-environment-only",
                "BUILDANDDO_TELEMETRY_TRANSPORT": "stdout",
                "DD_API_KEY": "synthetic-environment-only",
            },
        ):
            for server_type in (
                workspace.WorkspaceServer,
                learning.LearningServer,
                classroom.ClassroomServer,
            ):
                with (
                    self.subTest(server=server_type.__name__),
                    staged(server_type) as server,
                ):
                    # SystemRoot is the Windows directory, not a credential; without it the
                    # native binary cannot start Winsock there.
                    self.assertLessEqual(
                        set(server.environment),
                        {"PATH", "BUILDANDDO_CLASSROOM_PUBLISHERS"}
                        | ({"SystemRoot"} if os.name == "nt" else set()),
                    )
                    self.assertNotIn(
                        "synthetic-environment-only", str(server.environment)
                    )
                    self.assertFalse(
                        (server.root / "native.log").exists(),
                        "Raw startup credentials must not become a named retained log.",
                    )

    def test_declared_profiles_and_existing_native_test_floors_are_preserved(
        self,
    ) -> None:
        self.assertEqual(runtime_version(ROOT, "package"), "0.39.8")
        self.assertEqual(runtime_version(ROOT, "compose"), "0.39.8")
        for name in ("native_classroom", "native_workspace", "native_learning"):
            self.assertEqual(CHECKS[name].level, "native")
            self.assertIn("--require-binary", CHECKS[name].argv)
        for case, floor in (
            (classroom.NativeClassroomTests, 3),
            (workspace.NativeWorkspaceTests, 7),
            (learning.NativeLearningTests, 10),
        ):
            self.assertGreaterEqual(
                unittest.defaultTestLoader.loadTestsFromTestCase(case).countTestCases(),
                floor,
            )

    def test_required_entrypoints_fail_instead_of_passing_when_binary_is_missing(
        self,
    ) -> None:
        for name in (
            "test_classroom_native.py",
            "test_workspace_native.py",
            "test_tutorial_learning_native.py",
        ):
            with self.subTest(entrypoint=name):
                result = subprocess.run(
                    [
                        sys.executable,
                        str(ROOT / "tests/upgrade" / name),
                        "--require-binary",
                    ],
                    cwd=ROOT,
                    env={
                        "PATH": os.environ.get("PATH", ""),
                        "BUILDANDDO_TEST_POCKETBASE": "",
                    },
                    capture_output=True,
                    text=True,
                    timeout=30,
                    check=False,
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("FAIL:", result.stderr)
                self.assertIn("did not run", result.stderr)
                self.assertNotIn("OK (skipped", result.stderr)


class NativeDiagnosticTests(unittest.TestCase):
    def test_sanitizer_preserves_migration_failures_not_bootstrap_material(
        self,
    ) -> None:
        sensitive = "synthetic-bootstrap-value-only"
        raw = (
            "\x1b[31mError: migration usage JSONField is missing\x1b[0m\n"
            + "superuser password: "
            + sensitive
            + "\n"
            + "Authorization: Bearer "
            + sensitive
            + "\n"
            + "http://127.0.0.1:8090/_/#/pbinstal/"
            + sensitive
            + "\n"
            + 'token="'
            + sensitive
            + '"\n'
            + "fixture-user@fixture.invalid\n"
        )
        sanitized = classroom.sanitize_diagnostics(raw)
        self.assertIn("Error: migration usage JSONField is missing", sanitized)
        self.assertNotIn(sensitive, sanitized)
        self.assertNotIn("http://", sanitized)
        self.assertNotIn("fixture-user@", sanitized)
        self.assertNotIn("\x1b", sanitized)
        self.assertLessEqual(len(classroom.sanitize_diagnostics("x" * 100000)), 12000)

    def test_migration_failure_survives_cleanup_with_sanitized_diagnostics(
        self,
    ) -> None:
        roots = []
        capture = io.StringIO()

        def failed(_args: list[str], **options: object) -> SimpleNamespace:
            roots.append(Path(options["cwd"]))
            options["stdout"].write(
                b"Error: assistant_turns.usage rejected\npassword: fixture-bootstrap-only\n"
            )
            return SimpleNamespace(returncode=1)

        with (
            patch("subprocess.run", side_effect=failed),
            patch.object(classroom.DiagnosticNativeServer, "start") as start,
        ):
            with (
                redirect_stderr(capture),
                self.assertRaisesRegex(
                    AssertionError, "assistant_turns.usage rejected"
                ) as error,
            ):
                workspace.WorkspaceServer("/fixture-only/pocketbase")
        start.assert_not_called()
        self.assertIn("assistant_turns.usage rejected", capture.getvalue())
        self.assertNotIn(
            "fixture-bootstrap-only", str(error.exception) + capture.getvalue()
        )
        self.assertFalse(roots[0].exists())

    def test_native_startup_exit_keeps_hook_error_and_discards_raw_log(self) -> None:
        roots = []
        capture = io.StringIO()

        def exited(_args: list[str], **options: object) -> Mock:
            roots.append(Path(options["cwd"]))
            options["stdout"].write(
                b"ReferenceError: classroom_media_session_field is not defined\nhttp://127.0.0.1:8090/_/#/pbinstal/fixture-bootstrap-only\n"
            )
            return Mock(poll=Mock(return_value=2))

        with (
            patch("subprocess.run", return_value=SimpleNamespace(returncode=0)),
            patch("subprocess.Popen", side_effect=exited),
        ):
            with (
                redirect_stderr(capture),
                self.assertRaisesRegex(
                    AssertionError, "ReferenceError: classroom_media_session_field"
                ) as error,
            ):
                learning.LearningServer("/fixture-only/pocketbase")
        self.assertIn("ReferenceError", capture.getvalue())
        self.assertNotIn(
            "fixture-bootstrap-only", str(error.exception) + capture.getvalue()
        )
        self.assertFalse(roots[0].exists())

    def test_migration_timeout_keeps_bounded_error_and_hides_partial_secret_line(
        self,
    ) -> None:
        capture = io.StringIO()

        def timeout(args: list[str], **options: object) -> None:
            options["stdout"].write(
                b"token="
                + b"private-fragment-" * 5000
                + b"\nError: migration lock timed out\n"
            )
            raise subprocess.TimeoutExpired(args, 45)

        with patch("subprocess.run", side_effect=timeout):
            with (
                redirect_stderr(capture),
                self.assertRaisesRegex(
                    AssertionError, "migration lock timed out"
                ) as error,
            ):
                workspace.WorkspaceServer("/fixture-only/pocketbase")
        retained = str(error.exception) + capture.getvalue()
        self.assertIn("TimeoutExpired", retained)
        self.assertNotIn("private-fragment-", retained)
        self.assertLess(len(retained), 25000)


if __name__ == "__main__":
    unittest.main(verbosity=2)
