"""PRAHARI — Navigator: adaptive procurement optimiser (TRD §5.3).

Transparent multi-criteria allocation (TRD-sanctioned fallback for OR-Tools):
filter hard constraints -> score = landed_cost + λ·risk·days -> greedy allocate.
Every exclusion carries its reason (PRD C2); λ is user-tunable.
"""
from __future__ import annotations

import time

from ..cognition.cdp import ENGINE
from ..config import model_config, seed_data
from ..ingestion.brent import PRICE
from ..knowledge.graph import KG
from ..models.schemas import Alternative, ProcurementPlan, ProcurementRequest


def optimize(req: ProcurementRequest) -> ProcurementPlan:
    t0 = time.perf_counter()
    cfg = model_config()["navigator"]
    lam = req.risk_aversion_lambda if req.risk_aversion_lambda is not None \
        else float(cfg["risk_aversion_lambda"])
    ceiling = req.risk_ceiling if req.risk_ceiling is not None \
        else float(cfg["risk_ceiling"])
    tolerance = float(cfg["yield_penalty_tolerance"])

    refinery = KG.node(req.refinery_id)
    port_capacity = {p["id"]: p["capacity_kbd"] * (1 - p["congestion"])
                     for p in KG.nodes_of("port")}
    brent = PRICE.brent_usd

    candidates: list[Alternative] = []
    excluded: list[Alternative] = []
    availability: dict[str, float] = {}
    for alt in seed_data()["alternatives"]:
        corridor = KG.node(alt["corridor"])
        category = KG.grade_category(alt["grade"])
        penalty = KG.yield_penalty(req.refinery_id, category)
        risk = ENGINE.state(alt["corridor"]).cdp
        landed = brent + float(alt["landed_premium_usd"])
        supplier = KG.node(alt["supplier"])
        # reliability: EIA-derived flow-stability proxy where available, seed otherwise
        reliability = float(supplier.get("reliability", 0.8))
        rel_weight = float(cfg.get("reliability_weight_usd", 2.0))
        score = landed + lam * risk * float(alt["eta_days"]) + rel_weight * (1 - reliability)

        a = Alternative(
            id=alt["id"], supplier=supplier["name"], grade=KG.node(alt["grade"])["name"],
            grade_category=category, corridor=alt["corridor"], corridor_name=corridor["name"],
            allocated_kbd=0.0, landed_cost_usd=round(landed, 2),
            landed_premium_usd=float(alt["landed_premium_usd"]),
            eta_days=float(alt["eta_days"]), corridor_risk=round(risk, 3),
            grade_fit=penalty <= tolerance, yield_penalty=penalty,
            supplier_reliability=round(reliability, 2),
            reliability_source=supplier.get("reliability_source", "seed"),
            score=round(score, 2), feasible=True)

        # hard constraints (FR8) — excluded WITH the reason
        if penalty > tolerance:
            a.feasible = False
            a.exclusion_reason = (f"grade incompatible: {category} yield penalty "
                                  f"{penalty:.0%} > {tolerance:.0%} tolerance at {refinery['name']}")
        elif risk > ceiling:
            a.feasible = False
            a.exclusion_reason = f"corridor risk {risk:.2f} above ceiling {ceiling:.2f}"
        elif float(alt["tanker_availability_kbd"]) <= 0:
            a.feasible = False
            a.exclusion_reason = "no tanker availability in window"
        elif supplier.get("sanction_exposure") == "high" and _sanctions_hot():
            a.feasible = False
            a.exclusion_reason = f"supplier sanction exposure high ({supplier['name']}) with fresh SDN activity"

        if a.feasible:
            availability[a.id] = float(alt["tanker_availability_kbd"])
            candidates.append(a)
        else:
            excluded.append(a)

    # greedy allocation by score (cheapest risk-adjusted first)
    candidates.sort(key=lambda x: x.score)
    remaining = req.gap_kbd
    ranked: list[Alternative] = []
    for a in candidates:
        if remaining <= 0:
            a.allocated_kbd = 0.0
            ranked.append(a)
            continue
        # respect destination port headroom + single-source diversification cap
        headroom = port_capacity.get(refinery["port"], 1e9)
        source_cap = req.gap_kbd * float(cfg.get("max_single_source_share", 0.5))
        take = min(availability[a.id], remaining, headroom, source_cap)
        a.allocated_kbd = round(take, 0)
        remaining -= take
        ranked.append(a)

    filled = req.gap_kbd - max(remaining, 0.0)
    return ProcurementPlan(
        refinery_id=req.refinery_id, gap_kbd=req.gap_kbd, filled_kbd=round(filled, 0),
        ranked=ranked, excluded=excluded,
        params={"lambda": lam, "risk_ceiling": ceiling, "yield_tolerance": tolerance,
                "brent_basis_usd": brent},
        computed_in_ms=round((time.perf_counter() - t0) * 1000, 1))


def _sanctions_hot() -> bool:
    """True when recent SDN signals are in the bus history."""
    from ..ingestion.bus import BUS
    from ..models.schemas import SignalType, now_ts
    return any(s.type == SignalType.sanction_update and now_ts() - s.ts < 86400
               for s in BUS.history)
