# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/estate/syntax.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-ESTATE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-ESTATE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/estate/common.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/estate/common.py
# DAG Node:    none
# Intent:      Extract static imports, exports, routes and schema evidence without running repository code.
# ───────────────────────────────────────────────────────────────

"""Extract bounded Python AST and JavaScript token evidence."""

from __future__ import annotations

import ast
from dataclasses import dataclass, field
import re

from apps.estate.common import Diagnostic

JS_EXTENSIONS = {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"}


@dataclass(frozen=True)
class ImportReference:
    """Retain a source-level import before resolving module ownership."""

    target: str
    names: list[str]
    language: str
    line: int
    level: int = 0
    usage: str = "import"


@dataclass(frozen=True)
class Route:
    """Describe one static PocketBase endpoint and its local evidence."""

    method: str
    path: str
    file: str
    line: int
    handler_implemented: bool
    auth: str
    handler_reference: str = ""
    module_id: str = ""
    test_files: list[str] = field(default_factory=list)


@dataclass
class SourceFacts:
    """Collect file evidence without retaining source text or AST objects."""

    imports: list[ImportReference] = field(default_factory=list)
    exports: list[str] = field(default_factory=list)
    symbols: list[str] = field(default_factory=list)
    implementations: list[str] = field(default_factory=list)
    routes: list[Route] = field(default_factory=list)
    collections: list[str] = field(default_factory=list)
    collection_references: list[str] = field(default_factory=list)
    route_literals: list[str] = field(default_factory=list)
    notes: list[Diagnostic] = field(default_factory=list)


@dataclass(frozen=True)
class Token:
    """Retain only the token value and source line needed by static readers."""

    kind: str
    value: str
    line: int


_IDENTIFIER = re.compile(r"[A-Za-z_$][\w$]*")
_REGEX_PREFIX = {"=", "(", "[", "{", ",", ":", ";", "!", "?", "=>", "return", "case", "&&", "||"}


def tokenize_js(text: str) -> list[Token]:
    """Tokenize JS comments, strings, templates and balanced-code punctuation.

    This is a static token reader, not an evaluator or a JavaScript type checker.
    Interpolated templates remain opaque except for known hook-path resolution.
    """
    result: list[Token] = []
    index, line = 0, 1
    while index < len(text):
        char = text[index]
        if char.isspace():
            line += char == "\n"
            index += 1
            continue
        if text.startswith("//", index):
            end = text.find("\n", index)
            index = len(text) if end < 0 else end
            continue
        if text.startswith("/*", index):
            end = text.find("*/", index + 2)
            end = len(text) if end < 0 else end + 2
            line += text[index:end].count("\n")
            index = end
            continue
        start_line = line
        if char in {"'", '"', chr(96)}:
            quote = char
            value: list[str] = []
            index += 1
            while index < len(text) and text[index] != quote:
                char = text[index]
                if char == "\\" and index + 1 < len(text):
                    following = text[index + 1]
                    value.append({"n": "\n", "r": "\r", "t": "\t"}.get(following, following))
                    line += following == "\n"
                    index += 2
                else:
                    value.append(char)
                    line += char == "\n"
                    index += 1
            result.append(Token("template" if quote == chr(96) else "string", "".join(value), start_line))
            index += 1
            continue
        if char == "/" and (not result or result[-1].value in _REGEX_PREFIX):
            end, bracket = index + 1, False
            while end < len(text) and text[end] != "\n":
                if text[end] == "\\":
                    end += 2
                    continue
                if text[end] == "[":
                    bracket = True
                elif text[end] == "]":
                    bracket = False
                elif text[end] == "/" and not bracket:
                    end += 1
                    while end < len(text) and text[end].isalpha():
                        end += 1
                    break
                end += 1
            else:
                end = index + 1
            result.append(Token("regex", "", start_line))
            index = end
            continue
        match = _IDENTIFIER.match(text, index)
        if match:
            result.append(Token("identifier", match[0], line))
            index = match.end()
            continue
        pair = text[index:index + 2]
        if pair in {"=>", "?.", "&&", "||", "==", "!=", "??", "**", "..."}:
            result.append(Token("punctuation", pair, line))
            index += 2
        else:
            result.append(Token("punctuation", char, line))
            index += 1
    return result


def matching(tokens: list[Token], start: int) -> int:
    """Find the end of a balanced expression or the end of incomplete input."""
    pairs = {"(": ")", "[": "]", "{": "}"}
    stack: list[str] = []
    for index in range(start, len(tokens)):
        value = tokens[index].value
        if tokens[index].kind != "punctuation":
            continue
        if value in pairs:
            stack.append(pairs[value])
        elif stack and value == stack[-1]:
            stack.pop()
            if not stack:
                return index
    return len(tokens) - 1


def arguments(tokens: list[Token], opening: int) -> list[list[Token]]:
    """Split call arguments at their actual nesting depth."""
    end = matching(tokens, opening)
    result: list[list[Token]] = []
    start, index = opening + 1, opening + 1
    while index < end:
        token = tokens[index]
        if token.kind == "punctuation" and token.value in {"(", "[", "{"}:
            index = matching(tokens, index) + 1
            continue
        if token.kind == "punctuation" and token.value == ",":
            result.append(tokens[start:index])
            start = index + 1
        index += 1
    result.append(tokens[start:end])
    return result


def literal(tokens: list[Token]) -> str | None:
    """Read a single static string or template argument."""
    if len(tokens) == 1 and tokens[0].kind in {"string", "template"}:
        return tokens[0].value
    return None


def normalize_route(value: str) -> str:
    """Normalize literal and interpolated route parameter spellings."""
    value = re.sub(r"[$][{][^}]+[}]|[{][^}]+[}]|:[A-Za-z_]\w*", "{}", value)
    return value.rstrip("/") or "/"


def route_matches(pattern: str, reference: str) -> bool:
    """Match a static endpoint reference, including concrete parameter values."""
    normalized = normalize_route(reference.split("?", 1)[0].split("#", 1)[0])
    expression = "[^/]+".join(re.escape(part) for part in normalize_route(pattern).split("{}"))
    return re.fullmatch(expression, normalized) is not None


def _api_path(value: str) -> str | None:
    position = value.find("/api/")
    return value[position:] if position >= 0 else None


def parse_python(text: str, path: str) -> SourceFacts:
    """Extract imports and public symbols from Python without importing it."""
    result = SourceFacts()
    try:
        tree = ast.parse(text, filename=path)
    except (SyntaxError, ValueError, RecursionError):
        result.notes.append(Diagnostic("python_parse_error", path, "Python source could not be parsed", [path]))
        return result
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            result.imports.extend(ImportReference(alias.name, [], "python", node.lineno) for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            result.imports.append(ImportReference(node.module or "", [alias.name for alias in node.names], "python", node.lineno, node.level))
        elif isinstance(node, ast.Constant) and isinstance(node.value, str):
            if (api_path := _api_path(node.value)) is not None:
                result.route_literals.append(api_path)
        elif isinstance(node, ast.JoinedStr):
            template = "".join(item.value if isinstance(item, ast.Constant) and isinstance(item.value, str) else "{}" for item in node.values)
            if (api_path := _api_path(template)) is not None:
                result.route_literals.append(api_path)
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            result.symbols.append(node.name)
            if not node.name.startswith("_"):
                result.exports.append(node.name)
        elif isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == "__all__" for target in node.targets):
            if isinstance(node.value, (ast.List, ast.Tuple)):
                result.exports.extend(item.value for item in node.value.elts if isinstance(item, ast.Constant) and isinstance(item.value, str))
    result.exports = sorted(set(result.exports))
    result.symbols = sorted(set(result.symbols))
    return result


def _has_implementation(tokens: list[Token], symbols: set[str]) -> bool:
    if not tokens:
        return False
    if tokens[0].value == "async":
        tokens = tokens[1:]
    if not tokens:
        return False
    if len(tokens) == 1:
        return tokens[0].value in symbols
    if tokens[0].value == "function":
        signature = next((index for index, token in enumerate(tokens) if token.value == "("), None)
        if signature is None:
            return False
        opening = matching(tokens, signature) + 1
        if opening >= len(tokens) or tokens[opening].value != "{":
            return False
        body = tokens[opening + 1:matching(tokens, opening)]
        return any(token.value != ";" for token in body)
    arrow = matching(tokens, 0) + 1 if tokens[0].value == "(" else 1
    if arrow >= len(tokens) or tokens[arrow].value != "=>":
        return False
    body = tokens[arrow + 1:]
    if body and body[0].value == "{":
        body = body[1:matching(body, 0)]
    return any(token.value != ";" for token in body)


def _collection_definitions(tokens: list[Token]) -> list[str]:
    result: set[str] = set()
    for index, token in enumerate(tokens):
        if token.value != "{" or token.kind != "punctuation":
            continue
        end = matching(tokens, index)
        position = index + 1
        fields: dict[str, Token] = {}
        while position < end:
            item = tokens[position]
            if position + 2 < end and tokens[position + 1].value == ":":
                fields[item.value] = tokens[position + 2]
            if item.kind == "punctuation" and item.value in {"{", "[", "("}:
                position = matching(tokens, position)
            position += 1
        collection_type = fields["type"].value if "type" in fields else ""
        if "name" in fields and fields["name"].kind == "string" and ("fields" in fields or "schema" in fields or collection_type in {"auth", "base", "view"}):
            result.add(fields["name"].value)
    return sorted(result)


def parse_javascript(text: str, path: str, auth_declaration: str = "") -> SourceFacts:
    """Extract JS bindings and PocketBase declarations from lexical evidence."""
    result = SourceFacts()
    tokens = tokenize_js(text)
    bindings: dict[str, str] = {}
    implementations: set[str] = set()
    depths: list[int] = []
    depth = 0
    for token in tokens:
        depths.append(depth)
        if token.kind == "punctuation":
            depth += token.value in {"{", "(", "["}
            depth -= token.value in {"}", ")", "]"}
    # Discover definitions first so a named handler can appear after routerAdd.
    for index, token in enumerate(tokens[:-1]):
        if token.value in {"function", "class"} and tokens[index + 1].kind == "identifier":
            result.symbols.append(tokens[index + 1].value)
            signature = index + 2
            if token.value == "function" and signature < len(tokens) and tokens[signature].value == "(":
                opening = matching(tokens, signature) + 1
                if opening < len(tokens) and tokens[opening].value == "{" and _has_implementation(tokens[index:matching(tokens, opening) + 1], set()):
                    implementations.add(tokens[index + 1].value)
        if token.value in {"const", "let", "var"} and tokens[index + 1].kind == "identifier":
            end = next((j for j in range(index + 2, len(tokens)) if tokens[j].value == ";"), min(index + 30, len(tokens)))
            if any(item.value == "=>" for item in tokens[index + 2:end]):
                result.symbols.append(tokens[index + 1].value)
                if index + 2 < len(tokens) and tokens[index + 2].value == "=" and _has_implementation(tokens[index + 3:end], set()):
                    implementations.add(tokens[index + 1].value)
    symbols = set(result.symbols)
    for index, token in enumerate(tokens):
        next_value = tokens[index + 1].value if index + 1 < len(tokens) else ""
        if token.kind in {"string", "template"} and (api_path := _api_path(token.value)) is not None:
            result.route_literals.append(api_path)
        if token.kind != "identifier":
            continue
        if token.value in {"import", "require"} and next_value == "(":
            args = arguments(tokens, index + 1)
            target = literal(args[0]) if args else None
            if target is not None:
                result.imports.append(ImportReference(target, [], "javascript", token.line))
                if index >= 2 and tokens[index - 1].value == "=":
                    bindings[tokens[index - 2].value] = target
            else:
                result.notes.append(Diagnostic("dynamic_import", path, f"Nonliteral dependency at line {token.line}", [path]))
        elif token.value in {"import", "export"} and next_value != "(" and depths[index] == 0:
            cursor = index + 1
            clause: list[Token] = []
            target = None
            while cursor < len(tokens):
                item = tokens[cursor]
                if item.value == ";" or item.line > token.line + 30:
                    break
                if item.kind in {"string", "template"} and (cursor == index + 1 or clause and clause[-1].value == "from"):
                    target = item.value
                    break
                clause.append(item)
                # An export declaration is not a re-export-from statement.
                if token.value == "export" and item.value in {"function", "class", "const", "let", "default"}:
                    break
                cursor += 1
            names = [item.value for item in clause if item.kind == "identifier" and item.value not in {"type", "from", "as"}]
            if target is not None:
                result.imports.append(ImportReference(target, names, "javascript", token.line))
                for name in names:
                    bindings[name] = target
            if token.value == "export":
                if next_value == "default":
                    result.exports.append("default")
                elif next_value in {"function", "class", "const", "let", "var"} and index + 2 < len(tokens):
                    result.exports.append(tokens[index + 2].value)
                elif next_value == "{":
                    result.exports.extend(names)
        elif token.value == "exports" and next_value == "." and index + 2 < len(tokens):
            result.exports.append(tokens[index + 2].value)
        elif token.value == "routerAdd" and next_value == "(" and "/pb_hooks/" in path:
            args = arguments(tokens, index + 1)
            method = literal(args[0]) if args else None
            route_path = literal(args[1]) if len(args) > 1 else None
            if not method or not route_path or "$" + "{" in method + route_path:
                result.notes.append(Diagnostic("dynamic_route", path, f"Nonliteral route at line {token.line}", [path]))
                continue
            handler = args[2] if len(args) > 2 else []
            middleware = [item.value for group in args[3:] for item in group]
            required = any(value in {"requireAuth", "requireAdminAuth", "requireSuperuserAuth"} for value in middleware)
            auth = "required" if required else "public" if auth_declaration.lower() == "public" else "unknown"
            reference = ""
            if len(handler) == 3 and handler[1].value == "." and handler[0].value in bindings:
                reference = bindings[handler[0].value] + "#" + handler[2].value
            result.routes.append(Route(method.upper(), route_path, path, token.line,
                                       _has_implementation(handler, implementations), auth, reference))
        elif next_value == "(" and (token.value.startswith("onRecord") or token.value == "onFileDownloadRequest"):
            for group in arguments(tokens, index + 1)[1:]:
                collection_name = literal(group)
                if collection_name:
                    result.collection_references.append(collection_name)
        elif next_value == "(" and token.value in {"findCollectionByNameOrId", "findRecordById", "findRecordsByFilter", "collection"}:
            args = arguments(tokens, index + 1)
            collection_name = literal(args[0]) if args else None
            if collection_name:
                result.collection_references.append(collection_name)
    for index, token in enumerate(tokens[:-1]):
        if token.value == "<" and tokens[index + 1].value in bindings:
            name = tokens[index + 1].value
            result.imports.append(ImportReference(bindings[name], [name], "javascript", token.line, usage="jsx"))
    if "/pb_migrations/" in path:
        migration = next((index for index, token in enumerate(tokens[:-1]) if token.value == "migrate" and tokens[index + 1].value == "("), None)
        up = arguments(tokens, migration + 1)[0] if migration is not None else tokens
        result.collections = _collection_definitions(up)
    # CommonJS object exports are explicit public symbols, including shorthand.
    for index in range(len(tokens) - 4):
        if [token.value for token in tokens[index:index + 4]] == ["module", ".", "exports", "="] and tokens[index + 4].value == "{":
            end = matching(tokens, index + 4)
            result.exports.extend(token.value for token in tokens[index + 5:end] if token.kind == "identifier" and token.value in symbols)
    result.exports = sorted(set(result.exports))
    result.symbols = sorted(symbols)
    result.implementations = sorted(implementations)
    result.collection_references = sorted(set(result.collection_references))
    result.route_literals = sorted(set(result.route_literals))
    return result
