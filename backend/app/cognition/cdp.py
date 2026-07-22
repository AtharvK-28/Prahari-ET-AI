"""PRAHARI — Corridor Disruption Probability engine (TRD §5.1).

CDP(c,t) = σ( scale · (w_g·G + w_a·A + w_s·S + w_m·M + baseline) + bias )

Explainable by construction: every component keeps its evidence list and its
weighted contribution is exposed via /corridors/{id}/explain (PRD A2, NFR2).
Signals decay exponentially with a configurable half-life.
"""
from __future__ import annotations

import math
import time

from ..config import model_config
from ..ingestion.brent import PRICE
from ..knowledge.graph import KG
from ..models.schemas import CorridorState, FactorContribution, Signal, SignalType

_FACTOR_OF = {
    SignalType.conflict_event: "geo",
    SignalType.ais_anomaly: "ais",
    SignalType.sanction_update: "sanctions",
    SignalType.price_move: "market",
}


class _Component:
    """Decaying accumulation of one factor's signals for one corridor."""

    def __init__(self, halflife_min: float) -> None:
        self.halflife_s = halflife_min * 60
        self.items: list[tuple[float, float, float, str]] = []   # (ts, mag, conf, summary)

    def add(self, sig: Signal) -> None:
        self.items.append((sig.ts, sig.magnitude, sig.confidence, sig.summary))
        self.items = self.items[-40:]

    def value(self, now: float) -> tuple[float, float, list[str]]:
        """Return (score 0..1, mean confidence, top evidence)."""
        if not self.items:
            return 0.0, 0.0, []
        acc, wconf, weights = 0.0, 0.0, 0.0
        scored: list[tuple[float, str]] = []
        for ts, mag, conf, summary in self.items:
            decay = math.exp(-math.log(2) * (now - ts) / self.halflife_s)
            eff = mag * decay
            acc += eff * conf
            wconf += conf * decay
            weights += decay
            if summary:
                scored.append((eff, summary))
        score = 1 - math.exp(-1.6 * acc)          # saturating sum -> 0..1
        conf = wconf / weights if weights else 0.0
        scored.sort(reverse=True)
        return min(1.0, score), min(1.0, conf), [s for _, s in scored[:3]]


class CDPEngine:
    def __init__(self) -> None:
        cfg = model_config()
        self.w = cfg["cdp"]["weights"]
        self.bias = float(cfg["cdp"]["bias"])
        self.scale = float(cfg["cdp"]["scale"])
        self.threshold = float(cfg["cdp"]["alert_threshold"])
        self.halflife = float(cfg["cdp"]["decay_halflife_min"])
        self.lead_cfg = cfg["lead_time"]
        self.corridors = {c["id"]: c for c in KG.nodes_of("corridor")}
        self.components: dict[str, dict[str, _Component]] = {
            cid: {f: _Component(self.halflife) for f in ("geo", "ais", "sanctions", "market")}
            for cid in self.corridors
        }
        self.first_physical_signal: dict[str, float] = {}    # corridor -> ts (lead time)
        self.alert_active: dict[str, bool] = {cid: False for cid in self.corridors}

    # ------------------------------------------------------------------ ingest
    def ingest(self, sig: Signal) -> list[str]:
        """Route a signal to its corridors; return corridor ids whose CDP changed."""
        factor = _FACTOR_OF.get(sig.type)
        if factor is None:
            return []
        touched: list[str] = []
        corridor_ids = sig.corridor_ids or (
            # price moves are systemic: apply to all chokepoint-transiting corridors
            [cid for cid, c in self.corridors.items() if c["chokepoints"]]
            if sig.type == SignalType.price_move else []
        )
        for cid in corridor_ids:
            if cid not in self.components:
                continue
            self.components[cid][factor].add(sig)
            touched.append(cid)
            if factor in ("ais", "geo") and cid not in self.first_physical_signal:
                self.first_physical_signal[cid] = sig.ts
        return touched

    # ----------------------------------------------------------------- compute
    def state(self, corridor_id: str) -> CorridorState:
        now = time.time()
        c = self.corridors[corridor_id]
        comps = self.components[corridor_id]
        factors: list[FactorContribution] = []
        weighted_sum = 0.0
        confs: list[float] = []
        for name, comp in comps.items():
            value, conf, evidence = comp.value(now)
            if name == "market" and value == 0.0:
                z = PRICE.spike_zscore()
                value = min(1.0, z / 4.0)
                if value:
                    evidence = [f"Brent z-score {z:.1f} (${PRICE.brent_usd:.2f}, {PRICE.source})"]
            w = float(self.w[name])
            contribution = w * value
            weighted_sum += contribution
            if conf:
                confs.append(conf)
            factors.append(FactorContribution(
                factor=name, value=round(value, 3), weight=w,
                contribution=round(contribution, 4), evidence=evidence))

        base = float(c.get("baseline_risk", 0.1))
        logit = self.scale * (weighted_sum + base * 0.55) + self.bias
        cdp = 1 / (1 + math.exp(-logit))
        factors.sort(key=lambda f: -f.contribution)

        band = ("critical" if cdp >= 0.8 else "high" if cdp >= self.threshold
                else "elevated" if cdp >= 0.4 else "low")
        lead = None
        if cdp >= self.threshold:
            lo, hi = (self.lead_cfg["ais_lead_hours"]
                      if comps["ais"].value(now)[0] > 0.1 else self.lead_cfg["news_lead_hours"])
            lead = (float(lo), float(hi))
        return CorridorState(
            corridor_id=corridor_id, name=c["name"], cdp=round(cdp, 3), band=band,
            confidence=round(sum(confs) / len(confs), 2) if confs else 0.3,
            factors=factors, lead_time_hours=lead, updated_at=now,
            baseline_risk=base)

    def all_states(self) -> list[CorridorState]:
        return [self.state(cid) for cid in self.corridors]

    def reset(self) -> None:
        """Rehearsal reset: forget all accumulated signal influence.

        Corridors fall back to their structural baselines; live feeds keep
        running, so real news will re-elevate the board organically (FR10).
        """
        self.components = {
            cid: {f: _Component(self.halflife) for f in ("geo", "ais", "sanctions", "market")}
            for cid in self.corridors
        }
        self.first_physical_signal.clear()
        self.alert_active = {cid: False for cid in self.corridors}

    def crossed_threshold(self, corridor_id: str) -> bool:
        """True exactly once per excursion above the alert threshold."""
        st = self.state(corridor_id)
        was = self.alert_active[corridor_id]
        now_above = st.cdp >= self.threshold
        self.alert_active[corridor_id] = now_above
        return now_above and not was


ENGINE = CDPEngine()
