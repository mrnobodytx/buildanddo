# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/capability_tokens/registry.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-CAPABILITY-TOKEN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAPABILITY-TOKEN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/capability_tokens/conformance.py, libs/capability_tokens/models.py, libs/capability_tokens/passport.py, libs/capability_tokens/verification.py, libs/evolution/common.py, libs/evolution/compiler.py, libs/semantic_twin/contracts.py, libs/semantic_twin/identity.py, libs/semantic_twin/merkle.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON libs/capability_tokens/conformance.py; DEPENDS_ON libs/capability_tokens/models.py; DEPENDS_ON libs/capability_tokens/passport.py; DEPENDS_ON libs/capability_tokens/verification.py; DEPENDS_ON libs/evolution/common.py; DEPENDS_ON libs/evolution/compiler.py; DEPENDS_ON libs/semantic_twin/contracts.py; DEPENDS_ON libs/semantic_twin/identity.py; DEPENDS_ON libs/semantic_twin/merkle.py
# Intent:      Distribute pinned capability versions locally while retaining revocation history and the existing proposal boundary.
# ───────────────────────────────────────────────────────────────

"""Maintain a local federated registry with immutable versions and proposal-only use."""

from __future__ import annotations

import sqlite3
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Literal

from libs.evolution.common import digest, mapping
from libs.evolution.compiler import ActionProposal, DecisionInput
from libs.semantic_twin.contracts import Contract, ContractError, require, text
from libs.semantic_twin.identity import SemanticId
from libs.semantic_twin.merkle import ContentDigest

from .conformance import Certification, propose
from .models import ImplementationBinding, TokenBundle, TokenPin, version_key
from .passport import MeteredCall, PassportPublication, validated_calls
from .verification import ReviewPolicy


@dataclass(frozen=True, slots=True)
class FederatedIndex(Contract):
    """Capture a namespace-owned generation; its trust pin must arrive separately."""

    publisher: str
    generation: int
    issued_at: datetime
    bundles: tuple[TokenBundle, ...]
    certifications: tuple[Certification, ...] = ()
    revoked: tuple[TokenPin, ...] = ()
    previous_digest: ContentDigest | None = None
    passports: tuple[PassportPublication, ...] = ()
    schema_version: Literal["cnwb.capability-index/v1"] = "cnwb.capability-index/v1"

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(
            self.generation >= 1
            and (self.generation == 1) == (self.previous_digest is None),
            "invalid federation generation",
        )
        require(bool(self.bundles or self.revoked), "empty federation generation")
        require(
            all(b.token.publisher == self.publisher for b in self.bundles),
            "publisher cannot advertise another namespace",
        )
        require(
            len({b.token.pin.key for b in self.bundles}) == len(self.bundles),
            "duplicate indexed version",
        )
        require(
            all(
                str(p.capability_id).startswith(f"cni://capability/{self.publisher}/")
                for p in self.revoked
            ),
            "publisher cannot revoke another namespace",
        )
        pins = {b.token.pin for b in self.bundles}
        require(
            all(c.report.binding.token in pins for c in self.certifications),
            "index certification has no bundle",
        )
        require(len(set(self.revoked)) == len(self.revoked), "duplicate revocation")
        require(
            all(
                p.passport.binding.token in pins and p.published_at <= self.issued_at
                for p in self.passports
            ),
            "passport is future or has no indexed version",
        )
        available = {b.token.pin: b.token for b in self.bundles}
        for certificate in self.certifications:
            binding = certificate.report.binding
            require(
                available[binding.token].binding(binding.implementation_id) == binding,
                "indexed certificate implementation mismatch",
            )
        for publication in self.passports:
            record = publication.passport
            token = available[record.binding.token]
            require(
                token.binding(record.binding.implementation_id) == record.binding,
                "indexed passport implementation mismatch",
            )
            require(
                record.currency == token.pricing.currency
                and set(record.environments_tested)
                <= set(
                    token.implementation(record.binding.implementation_id).environments
                ),
                "indexed passport compatibility mismatch",
            )

    @property
    def root(self) -> ContentDigest:
        """Hash the complete portable generation with the canonical profile."""
        return ContentDigest(digest(self))


@dataclass(frozen=True, slots=True)
class RegistryEntry(Contract):
    """Hash one local chronological operation without implying a signed audit log."""

    sequence: int
    scope_id: str
    occurred_at: datetime
    kind: Literal["index", "install", "certificate", "revoke", "proposal", "meter"]
    payload: Mapping[str, object]
    previous: ContentDigest | None

    @property
    def root(self) -> ContentDigest:
        """Bind every operation to the preceding local entry."""
        return ContentDigest(digest(self))


class Registry:
    """Keep scope-bound registry history in SQLite with serialized compare-and-append."""

    def __init__(self, path: Path, scope_id: str) -> None:
        text(scope_id, "registry scope")
        require(not path.is_symlink(), "registry path cannot be a symlink")
        path.parent.mkdir(parents=True, exist_ok=True)
        self.scope_id = scope_id
        self.connection = sqlite3.connect(path, timeout=10, isolation_level=None)
        self.connection.execute(
            "create table if not exists cnwb_meta (scope text not null, version integer not null)"
        )
        self.connection.execute(
            "create table if not exists cnwb_log (seq integer primary key, body text not null, root text not null)"
        )
        self.connection.execute("begin immediate")
        try:
            rows = self.connection.execute(
                "select scope, version from cnwb_meta"
            ).fetchall()
            if not rows:
                self.connection.execute(
                    "insert into cnwb_meta values (?, 1)", (scope_id,)
                )
            else:
                require(
                    rows == [(scope_id, 1)],
                    "registry belongs to another scope or schema",
                )
            self.entries()
            self.connection.execute("commit")
        except Exception:
            self.connection.execute("rollback")
            self.connection.close()
            raise

    def close(self) -> None:
        """Close the local journal without modifying retained history."""
        self.connection.close()

    def __enter__(self) -> Registry:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()

    def entries(self) -> tuple[RegistryEntry, ...]:
        """Revalidate scope, order and content hashes before any registry decision."""
        output: list[RegistryEntry] = []
        previous: ContentDigest | None = None
        for seq, body, root in self.connection.execute(
            "select seq, body, root from cnwb_log order by seq"
        ):
            entry = RegistryEntry.from_json(body)
            require(
                entry.sequence == seq == len(output) + 1
                and entry.scope_id == self.scope_id
                and entry.previous == previous
                and entry.root.value == root,
                "registry history integrity failure",
            )
            require(
                not output or entry.occurred_at >= output[-1].occurred_at,
                "registry time reversal",
            )
            output.append(entry)
            previous = entry.root
        return tuple(output)

    def _append(
        self,
        kind: str,
        payload: Mapping[str, object],
        at: datetime,
        expected: ContentDigest | None,
    ) -> None:
        self.connection.execute("begin immediate")
        try:
            entries = self.entries()
            require(
                (entries[-1].root if entries else None) == expected,
                "registry changed; retry from current state",
            )
            require(
                not entries or entries[-1].occurred_at <= at,
                "operation predates registry state",
            )
            entry = RegistryEntry.from_dict(
                {
                    "sequence": len(entries) + 1,
                    "scope_id": self.scope_id,
                    "occurred_at": at.isoformat(),
                    "kind": kind,
                    "payload": payload,
                    "previous": expected.to_dict() if expected else None,
                }
            )
            self.connection.execute(
                "insert into cnwb_log values (?, ?, ?)",
                (entry.sequence, entry.to_json(), entry.root.value),
            )
            self.connection.execute("commit")
        except Exception:
            self.connection.execute("rollback")
            raise

    def state(self, *, as_of: datetime | None = None) -> RegistryState:
        """Reconstruct immutable content, installs and accumulated revocations."""
        entries = tuple(
            e for e in self.entries() if as_of is None or e.occurred_at <= as_of
        )
        state = RegistryState(
            {}, {}, {}, set(), {}, {}, entries[-1].root if entries else None
        )
        for entry in entries:
            data = entry.payload
            if entry.kind == "index":
                index = FederatedIndex.from_dict(mapping(data))
                state.indexes[index.publisher] = index
                for bundle in index.bundles:
                    key = bundle.token.pin.key
                    require(
                        key not in state.bundles or state.bundles[key] == bundle,
                        "immutable version changed",
                    )
                    state.bundles[key] = bundle
                for cert in index.certifications:
                    state.certificates[digest(cert)] = cert
                for publication in index.passports:
                    state.passports[digest(publication)] = publication
                state.revoked.update(index.revoked)
            elif entry.kind == "certificate":
                cert = Certification.from_dict(mapping(data))
                state.certificates[digest(cert)] = cert
            elif entry.kind == "install":
                raw = data["pins"]
                require(isinstance(raw, tuple), "invalid install record")
                assert isinstance(raw, tuple)
                for value in raw:
                    pin = TokenPin.from_dict(mapping(value))
                    state.installed[pin.capability_id] = pin
            elif entry.kind == "revoke":
                state.revoked.add(TokenPin.from_dict(mapping(data["pin"])))
        return state

    def import_index(
        self,
        index: FederatedIndex,
        *,
        publisher: str,
        expected_digest: ContentDigest,
        at: datetime,
    ) -> None:
        """Admit only an independently pinned namespace generation and monotonic chain."""
        require(
            index.publisher == publisher and index.root == expected_digest,
            "federation publisher or independent content pin mismatch",
        )
        require(index.issued_at <= at, "future federation generation")
        state = self.state()
        previous = state.indexes.get(publisher)
        if previous == index:
            return
        require(
            index.generation == (previous.generation + 1 if previous else 1)
            and index.previous_digest == (previous.root if previous else None),
            "federation rollback or missing generation",
        )
        if previous is not None:
            require(index.issued_at >= previous.issued_at, "federation time reversal")
        for bundle in index.bundles:
            prior = state.bundles.get(bundle.token.pin.key)
            require(prior is None or prior == bundle, "immutable version conflict")
        for pin in index.revoked:
            prior = state.bundles.get(pin.key)
            require(
                prior is None or prior.token.pin == pin, "revocation content mismatch"
            )
        for revoked in state.revoked:
            require(
                all(
                    b.token.pin.key != revoked.key or b.token.pin == revoked
                    for b in index.bundles
                ),
                "revoked version cannot be replaced",
            )
        self._append("index", index.to_dict(), at, state.root)

    def inspect(self, pin: TokenPin) -> TokenBundle:
        """Inspect exact content even when a version has been revoked."""
        return self.state().bundle(pin)

    def metered(self, binding: ImplementationBinding) -> tuple[MeteredCall, ...]:
        """Read retained measurements for one implementation without accepting other scopes."""
        records: dict[str, MeteredCall] = {}
        for entry in self.entries():
            if entry.kind != "meter":
                continue
            values = entry.payload["calls"]
            require(isinstance(values, tuple), "invalid metering journal entry")
            assert isinstance(values, tuple)
            for value in values:
                call = MeteredCall.from_dict(mapping(value))
                require(
                    call.observation.scope_id == self.scope_id,
                    "foreign metering history",
                )
                if call.observation.binding == binding:
                    records[call.observation.call_id] = call
        return tuple(records[k] for k in sorted(records))

    def meter(
        self,
        bundle: TokenBundle,
        implementation: str,
        calls: tuple[MeteredCall, ...],
        policy: ReviewPolicy,
        *,
        at: datetime,
    ) -> None:
        """Append validated receiver captures and reviewed results, preserving retry identity."""
        state = self.state()
        require(state.bundle(bundle.token.pin) == bundle, "metering bundle mismatch")
        existing = self.metered(bundle.token.binding(implementation))
        retained = validated_calls(
            bundle,
            implementation,
            existing + calls,
            policy,
            scope_id=self.scope_id,
            at=at,
        )
        if retained != existing:
            self._append(
                "meter", {"calls": [c.to_dict() for c in retained]}, at, state.root
            )

    def search(self, query: str) -> tuple[dict[str, object], ...]:
        """Search descriptive metadata without representing advertisements as certification."""
        state = self.state()
        rows = []
        for bundle in sorted(state.bundles.values(), key=lambda b: b.token.pin.key):
            token = bundle.token
            if (
                query.casefold()
                in " ".join(
                    (token.name, token.description, token.category, *token.skills)
                ).casefold()
            ):
                rows.append(
                    {
                        "pin": token.pin.to_dict(),
                        "name": token.name,
                        "category": token.category,
                        "revoked": token.pin in state.revoked,
                        "installed": state.installed.get(token.capability_id)
                        == token.pin,
                        "published_passports": [
                            p.to_dict()
                            for p in state.passports.values()
                            if p.passport.binding.token == token.pin
                        ],
                    }
                )
        return tuple(rows)

    def resolve(self, capability: SemanticId, version: str | None = None) -> TokenPin:
        """Resolve a name once to an exact available version; installation remains explicit."""
        state = self.state()
        choices = [
            b.token.pin
            for b in state.bundles.values()
            if b.token.capability_id == capability
            and b.token.pin not in state.revoked
            and (version is None or b.token.version == version)
        ]
        require(bool(choices), "no available version")
        return max(choices, key=lambda p: version_key(p.version))

    def install(
        self, pin: TokenPin, *, at: datetime, expected_previous: TokenPin | None = None
    ) -> None:
        """Atomically install a dependency closure or explicitly update its current root."""
        state = self.state()
        existing = state.installed.get(pin.capability_id)
        if expected_previous is not None:
            require(existing == expected_previous, "update predecessor changed")
            require(
                version_key(pin.version) > version_key(expected_previous.version),
                "update must advance version",
            )
            require(
                state.bundle(expected_previous).token.authority
                == state.bundle(pin).token.authority,
                "update cannot expand authority requirements",
            )
        else:
            require(
                existing is None or existing == pin,
                "use an explicit update for installed versions",
            )
        closure = state.closure(pin)
        for item in closure:
            current = state.installed.get(item.capability_id)
            if current is not None and current != item:
                require(
                    item == pin and expected_previous == current,
                    "installed dependency version conflict",
                )
        self._append(
            "install", {"pins": [p.to_dict() for p in closure]}, at, state.root
        )

    def add_certificate(
        self, certificate: Certification, policy: ReviewPolicy, *, at: datetime
    ) -> None:
        """Retain a separately authenticated, exact certificate without changing installs."""
        state = self.state()
        pin = certificate.report.binding.token
        require(pin not in state.revoked, "revoked version cannot be certified")
        certificate.require_valid(state.bundle(pin), policy, at=at)
        self._append("certificate", certificate.to_dict(), at, state.root)

    def revoke(self, pin: TokenPin, *, reason: str, at: datetime) -> None:
        """Disable a local exact version permanently while preserving its records."""
        text(reason, "revocation reason")
        state = self.state()
        state.bundle(pin)
        if pin in state.revoked:
            return
        self._append("revoke", {"pin": pin.to_dict(), "reason": reason}, at, state.root)

    def require_ready(
        self, pin: TokenPin, implementation: str, policy: ReviewPolicy, *, at: datetime
    ) -> TokenBundle:
        """Recheck current installs, transitive revocations and fresh trusted certificates."""
        state = self.state(as_of=at)
        for dependency in state.closure(pin):
            require(
                state.installed.get(dependency.capability_id) == dependency,
                "dependency is not installed",
            )
            bundle = state.bundle(dependency)
            choices = [
                c
                for c in state.certificates.values()
                if c.report.binding.token == dependency
                and (
                    dependency != pin
                    or c.report.binding.implementation_id == implementation
                )
            ]
            valid = False
            for certificate in choices:
                try:
                    certificate.require_valid(bundle, policy, at=at)
                    valid = True
                    break
                except ContractError:
                    continue
            require(
                valid,
                "no current trusted certification for implementation or dependency",
            )
        return state.bundle(pin)

    def invoke(
        self,
        pin: TokenPin,
        implementation: str,
        inputs: Mapping[str, object],
        observation: DecisionInput,
        *,
        environment: str,
        policy: ReviewPolicy,
        at: datetime,
    ) -> ActionProposal | None:
        """Record a proposal at unchanged authority; never invoke scripts, models or adapters."""
        require(
            observation.scope_id == self.scope_id, "registry cannot cross tenant scope"
        )
        require(observation.decision_at <= at, "future invocation context")
        state = self.state()
        bundle = self.require_ready(
            pin, implementation, policy, at=observation.decision_at
        )
        self.require_ready(pin, implementation, policy, at=at)
        proposal = propose(
            bundle, implementation, inputs, observation, environment=environment
        )
        self._append(
            "proposal",
            {
                "binding": bundle.token.binding(implementation).to_dict(),
                "proposal": proposal.to_dict() if proposal else None,
                "effects_executed": 0,
            },
            at,
            state.root,
        )
        return proposal


@dataclass
class RegistryState:
    """Hold a transient reduction of the validated append-only journal."""

    bundles: dict[str, TokenBundle]
    installed: dict[SemanticId, TokenPin]
    certificates: dict[str, Certification]
    revoked: set[TokenPin]
    indexes: dict[str, FederatedIndex]
    passports: dict[str, PassportPublication]
    root: ContentDigest | None

    def bundle(self, pin: TokenPin) -> TokenBundle:
        """Reject an unpinned alias or conflicting manifest."""
        result = self.bundles.get(pin.key)
        require(
            result is not None and result.token.pin == pin,
            "unknown or conflicting token pin",
        )
        assert result is not None
        return result

    def closure(self, root: TokenPin) -> tuple[TokenPin, ...]:
        """Topologically resolve exact dependencies while rejecting cycles and conflicts."""
        ordered: list[TokenPin] = []
        visiting: set[str] = set()
        selected: dict[SemanticId, TokenPin] = {}

        def visit(pin: TokenPin) -> None:
            require(pin not in self.revoked, "version or dependency is revoked")
            require(pin.key not in visiting, "dependency cycle")
            if pin.capability_id in selected:
                require(
                    selected[pin.capability_id] == pin, "dependency version conflict"
                )
                return
            require(
                len(selected) + len(visiting) < 128, "dependency closure exceeds bound"
            )
            visiting.add(pin.key)
            bundle = self.bundle(pin)
            for dependency in bundle.token.dependencies:
                visit(dependency)
            visiting.remove(pin.key)
            selected[pin.capability_id] = pin
            ordered.append(pin)

        visit(root)
        return tuple(ordered)
