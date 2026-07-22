"""PRAHARI — REST API surface (TRD §6)."""
from __future__ import annotations

import asyncio
import time

from fastapi import APIRouter, HTTPException

from ..agents import custodian, navigator, oracle, supervisor
from ..cognition.cdp import ENGINE
from ..config import get_settings, model_config, seed_data
from ..ingestion import replay
from ..ingestion.ais import VESSELS
from ..ingestion.brent import PRICE, apply_demo_spike
from ..ingestion.bus import BUS
from ..knowledge.graph import KG
from ..models.schemas import (ProcurementRequest, ScenarioRequest, Signal,
                              SignalMode, SignalType, SPRRequest)
from .ws import MANAGER

router = APIRouter()

_loop_lock = asyncio.Lock()     # one supervisor loop at a time


def _fred_status() -> str:
    from ..ingestion import fred
    return f"loaded ({fred.CALIBRATION.get('episodes')} shocks)" if fred.CALIBRATION else "off"


def _marine_status() -> str:
    from ..ingestion.marine import WEATHER
    return f"live ({len(WEATHER)} corridors)" if WEATHER else "warming up"


# ------------------------------------------------------------------ sensing
@router.get("/status")
def status() -> dict:
    s = get_settings()
    return {
        "model_version": "prahari-mvp-0.1",
        "brent_usd": PRICE.brent_usd,
        "brent_source": PRICE.source,
        "feeds": {
            "gdelt": "live" if s.gdelt_enabled else "off",
            "ais": "live" if s.ais_live else "off (no key)",
            "eia": "live" if s.eia_live else "seed baseline (no key)",
            "ofac": "live",
            "fred": _fred_status(),
            "marine": _marine_status(),
            "llm": "anthropic" if s.llm_available else "template narrative (no key)",
        },
        "alert_threshold": ENGINE.threshold,
        "signals_seen": len(BUS.history),
    }


@router.get("/corridors")
def corridors() -> dict:
    return {"corridors": [st.model_dump() for st in ENGINE.all_states()]}


@router.get("/corridors/{corridor_id}/explain")
def explain(corridor_id: str) -> dict:
    if corridor_id not in ENGINE.corridors:
        raise HTTPException(404, f"unknown corridor {corridor_id}")
    st = ENGINE.state(corridor_id)
    return {"state": st.model_dump(),
            "weights": ENGINE.w, "bias": ENGINE.bias, "scale": ENGINE.scale,
            "note": "CDP = sigmoid(scale·(Σ wᵢ·factorᵢ + 0.55·baseline) + bias)"}


@router.get("/twin")
def twin() -> dict:
    return KG.geojson()


@router.get("/vessels")
def vessels() -> dict:
    cutoff = time.time() - 1800
    return {"vessels": [v for v in VESSELS.values() if v["ts"] > cutoff]}


@router.get("/signals/recent")
def recent_signals(limit: int = 40) -> dict:
    items = [s for s in list(BUS.history) if s.type != SignalType.vessel_position]
    return {"signals": [s.model_dump() for s in items[-limit:]]}


# ----------------------------------------------------------------- scenario
@router.post("/scenario/run")
def scenario_run(req: ScenarioRequest) -> dict:
    return oracle.run_scenario(req).model_dump()


@router.post("/scenario/whatif")
def scenario_whatif(payload: dict) -> dict:
    """Free-form corridor throughput slider (PRD B3): {corridor_id, throughput_pct}."""
    corridor_id = payload.get("corridor_id", "pg_west_india")
    throughput = float(payload.get("throughput_pct", 50))
    cut = max(0.0, min(100.0, 100.0 - throughput))
    c = KG.node(corridor_id)
    if c.get("chokepoints"):
        req = ScenarioRequest(kind="chokepoint_cut", chokepoint=c["chokepoints"][0],
                              cut_pct=cut, duration_days=int(payload.get("duration_days", 30)))
    else:
        req = ScenarioRequest(kind="supply_cut", chokepoint=None,
                              volume_kbd=KG.corridor_supply_kbd(corridor_id) * cut / 100.0,
                              cut_pct=cut, duration_days=int(payload.get("duration_days", 30)))
    return oracle.run_scenario(req).model_dump()


@router.get("/scenario/presets")
def scenario_presets() -> dict:
    return {"presets": seed_data()["scenarios"]}


# -------------------------------------------------------------- procurement
@router.post("/procurement/optimize")
def procurement(req: ProcurementRequest) -> dict:
    if req.refinery_id not in {r["id"] for r in KG.nodes_of("refinery")}:
        raise HTTPException(404, f"unknown refinery {req.refinery_id}")
    return navigator.optimize(req).model_dump()


@router.post("/spr/optimize")
def spr(req: SPRRequest) -> dict:
    return custodian.plan(req).model_dump()


# ---------------------------------------------------------------- supervisor
@router.post("/supervisor/trigger")
async def trigger(payload: dict | None = None) -> dict:
    """Fire the full demo loop (PRD E3/F7). Injects the labelled demo burst,
    then runs Sentinel→Oracle→Navigator→Custodian→brief, streaming stages."""
    payload = payload or {}
    cfg = model_config()["demo"]
    corridor = payload.get("corridor", cfg["corridor"])
    if _loop_lock.locked():
        raise HTTPException(409, "a loop is already running")
    async with _loop_lock:
        t0 = time.perf_counter()
        # 1 — inject the demo burst (always tagged mode=demo, NFR3)
        cp = cfg["chokepoint"]
        for spec in cfg["signals"]:
            sig = Signal(
                source="demo", mode=SignalMode.demo,
                type=SignalType(spec["type"]),
                chokepoint_id=cp, corridor_ids=[corridor],
                magnitude=float(spec["magnitude"]), confidence=float(spec["confidence"]),
                summary=spec["summary"],
            )
            if sig.type == SignalType.price_move:
                apply_demo_spike(6.2)
            await BUS.publish(sig)
            await asyncio.sleep(0.15)
        await asyncio.sleep(0.3)         # let the watcher ingest + broadcast CDP jump

        # 2 — run the full agentic loop, streaming stage events
        brief = await supervisor.run_loop(corridor, MANAGER.broadcast)
        return {"brief_id": brief.brief_id,
                "elapsed_s": round(time.perf_counter() - t0, 1),
                "under_60s": (time.perf_counter() - t0) < 60}


@router.get("/brief/{brief_id}")
def get_brief(brief_id: str) -> dict:
    if brief_id not in supervisor.BRIEFS:
        raise HTTPException(404, "unknown brief")
    return supervisor.BRIEFS[brief_id].model_dump()


@router.post("/brief/{brief_id}/approve")
def approve(brief_id: str, payload: dict | None = None) -> dict:
    if brief_id not in supervisor.BRIEFS:
        raise HTTPException(404, "unknown brief")
    approve_flag = (payload or {}).get("approve", True)
    return supervisor.decide(brief_id, approve_flag).model_dump()


# -------------------------------------------------------- calibration/weather
@router.get("/calibration/shocks")
def calibration_shocks() -> dict:
    """Historical Brent shock episodes (FRED) grounding the Oracle's outputs."""
    from ..ingestion import fred
    return {"calibration": fred.CALIBRATION,
            "all_moves_pct": [s["move_pct"] for s in fred.SHOCKS],
            "recent": fred.SHOCKS[-8:]}


@router.get("/weather")
def weather() -> dict:
    """Live corridor sea state (Open-Meteo Marine) + delay factors."""
    from ..ingestion.marine import WEATHER
    return {"corridors": WEATHER}


# -------------------------------------------------------------------- replay
@router.get("/replay/windows")
def replay_windows() -> dict:
    return {"windows": replay.list_windows()}


@router.post("/replay/play")
async def replay_play(payload: dict) -> dict:
    try:
        n = await replay.play(payload["file"], float(payload.get("speed", 10)))
    except FileNotFoundError:
        raise HTTPException(404, "window not found")
    return {"replayed": n}
