"""PRAHARI — supply-chain knowledge graph (TRD §4).

NetworkX in-memory implementation (TRD-sanctioned Neo4j fallback).
Nodes: Supplier, CrudeGrade, Corridor, Chokepoint, Port, Refinery, SPRSite.
Edges: PRODUCES, SHIPS_VIA, PASSES_THROUGH, LANDS_AT, FEEDS, CAN_PROCESS, STORES.
"""
from __future__ import annotations

from typing import Any

import networkx as nx

from ..config import seed_data


class KnowledgeGraph:
    def __init__(self) -> None:
        self.g = nx.MultiDiGraph()
        self.seed = seed_data()
        self._build()

    # ------------------------------------------------------------------ build
    def _build(self) -> None:
        s = self.seed
        for grade in s["crude_grades"]:
            self.g.add_node(grade["id"], kind="grade", **grade)
        for cp in s["chokepoints"]:
            self.g.add_node(cp["id"], kind="chokepoint", **cp)
        for port in s["ports"]:
            self.g.add_node(port["id"], kind="port", **port)
        for c in s["corridors"]:
            self.g.add_node(c["id"], kind="corridor", **c)
            for cp in c["chokepoints"]:
                self.g.add_edge(c["id"], cp, rel="PASSES_THROUGH")
            for p in c["ports"]:
                self.g.add_edge(c["id"], p, rel="LANDS_AT")
        derived = self._load_derived_eia()
        for sup in s["suppliers"]:
            self.g.add_node(sup["id"], kind="supplier", **sup)
            d = derived.get(sup["id"])
            if d:
                # EIA-derived flow-stability proxy overrides the seed guess when
                # there is real signal (>=12 active months); provenance kept
                self.g.nodes[sup["id"]]["reliability_derived"] = d.get("reliability_proxy")
                self.g.nodes[sup["id"]]["eia_metrics"] = d
                if d.get("reliability_proxy") is not None:
                    self.g.nodes[sup["id"]]["reliability"] = d["reliability_proxy"]
                    self.g.nodes[sup["id"]]["reliability_source"] = "eia_derived"
            for gid in sup["grades"]:
                self.g.add_edge(sup["id"], gid, rel="PRODUCES")
            for cid in sup["corridors"]:
                self.g.add_edge(sup["id"], cid, rel="SHIPS_VIA")
        for r in s["refineries"]:
            self.g.add_node(r["id"], kind="refinery", **r)
            self.g.add_edge(r["port"], r["id"], rel="FEEDS")
            for category, penalty in r["process_penalty"].items():
                # CAN_PROCESS is category-level for the MVP
                self.g.add_node(f"cat:{category}", kind="grade_category", category=category)
                self.g.add_edge(r["id"], f"cat:{category}", rel="CAN_PROCESS", yield_penalty=penalty)
        for site in s["spr_sites"]:
            self.g.add_node(site["id"], kind="spr", **site)

    @staticmethod
    def _load_derived_eia() -> dict[str, dict]:
        """Optional config/derived_eia.yaml written by scripts/eia_etl.py."""
        import yaml

        from ..config import CONFIG_DIR
        path = CONFIG_DIR / "derived_eia.yaml"
        if not path.exists():
            return {}
        with open(path, encoding="utf-8") as f:
            return yaml.safe_load(f).get("suppliers", {}) or {}

    # ------------------------------------------------------------- traversals
    def node(self, node_id: str) -> dict[str, Any]:
        return dict(self.g.nodes[node_id])

    def nodes_of(self, kind: str) -> list[dict[str, Any]]:
        return [dict(d) for _, d in self.g.nodes(data=True) if d.get("kind") == kind]

    def corridors_through(self, chokepoint_id: str) -> list[dict[str, Any]]:
        """Corridor ← PASSES_THROUGH → Chokepoint."""
        out = []
        for u, v, d in self.g.edges(data=True):
            if d.get("rel") == "PASSES_THROUGH" and v == chokepoint_id:
                out.append(self.node(u))
        return out

    def suppliers_via(self, corridor_id: str) -> list[dict[str, Any]]:
        """Supplier → SHIPS_VIA → Corridor."""
        out = []
        for u, v, d in self.g.edges(data=True):
            if d.get("rel") == "SHIPS_VIA" and v == corridor_id:
                out.append(self.node(u))
        return out

    def refineries_fed_by(self, corridor_id: str) -> list[dict[str, Any]]:
        """Corridor → LANDS_AT → Port → FEEDS → Refinery."""
        refs: dict[str, dict] = {}
        for u, v, d in self.g.edges(data=True):
            if d.get("rel") == "LANDS_AT" and u == corridor_id:
                for _, r, d2 in self.g.edges(v, data=True):
                    if d2.get("rel") == "FEEDS":
                        refs[r] = self.node(r)
        return list(refs.values())

    def yield_penalty(self, refinery_id: str, grade_category: str) -> float:
        """CAN_PROCESS yield penalty; 1.0 => cannot process."""
        for _, v, d in self.g.edges(refinery_id, data=True):
            if d.get("rel") == "CAN_PROCESS" and v == f"cat:{grade_category}":
                return float(d.get("yield_penalty", 1.0))
        return 1.0

    def grade_category(self, grade_id: str) -> str:
        return self.node(grade_id).get("category", "unknown")

    # ------------------------------------------------ shock-facing aggregates
    def supply_at_risk_kbd(self, chokepoint_id: str, cut_pct: float) -> tuple[float, dict[str, float]]:
        """Barrels/day of India-bound supply lost if this chokepoint is cut.

        Volume attribution: supplier share_pct × import_volume_kbd, split evenly
        across a supplier's corridors, summed for corridors through the chokepoint.
        """
        s = self.seed["national"]
        import_kbd = float(s["import_volume_kbd"])
        affected = {c["id"] for c in self.corridors_through(chokepoint_id)}
        per_supplier: dict[str, float] = {}
        for sup in self.nodes_of("supplier"):
            share = float(sup["share_pct"]) / 100.0
            corridors = sup["corridors"]
            if not corridors:
                continue
            per_corridor = share * import_kbd / len(corridors)
            hit = sum(per_corridor for cid in corridors if cid in affected)
            if hit > 0:
                per_supplier[sup["id"]] = hit * cut_pct / 100.0
        return sum(per_supplier.values()), per_supplier

    def corridor_supply_kbd(self, corridor_id: str) -> float:
        """India-bound kbd flowing on a corridor (even split across supplier corridors)."""
        import_kbd = float(self.seed["national"]["import_volume_kbd"])
        total = 0.0
        for sup in self.suppliers_via(corridor_id):
            share = float(sup["share_pct"]) / 100.0
            total += share * import_kbd / max(1, len(sup["corridors"]))
        return total

    # --------------------------------------------------------------- geo twin
    def geojson(self) -> dict[str, Any]:
        """The geospatial twin as one FeatureCollection for the console."""
        feats: list[dict] = []
        for c in self.nodes_of("corridor"):
            feats.append({
                "type": "Feature",
                "geometry": {"type": "LineString", "coordinates": c["waypoints"]},
                "properties": {"kind": "corridor", "id": c["id"], "name": c["name"],
                               "chokepoints": c["chokepoints"], "transit_days": c["transit_days"]},
            })
        for cp in self.nodes_of("chokepoint"):
            feats.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [cp["lon"], cp["lat"]]},
                "properties": {"kind": "chokepoint", "id": cp["id"], "name": cp["name"],
                               "share_pct": cp["india_import_share_pct"]},
            })
        for r in self.nodes_of("refinery"):
            feats.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [r["lon"], r["lat"]]},
                "properties": {"kind": "refinery", "id": r["id"], "name": r["name"],
                               "capacity_kbd": r["capacity_kbd"]},
            })
        for site in self.nodes_of("spr"):
            feats.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [site["lon"], site["lat"]]},
                "properties": {"kind": "spr", "id": site["id"], "name": site["name"],
                               "capacity_mmt": site["capacity_mmt"], "fill_pct": site["fill_pct"]},
            })
        for p in self.nodes_of("port"):
            feats.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [p["lon"], p["lat"]]},
                "properties": {"kind": "port", "id": p["id"], "name": p["name"]},
            })
        return {"type": "FeatureCollection", "features": feats}

    # ------------------------------------------------------------ geo mapping
    def nearest_chokepoint(self, lat: float, lon: float, max_deg: float = 4.0) -> str | None:
        """Map an incoming geo-event to a chokepoint (spatial-join stand-in)."""
        best, best_d = None, max_deg
        for cp in self.nodes_of("chokepoint"):
            d = ((cp["lat"] - lat) ** 2 + (cp["lon"] - lon) ** 2) ** 0.5
            if d < best_d:
                best, best_d = cp["id"], d
        return best

    def corridors_for_chokepoint(self, chokepoint_id: str) -> list[str]:
        return [c["id"] for c in self.corridors_through(chokepoint_id)]


KG = KnowledgeGraph()
