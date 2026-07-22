"""PRAHARI — replay harness (Phase 5 demo safety net).

Replays a recorded real signal window (JSONL written by the bus recorder) at
original or compressed pacing. Every replayed signal is retagged mode=replay —
labelled honestly, never presented as live (NFR3).
"""
from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path

from ..config import REPLAY_DIR
from ..models.schemas import Signal, SignalMode, new_id as _fresh_id, now_ts
from .bus import BUS

log = logging.getLogger("prahari.replay")


def list_windows() -> list[str]:
    return sorted(p.name for p in REPLAY_DIR.glob("*.jsonl"))


async def play(filename: str, speed: float = 10.0) -> int:
    """Replay a window at `speed`x compression. Returns signals emitted."""
    path = REPLAY_DIR / Path(filename).name
    if not path.exists():
        raise FileNotFoundError(filename)
    signals: list[Signal] = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.strip():
                signals.append(Signal.model_validate(json.loads(line)))
    if not signals:
        return 0
    t0 = signals[0].ts
    started = now_ts()
    for sig in signals:
        delay = (sig.ts - t0) / max(speed, 0.1)
        wait = started + delay - now_ts()
        if wait > 0:
            await asyncio.sleep(min(wait, 5.0))
        sig.mode = SignalMode.replay
        sig.ts = now_ts()          # decay math uses arrival time
        sig.signal_id = _fresh_id()  # re-emission is a new signal instance
        await BUS.publish(sig)
    log.info("replayed %d signals from %s", len(signals), filename)
    return len(signals)
