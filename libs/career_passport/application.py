# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/career_passport/application.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     libs/career_passport/matching.py, libs/career_passport/passport.py, libs/career_passport/models.py, libs/capability_tokens/verification.py
# EnumType:    Service
# EnumEdges:   CONSUMES libs/career_passport/matching.py; CONSUMES libs/career_passport/passport.py; CONSUMES libs/career_passport/models.py; CONSUMES libs/capability_tokens/verification.py
# Intent:      Compile reviewable application artifacts exclusively from verified personal contributions with exact claim provenance.
# ───────────────────────────────────────────────────────────────

"""Generate deterministic drafts; package creation conveys no publication consent."""

from __future__ import annotations

import hashlib
import json
import textwrap
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from types import MappingProxyType

from libs.capability_tokens.verification import ReviewPolicy
from libs.evolution.common import digest
from libs.semantic_twin.contracts import ContractError, require
from libs.semantic_twin.identity import SemanticId

from .jobs import HUMAN_FIELDS, Job
from .matching import evaluate
from .models import WorkBundle, bounded_text
from .passport import project_passport


def json_bytes(value: object) -> bytes:
    """Serialize exported artifacts with stable JSON and a terminal newline."""
    return (
        json.dumps(value, sort_keys=True, ensure_ascii=True, indent=2, allow_nan=False)
        + "\n"
    ).encode()


def private_destination(destination: Path) -> Path:
    """Create a new private output directory without following source-tree links."""
    output = destination.absolute()
    require(
        not output.exists() and not output.is_symlink(),
        "output destination already exists",
    )
    require(
        output.resolve() == output, "output traverses a symlink or relative segment"
    )
    repo = Path(__file__).resolve().parents[2]
    if output.is_relative_to(repo):
        require(
            output.is_relative_to(repo / "state" / "career"),
            "personal career output belongs in ignored state/career or outside the repository",
        )
    output.mkdir(parents=True, mode=0o700)
    return output


def resume_pdf(lines: tuple[str, ...]) -> bytes:
    """Render a paginated text resume using the PDF base font without dependencies.

    Latin/Windows-1252 text is supported by Helvetica. Unsupported glyphs fail
    explicitly so a candidate name or reviewed claim is never silently altered.
    """
    wrapped = [part for line in lines for part in (textwrap.wrap(line, 92) or [""])]
    try:
        encoded = [line.encode("cp1252") for line in wrapped]
    except UnicodeEncodeError as error:
        raise ContractError(
            "Resume PDF requires a Unicode font for these glyphs; retain the text and use a reviewed renderer."
        ) from error
    pages = [encoded[i : i + 48] for i in range(0, len(encoded), 48)] or [[b""]]
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    ]
    for page in pages:
        page_id = len(objects) + 1
        commands = [b"BT /F1 10 Tf 14 TL 50 790 Td"]
        for line in page:
            literal = (
                line.replace(b"\\", b"\\\\").replace(b"(", b"\\(").replace(b")", b"\\)")
            )
            commands.append(b"(" + literal + b") Tj T*")
        commands.append(b"ET")
        content = b"\n".join(commands)
        objects.extend(
            (
                f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents {page_id + 1} 0 R >>".encode(),
                f"<< /Length {len(content)} >>\nstream\n".encode()
                + content
                + b"\nendstream",
            )
        )
    kids = " ".join(f"{4 + i * 2} 0 R" for i in range(len(pages)))
    objects[1] = f"<< /Type /Pages /Count {len(pages)} /Kids [{kids}] >>".encode()
    result = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for index, obj in enumerate(objects, 1):
        offsets.append(len(result))
        result.extend(f"{index} 0 obj\n".encode() + obj + b"\nendobj\n")
    xref = len(result)
    result.extend(f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode())
    result.extend(
        b"".join(f"{offset:010d} 00000 n \n".encode() for offset in offsets[1:])
    )
    result.extend(
        f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    )
    return bytes(result)


@dataclass(frozen=True, slots=True)
class ApplicationPackage:
    """Hold immutable draft bytes bound to one candidate and job revision."""

    person: str
    workspace: str
    job_id: str
    job_revision: str
    apply_url: str
    generated_at: datetime
    files: Mapping[str, bytes]

    def __post_init__(self) -> None:
        object.__setattr__(self, "files", MappingProxyType(dict(self.files)))

    def manifest(self) -> dict[str, object]:
        """Bind every emitted byte; this integrity proof is not approval."""
        core: dict[str, object] = {
            "schema_version": "buildanddo.career-application/v1",
            "person": self.person,
            "workspace": self.workspace,
            "job_id": self.job_id,
            "job_revision": self.job_revision,
            "apply_url": self.apply_url,
            "generated_at": self.generated_at.isoformat(),
            "state": "DRAFT_REQUIRES_HUMAN_REVIEW",
            "authority_granted": False,
            "files": {
                name: {"sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)}
                for name, raw in sorted(self.files.items())
            },
        }
        return {**core, "package_sha256": digest(core)}

    @property
    def sha256(self) -> str:
        """Return the exact package binding used by scoped approval."""
        return str(self.manifest()["package_sha256"])

    def write(self, destination: Path) -> None:
        """Write only to a new local directory, retaining any earlier application."""
        destination = private_destination(destination)
        for name, raw in self.files.items():
            require(Path(name).name == name, "invalid application filename")
            with (destination / name).open("xb") as stream:
                stream.write(raw)
        with (destination / "package.json").open("xb") as stream:
            stream.write(json_bytes(self.manifest()))


def compile_application(
    job: Job,
    work: WorkBundle,
    person: SemanticId,
    *,
    workspace: str,
    at: datetime,
    policy: ReviewPolicy | None,
    display_name: str | None = None,
) -> ApplicationPackage:
    """Revalidate source evidence and compile only role-relevant verified facts."""
    passport = project_passport(work, person, workspace=workspace, at=at, policy=policy)
    dossier = evaluate(job, passport)
    require(
        dossier.freshness == "CURRENT",
        "refresh the job before compiling an application",
    )
    claims = dossier.selected_claims
    require(bool(claims), "no verified personal fact supports this application")
    if display_name is not None:
        bounded_text(display_name, "candidate supplied name", 160)
    name = display_name or str(person)
    facts = tuple(claim.contribution.statement for claim in claims)
    artifact_ids = {source for c in claims for source in c.contribution.artifact_ids}
    artifacts = [a for a in work.artifacts if a.source in artifact_ids]
    provenance = [
        {
            "claim_id": str(c.contribution.subject.semantic_id),
            "claim": c.contribution.statement,
            "claim_state": "VERIFIED",
            "participation": c.contribution.participation.value,
            "agent_assistance": c.contribution.agent_assistance,
            "evidence_refs": list(map(str, c.contribution.artifact_ids)),
            "review_sha256": c.review_sha256,
        }
        for c in claims
    ]
    cover = "\n".join(
        (
            f"Application for {job.role} at {job.board.company}",
            "",
            name,
            "",
            "Please consider these evidenced contributions relevant to this role:",
            *("- " + fact for fact in facts),
            "",
            "Supporting project references accompany this application.",
            "",
        )
    )
    answers = {
        "schema_version": "buildanddo.career-answers/v1",
        "person": str(person),
        "job_revision": job.revision,
        "verified_contributions": provenance,
        "reserved": {
            key: {"answer": None, "state": "HUMAN_INPUT_REQUIRED"}
            for key in HUMAN_FIELDS
        },
        "unknown_questions": "HUMAN_INPUT_REQUIRED",
        "submit_authorized": False,
    }
    brief = "\n".join(
        (
            f"# Interview brief: {job.role}",
            "",
            "## Evidenced contributions",
            "",
            *("- " + fact for fact in facts),
            "",
            "## DO NOT CLAIM",
            "",
            *("- " + value for value in dossier.do_not_claim),
            "",
            "Employment duration and personal attestations remain separate from capability evidence.",
            "",
        )
    )
    files = {
        "resume_variant.pdf": resume_pdf(
            (name, f"Relevant work for {job.role}", "", *facts)
        ),
        "cover_letter.txt": cover.encode(),
        "application_answers.json": json_bytes(answers),
        "portfolio_manifest.json": json_bytes(
            {"person": str(person), "claims": provenance}
        ),
        "interview_brief.md": brief.encode(),
        "evidence_manifest.json": json_bytes(
            {
                "work_sha256": passport.work_sha256,
                "claims": provenance,
                "artifacts": [
                    {
                        "source": str(a.source),
                        "sha256": a.sha256.value,
                        "locator": a.locator,
                        "source_revision": a.source_revision,
                        "recorded_at": a.recorded_at.isoformat(),
                    }
                    for a in artifacts
                ],
                "identity": {
                    "person": str(person),
                    "display_name": display_name,
                    "source": "caller_supplied"
                    if display_name
                    else "human_name_required",
                },
                "do_not_claim": list(dossier.do_not_claim),
                "authority_granted": False,
            }
        ),
    }
    return ApplicationPackage(
        str(person), workspace, job.id, job.revision, job.apply_url, at, files
    )
