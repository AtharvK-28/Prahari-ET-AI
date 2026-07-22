"""PRAHARI — Supervisor: agentic orchestration + decision brief (TRD §5.5).

Deterministic state machine:
  watch(CDP) -> [threshold] -> Oracle -> Navigator -> Custodian
             -> compose_brief -> human_review (approve | dismiss)

Emits stage events over the WebSocket so the console shows the loop running
live with a timer (PRD E3). The narrative layer (LLM when key present,
template otherwise) only narrates computed values — it invents nothing.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from typing import Any, Awaitable, Callable

from ..config import AUDIT_LOG, MODEL_VERSION, get_settings, model_config
from ..cognition.cdp import ENGINE
from ..models.schemas import (BriefStatus, DecisionBrief, ProcurementRequest,
                              ScenarioRequest, SPRRequest, now_ts)
from . import custodian, navigator, oracle

log = logging.getLogger("prahari.supervisor")

BRIEFS: dict[str, DecisionBrief] = {}
Emit = Callable[[dict[str, Any]], Awaitable[None]]

_CHOKEPOINT_OF_CORRIDOR: dict[str, str] = {}


def _chokepoint_for(corridor_id: str) -> str:
    if not _CHOKEPOINT_OF_CORRIDOR:
        from ..knowledge.graph import KG
        for c in KG.nodes_of("corridor"):
            if c["chokepoints"]:
                _CHOKEPOINT_OF_CORRIDOR[c["id"]] = c["chokepoints"][0]
    return _CHOKEPOINT_OF_CORRIDOR.get(corridor_id, "hormuz")


try:
    from . import graph_supervisor
    _HAS_LANGGRAPH = True
except ImportError:                    # demo safety: deterministic fallback (NFR4)
    _HAS_LANGGRAPH = False


async def run_loop(corridor_id: str, emit: Emit, cut_pct: float = 50.0,
                   duration_days: int = 30) -> DecisionBrief:
    """The full Sentinel->Oracle->Navigator->Custodian->brief chain, timed.

    Primary path: LangGraph StateGraph (agents/graph_supervisor.py).
    Fallback: the equivalent deterministic sequential chain below.
    """
    t0 = time.perf_counter()
    chokepoint = _chokepoint_for(corridor_id)

    if _HAS_LANGGRAPH:
        brief, scen_req = await graph_supervisor.run(
            corridor_id, emit, cut_pct, duration_days, chokepoint)
    else:
        brief, scen_req = await _run_sequential(
            corridor_id, emit, cut_pct, duration_days, chokepoint, t0)

    impact, plan, schedule, trigger = (brief.scenario, brief.procurement,
                                       brief.spr, brief.trigger)
    brief.narrative, brief.narrative_source = await _narrate(brief)
    brief.economics = _economics(brief)
    brief.elapsed_s = round(time.perf_counter() - t0, 1)
    brief.audit = {   # NFR7
        "model_version": MODEL_VERSION,
        "orchestrator": "langgraph" if _HAS_LANGGRAPH else "sequential",
        "inputs": trigger,
        "scenario_request": scen_req.model_dump(), "assumptions": impact.assumptions,
        "navigator_params": plan.params, "economics": brief.economics,
        "created_at": now_ts(),
    }
    BRIEFS[brief.brief_id] = brief
    _audit_write(brief)
    await emit({"event": "brief_ready", "t": brief.elapsed_s,
                "brief": brief.model_dump()})
    log.info("loop complete in %.1fs -> brief %s", brief.elapsed_s, brief.brief_id)
    return brief


async def _run_sequential(corridor_id: str, emit: Emit, cut_pct: float,
                          duration_days: int, chokepoint: str,
                          t0: float) -> tuple[DecisionBrief, ScenarioRequest]:
    """Deterministic fallback chain — behaviourally identical to the graph."""
    state = ENGINE.state(corridor_id)
    trigger = {
        "corridor": corridor_id, "corridor_name": state.name, "cdp": state.cdp,
        "band": state.band, "lead_time_hours": state.lead_time_hours,
        "top_factors": [f.model_dump() for f in state.factors[:3]],
    }
    await emit({"event": "loop_started", "trigger": trigger, "t": 0.0})

    scen_req = ScenarioRequest(kind="chokepoint_cut", chokepoint=chokepoint,
                               cut_pct=cut_pct, duration_days=duration_days)
    await emit({"event": "stage", "stage": "oracle", "status": "running",
                "t": round(time.perf_counter() - t0, 1)})
    impact = await asyncio.to_thread(oracle.run_scenario, scen_req)
    await emit({"event": "stage", "stage": "oracle", "status": "done",
                "t": round(time.perf_counter() - t0, 1), "impact": impact.model_dump()})

    worst = max(impact.refineries, key=lambda r: r.supply_loss_kbd, default=None)
    gap = max(worst.supply_loss_kbd if worst else 0.0, 100.0)
    await emit({"event": "stage", "stage": "navigator", "status": "running",
                "t": round(time.perf_counter() - t0, 1)})
    plan = await asyncio.to_thread(navigator.optimize, ProcurementRequest(
        refinery_id=worst.id if worst else "jamnagar", gap_kbd=gap))
    await emit({"event": "stage", "stage": "navigator", "status": "done",
                "t": round(time.perf_counter() - t0, 1), "plan": plan.model_dump()})

    await emit({"event": "stage", "stage": "custodian", "status": "running",
                "t": round(time.perf_counter() - t0, 1)})
    schedule = await asyncio.to_thread(custodian.plan, SPRRequest(
        gap_kbd=impact.supply_loss_kbd * 0.5, duration_days=duration_days))
    await emit({"event": "stage", "stage": "custodian", "status": "done",
                "t": round(time.perf_counter() - t0, 1), "spr": schedule.model_dump()})

    await emit({"event": "stage", "stage": "brief", "status": "running",
                "t": round(time.perf_counter() - t0, 1)})
    brief = DecisionBrief(trigger=trigger, scenario=impact,
                          procurement=plan, spr=schedule)
    return brief, scen_req


def _economics(brief: DecisionBrief) -> dict[str, Any]:
    """₹ cost-of-inaction vs plan premium, derived from figures already computed.

    - inaction: the Oracle's unmitigated import-bill shock, expressed per day
    - premium:  extra $/bbl actually paid on the Navigator's rerouted barrels
    Both converted at the live FRED INR rate (tagged seed_fallback without key).
    """
    from ..ingestion.fred import FX
    from ..knowledge.graph import KG
    s = brief.scenario
    dur = float(s.event.get("duration_days") or 30)
    inaction_mn_day = s.import_bill_shock_usd_bn * 1000.0 / dur
    premium_mn_day = sum(a.landed_premium_usd * a.allocated_kbd * 1000.0
                         for a in brief.procurement.ranked
                         if a.allocated_kbd > 0) / 1e6
    inr = float(FX["inr_per_usd"])
    return {
        "inr_per_usd": inr, "fx_source": FX["source"],
        "consumption_kbd": float(KG.seed["national"]["crude_consumption_kbd"]),
        "cost_of_inaction_usd_mn_day": round(inaction_mn_day, 1),
        "cost_of_inaction_inr_crore_day": round(inaction_mn_day * inr / 10.0, 0),
        "plan_premium_usd_mn_day": round(premium_mn_day, 1),
        "plan_premium_inr_crore_day": round(premium_mn_day * inr / 10.0, 1),
        "note": ("unmitigated import-bill shock per day (Oracle) vs premium paid "
                 "on rerouted barrels (Navigator); ₹ at "
                 + ("live FRED DEXINUS" if FX["source"] == "fred_dexinus"
                    else "tagged seed rate")),
    }


# ---------------------------------------------------------------- narrative
_TEMPLATE = """PRAHARI DECISION BRIEF — {corridor_name}

SITUATION: Corridor disruption probability is {cdp:.0%} ({band}). Top drivers: {drivers}.
Estimated warning window: {lead}.

IMPACT ({chokepoint} {cut:.0f}% cut, {days}d): {at_risk:.1f}% of imports at risk
({loss:.0f} kbd). Days of cover falls {cover_base:.1f} → {cover:.1f}
(P10–P90: {cov_lo:.1f}–{cov_hi:.1f}). Brent {brent_delta:+.1f}% → ${brent_proj:.2f};
basket premium ${premium:.2f}. Import-bill shock ≈ ${bill:.1f}bn ({gdp:.2f}% of GDP).

RECOMMENDED REROUTE ({refinery}, gap {gap:.0f} kbd): {n_alts} feasible alternatives,
{filled:.0f} kbd covered. Best: {best}.

SPR ACTION: {spr_rationale}

Every figure above is computed by the Oracle/Navigator/Custodian agents from the
knowledge graph and live signals; assumptions are editable in the console."""


async def _narrate(brief: DecisionBrief) -> tuple[str, str]:
    """LLM narration of computed values when a key exists; template otherwise."""
    text = _template_narrative(brief)
    settings = get_settings()
    if not settings.llm_available:
        return text, "template"
    try:
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_key)
        payload = {
            "trigger": brief.trigger,
            "impact": brief.scenario.model_dump(exclude={"refineries"}),
            "worst_refineries": [r.model_dump() for r in brief.scenario.refineries[:3]],
            "top_alternatives": [a.model_dump() for a in brief.procurement.ranked[:4]],
            "spr": {"rationale": brief.spr.rationale if brief.spr else "",
                    "total_release_mbbl": brief.spr.total_release_mbbl if brief.spr else 0},
        }
        msg = await asyncio.wait_for(client.messages.create(
            model="claude-sonnet-5",
            max_tokens=700,
            system=("You are PRAHARI's brief composer for India's energy security desk. "
                    "Write a crisp one-page decision brief for a refinery procurement head. "
                    "Use ONLY the numbers in the JSON — never invent, extrapolate, or round "
                    "beyond one decimal. Structure: SITUATION / IMPACT / RECOMMENDED REROUTE / "
                    "SPR ACTION / RATIONALE. Plain text, no markdown headers beyond caps."),
            messages=[{"role": "user", "content": json.dumps(payload, default=str)}],
        ), timeout=25)
        return msg.content[0].text, "llm"
    except Exception as e:
        log.warning("LLM narration failed (%s) — using template", e)
        return text, "template"


def _template_narrative(brief: DecisionBrief) -> str:
    s = brief.scenario
    t = brief.trigger
    p = brief.procurement
    best = next((a for a in p.ranked if a.allocated_kbd > 0), None)
    drivers = ", ".join(f["factor"] for f in t.get("top_factors", [])[:3]) or "baseline"
    lead = t.get("lead_time_hours")
    cov = s.uncertainty.get("days_of_cover", (s.days_of_cover, s.days_of_cover))
    return _TEMPLATE.format(
        corridor_name=t.get("corridor_name", ""), cdp=t.get("cdp", 0), band=t.get("band", ""),
        drivers=drivers,
        lead=f"{lead[0]:.0f}–{lead[1]:.0f}h" if lead else "n/a",
        chokepoint=s.event.get("chokepoint", ""), cut=s.event.get("cut_pct", 0),
        days=s.event.get("duration_days", 0), at_risk=s.imports_at_risk_pct,
        loss=s.supply_loss_kbd, cover_base=s.days_of_cover_baseline, cover=s.days_of_cover,
        cov_lo=cov[0], cov_hi=cov[1], brent_delta=s.brent_delta_pct,
        brent_proj=s.brent_projected_usd, premium=s.india_basket_premium_usd,
        bill=s.import_bill_shock_usd_bn, gdp=s.import_bill_shock_pct_gdp,
        refinery=p.refinery_id, gap=p.gap_kbd,
        n_alts=sum(1 for a in p.ranked if a.feasible), filled=p.filled_kbd,
        best=(f"{best.allocated_kbd:.0f} kbd {best.grade} from {best.supplier} via "
              f"{best.corridor_name} (${best.landed_cost_usd:.2f}/bbl, {best.eta_days:.0f}d)"
              if best else "none"),
        spr_rationale=brief.spr.rationale if brief.spr else "not requested")


# Tamper-evident ledger: every audit line carries sha256(prev_hash + payload),
# so any edit or deletion breaks the chain from that point on (verify: /ledger).
_last_hash = "genesis"


def _chain_write(entry: dict[str, Any]) -> str:
    global _last_hash
    payload = json.dumps(entry, default=str, sort_keys=True)
    h = hashlib.sha256((_last_hash + payload).encode()).hexdigest()
    entry = {**entry, "prev_hash": _last_hash, "hash": h}
    _last_hash = h
    AUDIT_LOG.parent.mkdir(parents=True, exist_ok=True)
    with open(AUDIT_LOG, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, default=str) + "\n")
    return h


def verify_chain() -> dict[str, Any]:
    """Re-walk the audit file recomputing every hash. O(n), demo-scale."""
    checked = broken = 0
    try:
        with open(AUDIT_LOG, encoding="utf-8") as f:
            lines = [json.loads(ln) for ln in f if ln.strip()]
    except FileNotFoundError:
        return {"entries": 0, "checked": 0, "intact": True}
    prev = None
    for e in lines:
        if "hash" not in e:            # pre-ledger lines: outside the chain
            continue
        body = {k: v for k, v in e.items() if k not in ("hash", "prev_hash")}
        payload = json.dumps(body, default=str, sort_keys=True)
        expect = hashlib.sha256((e["prev_hash"] + payload).encode()).hexdigest()
        if expect != e["hash"]:
            broken += 1
        elif prev is not None and e["prev_hash"] not in (prev, "genesis"):
            broken += 1                # "genesis" mid-file = new session segment
        prev = e["hash"]
        checked += 1
    return {"entries": len(lines), "checked": checked, "intact": broken == 0}


def _audit_write(brief: DecisionBrief) -> None:
    h = _chain_write({"kind": "brief", "brief_id": brief.brief_id, **brief.audit})
    brief.audit["hash"] = h


def decide(brief_id: str, approve: bool) -> DecisionBrief:
    brief = BRIEFS[brief_id]
    brief.status = BriefStatus.approved if approve else BriefStatus.dismissed
    brief.decided_at = now_ts()
    h = _chain_write({"kind": "decision", "brief_id": brief_id,
                      "decision": brief.status.value, "decided_at": brief.decided_at})
    brief.audit["decision_hash"] = h
    return brief
