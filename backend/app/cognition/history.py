"""PRAHARI — rolling time-series memory for the chronology strip.

The console's lead-time claim (signal → alert → brief before the market moves)
is temporal, so the system keeps a short in-memory history of CDP per corridor
and Brent ticks. Recorded on every CDP change plus a periodic sampler so the
exponential decay is visible between signals. In-process deques, same
TRD-sanctioned fallback posture as the signal bus.
"""
from __future__ import annotations

import time
from collections import deque

_MAXLEN = 4000            # ~2 days at the 45 s sampler cadence

CDP_HISTORY: dict[str, deque[tuple[float, float]]] = {}
BRENT_TICKS: deque[tuple[float, float]] = deque(maxlen=_MAXLEN)
SIGNAL_LOG: deque[dict] = deque(maxlen=_MAXLEN)

# NOTE: deliberately NOT cleared by the board reset. The chronology is a
# chronicle — a reset shows as a cliff in the curves, it doesn't rewrite what
# happened. (The reset clears the ENGINE's influence, not the record of it.)


def record_cdp(corridor_id: str, cdp: float, ts: float | None = None) -> None:
    CDP_HISTORY.setdefault(corridor_id, deque(maxlen=_MAXLEN)) \
        .append((ts or time.time(), round(cdp, 4)))


def record_brent(usd: float) -> None:
    BRENT_TICKS.append((time.time(), round(usd, 2)))


def record_signal(sig) -> None:
    SIGNAL_LOG.append({
        "ts": sig.ts, "type": sig.type.value, "mode": sig.mode.value,
        "magnitude": sig.magnitude, "corridor_ids": sig.corridor_ids,
        "summary": sig.summary,
    })


def snapshot(minutes: float) -> dict:
    cutoff = time.time() - minutes * 60
    return {
        "corridors": {cid: [[t, v] for t, v in pts if t >= cutoff]
                      for cid, pts in CDP_HISTORY.items()},
        "brent": [[t, v] for t, v in BRENT_TICKS if t >= cutoff],
        "signals": [s for s in SIGNAL_LOG if s["ts"] >= cutoff],
    }
