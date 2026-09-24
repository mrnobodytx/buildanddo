#!/usr/bin/env python3
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/ci/readme_check.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-CHANGELOG-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CHANGELOG-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     README.md, scripts/ci/sprint_cycle.py
# EnumType:    Service
# EnumEdges:   VALIDATES README.md; CONSUMES scripts/ci/sprint_cycle.py;
#              GATES .github/workflows/pr-governance.yml; GATES .gitlab-ci.yml
# Intent:      Stop the README from silently falling behind the repository it describes.
# ───────────────────────────────────────────────────────────────
"""Regression check for README.md.

The README is the first thing a skeptic reads, and every claim in it can go
stale without anything failing: an app gets added and never mentioned, a doc is
renamed and its link 404s, the roadmap moves and the table does not. This check
turns those into build failures.

Four rules, each measured against the working tree:

- links:    every relative link or image target in README.md exists, and every
            in-page `#anchor` names a real heading.
- coverage: every directory under apps/ and services/, and every CI definition
            (.github/workflows/*.yml, .gitlab-ci.yml), is named in README.md.
            Adding a system without documenting it is the regression this
            catches.
- roadmap:  the block between the roadmap markers is exactly what
            scripts/ci/sprint_cycle.py MILESTONES renders to. `--write`
            regenerates it; nothing else should edit it.
- markers:  each generated block's markers appear exactly once, in order.

Standard library only, matching the other scripts in this directory.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
README = "README.md"

ROADMAP_BEGIN = "<!-- readme:roadmap:begin -->"
ROADMAP_END = "<!-- readme:roadmap:end -->"
CATALOGUE_BEGIN = "<!-- readme:catalogue:begin -->"
CATALOGUE_END = "<!-- readme:catalogue:end -->"

# Directories whose every child must be named in the README. A child counts as
# named when its repo-relative path (e.g. `apps/web`) appears anywhere in the
# text, so a table row, a tree line or a link all satisfy it.
COVERED_PARENTS = ("apps", "services")

# Markdown links and images: [text](target) / ![alt](target). HTML href/src
# attributes are read too, because the hero and badges are HTML.
MD_LINK = re.compile(r"!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+\"[^\"]*\")?\s*\)")
HTML_LINK = re.compile(r"""(?:href|src)\s*=\s*["']([^"']+)["']""")
HEADING = re.compile(r"^(#{1,6})\s+(.+?)\s*#*\s*$")
FENCE = re.compile(r"^\s*(```|~~~)")


class ReadmeError(Exception):
    """Raised when README.md cannot be read or the roadmap source cannot load."""


def strip_code(text: str) -> str:
    """Blank out fenced code blocks so example paths inside them are not links."""
    out, fenced = [], False
    for line in text.splitlines():
        if FENCE.match(line):
            fenced = not fenced
            out.append("")
            continue
        out.append("" if fenced else line)
    return "\n".join(out)


def slugify(heading: str) -> str:
    """Return the anchor GitHub generates for a heading.

    GitHub lower-cases, drops inline markup and punctuation other than hyphens
    and underscores, and turns each space into a hyphen without collapsing runs.
    """
    text = re.sub(r"`([^`]*)`", r"\1", heading)
    text = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = unicodedata.normalize("NFKC", text).strip().lower()
    text = "".join(ch for ch in text if ch.isalnum() or ch in " -_")
    return text.replace(" ", "-")


def anchors(text: str) -> set[str]:
    """Return every heading anchor in the document, with GitHub's -1, -2 suffixes."""
    seen: dict[str, int] = {}
    found: set[str] = set()
    for line in strip_code(text).splitlines():
        match = HEADING.match(line)
        if not match:
            continue
        slug = slugify(match.group(2))
        count = seen.get(slug, 0)
        found.add(slug if count == 0 else f"{slug}-{count}")
        seen[slug] = count + 1
    # Explicit HTML anchors (<a id="..."> / <a name="...">) are link targets too.
    found.update(re.findall(r"""<a\s+(?:id|name)\s*=\s*["']([^"']+)["']""", text))
    return found


def link_targets(text: str) -> list[str]:
    body = strip_code(text)
    return MD_LINK.findall(body) + HTML_LINK.findall(body)


def check_links(root: Path, text: str) -> list[str]:
    """Report relative targets that do not exist and anchors that match no heading."""
    problems: list[str] = []
    known = anchors(text)
    for target in link_targets(text):
        if re.match(r"^[a-z][a-z0-9+.-]*:", target, re.I) or target.startswith("//"):
            continue  # absolute URL or mailto: - reachability is not a source property
        path, _, fragment = target.partition("#")
        if not path:
            if fragment and fragment not in known:
                problems.append(f"links: #{fragment} names no heading in {README}")
            continue
        resolved = (root / path.split("?", 1)[0]).resolve()
        try:
            resolved.relative_to(root.resolve())
        except ValueError:
            problems.append(f"links: {target} points outside the repository")
            continue
        if not resolved.exists():
            problems.append(f"links: {target} does not exist")
    return problems


def required_names(root: Path) -> list[str]:
    """Return every repo path the README must name."""
    names: list[str] = []
    for parent in COVERED_PARENTS:
        base = root / parent
        if base.is_dir():
            names.extend(
                f"{parent}/{child.name}"
                for child in sorted(base.iterdir())
                if child.is_dir() and not child.name.startswith((".", "_"))
            )
    workflows = root / ".github" / "workflows"
    if workflows.is_dir():
        names.extend(f".github/workflows/{p.name}" for p in sorted(workflows.glob("*.yml")))
    if (root / ".gitlab-ci.yml").is_file():
        names.append(".gitlab-ci.yml")
    return names


def check_coverage(root: Path, text: str) -> list[str]:
    missing = []
    for name in required_names(root):
        # Match the path as a token, so `apps/web` is not satisfied by `apps/webhooks`.
        if not re.search(rf"(?<![\w/.-]){re.escape(name)}(?![\w-])", text):
            missing.append(f"coverage: {name} exists but {README} never names it")
    return missing


def load_milestones(root: Path) -> list[dict]:
    """Load MILESTONES from sprint_cycle.py, the canonical plan."""
    source = root / "scripts" / "ci" / "sprint_cycle.py"
    spec = importlib.util.spec_from_file_location("_readme_sprint_cycle", source)
    if spec is None or spec.loader is None:
        raise ReadmeError(f"cannot load {source}")
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except Exception as exc:  # noqa: BLE001 - any import failure means no canonical plan
        raise ReadmeError(f"cannot load {source}: {type(exc).__name__}: {exc}") from exc
    milestones = getattr(module, "MILESTONES", None)
    if not isinstance(milestones, list) or not milestones:
        raise ReadmeError(f"{source} has no MILESTONES list")
    return milestones


def render_roadmap(milestones: list[dict]) -> str:
    """Render the roadmap table. A pure function of MILESTONES, so --check is exact."""
    lines = [
        "| Day | Milestone | Planned |",
        "|---:|---|---:|",
    ]
    for item in sorted(milestones, key=lambda m: int(m["day"])):
        value = int(item["planned_value"])
        # Half-up, not round(): banker's rounding drew 5% as an empty bar and 65% like 60%.
        filled = min(10, (value + 5) // 10)
        bar = "▰" * filled + "▱" * (10 - filled)
        lines.append(f"| {int(item['day'])} | {item['title']} | `{bar}` {value}% |")
    return "\n".join(lines)


# ── README catalogue ───────────────────────────────────────────────────────────────────────
# Every README in the tree, grouped by area, so the root README is the index to all of them.
# Generated, so a README added anywhere fails the check until the catalogue carries it.
CATALOGUE_SKIP_DIRS = {"node_modules", "dist", "state", "reports", "__pycache__", "venv"}
# Hidden directories are tool caches (.pytest_cache, .venv, .git) except these two, which are source.
CATALOGUE_HIDDEN_ALLOWED = {".bits", ".github"}
CATALOGUE_GROUPS = (
    # (path prefix, label). First match wins; order matters.
    (".bits/", "Governance and agent context"),
    ("apps/", "Applications"),
    ("services/", "Services"),
    ("libs/", "Libraries"),
    ("design/broadcast-classroom/components/", "Broadcast-classroom components"),
    ("design/", "Design system"),
    ("docs/", "Documentation"),
    ("foundry/lanes/", "Foundry research lanes"),
    ("foundry/", "Foundry"),
    ("", "Other"),
)
SUMMARY_MAX = 150
CGRF_START = re.compile(r"^\s*(?:#|<!--)\s*─+\s*CGRF Header")
CGRF_RULE = re.compile(r"^\s*(?:#\s*)?─{8,}\s*(?:-->)?\s*$")
CGRF_FIELD = re.compile(r"^\s*#?\s*([A-Za-z ]+):\s*(.*)$")
CGRF_CONTINUATION = re.compile(r"^\s*#?\s{2,}(\S.*)$")


def find_readmes(root: Path) -> list[str]:
    """Every README.md under the root except the root README itself, as sorted posix paths."""
    found: list[str] = []
    for current, dirs, files in os.walk(root):
        dirs[:] = sorted(
            d for d in dirs
            if d not in CATALOGUE_SKIP_DIRS and (not d.startswith(".") or d in CATALOGUE_HIDDEN_ALLOWED)
        )
        for name in files:
            if name.lower() == "readme.md":
                rel = (Path(current) / name).relative_to(root).as_posix()
                if rel != README:
                    found.append(rel)
    return sorted(found)


def describe_readme(path: Path) -> tuple[str, str]:
    """Return (title, summary). The CGRF Intent is the summary when present: the author wrote it
    as exactly that. Otherwise the first prose paragraph after the title."""
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    intent: list[str] = []
    body_start = 0
    if lines and CGRF_START.match(lines[0]):
        in_intent = False
        for index, line in enumerate(lines[1:], start=1):
            if CGRF_RULE.match(line):
                body_start = index + 1
                break
            field = CGRF_FIELD.match(line)
            continuation = CGRF_CONTINUATION.match(line)
            if field and not continuation:
                in_intent = field.group(1).strip().lower() == "intent"
                if in_intent:
                    intent.append(field.group(2).strip())
            elif in_intent and continuation:
                intent.append(continuation.group(1).strip())
    title, paragraph, fenced = "", [], False
    for line in lines[body_start:]:
        if FENCE.match(line):
            fenced = not fenced
            continue
        if fenced or line.strip().startswith("<!--"):
            continue
        heading = HEADING.match(line)
        if heading and not title:
            title = heading.group(2).strip()
            continue
        if not title:
            if not line.strip() or line.strip().startswith(("<", "!", "[")):
                continue
            # Prose before any heading: the README is untitled, so its folder names it.
            title = path.parent.name.replace("-", " ").replace("_", " ").capitalize()
        if heading or (not line.strip() and paragraph):
            if paragraph:
                break
            continue
        stripped = line.strip()
        if stripped and not stripped.startswith(("|", "<", "!", "---", "- ", "* ", ">")):
            paragraph.append(stripped)
    summary = " ".join(intent) if intent else " ".join(paragraph)
    return title or path.parent.name, shorten(summary)


def shorten(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip().replace("|", "\\|")
    if len(text) <= SUMMARY_MAX:
        return text
    cut = text[:SUMMARY_MAX].rsplit(" ", 1)[0].rstrip(",;:—-")
    # Never leave an unbalanced code span behind a cut.
    if cut.count("`") % 2:
        cut = cut.rsplit("`", 1)[0].rstrip()
    return cut + "…"


def render_catalogue(root: Path) -> str:
    groups: dict[str, list[str]] = {}
    for rel in find_readmes(root):
        label = next(name for prefix, name in CATALOGUE_GROUPS if rel.startswith(prefix))
        title, summary = describe_readme(root / rel)
        where = rel.rsplit("/", 1)[0] if "/" in rel else "."
        title = title.replace("|", "\\|")
        groups.setdefault(label, []).append(f"| [{title}](./{rel}) | `{where}` | {summary} |")
    out: list[str] = []
    for _, label in CATALOGUE_GROUPS:
        rows = groups.get(label)
        if not rows:
            continue
        out += [
            "<details>",
            f"<summary><strong>{label}</strong> · {len(rows)}</summary>",
            "",
            "| README | Location | What it covers |",
            "|---|---|---|",
            *rows,
            "",
            "</details>",
            "",
        ]
    return "\n".join(out).rstrip("\n")


# ── generated blocks ───────────────────────────────────────────────────────────────────────
# (name, begin marker, end marker, renderer). Each block is a pure function of the tree, so
# --check is exact and --write is idempotent.
BLOCKS = (
    ("roadmap", ROADMAP_BEGIN, ROADMAP_END,
     lambda root: render_roadmap(load_milestones(root)), "scripts/ci/sprint_cycle.py MILESTONES"),
    ("catalogue", CATALOGUE_BEGIN, CATALOGUE_END, render_catalogue, "the README files in the tree"),
)


def split_block(text: str, begin: str, end: str) -> tuple[str, str, str] | None:
    if text.count(begin) != 1 or text.count(end) != 1 or text.index(begin) > text.index(end):
        return None
    head, _, rest = text.partition(begin)
    body, _, tail = rest.partition(end)
    return head, body, tail


def regenerate(root: Path, text: str) -> tuple[str, list[str]]:
    """Return the README with every generated block rebuilt, and the marker problems found."""
    problems: list[str] = []
    for name, begin, end, render, _ in BLOCKS:
        parts = split_block(text, begin, end)
        if parts is None:
            problems.append(f"markers: {README} must contain {begin} before {end}, exactly once each")
            continue
        head, _, tail = parts
        text = f"{head}{begin}\n{render(root)}\n{end}{tail}"
    return text, problems


def check(root: Path) -> dict:
    path = root / README
    if not path.is_file():
        raise ReadmeError(f"{path} is missing")
    text = path.read_text(encoding="utf-8")
    problems = check_links(root, text) + check_coverage(root, text)
    expected, marker_problems = regenerate(root, text)
    problems += marker_problems
    for name, begin, end, _, source in BLOCKS:
        want, have = split_block(expected, begin, end), split_block(text, begin, end)
        if want and have and want[1] != have[1]:
            problems.append(
                f"{name}: the generated block does not match {source}; "
                "run `python scripts/ci/readme_check.py --write`"
            )
    return {
        "readme": README,
        "links_checked": len(link_targets(text)),
        "names_required": len(required_names(root)),
        "readmes_catalogued": len(find_readmes(root)),
        "problems": problems,
        "status": "PASS" if not problems else "FAIL",
    }


def write(root: Path) -> bool:
    """Regenerate every generated block in place. Return True when the file changed."""
    path = root / README
    text = path.read_text(encoding="utf-8")
    expected, problems = regenerate(root, text)
    if problems:
        raise ReadmeError("; ".join(problems))
    if expected == text:
        return False
    path.write_text(expected, encoding="utf-8", newline="\n")
    return True


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", type=Path, default=ROOT)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="fail when the README has drifted (default)")
    mode.add_argument("--write", action="store_true", help="regenerate the generated blocks, then check")
    parser.add_argument("--json", action="store_true", help="print the result as JSON")
    args = parser.parse_args(argv)
    root = args.root.resolve()
    try:
        if args.write and write(root):
            print(f"readme: regenerated the generated blocks in {README}")
        result = check(root)
    except ReadmeError as exc:
        print(f"FAIL: readme: {exc}", file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        for problem in result["problems"]:
            print(f"- {problem}")
        print(
            f"{result['status']}: {README} - {result['links_checked']} link(s) resolved, "
            f"{result['names_required']} system path(s) required, "
            f"{result['readmes_catalogued']} README(s) catalogued, {len(result['problems'])} problem(s)"
        )
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
