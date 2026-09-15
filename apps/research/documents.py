# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/research/documents.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-15
# Depends:     apps/research/contracts.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/research/contracts.py
# DAG Node:    none
# Intent:      Parse uploaded documents in a bounded child process without publishing protected file URLs or executing their contents.
# ───────────────────────────────────────────────────────────────

"""Extract text from explicit document files without executing document instructions."""
from __future__ import annotations

import argparse
import importlib
import io
import json
from pathlib import Path
import sys
from xml.etree import ElementTree
import zipfile

from apps.research.contracts import MAX_FILE, ResearchError, clip_text, file_kind


def extract(data: bytes, name: str) -> tuple[str, str, bool]:
    """Extract bounded text and identify the actual parser used."""
    if file_kind(name, len(data)) != "document":
        raise ResearchError("unsupported")
    extension = name.rsplit(".", 1)[-1].lower()
    truncated = False
    try:
        if extension in {"txt", "md"}:
            value = data.decode("utf-8-sig")
            version = "python-" + sys.version.split()[0]
        elif extension == "docx":
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                if len(archive.infolist()) > 2000 or sum(item.file_size for item in archive.infolist()) > MAX_FILE * 4:
                    raise ResearchError("too_large")
                document = archive.getinfo("word/document.xml")
                if document.file_size > 2 * 1024 * 1024:
                    raise ResearchError("too_large")
                raw = archive.read(document)
                if b"<!DOCTYPE" in raw.upper() or b"<!ENTITY" in raw.upper():
                    raise ResearchError("unsupported")
                root = ElementTree.fromstring(raw)
                namespace = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
                value = "\n".join("".join(part.text or "" for part in paragraph.iter(namespace + "t")) for paragraph in root.iter(namespace + "p"))
                version = "python-" + sys.version.split()[0]
        else:
            try:
                pypdf = importlib.import_module("pypdf")
            except ImportError:
                raise ResearchError("capability_unavailable") from None
            reader = pypdf.PdfReader(io.BytesIO(data))
            if reader.is_encrypted or len(reader.pages) > 200:
                raise ResearchError("unsupported")
            pages: list[str] = []
            for page in reader.pages:
                pages.append(str(page.extract_text() or ""))
                if sum(len(part) for part in pages) > 16000:
                    break
            value = "\n\n".join(pages)
            version = "pypdf-" + str(pypdf.__version__)
            truncated = len(pages) < len(reader.pages)
        if "\x00" in value:
            raise ResearchError("unsupported")
        # Strip control codes while preserving paragraph and tab structure.
        value = "".join(char for char in value if ord(char) >= 32 or char in "\n\r\t")
        if not value.strip():
            raise ResearchError("unsupported")
        excerpt = clip_text(value, 16000)
        return excerpt, version, truncated or excerpt != value
    except (UnicodeError, zipfile.BadZipFile, KeyError, ElementTree.ParseError, ValueError):
        raise ResearchError("invalid_data") from None


def main() -> int:
    """Parse only a worker-created file and emit a bounded child-process result."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path)
    parser.add_argument("--name", required=True)
    args = parser.parse_args()
    try:
        if args.path.stat().st_size > MAX_FILE:
            raise ResearchError("too_large")
        result, version, truncated = extract(args.path.read_bytes(), args.name)
        print(json.dumps({"text": result, "version": version, "truncated": truncated}, ensure_ascii=True))
        return 0
    except ResearchError as error:
        print(json.dumps({"failure": error.reason}))
    except Exception:
        # Parser exceptions can include document text. Never serialize them.
        print(json.dumps({"failure": "invalid_data"}))
    return 1


def limit_resources() -> None:
    """Bound parser child memory and CPU on hosts that expose resource limits."""
    try:
        resource = importlib.import_module('resource')
    except ImportError:
        # The receiving Windows/container runtime must apply its own job limits.
        return
    for kind, maximum in [(resource.RLIMIT_AS, 512 * 1024 * 1024), (resource.RLIMIT_CPU, 25)]:
        _soft, hard = resource.getrlimit(kind)
        limit = maximum if hard < 0 else min(maximum, hard)
        resource.setrlimit(kind, (limit, limit))


if __name__ == "__main__":
    limit_resources()
    raise SystemExit(main())
