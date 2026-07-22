"""PRAHARI — GDELT DOC API ingestion (no key required).

Polls conflict/tanker coverage near each chokepoint; normalises article bursts
into conflict_event signals with magnitude from volume + tone.
"""
from __future__ import annotations

import asyncio
import logging

import httpx

from ..knowledge.graph import KG
from ..models.schemas import Signal, SignalType
from .bus import BUS

log = logging.getLogger("prahari.gdelt")

DOC_API = "https://api.gdeltproject.org/api/v2/doc/doc"
POLL_SECONDS = 300           # 5-min cadence

# chokepoint -> query terms (kept tight to avoid noise)
QUERIES: dict[str, str] = {
    "hormuz": '"strait of hormuz" (tanker OR missile OR attack OR seizure OR navy OR closure)',
    "bab_el_mandeb": '("bab el-mandeb" OR "red sea") (tanker OR houthi OR attack OR missile OR shipping)',
    "suez": '"suez canal" (blocked OR attack OR disruption OR transit)',
    "malacca": '"strait of malacca" (tanker OR piracy OR collision OR disruption)',
}

_seen_urls: set[str] = set()


def _score_articles(articles: list[dict]) -> tuple[float, float, list[str]]:
    """magnitude from article burst size + negative tone; returns (mag, conf, evidence)."""
    fresh = [a for a in articles if a.get("url") not in _seen_urls]
    for a in fresh:
        _seen_urls.add(a.get("url", ""))
    if not fresh:
        return 0.0, 0.0, []
    n = len(fresh)
    tones = []
    for a in fresh:
        try:
            tones.append(float(a.get("tone", 0)))
        except (TypeError, ValueError):
            pass
    avg_tone = sum(tones) / len(tones) if tones else 0.0
    # burst size saturates at ~20 fresh articles; tone below -5 is very negative
    magnitude = min(1.0, n / 20.0) * min(1.0, max(0.2, -avg_tone / 6.0))
    confidence = min(0.9, 0.3 + n / 25.0)
    evidence = [a.get("title", "")[:120] for a in fresh[:3]]
    return round(magnitude, 3), round(confidence, 3), evidence


async def poll_once(client: httpx.AsyncClient) -> int:
    emitted = 0
    for cp_id, query in QUERIES.items():
        try:
            r = await client.get(DOC_API, params={
                "query": query, "mode": "artlist", "format": "json",
                "timespan": "60min", "maxrecords": 50, "sort": "hybridrel",
            }, timeout=20)
            r.raise_for_status()
            articles = r.json().get("articles", [])
        except Exception as e:                       # circuit-breaker: degrade, never crash
            log.warning("GDELT poll failed for %s: %s", cp_id, e)
            continue
        mag, conf, evidence = _score_articles(articles)
        if mag <= 0.05:
            continue
        cp = KG.node(cp_id)
        await BUS.publish(Signal(
            source="gdelt", type=SignalType.conflict_event,
            lat=cp["lat"], lon=cp["lon"], chokepoint_id=cp_id,
            corridor_ids=KG.corridors_for_chokepoint(cp_id),
            magnitude=mag, confidence=conf,
            summary=f"GDELT: {len(evidence)}+ fresh articles near {cp['name']}" +
                    (f' — "{evidence[0]}"' if evidence else ""),
            raw_ref=DOC_API, extracted={"titles": evidence},
        ))
        emitted += 1
    return emitted


async def run() -> None:
    async with httpx.AsyncClient(headers={"user-agent": "prahari-hackathon/0.1"}) as client:
        while True:
            try:
                n = await poll_once(client)
                if n:
                    log.info("GDELT emitted %d signals", n)
            except Exception as e:
                log.warning("GDELT cycle error: %s", e)
            await asyncio.sleep(POLL_SECONDS)
