# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/estate/support.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-ESTATE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-ESTATE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/estate
# EnumType:    Test
# EnumEdges:   DEPENDS_ON apps/estate
# DAG Node:    none
# Intent:      Provide representative repository evidence for deterministic compiler tests.
# ───────────────────────────────────────────────────────────────

"""Build filesystem fixtures without a backend or network."""

from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

SRS = "SRS-FIXTURE-001"


def cgrf(path: str, *, role: str = "Service", depends: str = "none", extra: str = "", srs: str = SRS) -> str:
    """Build a representative leading governance comment."""
    return (
        "# --- CGRF Header ---\n"
        f"# File: {path}\n# Stage: 07_BUILD\n# SRS: {srs}\n"
        "# CAPS: pending\n# CK: pending\n# Dispatch: VCC-FIXTURE-001\n"
        "# Seat: BITS-CODEGEN\n# Owner: Citadel Nexus Inc.\n"
        f"# Depends: {depends}\n# EnumType: {role}\n"
        "# Intent: Supply fixture evidence.\n" + extra + "# -------------------\n\n"
    )


class RepositoryTest(unittest.TestCase):
    """Own a temporary repository for each behavior test."""

    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="estate-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def write(self, path: str, content: str = "") -> Path:
        """Create one UTF-8 fixture file."""
        destination = self.root / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(content, encoding="utf-8")
        return destination

    def repository(self) -> None:
        """Create the real repository's principal boundary and syntax patterns."""
        self.write("package.json", '{"name":"buildanddo-fixture","workspaces":["apps/*"]}')
        self.write(".bits/srs_registry.yml",
                   "schema_version: 1\nsrs:\n  - code: SRS-FIXTURE-001\n"
                   "    title: Fixture capability\n    status: in_progress\n    risk: A1\n"
                   "    spec: .bits/srs/SRS-FIXTURE-001.md\n")
        self.write(".bits/srs/SRS-FIXTURE-001.md",
                   cgrf(".bits/srs/SRS-FIXTURE-001.md", role="Doc")
                   + "# Fixture\n\n## Scope\n\n- Add " + chr(96) + "apps/decision/" + chr(96) + ".\n")
        self.write(".bits/queue/VCC-FIXTURE-001.md",
                   cgrf(".bits/queue/VCC-FIXTURE-001.md", role="Doc")
                   + "**SRS:** SRS-FIXTURE-001 **Status:** in_progress\n")
        self.write("apps/web/package.json", '{"name":"@fixture/web","dependencies":{"@fixture/research":"workspace:*"}}')
        self.write("apps/web/jsconfig.json", '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["./src/*"]}}}')
        self.write("apps/web/src/lib/data.js",
                   cgrf("apps/web/src/lib/data.js", role="Adapter").replace("#", "//")
                   + "export function data() { return 1; }\n")
        self.write("apps/web/src/App.jsx", "import { data } from '@/lib/data';\nexport default function App() { return <div>{data()}</div>; }\n")
        self.write("apps/decision/runtime.py",
                   cgrf("apps/decision/runtime.py", depends="apps/research/contracts.py")
                   + "from apps.research.contracts import Contract\n\ndef decide():\n    return Contract()\n")
        self.write("apps/research/contracts.py",
                   cgrf("apps/research/contracts.py") + "class Contract:\n    pass\n")
        self.write("apps/research/requirements.txt", "httpx>=0.27\n")
        self.write("apps/research/package.json", '{"name":"@fixture/research"}')
        hook = cgrf("apps/pocketbase/pb_hooks/research.pb.js", role="Route",
                    depends="apps/pocketbase/pb_hooks/policy.js").replace("#", "//")
        self.write("apps/pocketbase/pb_hooks/research.pb.js",
                   hook + "routerAdd('GET', '/api/research/{id}', (e) => {\n"
                   " return require(" + chr(96) + "$" + "{__hooks}/policy.js" + chr(96)
                   + ").read(e);\n}, $apis.requireAuth('users'));\n"
                   + "onRecordCreateRequest((e) => e.next(), 'observations');\n")
        self.write("apps/pocketbase/pb_hooks/policy.js",
                   "function read(e) { return e.json(200, {}); }\nmodule.exports = { read };\n")
        self.write("apps/pocketbase/Dockerfile", "FROM scratch\n")
        self.write("apps/pocketbase/pb_migrations/001_initial.js",
                   "migrate((app) => { app.save(new Collection({name: 'observations', type: 'base', fields: []})); }, (app) => {});\n")
        self.write("tests/api/research.test.js", "const path = '/api/research/{id}';\n")
        self.write("scripts/ci/check.py", "print('PASS')\n")
