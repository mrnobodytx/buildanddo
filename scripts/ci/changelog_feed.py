#!/usr/bin/env python3
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/ci/changelog_feed.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-CHANGELOG-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CHANGELOG-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     scripts/ci/changelog_gen.py, scripts/ci/public_redaction.py
# EnumType:    Service
# EnumEdges:   PRODUCES apps/web/public/changelog.xml; PRODUCES apps/web/public/changelog.json;
#              CONSUMED_BY apps/web/tools/build.mjs; VERIFIED_BY tests/upgrade/test_changelog_feed.py
# Intent:      Publish what shipped - the reader-facing changes of the commits the site is built from - as
#              an RSS feed and as the JSON the home page reads.
# ───────────────────────────────────────────────────────────────
"""changelog_feed.py - the changelog as a public feed.

Reads the non-merge commits of the ref the build is made from, keeps the changes a reader would notice
(features, fixes, performance, security, removals and content), classifies them with changelog_gen.py's
own rules, withholds any address or fleet machine name with the public redaction rule, and writes:

    apps/web/public/changelog.xml   RSS 2.0, for feed readers
    apps/web/public/changelog.json  the same entries, for the home page's "What shipped" desk

Both are a pure function of the history - no clock is read - so the same ref writes the same bytes.
Housekeeping (chore, docs, ci, build, test, style, refactor) stays in CHANGELOG.md.

The build runs this best-effort. Without git history (a container build context has no .git) there is
no feed: the script exits 1, removes a stale feed from the output folder, and the home page says so.

    python scripts/ci/changelog_feed.py [--root .] [--ref HEAD] [--limit 40] [--out apps/web/public]
"""
from __future__ import annotations

import argparse
import datetime as dt
import email.utils
import json
import subprocess
import sys
from pathlib import Path
from xml.sax.saxutils import escape, quoteattr

try:
    from scripts.ci import changelog_gen, public_redaction
except ImportError:  # run as a script, e.g. by apps/web/tools/build.mjs
    import changelog_gen  # type: ignore[no-redef]
    import public_redaction  # type: ignore[no-redef]

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = ROOT / "apps" / "web" / "public"
FEED_FILES = ("changelog.json", "changelog.xml")
SITE = "https://buildanddo.com"
REPOSITORY = "https://github.com/mrnobodytx/buildanddo"
DEFAULT_LIMIT = 40
SCHEMA = "buildanddo.changelog-feed/v1"

# Conventional types a reader would notice. Everything else is housekeeping and stays in CHANGELOG.md.
FEED_TYPES = ("feat", "fix", "perf", "security", "revert", "remove", "content")


class FeedError(RuntimeError):
    """The feed could not be built from this checkout."""


def git(root: Path, *args: str) -> str:
    """Run git in `root` and return stdout, decoded as UTF-8 whatever the platform's code page."""
    proc = subprocess.run(["git", "-C", str(root), "-c", "i18n.logOutputEncoding=UTF-8", *args],
                          capture_output=True)
    if proc.returncode != 0:
        raise FeedError(proc.stderr.decode("utf-8", "replace").strip() or f"git {' '.join(args)} failed")
    return proc.stdout.decode("utf-8", "replace")


def read_changes(root: Path, ref: str) -> list[dict]:
    """The reader-facing, non-merge commits reachable from `ref`, newest first."""
    fields = changelog_gen.FIELD.join(["%h", "%H", "%cI", "%s", "%b"]) + changelog_gen.RECORD
    raw = git(root, "log", "--no-merges", f"--pretty=format:{fields}", ref)
    changes = []
    for chunk in raw.split(changelog_gen.RECORD):
        parts = chunk.strip("\n").split(changelog_gen.FIELD)
        if len(parts) < 5:
            continue
        short, full, when, subject, body = parts[:5]
        subject = subject.strip()
        match = changelog_gen.SUBJECT_RE.match(subject)
        if not match or match.group("type") not in FEED_TYPES:
            continue
        section, scope, description = changelog_gen.classify(subject)
        changes.append({
            "id": full,
            "short": short,
            "published": dt.datetime.fromisoformat(when.strip()).isoformat(),
            "section": section,
            "scope": scope,
            "title": f"{scope}: {description}" if scope else description,
            "srs": sorted(set(changelog_gen.SRS_RE.findall(f"{subject}\n{body}"))),
            "url": f"{REPOSITORY}/commit/{full}",
        })
    return changes


def withhold(changes: list[dict], rule) -> int:
    """Pass every published text through the public rule; return how many entries it changed."""
    changed = 0
    for change in changes:
        before = (change["scope"], change["title"])
        change["scope"] = rule.redact(change["scope"])
        change["title"] = rule.redact(change["title"])
        changed += (change["scope"], change["title"]) != before
    return changed


def render_json(changes: list[dict], ref: str) -> str:
    document = {
        "schema": SCHEMA,
        "ref": ref,
        "source": "the non-merge commits this build is made from",
        "kinds": list(FEED_TYPES),
        "rss": f"{SITE}/changelog.xml",
        "items": [dict(change, date=change["published"][:10]) for change in changes],
    }
    return json.dumps(document, indent=1, ensure_ascii=False) + "\n"


def rfc822(published: str) -> str:
    return email.utils.format_datetime(dt.datetime.fromisoformat(published))


def render_rss(changes: list[dict]) -> str:
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
        "<channel>",
        "<title>BuildAndDo changelog</title>",
        f"<link>{SITE}/</link>",
        f'<atom:link href="{SITE}/changelog.xml" rel="self" type="application/rss+xml"/>',
        "<description>What shipped on BuildAndDo: features, fixes, security and content changes, "
        "from the commits the site is built from.</description>",
        "<language>en</language>",
    ]
    if changes:
        lines.append(f"<lastBuildDate>{rfc822(changes[0]['published'])}</lastBuildDate>")
    for change in changes:
        detail = change["title"] + (f" ({', '.join(change['srs'])})" if change["srs"] else "")
        lines += [
            "<item>",
            f"<title>{escape(change['section'] + ': ' + change['title'])}</title>",
            f"<link>{escape(change['url'])}</link>",
            f"<guid isPermaLink=\"false\">{escape('buildanddo:' + change['id'])}</guid>",
            f"<pubDate>{rfc822(change['published'])}</pubDate>",
            f"<category>{escape(change['section'])}</category>",
            *(f"<category domain={quoteattr('srs')}>{escape(code)}</category>" for code in change["srs"]),
            f"<description>{escape(detail)}</description>",
            "</item>",
        ]
    lines += ["</channel>", "</rss>"]
    return "\n".join(lines) + "\n"


def write_feed(root: Path, ref: str, out: Path, rule=None, limit: int = DEFAULT_LIMIT) -> dict:
    """Build both files for `ref` and write them to `out`; return what was written (counts only)."""
    rule = rule if rule is not None else public_redaction.Rule()
    short = git(root, "rev-parse", "--short", ref).strip()
    changes = read_changes(root, ref)[:max(0, limit)]
    withheld = withhold(changes, rule)
    out.mkdir(parents=True, exist_ok=True)
    # Bytes, not text mode: text mode would write CRLF on Windows and the same ref would differ by platform.
    (out / "changelog.json").write_bytes(render_json(changes, short).encode("utf-8"))
    (out / "changelog.xml").write_bytes(render_rss(changes).encode("utf-8"))
    return {"ref": short, "items": len(changes), "withheld": withheld, "source": rule.source}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--ref", default="HEAD")
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args(argv)
    try:
        rule = public_redaction.Rule()
        summary = write_feed(args.root, args.ref, args.out, rule=rule, limit=args.limit)
    except FeedError as error:
        for name in FEED_FILES:
            (args.out / name).unlink(missing_ok=True)
        print(f"changelog_feed: no feed from {args.root}: {error}", file=sys.stderr)
        return 1
    public_redaction.report_withheld(rule, summary["withheld"], "changelog feed")
    print(f"changelog_feed: {summary['items']} change(s) from {summary['ref']} -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
