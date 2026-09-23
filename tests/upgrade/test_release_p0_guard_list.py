# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_release_p0_guard_list.py
# Stage:       09_VERIFY
# SRS:         SRS-BUILDANDDO-PURPOSE-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     tools/buildanddo_release.py
# EnumType:    Test
# EnumEdges:   VERIFIES tools/buildanddo_release.py::p0_state
# Intent:      The P0 legacy-copy gate must not fire on the product's own RETIRED_PHRASES guard
#              list, and must still fire on the same phrase used as copy.
# ───────────────────────────────────────────────────────────────
"""p0_state and the retired-phrase guard list.

Measured 2026-09-23: apps/web/src/lib/purpose.js declares RETIRED_PHRASES so the pages can
refuse old framing at runtime. The list quotes 'try a business challenge', the release controller
read that as product copy, and identity_pass went HOLD on a file whose purpose is to keep that
phrase OUT of the product. These tests pin the split both ways.

The controller is loaded by file path so a foreign `tools` package earlier on sys.path cannot
shadow it (this workstation exports one).
"""
from __future__ import annotations

import importlib.util
import os
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
CONTROLLER = REPO / "tools" / "buildanddo_release.py"


def _load_controller():
    spec = importlib.util.spec_from_file_location("_bnd_release_under_test", CONTROLLER)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _seed(repo: Path) -> None:
    """The minimum product surface that makes every other P0 flag true."""
    web = repo / "apps" / "web" / "src"
    (web / "pages").mkdir(parents=True)
    (web / "lib").mkdir(parents=True)
    (web / "pages" / "Home.jsx").write_text(
        "export default () => (<main><h1>Learn by doing real work</h1>"
        "<p>Learn with people and AI</p><a>Start learning</a><a>Build something</a>"
        "<p>What do you want to do?</p><a>Learn something</a>"
        "<a>Deploy my first website</a></main>);\n",
        encoding="utf-8")
    (repo / ".gitlab-ci.yml").write_text("stages: [verify]\n# /_version readback\n", encoding="utf-8")


class RetiredPhraseGuardListTests(unittest.TestCase):
    def setUp(self):
        self.release = _load_controller()
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self.tmp.name)
        _seed(self.repo)

    def tearDown(self):
        self.tmp.cleanup()

    def _guard_list(self, text: str) -> None:
        (self.repo / "apps" / "web" / "src" / "lib" / "purpose.js").write_text(text, encoding="utf-8")

    def test_guard_list_entry_does_not_gate_and_is_still_reported(self):
        self._guard_list(
            "export const RETIRED_PHRASES = Object.freeze([\n"
            "    'one business problem',\n"
            "    'try a business challenge',\n"
            "]);\n")
        p0 = self.release.p0_state(self.repo)
        self.assertTrue(p0["identity_pass"], p0["legacy_matches"])
        self.assertEqual(p0["legacy_matches"], [])
        reclassified = [h for h in p0["legacy_commentary"] if h.get("reclassified")]
        self.assertEqual(len(reclassified), 1)
        self.assertEqual(reclassified[0]["reclassified"], "retired-phrase guard list")
        self.assertTrue(reclassified[0]["path"].endswith("purpose.js"))

    def test_same_phrase_as_page_copy_still_gates(self):
        self._guard_list("export const RETIRED_PHRASES = Object.freeze([]);\n")
        (self.repo / "apps" / "web" / "src" / "pages" / "Challenge.jsx").write_text(
            "export default () => <button>Try a business challenge</button>;\n", encoding="utf-8")
        p0 = self.release.p0_state(self.repo)
        self.assertFalse(p0["identity_pass"])
        self.assertEqual(len(p0["legacy_matches"]), 1)
        self.assertTrue(p0["legacy_matches"][0]["path"].endswith("Challenge.jsx"))

    def test_quoted_line_in_a_file_without_a_guard_list_still_gates(self):
        # A string literal in a component is copy, not a guard: the file declares no RETIRED_PHRASES.
        (self.repo / "apps" / "web" / "src" / "pages" / "Cta.jsx").write_text(
            "const label = [\n    'try a business challenge',\n];\nexport default () => <a>{label[0]}</a>;\n",
            encoding="utf-8")
        p0 = self.release.p0_state(self.repo)
        self.assertFalse(p0["identity_pass"])
        self.assertEqual(len(p0["legacy_matches"]), 1)

    def test_phrase_inside_jsx_text_in_the_guard_file_still_gates(self):
        # The guard file itself rendering the phrase as text is copy; only a bare list entry is exempt.
        self._guard_list(
            "export const RETIRED_PHRASES = Object.freeze([]);\n"
            "export const Banner = () => <p>Try a business challenge</p>;\n")
        p0 = self.release.p0_state(self.repo)
        self.assertFalse(p0["identity_pass"])


if __name__ == "__main__":
    unittest.main()
