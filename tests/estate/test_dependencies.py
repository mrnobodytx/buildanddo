# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/estate/test_dependencies.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-ESTATE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-ESTATE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/estate/dependencies.py, apps/estate/syntax.py, tests/estate/support.py
# EnumType:    Test
# EnumEdges:   DEPENDS_ON apps/estate/dependencies.py; DEPENDS_ON apps/estate/syntax.py; DEPENDS_ON tests/estate/support.py
# DAG Node:    none
# Intent:      Prove actual import resolution, declaration edges, JS aliases, JSX bindings and native PocketBase route evidence.
# ───────────────────────────────────────────────────────────────

"""Exercise source parsing and dependency resolution without application execution."""

from __future__ import annotations

from apps.estate.census import scan_repository
from apps.estate.dependencies import DependencyAnalysis, Resolver, extract_dependencies, safe_relative
from apps.estate.evidence import collect_evidence
from apps.estate.modules import identify_modules
from apps.estate.syntax import ImportReference, normalize_route, parse_javascript, parse_python
from tests.estate.support import RepositoryTest, cgrf


class DependencyTests(RepositoryTest):
    def graph(self) -> tuple[DependencyAnalysis, Resolver]:
        census = scan_repository(self.root)
        evidence = collect_evidence(self.root, census)
        modules = identify_modules(census, evidence)
        return extract_dependencies(census, modules, evidence), Resolver(census, modules, evidence)

    def test_python_imports_map_to_semantic_module_and_keep_receipts(self) -> None:
        self.repository()
        self.write("apps/decision/consumer.py", "import apps.research.contracts\nfrom apps import research\n"
                   "from ..research.contracts import Contract\nfrom .runtime import decide\nimport json\n")
        graph, _ = self.graph()
        edge = next(edge for edge in graph.edges if edge.source == "buildanddo.decision" and
                    edge.target == "buildanddo.research" and edge.evidence == "import")
        self.assertEqual(edge.confidence, 1.0)
        self.assertEqual(edge.edge_type, "DEPENDS_ON")
        self.assertEqual(edge.evidence_files, ["apps/decision/consumer.py", "apps/decision/runtime.py"])
        self.assertFalse(any(edge.source == edge.target for edge in graph.edges))
        external = next(reference for reference in graph.references if reference.target == "json")
        self.assertEqual(external.status, "external")
        self.assertEqual(external.resolved_modules, [])
        self.assertTrue(any(reference.target == "..research.contracts" and reference.status == "resolved" for reference in graph.references))

    def test_js_aliases_relative_imports_and_jsx_component_bindings(self) -> None:
        self.repository()
        self.write("apps/web/src/components/Card.tsx", "export default function Card() { return <div/>; }")
        self.write("apps/web/src/pages/Page.jsx",
                   "import Card from '../components/Card.js';\nimport { data } from '@/lib/data';\n"
                   "export { data } from '@/lib/data';\nexport default function Page() { return <Card/>; }\n")
        graph, resolver = self.graph()
        paths, status, confidence = resolver.javascript("../components/Card.js", "apps/web/src/pages/Page.jsx")
        self.assertEqual((paths, status, confidence), (["apps/web/src/components/Card.tsx"], "resolved", 1.0))
        self.assertTrue(any(reference.usage == "jsx" and reference.resolved_paths == paths for reference in graph.references))
        self.assertTrue(any(reference.target == "@/lib/data" and reference.resolved_paths == ["apps/web/src/lib/data.js"] for reference in graph.references))
        self.assertEqual(resolver.javascript("@/missing", "apps/web/src/App.jsx")[1], "missing")
        self.assertEqual(resolver.javascript("react", "apps/web/src/App.jsx")[1], "external")

    def test_custom_aliases_resolve_from_the_config_directory(self) -> None:
        self.repository()
        self.write("apps/web/jsconfig.json",
                   '{// jsonc\n"compilerOptions":{"baseUrl":".","paths":{"@research/*":["../research/*"],"@data":["./src/lib/data"]}},}')
        self.write("apps/research/client.js", "export const client = 1;")
        self.write("apps/web/src/use.js", "import { client } from '@research/client';\nrequire('@data');")
        graph, resolver = self.graph()
        self.assertEqual(resolver.javascript("@research/client", "apps/web/src/use.js")[0], ["apps/research/client.js"])
        self.assertTrue(any(edge.source == "buildanddo.web" and edge.target == "buildanddo.research" and edge.evidence == "import" for edge in graph.edges))
        self.assertEqual(resolver.javascript("@data", "apps/web/src/use.js")[0], ["apps/web/src/lib/data.js"])

    def test_cgrf_declared_dependencies_and_evidence_deduplicate(self) -> None:
        self.repository()
        self.write("apps/decision/declared.py", cgrf("apps/decision/declared.py", depends="apps/research/contracts.py",
                   extra="# EnumEdges: DEPENDS_ON apps/research/contracts.py; CONSUMES apps/web; EXPOSES GET /api/expected\n"))
        self.write("tests/api/check.py", cgrf("tests/api/check.py", role="Test", extra="# EnumEdges: VALIDATES apps/decision\n"))
        graph, _ = self.graph()
        edge = next(edge for edge in graph.edges if edge.source == "buildanddo.decision" and edge.target == "buildanddo.research" and edge.evidence == "cgrf_header")
        self.assertEqual(edge.confidence, 1.0)
        self.assertIn("apps/decision/declared.py", edge.evidence_files)
        self.assertTrue(any(edge.source == "buildanddo.decision" and edge.target == "buildanddo.web" and edge.edge_type == "CONSUMES" for edge in graph.edges))
        self.assertTrue(any(edge.source == "buildanddo.decision" and edge.target == "buildanddo.tests.api" and edge.edge_type == "TESTED_BY" for edge in graph.edges))

    def test_pocketbase_route_auth_handler_tests_and_collections(self) -> None:
        self.repository()
        graph, resolver = self.graph()
        route = graph.routes[0]
        self.assertEqual((route.method, route.path, route.auth), ("GET", "/api/research/{id}", "required"))
        self.assertTrue(route.handler_implemented)
        self.assertEqual(route.test_files, ["tests/api/research.test.js"])
        self.assertEqual(route.module_id, "buildanddo.pocketbase")
        hooks = "$" + "{__hooks}/policy.js"
        self.assertEqual(resolver.javascript(hooks, route.file)[0], ["apps/pocketbase/pb_hooks/policy.js"])
        self.assertEqual([item.name for item in graph.collections], ["observations"])
        reference = next(item for item in graph.references if item.usage == "collection")
        self.assertEqual(reference.status, "resolved")
        self.assertTrue(any(edge.edge_type == "EXPOSES" and edge.evidence == "route_registration" for edge in graph.edges))

    def test_auth_is_per_route_and_named_handler_requires_implementation(self) -> None:
        self.write("apps/pocketbase/pb_hooks/routes.pb.js",
                   "routerAdd('GET','/api/protected', e => e.json(200, {}), $apis.requireAuth());\n"
                   "routerAdd('GET','/api/unguarded', e => e.json(200, {}));\n"
                   "routerAdd('GET','/api/empty', () => {}, $apis.requireAuth());\n"
                   "routerAdd('GET','/api/named', handler, $apis.requireAuth());\n"
                   "function handler(e) { return e.json(200, {}); }\n"
                   "routerAdd('GET','/api/unknown', missing, $apis.requireAuth());\n")
        graph, _ = self.graph()
        routes = {route.path: route for route in graph.routes}
        self.assertEqual(routes["/api/unguarded"].auth, "unknown")
        self.assertFalse(routes["/api/empty"].handler_implemented)
        self.assertTrue(routes["/api/named"].handler_implemented)
        self.assertFalse(routes["/api/unknown"].handler_implemented)

    def test_import_decoys_in_comments_strings_and_regex_are_ignored(self) -> None:
        quote = chr(96)
        text = ("// import Ghost from 'missing';\n"
                'const fake = "require(\'missing\')";\n'
                "/* require('also-missing') */\n"
                "const regex = /[{}()\\/]/g;\n"
                "import 'actual';\nexport { value as renamed } from 'reexported';\n"
                f"require({quote}$" + "{__hooks}/policy.js" + quote + ");\n")
        facts = parse_javascript(text, "apps/pocketbase/pb_hooks/example.pb.js")
        self.assertEqual([item.target for item in facts.imports], ["actual", "reexported", "$" + "{__hooks}/policy.js"])
        facts = parse_python('value = "import missing"\n# import also_missing\nfrom real import item\n__all__ = ["item"]', "apps/a.py")
        self.assertEqual([item.target for item in facts.imports], ["real"])
        self.assertIn("item", facts.exports)

    def test_migration_definitions_ignore_fields_down_migrations_and_dynamic_names(self) -> None:
        facts = parse_javascript(
            "migrate((app) => { const definitions = [{ name: 'records', fields: [{name:'label',type:'text'}] }];"
            "app.save(new Collection({name: dynamicName, fields: []}));"
            "app.save(new Collection({name:'people',type:'auth'}));"
            "}, (app) => { app.save(new Collection({name:'rollback_only',type:'base'})); });",
            "apps/pocketbase/pb_migrations/001.js")
        self.assertEqual(facts.collections, ["people", "records"])

    def test_package_manifest_edges_preserve_external_dependencies(self) -> None:
        self.repository()
        self.write("apps/decision/pyproject.toml", '[project]\nname = "decision"\ndependencies = ["httpx>=0.27"]\n')
        self.write("apps/research/package.json", '{"name":"@fixture/research","dependencies":{"other":"file:../web","absent":"workspace:*","remote":"^1.0.0"}}')
        graph, _ = self.graph()
        manifests = [edge for edge in graph.edges if edge.evidence == "package_manifest"]
        self.assertTrue(any(edge.source == "buildanddo.web" and edge.target == "buildanddo.research" for edge in manifests))
        self.assertTrue(any(edge.source == "buildanddo.research" and edge.target == "buildanddo.web" for edge in manifests))
        self.assertTrue(any(edge.edge_type == "CONFIGURES" for edge in manifests))
        self.assertTrue(any(reference.target == "absent" and reference.status == "missing" for reference in graph.references))
        self.assertTrue(any(reference.target == "remote" and reference.status == "external" for reference in graph.references))
        self.assertTrue(any(reference.target == "httpx" and reference.evidence == "package_manifest" for reference in graph.references))

    def test_dynamic_references_and_paths_outside_estate_are_not_resolved(self) -> None:
        self.repository()
        self.write("apps/pocketbase/pb_hooks/dynamic.pb.js", "routerAdd(method, url, handler);\nrequire(variable);\n")
        graph, resolver = self.graph()
        facts = resolver.evidence.files["apps/pocketbase/pb_hooks/dynamic.pb.js"]
        self.assertEqual({note.code for note in facts.notes}, {"dynamic_import", "dynamic_route"})
        self.assertEqual(safe_relative("../../outside"), None)
        self.assertEqual(safe_relative("C:/outside"), None)
        self.assertEqual(resolver.path("/tmp/outside", "apps/web/src/App.jsx"), [])
        self.assertEqual(resolver.javascript("$" + "{dynamic}/file.js", "apps/web/src/App.jsx")[1], "dynamic")
        self.assertEqual(resolver.python(ImportReference("", [], "python", 1, 9), "apps/a.py")[1], "missing")
        self.assertEqual(normalize_route("/api/thing/:id"), normalize_route("/api/thing/{id}"))
        self.assertTrue(graph.routes)

    def test_imported_handler_symbol_must_exist(self) -> None:
        self.repository()
        self.write("apps/pocketbase/pb_hooks/named.pb.js",
                   "const policy = require('./policy.js');\nrouterAdd('GET', '/api/named', policy.read, $apis.requireAuth());\n"
                   "routerAdd('GET','/api/absent', policy.absent, $apis.requireAuth());")
        graph, _ = self.graph()
        routes = {route.path: route for route in graph.routes}
        self.assertTrue(routes["/api/named"].handler_implemented)
        self.assertFalse(routes["/api/absent"].handler_implemented)

    def test_empty_named_or_imported_handlers_are_not_implementations(self) -> None:
        self.repository()
        self.write("apps/pocketbase/pb_hooks/empty.js", "function empty() {}\nmodule.exports = { empty };\n")
        self.write("apps/pocketbase/pb_hooks/empty.pb.js",
                   "const policy = require('./empty.js');\n"
                   "function empty() {}\nclass Constructor {}\nconst stub = () => {};\n"
                   "routerAdd('GET', '/api/imported-empty', policy.empty);\n"
                   "routerAdd('GET', '/api/local-empty', empty);\n"
                   "routerAdd('GET', '/api/constructor', Constructor);\n"
                   "routerAdd('GET', '/api/arrow-empty', stub);\n")
        graph, _ = self.graph()
        self.assertTrue(all(not route.handler_implemented for route in graph.routes if route.file.endswith('empty.pb.js')))

    def test_jsx_text_is_not_an_es_module_import(self) -> None:
        facts = parse_javascript("import React from 'react';\nexport function Page() { return <div>import 'imaginary';</div>; }", "apps/web/Page.jsx")
        self.assertEqual([reference.target for reference in facts.imports], ["react"])

    def test_route_test_references_match_concrete_ids_and_interpolated_origins(self) -> None:
        self.repository()
        self.write("tests/api/research.test.js", "const endpoint = '/api/research/concrete-id?limit=1';\n")
        self.write("tests/api/verify.py", "endpoint = f'{origin}/api/research/{record_id}'\n")
        graph, _ = self.graph()
        self.assertEqual(graph.routes[0].test_files, ["tests/api/research.test.js", "tests/api/verify.py"])

    def test_srs_edges_cite_actual_declarations_not_an_arbitrary_module_file(self) -> None:
        self.repository()
        self.write("apps/decision/a_untagged.py", "value = 1")
        graph, _ = self.graph()
        edge = next(edge for edge in graph.edges if edge.source == "buildanddo.decision" and edge.edge_type == "IMPLEMENTS")
        self.assertEqual(edge.evidence_files, ["apps/decision/runtime.py"])
