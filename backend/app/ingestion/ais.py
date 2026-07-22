"""PRAHARI — AISStream.io live vessel ingestion (WebSocket).

Streams tanker position reports inside chokepoint monitor boxes, feeds the
anomaly detector, and keeps latest positions for the map twin overlay.
Requires AISSTREAM_API_KEY; silently absent otherwise (replay covers demos).
"""
from __future__ import annotations

import asyncio
import json
import logging
import time

import websockets

from ..cognition.ais_anomaly import DETECTOR
from ..config import get_settings, seed_data
from ..models.schemas import Signal, SignalType
from .bus import BUS

log = logging.getLogger("prahari.ais")

WS_URL = "wss://stream.aisstream.io/v0/stream"

# latest positions for the console overlay: mmsi -> dict
VESSELS: dict[int, dict] = {}


def _monitor_boxes() -> list[list[list[float]]]:
    return [cp["monitor_bbox"] for cp in seed_data()["chokepoints"]]


async def run() -> None:
    s = get_settings()
    if not s.ais_live:
        log.info("AISSTREAM_API_KEY absent — AIS live feed off (replay/demo covers it)")
        return
    sub = {
        "APIKey": s.aisstream_key,
        "BoundingBoxes": _monitor_boxes(),
        "FilterMessageTypes": ["PositionReport"],
    }
    backoff = 10
    while True:
        try:
            async with websockets.connect(WS_URL, open_timeout=30) as ws:
                await ws.send(json.dumps(sub))
                log.info("AISStream connected (%d boxes)", len(sub["BoundingBoxes"]))
                backoff = 10
                async for raw in ws:
                    await _handle(json.loads(raw))
        except Exception as e:
            # aisstream.io 503s under load — patient reconnect, never crash (NFR4)
            log.warning("AISStream dropped (%s) — reconnecting in %ds", e, backoff)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 120)


async def _handle(msg: dict) -> None:
    if msg.get("MessageType") != "PositionReport":
        return
    body = msg.get("Message", {}).get("PositionReport", {})
    meta = msg.get("MetaData", {})
    mmsi = body.get("UserID") or meta.get("MMSI")
    if not mmsi:
        return
    pos = {
        "mmsi": mmsi,
        "name": (meta.get("ShipName") or "").strip(),
        "lat": body.get("Latitude"),
        "lon": body.get("Longitude"),
        "sog": body.get("Sog", 0.0),           # speed over ground, kn
        "cog": body.get("Cog", 0.0),           # course over ground, deg
        "ts": time.time(),
    }
    VESSELS[mmsi] = pos
    # raw position onto the bus (not recorded; high volume) for any consumer
    await BUS.publish(Signal(
        source="ais", type=SignalType.vessel_position,
        lat=pos["lat"], lon=pos["lon"], magnitude=0.0, confidence=1.0,
        summary="", extracted=pos,
    ))
    # anomaly detector may emit corridor-level ais_anomaly signals
    for anomaly in DETECTOR.observe(pos):
        await BUS.publish(anomaly)
