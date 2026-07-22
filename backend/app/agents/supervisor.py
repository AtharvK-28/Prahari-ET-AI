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


async def run_loop(corridor_id: str, emit: Emit, cut_pct: float = 50.0,
                   duration_days: int = 30) -> DecisionBrief:
    """The full Sentinel->Oracle->Navigator->Custodian->brief chain, timed."""
    t0 = time.perf_counter()
    state = ENGINE.state(corridor_id)
    trigger = {
        "corridor": corridor_id, "corridor_name": state.name, "cdp": state.cdp,
        "band": state.band, "lead_time_hours": state.lead_time_hours,
        "top_factors": [f.model_dump() for f in state.factors[:3]],
    }
    await emit({"event": "loop_started", "trigger": trigger, "t": 0.0})

    # ---- Oracle
    chokepoint = _chokepoint_for(corridor_id)
    scen_req = ScenarioRequest(kind="chokepoint_cut", chokepoint=chokepoint,
                               cut_pct=cut_pct, duration_days=duration_days)
    await emit({"event": "stage", "stage": "oracle", "status": "running",
                "t": round(time.perf_counter() - t0, 1)})
    impact = await asyncio.to_thread(oracle.run_scenario, scen_req)
    await emit({"event": "stage", "stage": "oracle", "status": "done",
                "t": round(time.perf_counter() - t0, 1),
                "impact": impact.model_dump()})

    # ---- Navigator: target the refinery with the largest absolute supply loss
    worst = max(impact.refineries, key=lambda r: r.supply_loss_kbd, default=None)
    gap = max(worst.supply_loss_kbd if worst else 0.0, 100.0)
    proc_req = ProcurementRequest(refinery_id=worst.id if worst else "jamnagar", gap_kbd=gap)
    await emit({"event": "stage", "stage": "navigator", "status": "running",
                "t": round(time.perf_counter() - t0, 1)})
    plan = await asyncio.to_thread(navigator.optimize, proc_req)
    await emit({"event": "stage", "stage": "navigator", "status": "done",
                "t": round(time.perf_counter() - t0, 1), "plan": plan.model_dump()})

    # ---- Custodian: bridge the national supply loss until reroutes land
    spr_req = SPRRequest(gap_kbd=impact.supply_loss_kbd * 0.5, duration_days=duration_days)
    await emit({"event": "stage", "stage": "custodian", "status": "running",
                "t": round(time.perf_counter() - t0, 1)})
    schedule = await asyncio.to_thread(custodian.plan, spr_req)
    await emit({"event": "stage", "stage": "custodian", "status": "done",
                "t": round(time.perf_counter() - t0, 1),
                "spr": schedule.model_dump()})

    # ---- Compose brief
    await emit({"event": "stage", "stage": "brief", "status": "running",
                "t": round(time.perf_counter() - t0, 1)})
    brief = DecisionBrief(trigger=trigger, scenario=impact, procurement=plan, spr=schedule)
    brief.narrative, brief.narrative_source = await _narrate(brief)
    brief.elapsed_s = round(time.perf_counter() - t0, 1)
    brief.audit = {   # NFR7
        "model_version": MODEL_VERSION, "inputs": trigger,
        "scenario_request": scen_req.model_dump(), "assumptions": impact.assumptions,
        "navigator_params": plan.params, "created_at": now_ts(),
    }
    BRIEFS[brief.brief_id] = brief
    _audit_write(brief)
    await emit({"event": "brief_ready", "t": brief.elapsed_s,
                "brief": brief.model_dump()})
    log.info("loop complete in %.1fs -> brief %s", brief.elapsed_s, brief.brief_id)
    return brief


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


def _audit_write(brief: DecisionBrief) -> None:
    AUDIT_LOG.parent.mkdir(parents=True, exist_ok=True)
    with open(AUDIT_LOG, "a", encoding="utf-8") as f:
        f.write(json.dumps({"brief_id": brief.brief_id, **brief.audit}, default=str) + "\n")


def decide(brief_id: str, approve: bool) -> DecisionBrief:
    brief = BRIEFS[brief_id]
    brief.status = BriefStatus.approved if approve else BriefStatus.dismissed
    with open(AUDIT_LOG, "a", encoding="utf-8") as f:
        f.write(json.dumps({"brief_id": brief_id, "decision": brief.status.value,
                            "decided_at": now_ts()}) + "\n")
    return brief
