# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_discordbot_doctor.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-15
# Depends:     scripts/discordbot/doctor.py
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/discordbot/doctor.py
# DAG Node:    none
# Intent:      Verify startup diagnostics expose only prerequisites and never read credential files, contact services or assert activation.
# ───────────────────────────────────────────────────────────────

"""Check read-only runtime diagnostics independently from live activation."""
from __future__ import annotations

from contextlib import redirect_stdout
from io import StringIO
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from scripts.discordbot import doctor


class DoctorTests(unittest.TestCase):
    def test_missing_runtime_is_a_failure_not_a_successful_empty_install(self) -> None:
        report = doctor.inspect_startup('bot', {}, available=lambda _: False)
        self.assertEqual(report['local_prerequisites'], 'FAIL')
        self.assertEqual(report['defined_command_count'], 13)
        self.assertEqual(report['runtime_state'], 'UNVERIFIED')
        self.assertEqual(report['service_launcher'], 'UNVERIFIED')
        self.assertIn('DISABLED', json.dumps(report))

    def test_complete_local_bot_configuration_is_not_live_readiness(self) -> None:
        env = {'BAD_DISCORD': 'synthetic-test-binding-never-output', 'BUILDANDDO_DISCORD_RESEARCH_BINDINGS': json.dumps([
            {'guild_id': '12345678901234567', 'channel_id': '23456789012345678', 'workspace': 'private-workspace'}]),
            'BUILDANDDO_POCKETBASE_URL': 'https://backend.invalid', 'BUILDANDDO_DISCORD_PB_TOKEN': 'synthetic-native-binding-never-output'}
        report = doctor.inspect_startup('bot', env, available=lambda _: True)
        self.assertEqual(report['local_prerequisites'], 'PASS')
        self.assertEqual(report['defined_command_count'], 25)
        output = json.dumps(report)
        for value in ['synthetic-test-binding-never-output', 'private-workspace', '12345678901234567', 'backend.invalid', 'synthetic-native-binding-never-output']:
            self.assertNotIn(value, output)
        self.assertIn('UNVERIFIED', output)

    def test_malformed_scope_sync_and_missing_bridge_binding_are_reported_safely(self) -> None:
        for values in [{'BUILDANDDO_DISCORD_SYNC': 'unexpected'}, {'BUILDANDDO_DISCORD_SYNC': 'guild'},
                       {'BUILDANDDO_DISCORD_RESEARCH_BINDINGS': 'invalid-json'},
                       {'BUILDANDDO_DISCORD_RESEARCH_BINDINGS': json.dumps([{'guild_id': '12345678901234567', 'channel_id': '23456789012345678', 'workspace': 'ws1'}])}]:
            report = doctor.inspect_startup('bot', {'BAD_DISCORD': 'fixture-only', **values}, available=lambda _: True)
            self.assertEqual(report['local_prerequisites'], 'FAIL')
            self.assertNotIn('fixture-only', json.dumps(report))

    def test_bridge_scopes_must_be_allowed_by_bot_settings(self) -> None:
        env = {'BAD_DISCORD': 'fixture-only', 'BUILDANDDO_DISCORD_RESEARCH_BINDINGS': json.dumps([
            {'guild_id': '12345678901234567', 'channel_id': '23456789012345678', 'workspace': 'ws1'}]),
            'BUILDANDDO_POCKETBASE_URL': 'http://127.0.0.1:8090', 'BUILDANDDO_DISCORD_PB_TOKEN': 'fixture-only',
            'BUILDANDDO_DISCORD_GUILD_IDS': '12345678901234567', 'BUILDANDDO_DISCORD_CHANNEL_IDS': '34567890123456789'}
        self.assertEqual(doctor.inspect_startup('bot', env, available=lambda _: True)['local_prerequisites'], 'FAIL')
        env['BUILDANDDO_DISCORD_CHANNEL_IDS'] = '23456789012345678'
        env['BUILDANDDO_DISCORD_SYNC'] = 'guild'
        report = doctor.inspect_startup('bot', env, available=lambda _: True)
        self.assertEqual(report['local_prerequisites'], 'PASS')
        self.assertIn('authorize', json.dumps(report))

    def test_worker_checks_real_parser_contracts_but_never_contacts_providers(self) -> None:
        env = {'BUILDANDDO_RESEARCH_TOKEN': 'fixture-only', 'BUILDANDDO_POCKETBASE_URL': 'http://127.0.0.1:8090',
               'BUILDANDDO_RESEARCH_WORKSPACE': 'workspace1'}
        self.assertEqual(doctor.inspect_startup('worker', env, available=lambda _: True)['local_prerequisites'], 'PASS')
        env['BUILDANDDO_FIRECRAWL_URL'] = 'http://firecrawl:3002'
        self.assertEqual(doctor.inspect_startup('worker', env, available=lambda _: True)['local_prerequisites'], 'FAIL')
        env['BUILDANDDO_FIRECRAWL_EGRESS_GUARDED'] = '1'
        env['BUILDANDDO_TRANSCRIPTION_URL'] = 'http://transcriber:8080/v1/audio/transcriptions'
        self.assertEqual(doctor.inspect_startup('worker', env, available=lambda _: True)['local_prerequisites'], 'FAIL')
        env['BUILDANDDO_TRANSCRIPTION_MODEL'] = 'configured-model'
        report = doctor.inspect_startup('worker', env, available=lambda _: True)
        self.assertEqual(report['local_prerequisites'], 'PASS')
        self.assertIn('UNVERIFIED', json.dumps(report))
        self.assertNotIn('configured-model', json.dumps(report))
        self.assertEqual(doctor.inspect_startup('worker', {}, available=lambda _: False)['local_prerequisites'], 'FAIL')

    def test_incomplete_source_and_old_python_fail_with_no_dotenv_read(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            report = doctor.inspect_startup('bot', {}, root=Path(folder), available=lambda _: True, python_version=(3, 10))
            self.assertEqual(report['local_prerequisites'], 'FAIL')
            failed = {row['check'] for row in report['checks'] if row['state'] == 'FAIL'}
            self.assertTrue({'source_bundle', 'python'} <= failed)
        with self.assertRaises(ValueError):
            doctor.inspect_startup('service', {})

    def test_module_detection_and_cli_return_codes_preserve_activation_boundary(self) -> None:
        self.assertTrue(doctor.installed('json'))
        self.assertFalse(doctor.installed('not_an_installed_test_module'))
        with patch.object(doctor.importlib.util, 'find_spec', side_effect=ValueError):
            self.assertFalse(doctor.installed('discord'))
        for state, code in [('PASS', 0), ('FAIL', 1)]:
            output = StringIO()
            with redirect_stdout(output), patch.object(doctor, 'inspect_startup', return_value={'local_prerequisites': state, 'runtime_state': 'UNVERIFIED'}):
                self.assertEqual(doctor.main(['--component', 'bot']), code)
            self.assertEqual(json.loads(output.getvalue())['runtime_state'], 'UNVERIFIED')


if __name__ == '__main__':
    unittest.main()
