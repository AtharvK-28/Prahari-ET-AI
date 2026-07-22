"""PRAHARI — Oracle: scenario propagation engine (TRD §5.2).

Deterministic graph propagation + parametric economic layer + Monte-Carlo
uncertainty band. All assumptions editable (PRD B2); no black box.
"""
from __future__ import annotations

import random
import time

from ..config import MODEL_VERSION, model_config, seed_data
from ..ingestion.brent import PRICE
from ..knowledge.graph import KG
from ..models.schemas import RefineryImpact, ScenarioImpact, ScenarioRequest


def _spr_total_mbbl() -> float:
    s = seed_data()
    factor = float(s["spr"]["mmt_to_mbbl"])
    return sum(site["capacity_mmt"] * site["fill_pct"] / 100.0 * factor
               for site in s["spr_sites"])


def _core(req: ScenarioRequest, elasticity: float, stock_days: float,
          substitutability: float) -> dict:
    """One deterministic propagation pass. Returns raw metric dict."""
    s = seed_data()
    n = s["national"]
    consumption = float(n["crude_consumption_kbd"])
    import_kbd = float(n["import_volume_kbd"])

    # 1 — supply loss via graph traversal
    if req.kind == "supply_cut":
        supply_loss = float(req.volume_kbd or 1500.0) * 0.20   # India's absorbed share (to-verify)
        per_supplier: dict[str, float] = {}
        affected_corridors: set[str] = set()
    else:
        supply_loss, per_supplier = KG.supply_at_risk_kbd(req.chokepoint or "hormuz", req.cut_pct)
        affected_corridors = {c["id"] for c in KG.corridors_through(req.chokepoint or "hormuz")}

    imports_at_risk_pct = supply_loss / import_kbd * 100.0

    # 2 — refinery impact: allocate shortfall by corridor-fed share, moderated by
    #     grade substitutability and commercial inventory buffer
    refineries: list[RefineryImpact] = []
    for r in KG.nodes_of("refinery"):
        fed_share = float(r.get("hormuz_fed_share", 0.3)) if "hormuz" in (req.chokepoint or "") \
            else _corridor_fed_share(r["id"], affected_corridors)
        raw_loss = r["capacity_kbd"] * fed_share * (req.cut_pct / 100.0 if req.kind != "supply_cut" else 0.1)
        mitigated = raw_loss * (1 - substitutability * 0.6)     # spot substitution softens
        runrate_pct = -mitigated / r["capacity_kbd"] * 100.0
        refineries.append(RefineryImpact(
            id=r["id"], name=r["name"], capacity_kbd=r["capacity_kbd"],
            runrate_impact_pct=round(runrate_pct, 1), supply_loss_kbd=round(mitigated, 0)))
    refineries.sort(key=lambda x: x.runrate_impact_pct)

    # 3 — days of cover
    spr_mbbl = _spr_total_mbbl()
    commercial_mbbl = stock_days * consumption / 1000.0
    baseline_cover = (spr_mbbl * 1000.0 + commercial_mbbl * 1000.0) / consumption
    net_draw_kbd = max(supply_loss * (1 - substitutability * 0.5), 0.0)
    horizon = min(req.duration_days, 60)
    remaining = (spr_mbbl + commercial_mbbl) * 1000.0 - net_draw_kbd * horizon
    days_of_cover = max(remaining, 0.0) / consumption

    # 4 — price impact
    global_supply = float(n["global_supply_kbd"])
    global_loss_pct = (supply_loss / 0.35) / global_supply * 100.0   # India ≈35% of chokepoint flow (to-verify)
    brent_delta_pct = min(global_loss_pct * elasticity * 100.0, 45.0)
    brent_now = PRICE.brent_usd
    brent_projected = brent_now * (1 + brent_delta_pct / 100.0)
    scramble = float(model_config()["oracle"]["spot_scramble_premium_usd_per_10pct_gap"])
    basket_premium = float(n["india_basket_offset_usd"]) + scramble * (imports_at_risk_pct / 10.0)

    # 5 — power stress: diesel-exposed load vs supply squeeze
    power_stress = min(1.0, imports_at_risk_pct / 100.0 * (1 + float(n["power_diesel_share"])))

    # 6 — import bill / GDP proxy
    extra_usd_per_bbl = brent_now * brent_delta_pct / 100.0 + max(basket_premium, 0.0)
    bill_shock_bn = extra_usd_per_bbl * import_kbd * 1000.0 * req.duration_days / 1e9
    gdp_pct = bill_shock_bn / float(n["gdp_usd_bn"]) * 100.0

    return {
        "supply_loss": supply_loss, "imports_at_risk_pct": imports_at_risk_pct,
        "refineries": refineries, "days_of_cover": days_of_cover,
        "baseline_cover": baseline_cover, "brent_delta_pct": brent_delta_pct,
        "brent_projected": brent_projected, "basket_premium": basket_premium,
        "power_stress": power_stress, "bill_shock_bn": bill_shock_bn, "gdp_pct": gdp_pct,
    }


def _corridor_fed_share(refinery_id: str, affected: set[str]) -> float:
    if not affected:
        return 0.0
    share = 0.0
    for cid in affected:
        for r in KG.refineries_fed_by(cid):
            if r["id"] == refinery_id:
                share += KG.corridor_supply_kbd(cid) / max(
                    sum(x["capacity_kbd"] for x in KG.refineries_fed_by(cid)), 1.0)
    return min(share, 0.9)


def run_scenario(req: ScenarioRequest) -> ScenarioImpact:
    t0 = time.perf_counter()
    cfg = model_config()["oracle"]
    n = seed_data()["national"]

    elasticity = req.supply_elasticity if req.supply_elasticity is not None \
        else float(n["supply_elasticity"])
    stock_days = req.commercial_stock_days if req.commercial_stock_days is not None \
        else float(n["commercial_stock_days"])
    substitutability = req.substitutability if req.substitutability is not None else 0.65

    point = _core(req, elasticity, stock_days, substitutability)

    # Monte-Carlo band over uncertain params (PRD B2)
    rng = random.Random(42)
    u = cfg["uncertain_params"]
    covers, brents = [], []
    for _ in range(int(cfg["monte_carlo_samples"])):
        e = rng.uniform(*u["supply_elasticity"])
        sd = rng.uniform(*u["commercial_stock_days"])
        sub = rng.uniform(*u["substitutability"])
        sample = _core(req, e, sd, sub)
        covers.append(sample["days_of_cover"])
        brents.append(sample["brent_delta_pct"])
    covers.sort(); brents.sort()
    p10, p90 = int(len(covers) * 0.1), int(len(covers) * 0.9)

    event = {"kind": req.kind, "chokepoint": req.chokepoint, "cut_pct": req.cut_pct,
             "duration_days": req.duration_days, "volume_kbd": req.volume_kbd}
    return ScenarioImpact(
        event=event,
        imports_at_risk_pct=round(point["imports_at_risk_pct"], 1),
        supply_loss_kbd=round(point["supply_loss"], 0),
        days_of_cover=round(point["days_of_cover"], 1),
        days_of_cover_baseline=round(point["baseline_cover"], 1),
        brent_delta_pct=round(point["brent_delta_pct"], 1),
        brent_projected_usd=round(point["brent_projected"], 2),
        india_basket_premium_usd=round(point["basket_premium"], 2),
        refineries=point["refineries"],
        power_stress_index=round(point["power_stress"], 2),
        import_bill_shock_usd_bn=round(point["bill_shock_bn"], 2),
        import_bill_shock_pct_gdp=round(point["gdp_pct"], 3),
        assumptions={"supply_elasticity": elasticity, "commercial_stock_days": stock_days,
                     "substitutability": substitutability, "model_version_note": 0.1},
        uncertainty={"days_of_cover": (round(covers[p10], 1), round(covers[p90], 1)),
                     "brent_delta_pct": (round(brents[p10], 1), round(brents[p90], 1))},
        computed_in_ms=round((time.perf_counter() - t0) * 1000, 1),
    )
