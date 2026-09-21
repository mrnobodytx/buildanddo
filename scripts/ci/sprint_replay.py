#!/usr/bin/env python3
# CGRF: SRS=SRS-BUILDANDDO-ROADMAP-001 | CAPS=B | Seat=C-ONE
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/ci/sprint_replay.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-ROADMAP-001
# CAPS:        pending
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-20
# Depends:     scripts/ci/sprint_cycle.py
# EnumType:    Service
# EnumEdges:   CONSUMES scripts/ci/sprint_cycle.py;
#              VALIDATES scripts/ci/sprint_ledger.json;
#              MIRRORED_BY apps/web/src/pages/RoadmapPage.jsx (replay verdicts)
# Intent:      Re-check every milestone against its own stated evidence, so a verification
#              that has rotted, or that never named anything checkable, stops counting as one.
# ───────────────────────────────────────────────────────────────
"""Day 21 of the campaign: replay the sprint against its own evidence.

WHY THIS EXISTS. `sprint_cycle.py` says of its scoring rule: "The actual-percentage rule
is deliberately hard to game." It is not. `_is_verified` asks only two questions - is the
status exactly ``verified``, and is the evidence string non-empty - and nothing in the
repository ever reads that string again. Measured on this ledger 2026-09-20:

    real ledger                        38.0 pct, 5 verified
    every evidence string replaced
      with the single letter "x"       38.0 pct, 5 verified   <- IDENTICAL
    all eleven asserted with "x"      100.0 pct, 11 verified

So the published number measures that somebody typed a string, not that anything is true.
Eleven characters complete the sprint. That is the gap day 21 closes, and the public
roadmap already states the contract in those words: every milestone "gets replayed against
its own stated evidence bar, in public - not summarized as 'done,' but shown with what was
actually verified and what wasn't."

WHAT A REPLAY CAN AND CANNOT SETTLE. This module re-checks the claims an evidence string
makes, and it is deliberately unwilling to call anything false that it merely cannot see:

  * a commit sha is checked against this repository's object store;
  * a repository path is checked AT THE COMMIT ITS OWN EVIDENCE CITES, because "commit X;
    path Y" asserts Y as of X. Checking the working tree answers a different question -
    which branch is checked out - and this checkout is shared: it moved under this module
    mid-measurement on 2026-09-20, and a worktree check called seven files rotted that were
    present in every commit their evidence named;
  * an estate receipt (``state/...``) is EXTERNAL - the day-1 evidence says so in its own
    text, "(controller estate, outside this repo)". It is absent here by design, and
    absence is not falsity;
  * an endpoint readback is a claim about a server at a past moment. It is UNMEASURABLE
    from a checkout. ``--probe`` re-checks it live, opt-in, because a gate that fails
    whenever staging is down is a gate people learn to ignore - and a pass today would
    not prove the reading taken then;
  * a shallow clone cannot disprove a commit, so it reports UNMEASURABLE rather than
    ROTTED. CI clones shallow by default, which is exactly where a false "rotted" would
    be loudest and least deserved.

THE VERDICT THE OLD RULE COULD NOT REACH is UNCHECKED: evidence that names nothing any
machine can re-check. That is where the letter "x" lands, and where prose lands - neither
is a lie, but neither is a verification either.

Nothing here edits the ledger. A replay reports; a person still records verification
through `sprint_cycle.py verify`. Standard library only, matching the rest of scripts/ci/.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "ci"))
import sprint_cycle  # noqa: E402 - path inserted above; this IS the single source of the plan

# Claim outcomes. HELD and ROTTED are measurements; EXTERNAL and UNMEASURABLE are refusals
# to measure, and are reported as such rather than being quietly counted either way.
HELD = "held"
ROTTED = "rotted"
EXTERNAL = "external"
UNMEASURABLE = "unmeasurable"

# Milestone verdicts.
HOLDS = "HOLDS"
ROTTED_V = "ROTTED"
UNCHECKED = "UNCHECKED"
NOT_VERIFIED = "NOT_VERIFIED"

# A path token is only treated as a file claim when it carries a known extension. Evidence
# prose is full of slashed tokens that are not paths - "app/rooms" in the day-13 entry is a
# React ROUTE, and calling it a missing file would invent a rot that does not exist.
_EXTENSIONS = (
    ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".py", ".json", ".yml", ".yaml",
    ".md", ".sh", ".css", ".html", ".txt", ".sql",
)

_STATUS_RE = re.compile(r"^\(?(\d{3})\)?$")
_PR_RE = re.compile(r"^#(\d{1,6})$")


def _is_sha(token: str) -> bool:
    """Report whether a token looks like an abbreviated or full git sha.

    Requires at least one of a-f. A run of digits alone is far more often a unix
    timestamp - ``1789100000_ocn_seat_users.js`` carries one - than a commit.

    Args:
        token: A bare token from an evidence string.

    Returns:
        True when the token is plausibly a git object name.
    """
    if not (7 <= len(token) <= 40):
        return False
    if not all(c in "0123456789abcdef" for c in token):
        return False
    return any(c in "abcdef" for c in token)


def _classify(token: str, following: str) -> dict | None:
    """Classify one evidence token into a checkable claim, or None.

    Args:
        token: The token, already stripped of surrounding punctuation.
        following: The next token, used only to pick up an expected HTTP status.

    Returns:
        A claim dict, or None when the token asserts nothing re-checkable.
    """
    if not token:
        return None
    if token.startswith("/"):
        # An endpoint, e.g. "/room-projections/index.json 200" or "/api/ocn/login (200)".
        status = _STATUS_RE.match(following or "")
        return {"kind": "endpoint", "ref": token,
                "expect_status": int(status.group(1)) if status else None}
    pr = _PR_RE.match(token)
    if pr:
        return {"kind": "pull_request", "ref": f"#{pr.group(1)}"}
    if "/" in token and token.lower().endswith(_EXTENSIONS):
        kind = "estate_receipt" if token.startswith("state/") else "repo_path"
        return {"kind": kind, "ref": token}
    if _is_sha(token):
        return {"kind": "commit", "ref": token}
    return None


def extract_claims(evidence: str) -> list[dict]:
    """Parse an evidence string into the claims it makes.

    Deliberately conservative: a token has to look unambiguously like a sha, a file with an
    extension, a rooted endpoint or a PR number. Everything else is prose, and prose is
    reported as uncheckable rather than guessed at.

    Args:
        evidence: The public evidence reference recorded for a milestone.

    Returns:
        A list of claim dicts, de-duplicated, in first-seen order.
    """
    # Strip punctuation off the ends, but never a LEADING dot: ".github/workflows/..." and
    # ".well-known/..." are real paths, and eating the dot turns a present file into a
    # fabricated rot. Measured 2026-09-20: that bug reported pr-governance.yml as missing.
    tokens = [t.lstrip("([\"'").rstrip(".,;:)]\"'") for t in re.split(r"[\s,;()]+", str(evidence or ""))]
    claims: list[dict] = []
    seen: set[tuple] = set()
    for index, token in enumerate(tokens):
        following = tokens[index + 1] if index + 1 < len(tokens) else ""
        claim = _classify(token, following)
        if claim is None:
            continue
        key = (claim["kind"], claim["ref"])
        if key in seen:
            continue
        seen.add(key)
        claims.append(claim)
    return claims


def _git(args: list[str], root: Path) -> tuple[int, str]:
    """Run a git command under `root`, returning (returncode, stdout).

    Args:
        args: Arguments after ``git``.
        root: Repository root.

    Returns:
        The exit code and stripped stdout; (-1, "") when git is unavailable.
    """
    try:
        proc = subprocess.run(["git", "-C", str(root), *args], capture_output=True,
                              text=True, timeout=30, check=False)
    except (OSError, subprocess.SubprocessError):
        return -1, ""
    return proc.returncode, (proc.stdout or "").strip()


_PUBLISH_DIR = "apps/web/public/"


def _webroot_path(ref: str) -> str:
    """Map a repo path under the web publish directory to the URL it is served at.

    Args:
        ref: A repository-relative path taken from an evidence string.

    Returns:
        The URL path, or "" when the file is not published to the webroot.
    """
    normalised = ref.lstrip("./")
    if normalised.startswith(_PUBLISH_DIR):
        return "/" + normalised[len(_PUBLISH_DIR):]
    return ""


def _is_build_output(ref: str, ctx: "Context") -> bool:
    """Report whether the repository itself declares this path as generated output.

    The declaration is .gitignore, where build output sits beside dist/ under a comment
    saying so. Asking git rather than pattern-matching paths keeps the repo as the
    authority: if a path stops being declared, this stops claiming it, which is the
    honest direction to fail in.

    Args:
        ref: A repository-relative path.
        ctx: The replay context.

    Returns:
        True when git reports the path as ignored.
    """
    if not ctx.git_available:
        return False
    code, _ = _git(["check-ignore", "-q", "--no-index", ref], ctx.root)
    return code == 0


def _probe_status(url: str, timeout: int = 15) -> tuple[int | None, str, str]:
    """GET `url`, returning (status, error_name, landed_url).

    urlopen follows redirects, so the status belongs to wherever the request LANDED, not
    to the URL the evidence named. Reporting only the number turns "301 to a directory
    index that 404s" into "the endpoint is gone", which reads as a regression in a
    backend that is in fact serving. The landing URL is returned so the caller can say
    where it actually looked. Measured 2026-09-20 on /hcgi/platform.

    Args:
        url: Absolute URL to fetch.
        timeout: Seconds to wait.

    Returns:
        (status, "", landed_url) for any HTTP answer, 4xx and 5xx included;
        (None, ExceptionName, url) when the host could not be reached at all, which is a
        failure to measure rather than a rotted claim.
    """
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "buildanddo-sprint-replay"})
        with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 - explicit base
            return response.status, "", response.geturl()
    except urllib.error.HTTPError as exc:
        return exc.code, "", exc.url or url
    except Exception as exc:  # noqa: BLE001 - an unreachable host is not a rotted claim
        return None, type(exc).__name__, url


def _landing(url: str, landed: str) -> str:
    """Render the redirect hop, or nothing when the request stayed put."""
    return "" if not landed or landed == url else f" (redirected to {landed})"


class Context:
    """What the replay is able to check in this environment.

    Built once and reported in the output, because the same ledger honestly yields
    different results in a shallow CI clone than in a full one, and a reader has to be able
    to tell which they are looking at.
    """

    def __init__(self, root: Path = ROOT, probe: bool = False, base_url: str = "") -> None:
        self.root = root
        self.probe = probe
        self.base_url = base_url.rstrip("/")
        code, _ = _git(["rev-parse", "--git-dir"], root)
        self.git_available = code == 0
        _, shallow = _git(["rev-parse", "--is-shallow-repository"], root)
        self.shallow = shallow == "true"

    def describe(self) -> dict:
        return {
            "git_available": self.git_available,
            "shallow_clone": self.shallow,
            "endpoints_probed": bool(self.probe and self.base_url),
            "base_url": self.base_url or None,
        }


def check_claim(claim: dict, ctx: Context, commits: tuple[str, ...] = ()) -> dict:
    """Re-check one claim, returning it annotated with an outcome and a reason.

    Args:
        claim: A claim dict from `extract_claims`.
        ctx: The replay context.
        commits: Commit shas cited by the SAME evidence string, used to resolve path
            claims at the revision the evidence actually named.

    Returns:
        The claim with ``outcome`` and ``reason`` added.
    """
    kind, ref = claim["kind"], claim["ref"]
    out = dict(claim)

    if kind == "estate_receipt":
        # Declared by the evidence itself as living in the controller estate. Checking for
        # it here would only ever measure this checkout, never the receipt.
        out.update(outcome=EXTERNAL, reason="estate receipt, outside this repository")
        return out

    if kind == "repo_path":
        # "commit X; path Y" asserts Y AS OF X. Checking the working tree instead asserts
        # something the evidence never claimed, and answers a different question: which
        # branch is checked out. Measured 2026-09-20 - a working-tree check called seven
        # files rotted that were present in every commit their own evidence cited, because
        # this checkout is shared and sits on another seat's branch.
        if commits and ctx.git_available:
            for sha in commits:
                if _git(["cat-file", "-e", f"{sha}:{ref}"], ctx.root)[0] == 0:
                    out.update(outcome=HELD, reason=f"present in cited commit {sha}", resolved_at=sha)
                    return out
        if (ctx.root / ref).exists():
            out.update(outcome=HELD, reason="present in the working tree", resolved_at="worktree")
            return out
        if commits and not ctx.git_available:
            out.update(outcome=UNMEASURABLE, reason="evidence names a commit and git cannot read it here")
            return out
        if commits and ctx.shallow:
            out.update(outcome=UNMEASURABLE, reason="shallow clone: the cited commits are not present to check against")
            return out
        # A path absent from source is not automatically a rot. Build output is absent from
        # every commit BY DESIGN - the repo declares it in .gitignore beside dist/ - so
        # calling it ROTTED measures the build contract, not the claim, and a perfectly
        # healthy repository yields exactly that red. Measured 2026-09-20: day 1 cited the
        # release manifest ship.py generates, and this branch called it rotted while
        # staging AND production were each serving it 200. The old comment here already
        # said such a path was "not something to report as proven" - and then the code
        # reported it refuted, which is a stronger claim than absent, not a weaker one.
        # Published output is still checkable, just not from a checkout: where it lands in
        # the webroot, --probe turns the refusal back into a measurement.
        if _is_build_output(ref, ctx):
            url_path = _webroot_path(ref)
            if url_path and ctx.probe and ctx.base_url:
                target = f"{ctx.base_url}{url_path}"
                status, error, landed = _probe_status(target)
                if status is None:
                    out.update(outcome=UNMEASURABLE, reason=f"build output; probe failed: {error}")
                else:
                    out.update(outcome=HELD if status == 200 else ROTTED,
                               reason=(f"build output, published at {url_path} -> {status}"
                                       f"{_landing(target, landed)}"))
                return out
            out.update(outcome=EXTERNAL,
                       reason=("build output, generated at deploy time and never committed"
                               + (f"; re-probe {url_path} with --probe" if url_path else "")))
            return out
        # Either the cited commits genuinely do not carry it, or the evidence named no
        # commit at all - in which case the claim is about the repository as it stands.
        # Stated as what was actually looked at.
        out.update(outcome=ROTTED,
                   reason=(f"not in the working tree, nor in cited commit(s) {', '.join(commits)}"
                           if commits else "not in the working tree, and the evidence names no commit"))
        return out

    if kind == "commit":
        if not ctx.git_available:
            out.update(outcome=UNMEASURABLE, reason="git is not available here")
            return out
        code, _ = _git(["cat-file", "-e", f"{ref}^{{commit}}"], ctx.root)
        if code == 0:
            out.update(outcome=HELD, reason="commit is reachable in this repository")
        elif ctx.shallow:
            # A truncated history cannot disprove a commit, and CI clones shallow.
            out.update(outcome=UNMEASURABLE, reason="shallow clone: history cannot settle this sha")
        else:
            out.update(outcome=ROTTED, reason="commit is not in this repository")
        return out

    if kind == "pull_request":
        out.update(outcome=UNMEASURABLE, reason="needs the GitHub API; not checked from a checkout")
        return out

    if kind == "endpoint":
        if not (ctx.probe and ctx.base_url):
            out.update(outcome=UNMEASURABLE,
                       reason="readback was a past measurement; re-probe with --probe --base-url")
            return out
        expected = claim.get("expect_status") or 200
        url = f"{ctx.base_url}{ref}"
        status, error, landed = _probe_status(url)
        if status is None:
            out.update(outcome=UNMEASURABLE, reason=f"probe failed: {error}")
            return out
        out.update(outcome=HELD if status == expected else ROTTED,
                   reason=(f"probed {url} -> {status}{_landing(url, landed)}, "
                           f"evidence claimed {expected}"))
        return out

    out.update(outcome=UNMEASURABLE, reason="unrecognised claim kind")
    return out


def _stamp_state(milestone: dict) -> dict:
    """Judge whether ``verified_at`` looks like a measurement or a backfill.

    The replay checks that cited artifacts exist. It cannot tell whether anyone actually
    looked at them, and on 2026-09-20 that blind spot let six milestones be certified in a
    single batch, all stamped ``2026-09-20T00:00:00Z`` - the value a bare ``--verified-at
    2026-09-20`` yields - while the replay reported a clean 11 HOLD. One of them had
    overwritten a genuine 2026-09-11T21:24:00Z. A person spotted it; this did not.

    Exact midnight UTC is the signal. A real observation lands on an arbitrary second, so a
    run of them at 00:00:00 is a date that was typed, not a time that was measured. This
    REPORTS rather than refutes: midnight is a legitimate instant, just an implausible one
    to have measured, and the distinction belongs to the reader.

    Args:
        milestone: One merged milestone dict.

    Returns:
        ``{state, verified_at, reason}`` with state measured / synthetic / absent.
    """
    if milestone.get("status") != sprint_cycle.VERIFIED:
        return {"state": "absent", "verified_at": None, "reason": "not verified"}
    raw = str(milestone.get("verified_at") or "").strip()
    if not raw:
        return {"state": "absent", "verified_at": None,
                "reason": "verified with no timestamp at all"}
    if "T00:00:00" in raw:
        return {"state": "synthetic", "verified_at": raw,
                "reason": "exact midnight: a date that was typed, not a time that was measured"}
    return {"state": "measured", "verified_at": raw, "reason": ""}


def _verdict(milestone: dict, checked: list[dict]) -> str:
    """Decide a milestone's replay verdict from its checked claims.

    Args:
        milestone: The merged milestone dict.
        checked: Its claims, annotated by `check_claim`.

    Returns:
        One of HOLDS, ROTTED_V, UNCHECKED, NOT_VERIFIED.
    """
    if not sprint_cycle._is_verified(milestone):  # noqa: SLF001 - one definition of verified, reused
        return NOT_VERIFIED
    if any(c["outcome"] == ROTTED for c in checked):
        return ROTTED_V
    if any(c["outcome"] == HELD for c in checked):
        return HOLDS
    # Verified, but nothing in the evidence could be re-checked at all. This is where the
    # letter "x" lands - and where the old rule saw full credit.
    return UNCHECKED


def replay(state: dict, ctx: Context) -> dict:
    """Replay every milestone in `state` against its own evidence.

    Args:
        state: A state dict as returned by `sprint_cycle._load_state`.
        ctx: The replay context.

    Returns:
        A report dict with per-milestone verdicts and the recomputed percentage.
    """
    by_day = {m.get("day"): m for m in state.get("milestones") or [] if isinstance(m, dict)}
    results: list[dict] = []
    for planned in sprint_cycle.MILESTONES:
        milestone = by_day.get(planned["day"]) or {}
        claims = extract_claims(milestone.get("evidence", ""))
        # A path in an evidence string is scoped by the commits in that same string.
        commits = tuple(c["ref"] for c in claims if c["kind"] == "commit")
        checked = [check_claim(c, ctx, commits) for c in claims]
        tally = {name: sum(1 for c in checked if c["outcome"] == name)
                 for name in (HELD, ROTTED, EXTERNAL, UNMEASURABLE)}
        results.append({
            "day": planned["day"],
            "title": planned["title"],
            "planned_value": planned["planned_value"],
            "ledger_status": milestone.get("status", sprint_cycle.PLANNED),
            "verdict": _verdict(milestone, checked),
            "claims": tally,
            "checked": checked,
            "stamp": _stamp_state(milestone),
        })

    # Recompute the headline number counting ONLY milestones that still hold, using the
    # same increment arithmetic as _actual_pct so the two are directly comparable.
    verdict_by_day = {r["day"]: r["verdict"] for r in results}
    replayed = 0.0
    previous = 0.0
    for planned in sprint_cycle.MILESTONES:
        increment = planned["planned_value"] - previous
        previous = planned["planned_value"]
        if verdict_by_day.get(planned["day"]) == HOLDS:
            replayed += increment

    claimed = sprint_cycle._actual_pct(state)  # noqa: SLF001 - intentional reuse
    return {
        "campaign_id": sprint_cycle.CAMPAIGN_ID,
        "sprint_day": sprint_cycle.sprint_day(),
        "context": ctx.describe(),
        "claimed_pct": claimed,
        "replayed_pct": round(replayed, 1),
        "overstatement_pct": round(claimed - replayed, 1),
        "counts": {
            verdict: sum(1 for r in results if r["verdict"] == verdict)
            for verdict in (HOLDS, ROTTED_V, UNCHECKED, NOT_VERIFIED)
        },
        # Carried separately from the verdicts: a synthetic stamp says nothing about whether
        # the artifacts exist, only about whether anyone is claiming to have looked.
        "synthetic_stamps": sum(1 for r in results if r["stamp"]["state"] == "synthetic"),
        "milestones": results,
    }


_GLYPH = {HOLDS: "HOLDS   ", ROTTED_V: "ROTTED  ", UNCHECKED: "UNCHECKED", NOT_VERIFIED: "-       "}


def render(report: dict) -> str:
    """Render the replay as the text a person reads in a pipeline log.

    Args:
        report: A report dict from `replay`.

    Returns:
        The rendered block.
    """
    ctx = report["context"]
    lines = [
        f"SPRINT REPLAY  {report['campaign_id']}  day {report['sprint_day']}",
        f"  git={'yes' if ctx['git_available'] else 'no'}  shallow={'yes' if ctx['shallow_clone'] else 'no'}"
        f"  endpoints={'probed' if ctx['endpoints_probed'] else 'not probed'}",
        "",
    ]
    for row in report["milestones"]:
        tally = row["claims"]
        detail = (f"held {tally[HELD]}, rotted {tally[ROTTED]}, "
                  f"external {tally[EXTERNAL]}, unmeasurable {tally[UNMEASURABLE]}")
        lines.append(f"  D{row['day']:<3}{_GLYPH[row['verdict']]}  {row['title'][:44]:<46}{detail}")
        for claim in row["checked"]:
            if claim["outcome"] == ROTTED:
                lines.append(f"          ROT  {claim['kind']} {claim['ref']}: {claim['reason']}")
        if row["stamp"]["state"] == "synthetic":
            lines.append(f"          STAMP {row['stamp']['verified_at']}: {row['stamp']['reason']}")
    counts = report["counts"]
    lines += [
        "",
        f"  claimed {report['claimed_pct']}%   replayed {report['replayed_pct']}%   "
        f"overstatement {report['overstatement_pct']}%",
        f"  {counts[HOLDS]} hold, {counts[ROTTED_V]} rotted, {counts[UNCHECKED]} unchecked, "
        f"{counts[NOT_VERIFIED]} not yet verified",
    ]
    if report.get("synthetic_stamps"):
        lines.append(f"  WARNING: {report['synthetic_stamps']} verification(s) stamped at exact "
                     f"midnight - recorded, not measured")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    """Replay the ledger and report, optionally failing on rot.

    Args:
        argv: Command-line arguments; defaults to sys.argv.

    Returns:
        Process exit code: 1 under --strict when a milestone has rotted.
    """
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--json", action="store_true", help="emit the full report as JSON")
    parser.add_argument("--strict", action="store_true", help="exit 1 when any milestone has ROTTED")
    parser.add_argument("--probe", action="store_true", help="re-probe endpoint claims live")
    parser.add_argument("--base-url", default="", help="origin for --probe, e.g. https://staging.buildanddo.com")
    args = parser.parse_args(argv)

    ctx = Context(probe=args.probe, base_url=args.base_url)
    report = replay(sprint_cycle._load_state(), ctx)  # noqa: SLF001 - intentional reuse
    print(json.dumps(report, indent=2) if args.json else render(report))

    if args.strict and report["counts"][ROTTED_V]:
        print(f"\nFAIL: {report['counts'][ROTTED_V]} milestone(s) cite evidence that no longer holds.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
