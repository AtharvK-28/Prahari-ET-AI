"""PRAHARI — FastAPI application: ingestion workers + CDP watcher + API + WS."""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .agents import supervisor
from .api.routes import router, _loop_lock
from .api.ws import MANAGER
from .cognition import history
from .cognition.cdp import ENGINE
from .config import get_settings
from .ingestion import ais, brent, fred, gdelt, marine, ofac
from .ingestion.bus import BUS
from .models.schemas import SignalType

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("prahari.main")


async def watcher() -> None:
    """Bus consumer: feeds CDP, broadcasts updates, auto-triggers the loop (FR10)."""
    async for sig in BUS.subscribe():
        if sig.type == SignalType.vessel_position:
            continue
        touched = ENGINE.ingest(sig)
        history.record_signal(sig)
        await MANAGER.broadcast({"event": "signal", "signal": sig.model_dump()})
        for cid in touched:
            state = ENGINE.state(cid)
            history.record_cdp(cid, state.cdp)
            await MANAGER.broadcast({"event": "cdp_update", "state": state.model_dump()})
            # auto-trigger on threshold crossing — but never re-enter a running loop,
            # and never auto-run on demo signals (the trigger endpoint drives those)
            if sig.mode.value != "demo" and ENGINE.crossed_threshold(cid) \
                    and not _loop_lock.locked():
                log.info("CDP threshold crossed on %s — auto-triggering loop", cid)
                asyncio.create_task(_auto_loop(cid))


async def _auto_loop(corridor_id: str) -> None:
    async with _loop_lock:
        await supervisor.run_loop(corridor_id, MANAGER.broadcast)


async def sampler() -> None:
    """Chronology heartbeat: CDP decay + Brent tick, even between signals."""
    while True:
        for st in ENGINE.all_states():
            history.record_cdp(st.corridor_id, st.cdp)
        history.record_brent(brent.PRICE.brent_usd)
        await asyncio.sleep(45)


@asynccontextmanager
async def lifespan(app: FastAPI):
    s = get_settings()
    tasks = [asyncio.create_task(watcher())]
    if s.gdelt_enabled:
        tasks.append(asyncio.create_task(gdelt.run()))
    tasks.append(asyncio.create_task(brent.run()))
    tasks.append(asyncio.create_task(ais.run()))
    tasks.append(asyncio.create_task(ofac.run()))
    tasks.append(asyncio.create_task(marine.run()))
    tasks.append(asyncio.create_task(fred.load_history()))
    tasks.append(asyncio.create_task(fred.load_fx()))
    tasks.append(asyncio.create_task(sampler()))
    log.info("PRAHARI up — feeds: gdelt=%s ais=%s eia=%s llm=%s",
             s.gdelt_enabled, s.ais_live, s.eia_live, s.llm_available)
    yield
    for t in tasks:
        t.cancel()


app = FastAPI(title="PRAHARI", version="0.1", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
                   allow_headers=["*"])
app.include_router(router)


@app.websocket("/stream/signals")
async def stream(ws: WebSocket) -> None:
    await MANAGER.connect(ws)
    try:
        while True:
            await ws.receive_text()      # keepalive pings from console
    except WebSocketDisconnect:
        MANAGER.disconnect(ws)
