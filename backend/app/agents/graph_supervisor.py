"""PRAHARI — LangGraph supervisor (TRD §5.5 supervisor pattern).

The agentic loop as an explicit StateGraph:

    sentinel -> oracle -> navigator -> custodian -> compose_brief -> END

Each node is one specialised agent; state carries the accumulating decision
context; stage events stream to the console from inside the nodes. The human
review (approve/dismiss) is the interrupt point, recorded via the API.
supervisor.run_loop() uses this graph when LangGraph is importable and falls
back to the deterministic sequential path otherwise (demo safety, NFR4).
"""
from __future__ import annotations

import asyncio
import time
from typing import Any, Awaitable, Callable, TypedDict

from langgraph.graph import END, StateGraph

from ..cognition.cdp import ENGINE
from ..models.schemas import (DecisionBrief, ProcurementRequest,
                              ScenarioRequest, SPRRequest)
from . import custodian, navigator, oracle

Emit = Callable[[dict[str, Any]], Awaitable[None]]


class LoopState(TypedDict, total=False):
    corridor_id: str
    cut_pct: float
    duration_days: int
    chokepoint: str
    t0: float
    trigger: dict
    scen_req: ScenarioRequest
    impact: Any
    plan: Any
    spr: Any
    brief: DecisionBrief


def build_graph(emit: Emit):
    """Compile the supervisor StateGraph with the emit callback closed over."""

    async def _stage(state: LoopState, stage: str, status: str, **extra: Any) -> None:
        await emit({"event": "stage", "stage": stage, "status": status,
                    "t": round(time.perf_counter() - state["t0"], 1), **extra})

    async def sentinel(state: LoopState) -> LoopState:
        st = ENGINE.state(state["corridor_id"])
        trigger = {
            "corridor": state["corridor_id"], "corridor_name": st.name, "cdp": st.cdp,
            "band": st.band, "lead_time_hours": st.lead_time_hours,
            "top_factors": [f.model_dump() for f in st.factors[:3]],
        }
        await emit({"event": "loop_started", "trigger": trigger, "t": 0.0})
        return {"trigger": trigger}

    async def oracle_node(state: LoopState) -> LoopState:
        await _stage(state, "oracle", "running")
        req = ScenarioRequest(kind="chokepoint_cut", chokepoint=state["chokepoint"],
                              cut_pct=state["cut_pct"],
                              duration_days=state["duration_days"])
        impact = await asyncio.to_thread(oracle.run_scenario, req)
        await _stage(state, "oracle", "done", impact=impact.model_dump())
        return {"impact": impact, "scen_req": req}

    async def navigator_node(state: LoopState) -> LoopState:
        await _stage(state, "navigator", "running")
        impact = state["impact"]
        worst = max(impact.refineries, key=lambda r: r.supply_loss_kbd, default=None)
        gap = max(worst.supply_loss_kbd if worst else 0.0, 100.0)
        plan = await asyncio.to_thread(navigator.optimize, ProcurementRequest(
            refinery_id=worst.id if worst else "jamnagar", gap_kbd=gap))
        await _stage(state, "navigator", "done", plan=plan.model_dump())
        return {"plan": plan}

    async def custodian_node(state: LoopState) -> LoopState:
        await _stage(state, "custodian", "running")
        schedule = await asyncio.to_thread(custodian.plan, SPRRequest(
            gap_kbd=state["impact"].supply_loss_kbd * 0.5,
            duration_days=state["duration_days"]))
        await _stage(state, "custodian", "done", spr=schedule.model_dump())
        return {"spr": schedule}

    async def compose(state: LoopState) -> LoopState:
        await _stage(state, "brief", "running")
        brief = DecisionBrief(trigger=state["trigger"], scenario=state["impact"],
                              procurement=state["plan"], spr=state["spr"])
        return {"brief": brief}

    g = StateGraph(LoopState)
    g.add_node("sentinel", sentinel)
    g.add_node("oracle", oracle_node)
    g.add_node("navigator", navigator_node)
    g.add_node("custodian", custodian_node)
    g.add_node("compose_brief", compose)
    g.set_entry_point("sentinel")
    g.add_edge("sentinel", "oracle")
    g.add_edge("oracle", "navigator")
    g.add_edge("navigator", "custodian")
    g.add_edge("custodian", "compose_brief")
    g.add_edge("compose_brief", END)
    return g.compile()


async def run(corridor_id: str, emit: Emit, cut_pct: float, duration_days: int,
              chokepoint: str) -> tuple[DecisionBrief, ScenarioRequest]:
    graph = build_graph(emit)
    final: LoopState = await graph.ainvoke({
        "corridor_id": corridor_id, "cut_pct": cut_pct,
        "duration_days": duration_days, "chokepoint": chokepoint,
        "t0": time.perf_counter(),
    })
    return final["brief"], final["scen_req"]
