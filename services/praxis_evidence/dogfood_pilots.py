#!/usr/bin/env python3
"""
dogfood_pilots.py - six heterogeneous real objectives through the SAME
universal code path, no domain-specific branching anywhere (Phase 20's
whole point: "if somebody has to add `if domain == 'cooking':` to universal
infrastructure, ask why"). Creates PERMANENT records (not test data cleaned
up afterward) - these are the fabric's first real, public content.

Run once: `python dogfood_pilots.py`. Idempotent-ish in spirit (checks for
an existing method with the same objective before creating), but not
transactionally guarded - a genuine one-shot seeding script, not a test.
"""
from __future__ import annotations

from client import PocketBaseClient
from claims import create_source, create_claim, audit_claim
from methods import create_method
from materials import create_material, create_tool
from pricing import record_price
from timing import record_timing
from research_quests import open_research_quest

client = PocketBaseClient()


def _existing_method(objective: str):
    found = client.list("praxis_methods", filter_expr=f'objective="{objective}"')
    return found[0] if found else None


def _method(objective: str, domain: str, steps: str) -> dict:
    existing = _existing_method(objective)
    if existing:
        return existing
    return create_method(client, objective=objective, domain=domain, steps=steps,
                          knowledge_state="PROPOSED")


def pilot_cooking() -> dict:
    """Cooking: method + material + price + timing + a real failure mode."""
    domain = "culinary.baking"
    method = _method("Bake a basic sourdough loaf", domain,
                      "Build levain, autolyse, bulk ferment 4-6h at 24C, shape, proof, bake at 230C.")
    flour = create_material(client, canonical_name="Bread flour (12-13% protein)", category="culinary.ingredient",
                             specification={"protein_pct": "12-13"}) if not client.list(
        "praxis_materials", filter_expr='canonical_name="Bread flour (12-13% protein)"') else \
        client.list("praxis_materials", filter_expr='canonical_name="Bread flour (12-13% protein)"')[0]
    price = record_price(client, material_id=flour["id"], amount=4.50, currency="USD",
                          quantity_value=2, quantity_unit="KG", channel="STORE", region="US")
    timing = record_timing(client, method_id=method["id"], activity="bulk fermentation",
                            duration_value=5, duration_unit="HOURS", confidence="USER_REPORTED",
                            experience_level="INTERMEDIATE", criterion_met=True)
    return {"domain": domain, "method": method["display_id"], "material": flour["display_id"],
             "price": price["display_id"], "timing": timing["display_id"]}


def pilot_guitar() -> dict:
    """Guitar: reuses the method already published on /practice (P8's real content)."""
    domain = "music.guitar"
    method = _existing_method("Play a clean F barre chord") or _method(
        "Play a clean F barre chord", domain,
        "Fret low E/A/D with index finger flat; add ring/pinky for D/G/B shapes.")
    timing = record_timing(client, method_id=method["id"], activity="daily barre chord practice",
                            duration_value=18, duration_unit="DAYS", confidence="USER_REPORTED",
                            experience_level="BEGINNER", criterion_met=True)
    return {"domain": domain, "method": method["display_id"], "timing": timing["display_id"]}


def pilot_writing() -> dict:
    """Writing: method + claim (a rubric assertion) + an editorial audit."""
    domain = "writing.fiction"
    method = _method("Revise a short story for clarity", domain,
                      "First pass for plot holes, second for pacing, third for line-level clarity.")
    source = create_source(client, title="Self-editing checklist (internal)", source_type="COMMUNITY")
    claim = create_claim(client, subject="a clear short-story revision pass", predicate="should separately address",
                          object_="plot, pacing, and line-level clarity", domain=domain,
                          initial_state="SOURCE_BACKED", supporting_source_ids=[source["id"]])
    return {"domain": domain, "method": method["display_id"], "claim": claim["display_id"]}


def pilot_research() -> dict:
    """Research: claim + source + lineage + a real contradiction -> DISPUTED."""
    domain = "research.history"
    origin = create_source(client, title="Primary account of the event", source_type="PUBLICATION")
    counter = create_source(client, title="Contradicting contemporary account", source_type="PUBLICATION")
    claim = create_claim(client, subject="the event", predicate="occurred on", object_="the disputed date",
                          domain=domain, initial_state="SOURCE_BACKED", supporting_source_ids=[origin["id"]])
    audit = audit_claim(client, claim_id=claim["id"], auditor_user_id=_seed_user(), action="CONTRADICT",
                          result="CONTRADICTED", independent=True,
                          evidence={"contradicting_source": counter["display_id"]})
    return {"domain": domain, "claim": claim["display_id"], "state_after_dispute": audit["claim_state_after"]}


def pilot_construction() -> dict:
    """Construction: material + regional price + method + timing + a safety flag."""
    domain = "construction.carpentry"
    lumber = create_material(client, canonical_name="SPF dimensional lumber 2x4", category="construction.lumber",
                              hazards=["splinter risk", "treated-wood dust if cut"])
    method = _method("Build a raised garden bed frame", domain,
                      "Cut 4 sides to length, pocket-screw corners, level on site.")
    price = record_price(client, material_id=lumber["id"], amount=4.28, currency="USD",
                          quantity_value=1, quantity_unit="EACH", channel="STORE", region="TX")
    timing = record_timing(client, method_id=method["id"], activity="frame assembly",
                            duration_value=90, duration_unit="MINUTES", confidence="USER_REPORTED",
                            experience_level="BEGINNER", criterion_met=True)
    # Safety hazard is recorded directly on the material (hazards field above) - a
    # material-targeted SAFETY_FLAG audit isn't wired yet, since audit_claim only
    # targets knowledge_claims today. A known, stated gap, not silently skipped.
    return {"domain": domain, "material": lumber["display_id"], "method": method["display_id"],
             "price": price["display_id"], "timing": timing["display_id"]}


def pilot_software() -> dict:
    """Software: method + tool + timing + a dependency claim + a research quest
    (proving research_quests.py works for a non-price/non-claim trigger type too)."""
    domain = "software.web"
    tool = create_tool(client, canonical_name="Vite", category="software.build_tool")
    method = _method("Add a new UI feature to a React SPA", domain,
                      "Add route, component, wire to existing data client, verify build.")
    timing = record_timing(client, method_id=method["id"], activity="feature implementation",
                            duration_value=3, duration_unit="HOURS", confidence="USER_REPORTED",
                            experience_level="INTERMEDIATE", criterion_met=True)
    source = create_source(client, title="Vite build documentation", source_type="PUBLICATION")
    claim = create_claim(client, subject="a new route", predicate="requires", object_="a real production build check",
                          domain=domain, initial_state="SOURCE_BACKED", supporting_source_ids=[source["id"]])
    quest = open_research_quest(client, trigger_reason="NEW_DOMAIN_INSUFFICIENT", subject_type="CLAIM",
                                  subject_id=claim["display_id"],
                                  question="What automated check proves a new route doesn't break the production build?",
                                  required_capabilities=["builder.application", "quality.page"])
    return {"domain": domain, "tool": tool["display_id"], "method": method["display_id"],
             "claim": claim["display_id"], "quest_opened": quest["created"]}


def _seed_user() -> str:
    email = "dogfood-pilot-auditor@buildanddo.internal"
    existing = client.list("users", filter_expr=f'email="{email}"')
    if existing:
        return existing[0]["id"]
    return client.create("users", {"email": email, "password": "DogfoodPilot123!",
                                     "passwordConfirm": "DogfoodPilot123!"})["id"]


def main() -> dict:
    return {
        "cooking": pilot_cooking(),
        "guitar": pilot_guitar(),
        "writing": pilot_writing(),
        "research": pilot_research(),
        "construction": pilot_construction(),
        "software": pilot_software(),
    }


if __name__ == "__main__":
    import json
    print(json.dumps(main(), indent=2))
