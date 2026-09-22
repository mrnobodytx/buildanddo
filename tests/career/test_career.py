# ─── CGRF Header ──────────────────────────────
# File:        tests/career/test_career.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-CAREER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAREER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     apps/career, tests/fixtures/career/jobs.json, tests/fixtures/career/questions.json
# EnumType:    Test
# EnumEdges:   VALIDATES apps/career/history.py; VALIDATES apps/career/passport.py; VALIDATES apps/career/match.py; VALIDATES apps/career/dossier.py; VALIDATES apps/career/compiler.py; VALIDATES apps/career/authority.py; VALIDATES apps/career/cli.py
# DAG Node:    none
# Intent:      Prove participation-honest attribution, requirement coverage, mandatory do-not-claim lists, reserved-answer handling and claim provenance.
# ─────────────────────────────────────────────────────────────

"""Exercise the career evidence engine end to end on a real temporary git repository."""

from __future__ import annotations

import contextlib
import io
import json
import os
import subprocess
import tempfile
import unittest
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path

from apps.career import (
    CareerError,
    ClaimState,
    Participation,
    build_dossier,
    build_passport,
    compile_application,
    evaluate,
    normalize_job,
    rank,
    validate_package,
)
from apps.career.authority import AuthorityGrant, Decision, JobTier, authorize, reserved_class
from apps.career.cli import load_identity, main
from apps.career.compiler import Package
from apps.career.evidence import EvidenceRef, attestation_evidence, best_state, strongest
from apps.career.history import Identity, attribute, parse_git_log, read_git_history
from apps.career.jobs import RequirementKind, classify, extract_requirements
from apps.career.match import Coverage
from apps.career.passport import (
    Passport,
    claim_participation,
    confidence,
    passport_from_history,
    recency_weight,
)
from apps.career.taxonomy import capabilities_for_change, capabilities_for_text

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "tests/fixtures/career"
PERSON = "person@example.invalid"
AGENT = "agent@example.invalid"
OTHER = "other@example.invalid"
AS_OF = datetime(2026, 9, 22, tzinfo=timezone.utc)
IDENTITY = Identity("human.test", frozenset({PERSON}), frozenset({AGENT}))


def git(repo: Path, *args: str, email: str = PERSON, when: str = "2026-09-01T12:00:00+00:00") -> str:
    env = {
        **os.environ,
        "GIT_AUTHOR_NAME": email.split("@")[0],
        "GIT_AUTHOR_EMAIL": email,
        "GIT_COMMITTER_NAME": email.split("@")[0],
        "GIT_COMMITTER_EMAIL": email,
        "GIT_AUTHOR_DATE": when,
        "GIT_COMMITTER_DATE": when,
        "GIT_CONFIG_NOSYSTEM": "1",
        "HOME": str(repo),
    }
    return subprocess.run(
        ["git", "-C", str(repo), *args], check=True, capture_output=True, text=True, env=env
    ).stdout.strip()


def commit(repo: Path, path: str, message: str, *, email: str, when: str) -> str:
    target = repo / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(f"{message}\n", encoding="utf-8")
    git(repo, "add", path, email=email, when=when)
    git(repo, "commit", "-q", "-m", message, email=email, when=when)
    return git(repo, "rev-parse", "HEAD", email=email, when=when)


def build_repo(repo: Path) -> dict[str, str]:
    """Create main with person commits, a person-merged agent branch and an unmerged agent branch."""
    git(repo, "init", "-q", "-b", "main")
    shas = {
        "person_ci": commit(repo, "scripts/ci/gate.py", "ci(ci): add gate", email=PERSON, when="2026-08-01T10:00:00+00:00"),
        "person_ci2": commit(repo, ".gitlab-ci.yml", "ci(ci): wire gate", email=PERSON, when="2026-08-02T10:00:00+00:00"),
        "person_py": commit(repo, "services/bus/app.py", "feat(evidence): event bus", email=PERSON, when="2026-08-03T10:00:00+00:00"),
        "person_py2": commit(repo, "services/bus/more.py", "feat(evidence): consumer", email=PERSON, when="2026-08-04T10:00:00+00:00"),
        "person_misc": commit(repo, "misc.txt", "chore: note", email=PERSON, when="2026-08-05T10:00:00+00:00"),
    }
    git(repo, "checkout", "-q", "-b", "agent-work")
    shas["agent_merged"] = commit(
        repo, "scripts/ci/security_scan.py", "ci(ci): security scan\n\nSRS: SRS-X-001\nDispatch: VCC-X-001",
        email=AGENT, when="2026-09-01T10:00:00+00:00",
    )
    shas["other_merged"] = commit(
        repo, "apps/web/src/App.tsx", "feat(web): page", email=OTHER, when="2026-09-02T10:00:00+00:00"
    )
    git(repo, "checkout", "-q", "main")
    git(repo, "merge", "-q", "--no-ff", "agent-work", "-m", "Merge agent work", email=PERSON, when="2026-09-03T10:00:00+00:00")
    shas["merge"] = git(repo, "rev-parse", "HEAD")
    git(repo, "checkout", "-q", "-b", "unmerged")
    shas["agent_unmerged"] = commit(
        repo, "docs/architecture/x.md", "docs(docs): agent only", email=AGENT, when="2026-09-04T10:00:00+00:00"
    )
    shas["other_unmerged"] = commit(
        repo, "docs/architecture/y.md", "docs(docs): other only", email=OTHER, when="2026-09-05T10:00:00+00:00"
    )
    git(repo, "checkout", "-q", "main")
    return shas


class RepoCase(unittest.TestCase):
    """Share one temporary repository per test class."""

    tmp: tempfile.TemporaryDirectory[str]
    repo: Path
    shas: dict[str, str]

    @classmethod
    def setUpClass(cls) -> None:
        cls.tmp = tempfile.TemporaryDirectory()
        cls.repo = Path(cls.tmp.name) / "repo"
        cls.repo.mkdir()
        cls.shas = build_repo(cls.repo)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.tmp.cleanup()

    def passport(self, attestations: list[EvidenceRef] | None = None) -> Passport:
        head, commits = read_git_history(self.repo)
        return passport_from_history(
            IDENTITY.person_id, attribute(commits, IDENTITY), attestations or [], as_of=AS_OF, head=head
        )


class TaxonomyTests(unittest.TestCase):
    def test_text_matches_whole_terms_only(self) -> None:
        self.assertIn("ai_systems", capabilities_for_text("Build AI agents"))
        self.assertNotIn("ai_systems", capabilities_for_text("Maintain email tooling"))
        self.assertEqual(capabilities_for_text("Apache Flink"), ())

    def test_change_uses_scope_and_paths(self) -> None:
        self.assertEqual(capabilities_for_change("chore: x", ("misc.txt",)), ())
        self.assertIn("frontend", capabilities_for_change("feat(web): x", ()))
        self.assertIn("ci_cd", capabilities_for_change("x", (".gitlab-ci.yml",)))


class HistoryTests(RepoCase):
    def test_parse_rejects_malformed_record(self) -> None:
        with self.assertRaises(CareerError):
            parse_git_log("\x1eonly\x1ftwo")
        self.assertEqual(parse_git_log(""), [])

    def test_read_history_rejects_non_repository(self) -> None:
        with tempfile.TemporaryDirectory() as empty, self.assertRaises(CareerError):
            read_git_history(Path(empty))

    def test_footers_and_max_count(self) -> None:
        _, commits = read_git_history(self.repo)
        agent = next(item for item in commits if item.sha == self.shas["agent_merged"])
        self.assertEqual(agent.footer("SRS"), "SRS-X-001")
        self.assertEqual(agent.footer("Dispatch"), "VCC-X-001")
        self.assertIsNone(agent.footer("Missing"))
        _, limited = read_git_history(self.repo, max_count=2)
        self.assertEqual(len(limited), 2)

    def test_attribution_credits_only_authored_or_integrated_work(self) -> None:
        _, commits = read_git_history(self.repo)
        result = attribute(commits, IDENTITY)
        by_ref: dict[str, set[Participation]] = {}
        for item in result.evidence:
            by_ref.setdefault(item.ref, set()).add(item.participation)
            self.assertIs(item.state, ClaimState.OBSERVED)
        self.assertEqual(by_ref[self.shas["person_ci"]], {Participation.PERSONALLY_IMPLEMENTED})
        self.assertEqual(by_ref[self.shas["agent_merged"]], {Participation.REVIEWED})
        self.assertEqual(by_ref[self.shas["other_merged"]], {Participation.REVIEWED})
        self.assertNotIn(self.shas["agent_unmerged"], by_ref)
        self.assertNotIn(self.shas["other_unmerged"], by_ref)
        self.assertNotIn(self.shas["merge"], by_ref)
        self.assertEqual((result.authored, result.integrated, result.agent_integrated), (5, 2, 1))
        self.assertEqual(result.unmapped, 1)
        detail = next(item.detail for item in result.evidence if item.ref == self.shas["agent_merged"])
        self.assertIn("agent-authored", detail)

    def test_unmerged_branch_head_counts_exclusions(self) -> None:
        git(self.repo, "checkout", "-q", "unmerged")
        try:
            _, commits = read_git_history(self.repo)
        finally:
            git(self.repo, "checkout", "-q", "main")
        result = attribute(commits, IDENTITY)
        self.assertEqual((result.excluded_agent, result.excluded_other), (1, 1))

    def test_merge_by_someone_else_integrates_nothing(self) -> None:
        _, commits = read_git_history(self.repo)
        stranger = Identity("x", frozenset({"nobody@example.invalid"}), frozenset({AGENT}))
        result = attribute(commits, stranger)
        self.assertEqual(result.evidence, [])
        self.assertEqual(attribute([], IDENTITY).commits_total, 0)

    def test_identity_contracts(self) -> None:
        with self.assertRaises(CareerError):
            Identity(" ", frozenset({PERSON}))
        with self.assertRaises(CareerError):
            Identity("p", frozenset())
        with self.assertRaises(CareerError):
            Identity("p", frozenset({PERSON}), frozenset({PERSON}))


class AttestationTests(unittest.TestCase):
    def base(self, **extra: object) -> dict[str, object]:
        return {
            "capability": "architecture",
            "participation": "DESIGNED",
            "statement": "Designed the event fabric",
            "observed_at": "2026-09-10T00:00:00Z",
            "evidence_refs": ["doc:fabric-design"],
            **extra,
        }

    def test_unverified_attestation_is_declared(self) -> None:
        [ref] = attestation_evidence(self.base(), "human.test")
        self.assertIs(ref.state, ClaimState.DECLARED)
        self.assertIs(ref.participation, Participation.DESIGNED)

    def test_independent_verifier_settles(self) -> None:
        [ref] = attestation_evidence(
            self.base(verifier={"id": "reviewer.a", "receipt": "tevv:123"}), "human.test"
        )
        self.assertIs(ref.state, ClaimState.VERIFIED)
        self.assertIn("reviewer.a", ref.detail)

    def test_rejections(self) -> None:
        cases = [
            self.base(verifier={"id": "human.test", "receipt": "r"}),
            self.base(participation="PERSONALLY_IMPLEMENTED"),
            self.base(participation="WROTE_IT_ALL"),
            self.base(capability="flink"),
            self.base(evidence_refs=[]),
            self.base(statement=""),
            self.base(verifier="yes"),
        ]
        for raw in cases:
            with self.subTest(raw=raw), self.assertRaises(CareerError):
                attestation_evidence(raw, "human.test")

    def test_ranking_helpers(self) -> None:
        self.assertIs(
            strongest([Participation.REVIEWED, Participation.DESIGNED]), Participation.DESIGNED
        )
        self.assertIs(best_state([]), ClaimState.ABSENT)
        with self.assertRaises(CareerError):
            strongest([])


class PassportTests(RepoCase):
    def test_passport_capabilities_and_limits(self) -> None:
        passport = self.passport()
        ci = passport.entry("ci_cd")
        assert ci is not None
        self.assertIs(ci.claim_participation, Participation.PERSONALLY_IMPLEMENTED)
        self.assertFalse(ci.verified)
        self.assertEqual(ci.participation_counts, {"PERSONALLY_IMPLEMENTED": 2, "REVIEWED": 1})
        security = passport.entry("security")
        assert security is not None
        self.assertIs(security.claim_participation, Participation.REVIEWED)
        self.assertEqual(security.claim_verb, "Reviewed and integrated")
        self.assertIsNone(passport.entry("kubernetes"))
        self.assertIsNone(passport.entry("architecture"))
        self.assertEqual(passport.sources[0]["agent_integrated"], 1)
        self.assertTrue(any("tenure" in item for item in passport.body()["limits"]))

    def test_round_trip_and_tamper_detection(self) -> None:
        passport = self.passport()
        raw = passport.to_dict()
        self.assertEqual(Passport.from_dict(raw).digest, passport.digest)
        tampered = json.loads(json.dumps(raw))
        tampered["capabilities"][0]["claim_verb"] = "Invented"
        with self.assertRaises(CareerError):
            Passport.from_dict(tampered)
        with self.assertRaises(CareerError):
            Passport.from_dict({**raw, "schema": "other"})
        broken = json.loads(json.dumps(raw))
        del broken["capabilities"][0]["records"]
        with self.assertRaises(CareerError):
            Passport.from_dict(broken)
        with self.assertRaises(CareerError):
            Passport.from_dict({"schema": raw["schema"]})

    def test_attestations_join_passport(self) -> None:
        refs = attestation_evidence(
            {
                "capability": "architecture",
                "participation": "DESIGNED",
                "statement": "Designed",
                "observed_at": "2026-09-10T00:00:00Z",
                "evidence_refs": ["doc:a", "doc:b"],
                "verifier": {"id": "reviewer.a", "receipt": "tevv:1"},
            },
            "human.test",
        )
        passport = self.passport(refs)
        entry = passport.entry("architecture")
        assert entry is not None
        self.assertTrue(entry.verified)
        self.assertIs(entry.claim_participation, Participation.DESIGNED)
        self.assertEqual(passport.sources[1], {"kind": "attestations", "records": 2})

    def test_rejects_agent_evidence_and_naive_time(self) -> None:
        agent = EvidenceRef("commit", "a", "python", Participation.AGENT_EXECUTED, ClaimState.OBSERVED, "2026-09-01T00:00:00Z", "x")
        with self.assertRaises(CareerError):
            build_passport("p", [agent], as_of=AS_OF)
        with self.assertRaises(CareerError):
            build_passport("p", [], as_of=datetime(2026, 1, 1))
        bad = replace(agent, participation=Participation.REVIEWED, observed_at="yesterday")
        with self.assertRaises(CareerError):
            build_passport("p", [bad], as_of=AS_OF)

    def test_heuristics(self) -> None:
        self.assertEqual(recency_weight(10), 1.0)
        self.assertEqual(recency_weight(1000), 0.3)
        self.assertTrue(0.3 < recency_weight(400) < 1.0)
        self.assertGreater(
            confidence(32, 0, Participation.PERSONALLY_IMPLEMENTED, ClaimState.VERIFIED),
            confidence(1, 800, Participation.TEAM_DELIVERED, ClaimState.DECLARED),
        )
        from collections import Counter

        self.assertIs(
            claim_participation(Counter({"PERSONALLY_IMPLEMENTED": 1, "REVIEWED": 23}), 24),
            Participation.REVIEWED,
        )
        self.assertIs(
            claim_participation(Counter({"PERSONALLY_IMPLEMENTED": 1}), 1),
            Participation.PERSONALLY_IMPLEMENTED,
        )


def load_jobs() -> list[dict[str, object]]:
    return list(json.loads((FIXTURES / "jobs.json").read_text())["jobs"])


class JobTests(unittest.TestCase):
    def test_normalize_and_extract(self) -> None:
        job = normalize_job(load_jobs()[0])
        requirements = extract_requirements(job)
        kinds = {item.requirement_id: item.kind for item in requirements}
        self.assertEqual(kinds["R5"], RequirementKind.TENURE)
        self.assertEqual(kinds["R6"], RequirementKind.RESERVED)
        self.assertEqual(kinds["P3"], RequirementKind.UNMAPPED)
        self.assertEqual(kinds["T1"], RequirementKind.CAPABILITY)
        tenure = next(item for item in requirements if item.requirement_id == "R5")
        self.assertEqual(tenure.years, 10)
        self.assertEqual(job.to_dict()["digest"], job.digest)

    def test_classify_credential(self) -> None:
        self.assertIs(classify("R1", "Bachelor's degree", True).kind, RequirementKind.CREDENTIAL)
        self.assertEqual(classify("R1", "Python", False).to_dict()["capabilities"], ["python"])

    def test_invalid_postings(self) -> None:
        good = load_jobs()[0]
        cases: list[object] = [
            "not an object",
            {**good, "company": ""},
            {**good, "location": 3},
            {**good, "requirements": "Python"},
            {**good, "requirements": []},
            {**good, "compensation": "lots"},
        ]
        for raw in cases:
            with self.subTest(raw=str(raw)[:40]), self.assertRaises(CareerError):
                normalize_job(raw)  # type: ignore[arg-type]


class MatchTests(RepoCase):
    def test_coverage_map_statuses(self) -> None:
        passport = self.passport()
        coverage = evaluate(normalize_job(load_jobs()[0]), passport)
        status = {row.requirement.requirement_id: row.status for row in coverage.rows}
        self.assertIs(status["R1"], Coverage.PARTIAL)
        self.assertEqual(coverage.rows[0].missing, ("architecture",))
        self.assertIs(status["R2"], Coverage.SUPPORTED)
        self.assertIs(status["R3"], Coverage.NOT_PROVEN)
        self.assertIs(status["R5"], Coverage.NOT_PROVEN)
        self.assertIs(status["R6"], Coverage.HUMAN_ATTESTATION)
        self.assertIs(status["P1"], Coverage.NOT_PROVEN)
        self.assertIs(status["P3"], Coverage.NOT_PROVEN)
        self.assertEqual(coverage.summary["hard_requirements"], "FAIL")
        self.assertIn("nominal gap", next(row.note for row in coverage.rows if row.requirement.requirement_id == "R5"))
        self.assertEqual(coverage.to_dict()["passport_digest"], passport.digest)

    def test_partial_and_pass(self) -> None:
        passport = self.passport()
        job = normalize_job({
            "job_id": "j", "company": "c", "role": "r", "source": "synthetic",
            "requirements": ["Python and Kubernetes", "CI/CD", "Distributed systems"],
            "preferred": ["Security", "5 years in the industry", "Master's degree"],
        })
        coverage = evaluate(job, passport)
        status = {row.requirement.requirement_id: row for row in coverage.rows}
        self.assertIs(status["R1"].status, Coverage.PARTIAL)
        self.assertEqual(status["R1"].missing, ("kubernetes",))
        self.assertEqual(coverage.summary["hard_requirements"], "REVIEW")
        self.assertIs(status["P2"].status, Coverage.NOT_PROVEN)
        self.assertIs(status["P3"].status, Coverage.NOT_PROVEN)
        clean = normalize_job({"job_id": "k", "company": "c", "role": "r", "source": "s", "requirements": ["CI/CD"]})
        self.assertEqual(evaluate(clean, passport).summary["hard_requirements"], "PASS")

    def test_declared_only_is_partial_and_tenure_without_evidence(self) -> None:
        refs = attestation_evidence(
            {"capability": "kubernetes", "participation": "PERSONALLY_OPERATED", "statement": "Ran clusters",
             "observed_at": "2026-09-10T00:00:00Z", "evidence_refs": ["note:k8s"]},
            "human.test",
        )
        passport = build_passport("p", refs, as_of=AS_OF)
        job = normalize_job({"job_id": "j", "company": "c", "role": "r", "source": "s",
                             "requirements": ["Kubernetes", "3+ years of Swift", "4 years of Python"]})
        coverage = evaluate(job, passport)
        self.assertIs(coverage.rows[0].status, Coverage.PARTIAL)
        self.assertIn("declared or low-confidence", coverage.rows[0].note)
        self.assertIn("overall recorded evidence", coverage.rows[1].note)
        self.assertIn("no related evidence", coverage.rows[2].note)
        self.assertEqual(coverage.summary["evidence_depth"], "NONE")


class DossierTests(RepoCase):
    def test_dossiers_rank_and_always_carry_do_not_claim(self) -> None:
        passport = self.passport()
        dossiers = [build_dossier(evaluate(normalize_job(raw), passport), passport) for raw in load_jobs()]
        ranked = rank(dossiers)
        self.assertEqual([item.state for item in ranked][-1], "REAL_GAP")
        for item in dossiers:
            self.assertTrue(item.body["do_not_claim"])
            self.assertEqual(item.to_dict()["digest"], item.digest)
        platform = next(item for item in dossiers if item.job_id == "synthetic-staff-platform")
        joined = " | ".join(platform.body["do_not_claim"])
        self.assertIn("10+ years", joined)
        self.assertIn("Kubernetes", joined)
        self.assertIn("Flink", joined)
        self.assertIn("personal authorship of 1 agent-authored", joined)
        self.assertEqual(platform.body["human_required"][0]["reserved_class"], "work_authorization")

    def test_states(self) -> None:
        passport = self.passport()
        strong = normalize_job({"job_id": "s", "company": "c", "role": "r", "source": "s",
                                "requirements": ["CI/CD", "Python", "Distributed systems"]})
        self.assertEqual(build_dossier(evaluate(strong, passport), passport).state, "STRONG_CANDIDATE")
        mixed = normalize_job({"job_id": "m", "company": "c", "role": "r", "source": "s",
                               "requirements": ["CI/CD"], "preferred": ["Kubernetes", "Python", "Security"]})
        self.assertEqual(build_dossier(evaluate(mixed, passport), passport).state, "CANDIDATE")
        weak = normalize_job({"job_id": "w", "company": "c", "role": "r", "source": "s",
                              "requirements": ["CI/CD"], "preferred": ["Kubernetes", "Swift", "Flink"]})
        self.assertEqual(build_dossier(evaluate(weak, passport), passport).state, "REAL_GAP")


class AuthorityTests(unittest.TestCase):
    def test_reserved_classes(self) -> None:
        self.assertEqual(reserved_class("Do you require visa sponsorship?"), "work_authorization")
        self.assertEqual(reserved_class("Please select your gender"), "demographic")
        self.assertIsNone(reserved_class("Describe a trace you debugged"))

    def test_tier_policy(self) -> None:
        grant = AuthorityGrant(max_tier=JobTier.J4_SUBMIT, approved_packages=frozenset({"sha256:ok"}),
                               approved_sites=frozenset({"lever"}))
        self.assertIs(authorize("evaluate", AuthorityGrant()).decision, Decision.ALLOWED)
        self.assertIs(authorize("fill", AuthorityGrant()).decision, Decision.DENIED)
        self.assertIs(authorize("nope", grant).decision, Decision.DENIED)
        self.assertIs(authorize("attest", grant).decision, Decision.HUMAN_REQUIRED)
        self.assertIs(authorize("submit", grant, package_digest="sha256:ok", challenge_present=True).decision,
                      Decision.STOP_FOR_HUMAN_CHALLENGE)
        self.assertIs(authorize("submit", grant, package_digest="sha256:ok",
                                unresolved_reserved=("compensation",)).decision, Decision.HUMAN_REQUIRED)
        self.assertIs(authorize("submit", grant).decision, Decision.DENIED)
        self.assertIs(authorize("submit", grant, package_digest="sha256:other").decision, Decision.REQUIRES_APPROVAL)
        self.assertIs(authorize("submit", grant, package_digest="sha256:ok").decision, Decision.ALLOWED)
        self.assertIs(authorize("submit", grant, package_digest="sha256:x", application_system="lever").decision,
                      Decision.ALLOWED)
        self.assertEqual(authorize("evaluate", grant).to_dict()["tier"], "J1_EVALUATE")


class CompilerTests(RepoCase):
    def setUp(self) -> None:
        self.passport_value = self.passport()
        self.job = normalize_job(load_jobs()[0])
        self.dossier = build_dossier(evaluate(self.job, self.passport_value), self.passport_value)
        self.questions = json.loads((FIXTURES / "questions.json").read_text())["synthetic-staff-platform"]

    def test_package_claims_have_provenance_and_reserved_answers_stay_human(self) -> None:
        package = compile_application(self.job, self.dossier, self.passport_value, questions=self.questions)
        self.assertEqual(validate_package(package, self.passport_value, self.dossier), [])
        manifest = json.loads(package.files["evidence_manifest.json"])
        self.assertTrue(manifest["claims"])
        for claim in manifest["claims"]:
            self.assertTrue(claim["evidence_refs"])
        security = next(claim for claim in manifest["claims"] if claim["capability_id"] == "security")
        self.assertTrue(security["claim"].startswith("Reviewed and integrated "))
        answers = {item["id"]: item for item in json.loads(package.files["application_answers.json"])}
        self.assertEqual(answers["q1"]["status"], "DRAFT")
        self.assertEqual(answers["q2"]["status"], "HUMAN_REQUIRED")
        self.assertEqual(answers["q3"]["status"], "HUMAN_REQUIRED")
        self.assertEqual(answers["q4"]["status"], "HUMAN_REQUIRED")
        self.assertEqual(package.manifest["submission_state"], "NOT_SUBMITTED")
        self.assertEqual(package.manifest["authority_tier"], "J2_PACKAGE")
        self.assertEqual(package.manifest["unresolved_reserved"], ["compensation", "work_authorization"])
        self.assertIn("Do not claim", package.files["interview_brief.md"])

    def test_stored_reusable_answers_only(self) -> None:
        stored = {"compensation": {"answer": "Open to discussion", "reusable": True},
                  "work_authorization": {"answer": "Yes", "reusable": False}}
        package = compile_application(self.job, self.dossier, self.passport_value,
                                      questions=self.questions, stored_answers=stored)
        answers = {item["id"]: item for item in json.loads(package.files["application_answers.json"])}
        self.assertEqual(answers["q3"]["status"], "STORED_HUMAN_ANSWER")
        self.assertEqual(answers["q2"]["status"], "HUMAN_REQUIRED")
        with self.assertRaises(CareerError):
            compile_application(self.job, self.dossier, self.passport_value, questions=[{"id": "", "text": "x"}])

    def test_mismatch_and_tamper_are_detected(self) -> None:
        other = normalize_job(load_jobs()[1])
        with self.assertRaises(CareerError):
            compile_application(other, self.dossier, self.passport_value)
        package = compile_application(self.job, self.dossier, self.passport_value, questions=self.questions)
        manifest = json.loads(package.files["evidence_manifest.json"])
        manifest["passport_digest"] = "sha256:other"
        manifest["claims"][0]["claim"] = "Invented " + manifest["claims"][0]["claim"]
        manifest["claims"][0]["evidence_refs"] = ["not-a-ref"]
        manifest["claims"][0]["participation"] = "DESIGNED"
        manifest["claims"][1]["evidence_refs"] = []
        manifest["claims"].append({"claim_id": "CX", "capability_id": "kubernetes", "claim": "x"})
        answers = json.loads(package.files["application_answers.json"])
        answers[1]["status"] = "DRAFT"
        files = {**package.files, "evidence_manifest.json": json.dumps(manifest),
                 "application_answers.json": json.dumps(answers)}
        tampered = Package({**package.manifest, "submission_state": "SUBMITTED"}, files)
        errors = " | ".join(validate_package(tampered, self.passport_value, self.dossier))
        for expected in ("different passport", "not in passport", "exceeds recorded participation",
                         "participation mismatch", "no evidence", "absent from passport",
                         "reserved answer was generated", "never submitted"):
            self.assertIn(expected, errors)

    def test_claim_on_unproven_capability_is_rejected(self) -> None:
        package = compile_application(self.job, self.dossier, self.passport_value)
        body = json.loads(json.dumps(self.dossier.body))
        body["strong_evidence"] = []
        body["coverage"][0]["status"] = "PARTIAL"
        body["coverage"][0]["missing_capabilities"] = [
            json.loads(package.files["evidence_manifest.json"])["claims"][0]["capability_id"]
        ]
        from apps.career.dossier import Dossier

        errors = validate_package(package, self.passport_value, Dossier(body))
        self.assertTrue(any("marks unproven" in item for item in errors))
        self.assertNotEqual(package.digest, "")


class CliTests(RepoCase):
    def run_cli(self, *args: str) -> tuple[int, dict[str, object]]:
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = main(list(args))
        return code, json.loads(out.getvalue() or err.getvalue())

    def test_passport_then_evaluate(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            identity = base / "identity.json"
            identity.write_text(json.dumps({
                "person_id": "human.test", "person_emails": [PERSON.upper()], "agent_emails": [AGENT],
                "attestations": [{"capability": "architecture", "participation": "DESIGNED",
                                  "statement": "Designed", "observed_at": "2026-09-10T00:00:00Z",
                                  "evidence_refs": ["doc:a"]}],
            }))
            code, result = self.run_cli("passport", "--repo", str(self.repo), "--identity", str(identity),
                                        "--output", str(base / "p"), "--as-of", "2026-09-22T00:00:00Z")
            self.assertEqual(code, 0, result)
            self.assertNotIn(PERSON, json.dumps(result))
            code, result = self.run_cli("passport", "--repo", str(self.repo), "--identity", str(identity),
                                        "--output", str(base / "p"))
            self.assertEqual(code, 1)
            self.assertIn("new or empty", str(result["error"]))
            code, result = self.run_cli(
                "evaluate", "--passport", str(base / "p/passport.json"), "--jobs", str(FIXTURES / "jobs.json"),
                "--questions", str(FIXTURES / "questions.json"), "--output", str(base / "e"),
                "--stored-answers", str(identity),
            )
            self.assertEqual(code, 0, result)
            self.assertEqual(result["submitted"], 0)
            self.assertTrue((base / "e/ranking.json").exists())
            self.assertEqual(len(list((base / "e/dossiers").iterdir())), 3)
            for package in result["packages"]:  # type: ignore[union-attr]
                folder = base / "e/packages" / package["job_id"]
                self.assertTrue((folder / "evidence_manifest.json").exists())

    def test_bad_inputs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            (base / "bad.json").write_text("{")
            (base / "list.json").write_text("[]")
            (base / "dup.json").write_text(json.dumps([load_jobs()[0], load_jobs()[0]]))
            code, _ = self.run_cli("evaluate", "--passport", str(base / "bad.json"), "--jobs", "x", "--output", str(base / "o"))
            self.assertEqual(code, 1)
            passport_dir = base / "p"
            passport_dir.mkdir()
            (passport_dir / "passport.json").write_text(json.dumps(self.passport().to_dict()))
            for jobs in ("list.json", "dup.json"):
                code, _ = self.run_cli("evaluate", "--passport", str(passport_dir / "passport.json"),
                                       "--jobs", str(base / jobs), "--output", str(base / f"o-{jobs}"))
                self.assertEqual(code, 1)
            code, _ = self.run_cli("evaluate", "--passport", str(passport_dir / "passport.json"),
                                   "--jobs", str(FIXTURES / "jobs.json"), "--questions", str(base / "list.json"),
                                   "--output", str(base / "o-q"))
            self.assertEqual(code, 1)
        with self.assertRaises(CareerError):
            load_identity([])
        with self.assertRaises(CareerError):
            load_identity({"person_id": "p", "person_emails": "x"})


if __name__ == "__main__":
    unittest.main()
