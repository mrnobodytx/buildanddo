# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/shared/federal_foundry/retrieval.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/shared/federal_foundry/validation.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON foundry/shared/federal_foundry/validation.py
# DAG Node:    none
# Intent:      Compare real deterministic lexical retrieval candidates with transparent scores and explicit relevance denominators.
# ───────────────────────────────────────────────────────────────

"""Evaluate BM25 and TF-IDF with stable rankings and source explanations."""

from __future__ import annotations

from collections import Counter
import math
import re

from .models import FoundryValidationError
from .validation import canonical, digest, finite, integer, mapping, records, strings


def tokens(text: str) -> tuple[str, ...]:
    """Tokenize text with a fixed Unicode word rule and case folding."""
    return tuple(re.findall(r"\w+", text.casefold(), flags=re.UNICODE))


def evaluate(
    dataset: dict[str, object], candidate: str, seed: int
) -> dict[str, object]:
    """Score every query against the same frozen corpus and relevance judgments."""
    if candidate not in {"bm25", "tfidf"}:
        raise FoundryValidationError("unknown retrieval candidate")
    documents = sorted(
        records(dataset.get("documents"), "documents"), key=lambda d: str(d.get("id"))
    )
    queries = sorted(
        records(dataset.get("queries"), "queries"), key=lambda q: str(q.get("id"))
    )
    if not 2 <= len(documents) <= 256 or not 1 <= len(queries) <= 128:
        raise FoundryValidationError("retrieval corpus or query count is out of bounds")
    ids = strings([row.get("id") for row in documents], "document IDs")
    strings([row.get("id") for row in queries], "query IDs")
    top_k = integer(dataset.get("top_k"), 1, len(documents), "top_k")
    counts: dict[str, Counter[str]] = {}
    for row in documents:
        if any(
            not isinstance(row.get(field), str) or not str(row[field]).strip()
            for field in ("title", "text")
        ):
            raise FoundryValidationError("documents require title and text")
        counts[str(row["id"])] = Counter(
            tokens(str(row["title"]) + " " + str(row["text"]))
        )
    frequency = Counter(term for terms in counts.values() for term in terms)
    average_length = sum(sum(terms.values()) for terms in counts.values()) / len(
        documents
    )
    n = len(documents)
    tfidf = {term: math.log((n + 1) / (df + 1)) + 1 for term, df in frequency.items()}
    output: list[dict[str, object]] = []
    totals = dict.fromkeys(("precision_at_k", "recall_at_k", "ndcg_at_k", "mrr"), 0.0)
    for query in queries:
        if not isinstance(query.get("text"), str) or not tokens(str(query["text"])):
            raise FoundryValidationError("queries must contain searchable text")
        judgments = mapping(query.get("relevance"), "relevance")
        if not judgments or set(judgments) - set(ids):
            raise FoundryValidationError("relevance must name known documents")
        grades = {
            key: integer(value, 0, 3, "relevance grade")
            for key, value in judgments.items()
        }
        relevant = {key for key, grade in grades.items() if grade > 0}
        if not relevant:
            raise FoundryValidationError(
                "query must have at least one relevant judgment"
            )
        query_counts = Counter(tokens(str(query["text"])))
        query_weights = {
            term: (1 + math.log(count)) * tfidf.get(term, math.log(n + 1) + 1)
            for term, count in query_counts.items()
        }
        query_norm = math.sqrt(sum(weight**2 for weight in query_weights.values()))
        ranked: list[dict[str, object]] = []
        for document in documents:
            doc_id = str(document["id"])
            terms = counts[doc_id]
            length = sum(terms.values())
            contributions: dict[str, float] = {}
            doc_norm = math.sqrt(
                sum(
                    ((1 + math.log(tf)) * tfidf[term]) ** 2
                    for term, tf in terms.items()
                )
            )
            for term in sorted(query_counts):
                tf = terms[term]
                if not tf:
                    continue
                if candidate == "bm25":
                    idf = math.log(
                        1 + (n - frequency[term] + 0.5) / (frequency[term] + 0.5)
                    )
                    contribution = (
                        idf
                        * tf
                        * 2.2
                        / (tf + 1.2 * (0.25 + 0.75 * length / average_length))
                    )
                else:
                    contribution = (
                        query_weights[term]
                        * (1 + math.log(tf))
                        * tfidf[term]
                        / (doc_norm * query_norm)
                    )
                contributions[term] = round(contribution, 12)
            ranked.append(
                {
                    "document_id": doc_id,
                    "score": round(sum(contributions.values()), 12),
                    "matched_terms": contributions,
                    "title": document["title"],
                    "excerpt": str(document["text"])[:240],
                    "source_locator": f"dataset:documents/{doc_id}",
                    "source_sha256": digest(canonical(document)),
                }
            )
        ranked.sort(key=lambda row: (-finite(row["score"]), str(row["document_id"])))
        selected = ranked[:top_k]
        selected_ids = [str(row["document_id"]) for row in selected]
        found = len(set(selected_ids) & relevant)
        dcg = sum(
            (2 ** grades.get(identity, 0) - 1) / math.log2(rank + 2)
            for rank, identity in enumerate(selected_ids)
        )
        ideal = sum(
            (2**grade - 1) / math.log2(rank + 2)
            for rank, grade in enumerate(sorted(grades.values(), reverse=True)[:top_k])
        )
        reciprocal = next(
            (
                1 / (index + 1)
                for index, row in enumerate(ranked)
                if row["document_id"] in relevant
            ),
            0.0,
        )
        scores = {
            "precision_at_k": found / top_k,
            "recall_at_k": found / len(relevant),
            "ndcg_at_k": dcg / ideal,
            "mrr": reciprocal,
        }
        for name, score in scores.items():
            totals[name] += score
        output.append(
            {
                "query_id": query["id"],
                "relevant_count": len(relevant),
                "retrieved_relevant": found,
                "top_k": top_k,
                "ranking": selected,
                "metrics": scores,
            }
        )
    return {
        "metrics": {
            **{name: round(total / len(queries), 10) for name, total in totals.items()},
            "queries": len(queries),
            "documents": len(documents),
        },
        "details": {
            "queries": output,
            "tokenizer": "unicode-word-casefold/v1",
            "tie_break": "document_id ascending",
            "seed_use": "no stochastic ranking; seeds repeat the same fixed corpus",
        },
        "limitations": [
            "Authored synthetic acquisition descriptions and judgments; no government corpus, embeddings, container validation or domain-expert quality claim."
        ],
    }
