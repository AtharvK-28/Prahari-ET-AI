"""PRAHARI — in-process async signal bus.

Redis-Streams-shaped API (publish/subscribe + history) so the implementation can
be swapped for Redis without touching producers/consumers (NFR5). Also records
every signal to JSONL for the replay harness (Phase 5).
"""
from __future__ import annotations

import asyncio
import json
import time
from collections import deque
from pathlib import Path
from typing import AsyncIterator

from ..config import REPLAY_DIR, get_settings
from ..models.schemas import Signal


class SignalBus:
    def __init__(self, history: int = 500) -> None:
        self._subs: list[asyncio.Queue[Signal]] = []
        self.history: deque[Signal] = deque(maxlen=history)
        self._record_path: Path | None = None
        if get_settings().record_signals:
            REPLAY_DIR.mkdir(parents=True, exist_ok=True)
            stamp = time.strftime("%Y%m%d_%H%M%S")
            self._record_path = REPLAY_DIR / f"recorded_{stamp}.jsonl"

    async def publish(self, sig: Signal) -> None:
        self.history.append(sig)
        self._record(sig)
        for q in list(self._subs):
            # non-blocking fan-out; a slow subscriber never stalls ingestion
            try:
                q.put_nowait(sig)
            except asyncio.QueueFull:
                pass

    def _record(self, sig: Signal) -> None:
        # raw AIS positions are high-volume; record only decision-relevant signals
        if self._record_path and sig.type.value != "vessel_position":
            with open(self._record_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(sig.model_dump(mode="json")) + "\n")

    async def subscribe(self) -> AsyncIterator[Signal]:
        q: asyncio.Queue[Signal] = asyncio.Queue(maxsize=2000)
        self._subs.append(q)
        try:
            while True:
                yield await q.get()
        finally:
            self._subs.remove(q)


BUS = SignalBus()
