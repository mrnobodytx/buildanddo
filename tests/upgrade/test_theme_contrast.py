# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_theme_contrast.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-14
# Depends:     apps/web/src/index.css
# EnumType:    Test
# EnumEdges:   DEPENDS_ON apps/web/src/index.css
# DAG Node:    none
# Intent:      Prevent unreadable body, card, navigation and primary text in either color theme.
# ───────────────────────────────────────────────────────────────

"""Check normal text contrast in the actual light and dark design tokens."""
import colorsys
from pathlib import Path
import re
import unittest


def luminance(hsl: str) -> float:
    """Convert a CSS HSL triplet to relative sRGB luminance."""
    hue, saturation, lightness = map(float, hsl.replace("%", "").split())
    rgb = colorsys.hls_to_rgb(hue / 360, lightness / 100, saturation / 100)
    linear = [value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4 for value in rgb]
    return sum(value * weight for value, weight in zip(linear, (0.2126, 0.7152, 0.0722)))


class ThemeContrastTests(unittest.TestCase):
    def test_normal_text_remains_readable_in_both_themes(self) -> None:
        css = (Path(__file__).resolve().parents[2] / "apps/web/src/index.css").read_text()
        pairs = [("foreground", "background"), ("muted-foreground", "background"),
                 ("card-foreground", "card"), ("primary-foreground", "primary"),
                 ("primary", "background"), ("paper-muted", "paper"),
                 ("sidebar-foreground", "sidebar-background")]
        for theme in (":root", ".dark"):
            block = re.search(re.escape(theme) + r"\s*\{([^}]+)", css)
            self.assertIsNotNone(block)
            assert block is not None
            tokens = dict(re.findall(r"--([a-z-]+):\s*([^;]+);", block.group(1)))
            for foreground, background in pairs:
                with self.subTest(theme=theme, foreground=foreground, background=background):
                    dim, bright = sorted((luminance(tokens[foreground]), luminance(tokens[background])))
                    self.assertGreaterEqual((bright + 0.05) / (dim + 0.05), 4.5)


if __name__ == "__main__":
    unittest.main()
