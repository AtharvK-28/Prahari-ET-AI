"""PRAHARI — FRED historical Brent integration.

Pulls decades of daily Brent (DCOILBRENTEU) once at startup to:
1. Identify historical shock episodes (5-day moves beyond a threshold) —
   surfaced via /calibration/shocks so the console can show the model is
   grounded in real price history (e.g. the 2025 US-Iran standoff spike).
2. Seed the PriceState history so the market z-score has a real baseline
   even before EIA's daily series refreshes.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta

import httpx

from .brent import PRICE

log = logging.getLogger("prahari.fred")

FRED_URL = "https://api.stlouisfed.org/fred/series/observations"
SERIES = "DCOILBRENTEU"

SHOCKS: list[dict] = []           # populated at startup
CALIBRATION: dict = {}

# USD→INR for the import-bill ticker. Seed fallback is clearly tagged (NFR3);
# overwritten by FRED DEXINUS (daily official rate) when the key is present.
FX: dict = {"inr_per_usd": 88.0, "date": None, "source": "seed_fallback"}


async def load_fx() -> None:
    """Latest INR/USD from FRED (series DEXINUS) — powers the ₹ import bill."""
    key = os.getenv("FRED_API_KEY", "")
    if not key:
        return
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(FRED_URL, params={
                "series_id": "DEXINUS", "api_key": key, "file_type": "json",
                "sort_order": "desc", "limit": 10,
            }, timeout=30)
            r.raise_for_status()
            for o in r.json().get("observations", []):
                try:
                    FX.update({"inr_per_usd": float(o["value"]),
                               "date": o["date"], "source": "fred_dexinus"})
                    log.info("FX loaded: ₹%.2f/USD (%s)", FX["inr_per_usd"], o["date"])
                    return
                except ValueError:      # FRED emits "." on market holidays
                    continue
    except Exception as e:
        log.warning("FRED FX load failed: %s — using tagged seed rate", e)


async def load_history(years: int = 12) -> None:
    key = os.getenv("FRED_API_KEY", "")
    if not key:
        log.info("FRED key absent — historical calibration off")
        return
    start = (datetime.utcnow() - timedelta(days=365 * years)).strftime("%Y-%m-%d")
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(FRED_URL, params={
                "series_id": SERIES, "api_key": key, "file_type": "json",
                "observation_start": start, "frequency": "d",
            }, timeout=30)
            r.raise_for_status()
            obs = r.json().get("observations", [])
    except Exception as e:
        log.warning("FRED load failed: %s", e)
        return

    closes: list[tuple[str, float]] = []
    for o in obs:
        try:
            closes.append((o["date"], float(o["value"])))
        except (KeyError, ValueError):
            continue
    if len(closes) < 100:
        return

    # seed the live price baseline with the most recent real closes
    PRICE.history = [v for _, v in closes[-30:]]
    if PRICE.source == "seed_baseline":
        PRICE.brent_usd = closes[-1][1]
        PRICE.source = "fred_daily"

    # find 5-day shock episodes > +6%
    global SHOCKS, CALIBRATION
    SHOCKS = []
    i = 5
    while i < len(closes):
        d0, p0 = closes[i - 5]
        d1, p1 = closes[i]
        move = (p1 - p0) / p0 * 100
        if move > 6.0:
            SHOCKS.append({"start": d0, "end": d1, "from_usd": round(p0, 2),
                           "to_usd": round(p1, 2), "move_pct": round(move, 1)})
            i += 5                      # skip overlapping windows
        i += 1
    moves = [s["move_pct"] for s in SHOCKS]
    CALIBRATION = {
        "series": SERIES,
        "years": years,
        "episodes": len(SHOCKS),
        "median_shock_pct": round(sorted(moves)[len(moves) // 2], 1) if moves else None,
        "max_shock_pct": round(max(moves), 1) if moves else None,
        "note": ("Oracle brent_delta outputs should sit within the historical "
                 "shock envelope; the 2025 US-Iran standoff (+8% intraday per the "
                 "problem brief) is the reference episode."),
    }
    log.info("FRED loaded %d closes, %d shock episodes (median %+0.1f%%)",
             len(closes), len(SHOCKS), CALIBRATION.get("median_shock_pct") or 0)
