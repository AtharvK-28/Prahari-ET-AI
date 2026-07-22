"""PRAHARI — Brent price ingestion.

Live: EIA open-data API (daily Brent spot) when EIA_API_KEY is set.
Fallback: static seed baseline, clearly tagged — never a fabricated tick (NFR3).
Emits price_move signals when the z-score of returns spikes.
"""
from __future__ import annotations

import asyncio
import logging
import statistics

import httpx

from ..config import get_settings, seed_data
from ..models.schemas import Signal, SignalMode, SignalType
from .bus import BUS

log = logging.getLogger("prahari.brent")

EIA_SERIES = "https://api.eia.gov/v2/petroleum/pri/spt/data/"
POLL_SECONDS = 900


class PriceState:
    """Latest Brent + recent closes; consumed by CDP market component + Oracle."""
    def __init__(self) -> None:
        n = seed_data()["national"]
        self.brent_usd: float = float(n["baseline_brent_usd"])
        self.source: str = "seed_baseline"     # seed_baseline | eia_live | demo
        self.history: list[float] = []

    def spike_zscore(self) -> float:
        if len(self.history) < 6:
            return 0.0
        rets = [(b - a) / a for a, b in zip(self.history[-6:], self.history[-5:])]
        if len(rets) < 2:
            return 0.0
        sd = statistics.pstdev(rets) or 1e-6
        return abs(rets[-1]) / sd


PRICE = PriceState()


async def poll_once(client: httpx.AsyncClient) -> None:
    key = get_settings().eia_key
    r = await client.get(EIA_SERIES, params={
        "api_key": key, "frequency": "daily",
        "data[0]": "value", "facets[series][]": "RBRTE",
        "sort[0][column]": "period", "sort[0][direction]": "desc", "length": 30,
    }, timeout=20)
    r.raise_for_status()
    rows = r.json().get("response", {}).get("data", [])
    closes = [float(row["value"]) for row in reversed(rows) if row.get("value") is not None]
    if not closes:
        return
    prev = PRICE.brent_usd
    PRICE.history = closes
    PRICE.brent_usd = closes[-1]
    PRICE.source = "eia_live"
    z = PRICE.spike_zscore()
    day_move_pct = (closes[-1] - closes[-2]) / closes[-2] * 100 if len(closes) > 1 else 0.0
    if z > 1.5 or abs(day_move_pct) > 3.0:
        await BUS.publish(Signal(
            source="eia", type=SignalType.price_move,
            magnitude=min(1.0, abs(day_move_pct) / 8.0),
            confidence=0.9,
            summary=f"Brent {day_move_pct:+.1f}% to ${closes[-1]:.2f} (z={z:.1f})",
            raw_ref="EIA RBRTE", extracted={"brent": closes[-1], "prev": prev},
        ))


async def run() -> None:
    s = get_settings()
    if not s.eia_live:
        log.info("EIA key absent — Brent stays at seed baseline $%.2f (tagged seed_baseline)",
                 PRICE.brent_usd)
        return
    async with httpx.AsyncClient() as client:
        while True:
            try:
                await poll_once(client)
            except Exception as e:
                log.warning("EIA poll failed: %s", e)
            await asyncio.sleep(POLL_SECONDS)


_pre_demo_price: float | None = None


def apply_demo_spike(pct: float) -> None:
    """Demo trigger: shift the displayed price, retagged as demo (never 'live').

    Idempotent across repeated triggers — always spikes from the last real
    (non-demo) price, so back-to-back demos don't compound.
    """
    global _pre_demo_price
    if PRICE.source != "demo":
        _pre_demo_price = PRICE.brent_usd
    base = _pre_demo_price if _pre_demo_price is not None else PRICE.brent_usd
    PRICE.brent_usd = round(base * (1 + pct / 100.0), 2)
    PRICE.source = "demo"
