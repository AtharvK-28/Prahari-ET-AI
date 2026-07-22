"""PRAHARI — Custodian: SPR drawdown optimiser (TRD §5.4).

Greedy-with-floor schedule: release min(gap, max_daily, headroom-above-floor)
per day; floor is a hard constraint that is never breached (PRD D1).
"""
from __future__ import annotations

import time

from ..config import model_config, seed_data
from ..ingestion.brent import PRICE
from ..models.schemas import SPRDay, SPRRequest, SPRSchedule


def plan(req: SPRRequest) -> SPRSchedule:
    t0 = time.perf_counter()
    s = seed_data()
    factor = float(s["spr"]["mmt_to_mbbl"])
    total_capacity_mbbl = sum(site["capacity_mmt"] * factor for site in s["spr_sites"])
    reserve_mbbl = sum(site["capacity_mmt"] * site["fill_pct"] / 100.0 * factor
                       for site in s["spr_sites"])
    floor_pct = req.reserve_floor_pct if req.reserve_floor_pct is not None \
        else float(s["spr"]["reserve_floor_pct"])
    floor_mbbl = total_capacity_mbbl * floor_pct / 100.0
    max_daily_kbd = float(s["spr"]["max_daily_release_kbd"])

    days: list[SPRDay] = []
    bridged = 0
    total_release = 0.0
    for day in range(1, req.duration_days + 1):
        # gap tapers late in the horizon as reroutes (Navigator cargoes) arrive
        taper = 1.0 if day <= 20 else max(0.3, 1.0 - (day - 20) * 0.05)
        gap = req.gap_kbd * taper
        headroom_kbd = max(reserve_mbbl - floor_mbbl, 0.0) * 1000.0   # 1 day at this rate
        release = min(gap, max_daily_kbd, headroom_kbd)
        release = max(release, 0.0)
        reserve_mbbl -= release / 1000.0
        unmet = gap - release
        if unmet <= 1.0:
            bridged += 1
        total_release += release / 1000.0
        days.append(SPRDay(
            day=day, gap_kbd=round(gap, 0), release_kbd=round(release, 0),
            unmet_kbd=round(max(unmet, 0.0), 0), reserve_mbbl=round(reserve_mbbl, 2),
            reserve_pct=round(reserve_mbbl / total_capacity_mbbl * 100.0, 1)))

    replenish = (
        f"begin refill when Brent < ${model_config()['custodian']['price_replenish_threshold_usd']:.0f} "
        f"(now ${PRICE.brent_usd:.2f}); refill {total_release:.1f} Mbbl over ~{max(30, req.duration_days)}d"
    )
    rationale = (
        f"Bridge a {req.gap_kbd:.0f} kbd gap for {req.duration_days}d releasing at most "
        f"{max_daily_kbd:.0f} kbd/day, holding reserve above the {floor_pct:.0f}% floor "
        f"({floor_mbbl:.1f} Mbbl). {bridged}/{req.duration_days} days fully bridged; "
        f"total drawdown {total_release:.1f} Mbbl."
    )
    return SPRSchedule(
        total_release_mbbl=round(total_release, 2), days_bridged=bridged,
        floor_respected=all(d.reserve_mbbl >= floor_mbbl - 1e-6 for d in days),
        reserve_floor_pct=floor_pct, replenish_window=replenish,
        schedule=days, rationale=rationale,
        computed_in_ms=round((time.perf_counter() - t0) * 1000, 1))
