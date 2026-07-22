"""PRAHARI — Open-Meteo Marine integration (no key required).

Samples live sea state (wave height) along each corridor's waypoints and
derives a transparent voyage delay factor — tankers slow in heavy seas.
The Navigator multiplies alternative ETAs by the factor (digital-twin realism).

Delay heuristic (documented, tunable): VLCC service speed degradation
  wave < 2.5 m  -> 1.00 (calm)        2.5-4 m -> 1.06 (moderate)
  4-6 m         -> 1.15 (rough)       > 6 m   -> 1.30 (very rough)
"""
from __future__ import annotations

import asyncio
import logging
import time

import httpx

from ..knowledge.graph import KG

log = logging.getLogger("prahari.marine")

MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"
REFRESH_S = 3 * 3600

# corridor_id -> {"max_wave_m": float, "delay_factor": float, "updated": ts}
WEATHER: dict[str, dict] = {}


def delay_factor(wave_m: float) -> float:
    if wave_m < 2.5:
        return 1.00
    if wave_m < 4.0:
        return 1.06
    if wave_m < 6.0:
        return 1.15
    return 1.30


def _sample_points() -> list[tuple[str, float, float]]:
    """Up to 3 mid-route waypoints per corridor (lon,lat in seed -> lat,lon)."""
    pts: list[tuple[str, float, float]] = []
    for c in KG.nodes_of("corridor"):
        wps = c["waypoints"]
        idxs = {len(wps) // 4, len(wps) // 2, (3 * len(wps)) // 4}
        for i in sorted(idxs):
            lon, lat = wps[i]
            pts.append((c["id"], lat, lon))
    return pts


async def refresh_once(client: httpx.AsyncClient) -> None:
    pts = _sample_points()
    lats = ",".join(f"{lat:.3f}" for _, lat, _ in pts)
    lons = ",".join(f"{lon:.3f}" for _, _, lon in pts)
    r = await client.get(MARINE_URL, params={
        "latitude": lats, "longitude": lons, "current": "wave_height",
    }, timeout=30)
    r.raise_for_status()
    payload = r.json()
    rows = payload if isinstance(payload, list) else [payload]
    per_corridor: dict[str, float] = {}
    for (cid, _, _), row in zip(pts, rows):
        wave = (row.get("current") or {}).get("wave_height")
        if wave is None:
            continue
        per_corridor[cid] = max(per_corridor.get(cid, 0.0), float(wave))
    now = time.time()
    for cid, wave in per_corridor.items():
        WEATHER[cid] = {"max_wave_m": round(wave, 2),
                        "delay_factor": delay_factor(wave), "updated": now}
    log.info("marine weather refreshed for %d corridors "
             "(worst %.1f m)", len(per_corridor),
             max(per_corridor.values(), default=0.0))


async def run() -> None:
    async with httpx.AsyncClient() as client:
        while True:
            try:
                await refresh_once(client)
            except Exception as e:                     # NFR4: degrade, never crash
                log.warning("marine refresh failed: %s", e)
            await asyncio.sleep(REFRESH_S)


def corridor_delay(corridor_id: str) -> dict:
    """Current delay info for a corridor; calm defaults when no data."""
    return WEATHER.get(corridor_id, {"max_wave_m": None, "delay_factor": 1.0})
