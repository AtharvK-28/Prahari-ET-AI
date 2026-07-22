"""PRAHARI — OFAC SDN sanctions ingestion (daily, free, no key).

Downloads the SDN list and matches vessel/energy entries against KG suppliers
and Gulf shipping keywords; new matches emit sanction_update signals.
"""
from __future__ import annotations

import asyncio
import logging

import httpx

from ..knowledge.graph import KG
from ..models.schemas import Signal, SignalType
from .bus import BUS

log = logging.getLogger("prahari.ofac")

SDN_CSV = "https://www.treasury.gov/ofac/downloads/sdn.csv"
POLL_SECONDS = 86400
KEYWORDS = ["crude", "tanker", "petroleum", "oil", "shipping", "NIOC", "vessel"]

_seen: set[str] = set()
_first_run = True


async def poll_once(client: httpx.AsyncClient) -> int:
    global _first_run
    r = await client.get(SDN_CSV, timeout=60, follow_redirects=True)
    r.raise_for_status()
    supplier_countries = {s["country"].lower() for s in KG.nodes_of("supplier")}
    fresh = 0
    for line in r.text.splitlines():
        low = line.lower()
        if not any(k.lower() in low for k in KEYWORDS):
            continue
        key = line[:120]
        if key in _seen:
            continue
        _seen.add(key)
        if _first_run:      # baseline load: learn existing entries, don't alert on history
            continue
        name = line.split('","')[1].strip('"') if '","' in line else key[:60]
        country_hit = next((c for c in supplier_countries if c in low), None)
        await BUS.publish(Signal(
            source="ofac", type=SignalType.sanction_update,
            magnitude=0.5 if country_hit else 0.3, confidence=0.85,
            corridor_ids=[],   # systemic; CDP routes via price-style broadcast if needed
            summary=f"OFAC SDN addition: {name[:80]}",
            raw_ref=SDN_CSV, extracted={"country_hit": country_hit},
        ))
        fresh += 1
    _first_run = False
    return fresh


async def run() -> None:
    async with httpx.AsyncClient() as client:
        while True:
            try:
                n = await poll_once(client)
                log.info("OFAC cycle done (%d fresh matches)", n)
            except Exception as e:
                log.warning("OFAC poll failed: %s", e)
            await asyncio.sleep(POLL_SECONDS)
