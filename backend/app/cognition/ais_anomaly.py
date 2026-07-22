"""PRAHARI — AIS anomaly detection (TRD §5.1).

Per-vessel rolling baseline of speed/heading inside chokepoint monitor boxes.
Flags: (a) heading reversal away from a chokepoint, (b) loitering,
(c) AIS dark gap, (d) is aggregated corridor-level by the CDP engine.
"""
from __future__ import annotations

import time
from collections import deque

from ..config import model_config, seed_data
from ..knowledge.graph import KG
from ..models.schemas import Signal, SignalType


def _in_box(lat: float, lon: float, box: list[list[float]]) -> bool:
    (lat_s, lon_w), (lat_n, lon_e) = box
    return lat_s <= lat <= lat_n and lon_w <= lon <= lon_e


class VesselTrack:
    def __init__(self, mmsi: int) -> None:
        self.mmsi = mmsi
        self.points: deque[dict] = deque(maxlen=60)
        self.last_seen: float = 0.0
        self.flagged: dict[str, float] = {}    # anomaly kind -> last emit ts (debounce)

    def debounced(self, kind: str, window_s: float = 1800) -> bool:
        return time.time() - self.flagged.get(kind, 0) > window_s

    def mark(self, kind: str) -> None:
        self.flagged[kind] = time.time()


class AnomalyDetector:
    def __init__(self) -> None:
        cfg = model_config()["ais_anomaly"]
        self.loiter_kn = float(cfg["loiter_speed_kn"])
        self.gap_min = float(cfg["gap_minutes"])
        self.reversal_deg = float(cfg["reversal_deg"])
        self.tracks: dict[int, VesselTrack] = {}
        self.chokepoints = seed_data()["chokepoints"]

    def _chokepoint_for(self, lat: float, lon: float) -> dict | None:
        for cp in self.chokepoints:
            if _in_box(lat, lon, cp["monitor_bbox"]):
                return cp
        return None

    def observe(self, pos: dict) -> list[Signal]:
        """Feed one position report; return zero or more anomaly signals."""
        lat, lon = pos.get("lat"), pos.get("lon")
        if lat is None or lon is None:
            return []
        cp = self._chokepoint_for(lat, lon)
        if cp is None:
            return []
        track = self.tracks.setdefault(pos["mmsi"], VesselTrack(pos["mmsi"]))
        now = pos.get("ts", time.time())
        out: list[Signal] = []

        # (c) dark gap: silence gap while previously inside a monitored box
        if track.last_seen and (now - track.last_seen) / 60.0 > self.gap_min \
                and track.debounced("dark_gap"):
            track.mark("dark_gap")
            out.append(self._signal(cp, pos, "dark_gap",
                                    f"AIS gap {int((now - track.last_seen) / 60)} min for "
                                    f"{pos.get('name') or pos['mmsi']} in {cp['name']} box",
                                    magnitude=0.6))

        # (b) loitering: sustained near-zero speed in the box
        recent = [p for p in track.points if now - p["ts"] < 1800]
        if pos.get("sog", 99) < self.loiter_kn and len(recent) >= 3 \
                and all(p.get("sog", 99) < self.loiter_kn for p in recent[-3:]) \
                and track.debounced("loiter"):
            track.mark("loiter")
            out.append(self._signal(cp, pos, "loiter",
                                    f"{pos.get('name') or pos['mmsi']} loitering "
                                    f"<{self.loiter_kn}kn in {cp['name']} box", magnitude=0.45))

        # (a) heading reversal vs. rolling baseline course
        if len(track.points) >= 5:
            base = sum(p.get("cog", 0) for p in list(track.points)[-5:]) / 5
            delta = abs((pos.get("cog", 0) - base + 180) % 360 - 180)
            if delta > self.reversal_deg and pos.get("sog", 0) > 5 \
                    and track.debounced("reversal"):
                track.mark("reversal")
                out.append(self._signal(cp, pos, "reversal",
                                        f"{pos.get('name') or pos['mmsi']} reversed course "
                                        f"({delta:.0f}°) near {cp['name']}", magnitude=0.7))

        track.points.append(pos)
        track.last_seen = now
        return out

    def _signal(self, cp: dict, pos: dict, kind: str, summary: str, magnitude: float) -> Signal:
        return Signal(
            source="ais", type=SignalType.ais_anomaly,
            lat=pos["lat"], lon=pos["lon"], chokepoint_id=cp["id"],
            corridor_ids=KG.corridors_for_chokepoint(cp["id"]),
            magnitude=magnitude, confidence=0.8,
            summary=summary, extracted={"kind": kind, "mmsi": pos["mmsi"]},
        )


DETECTOR = AnomalyDetector()
