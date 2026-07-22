"""PRAHARI — common data models (TRD §3 signal schema + API shapes)."""
from __future__ import annotations

import time
import uuid
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


def now_ts() -> float:
    return time.time()


def new_id() -> str:
    return uuid.uuid4().hex[:12]


class SignalType(str, Enum):
    conflict_event = "conflict_event"
    ais_anomaly = "ais_anomaly"
    sanction_update = "sanction_update"
    price_move = "price_move"
    vessel_position = "vessel_position"   # raw AIS, consumed by anomaly detector


class SignalMode(str, Enum):
    live = "live"
    replay = "replay"
    demo = "demo"


class Signal(BaseModel):
    """Common normalised signal (TRD §3). Every ingested item becomes one of these."""
    signal_id: str = Field(default_factory=new_id)
    source: str                              # gdelt | ais | ofac | eia | brent | demo
    mode: SignalMode = SignalMode.live       # data-honesty tag (NFR3)
    ts: float = Field(default_factory=now_ts)
    lat: Optional[float] = None
    lon: Optional[float] = None
    chokepoint_id: Optional[str] = None
    corridor_ids: list[str] = []
    type: SignalType
    magnitude: float = 0.0                   # 0..1 severity
    confidence: float = 0.5                  # 0..1
    summary: str = ""
    raw_ref: str = ""                        # url | record id
    extracted: dict[str, Any] = {}


class FactorContribution(BaseModel):
    factor: str            # geo | ais | sanctions | market | llm_adjudicator
    value: float           # component score 0..1
    weight: float
    contribution: float    # weight * value (pre-sigmoid)
    evidence: list[str] = []


class CorridorState(BaseModel):
    corridor_id: str
    name: str
    cdp: float
    band: str              # low | elevated | high | critical
    confidence: float
    factors: list[FactorContribution]
    lead_time_hours: Optional[tuple[float, float]] = None
    updated_at: float
    baseline_risk: float


# ----------------------------- Oracle ------------------------------------

class ScenarioRequest(BaseModel):
    kind: str = "chokepoint_cut"             # chokepoint_cut | supply_cut
    chokepoint: Optional[str] = "hormuz"
    cut_pct: float = 50.0
    duration_days: int = 30
    volume_kbd: Optional[float] = None       # for supply_cut
    # editable assumptions (PRD B2) — None => seed defaults
    supply_elasticity: Optional[float] = None
    commercial_stock_days: Optional[float] = None
    substitutability: Optional[float] = None


class RefineryImpact(BaseModel):
    id: str
    name: str
    capacity_kbd: float
    runrate_impact_pct: float                # negative = reduction
    supply_loss_kbd: float


class ScenarioImpact(BaseModel):
    scenario_id: str = Field(default_factory=new_id)
    event: dict[str, Any]
    imports_at_risk_pct: float
    supply_loss_kbd: float
    days_of_cover: float
    days_of_cover_baseline: float
    brent_delta_pct: float
    brent_projected_usd: float
    india_basket_premium_usd: float
    refineries: list[RefineryImpact]
    power_stress_index: float
    import_bill_shock_usd_bn: float
    import_bill_shock_pct_gdp: float
    assumptions: dict[str, float]
    uncertainty: dict[str, tuple[float, float]]   # P10–P90 bands
    computed_in_ms: float


# ----------------------------- Navigator ----------------------------------

class ProcurementRequest(BaseModel):
    refinery_id: str = "jamnagar"
    gap_kbd: float
    risk_aversion_lambda: Optional[float] = None
    risk_ceiling: Optional[float] = None


class Alternative(BaseModel):
    id: str
    supplier: str
    grade: str
    grade_category: str
    corridor: str
    corridor_name: str
    allocated_kbd: float
    landed_cost_usd: float                   # $/bbl absolute
    landed_premium_usd: float
    eta_days: float
    corridor_risk: float
    grade_fit: bool
    yield_penalty: float
    supplier_reliability: float = 0.8
    reliability_source: str = "seed"     # seed | eia_derived
    weather_delay_factor: float = 1.0    # Open-Meteo Marine sea-state multiplier
    max_wave_m: Optional[float] = None
    score: float
    feasible: bool
    exclusion_reason: Optional[str] = None


class ProcurementPlan(BaseModel):
    plan_id: str = Field(default_factory=new_id)
    refinery_id: str
    gap_kbd: float
    filled_kbd: float
    ranked: list[Alternative]
    excluded: list[Alternative]
    params: dict[str, float]
    computed_in_ms: float


# ----------------------------- Custodian ----------------------------------

class SPRRequest(BaseModel):
    gap_kbd: float = 500.0
    duration_days: int = 30
    reserve_floor_pct: Optional[float] = None


class SPRDay(BaseModel):
    day: int
    gap_kbd: float
    release_kbd: float
    unmet_kbd: float
    reserve_mbbl: float
    reserve_pct: float


class SPRSchedule(BaseModel):
    schedule_id: str = Field(default_factory=new_id)
    total_release_mbbl: float
    days_bridged: int
    floor_respected: bool
    reserve_floor_pct: float
    replenish_window: str
    schedule: list[SPRDay]
    rationale: str
    computed_in_ms: float


# ----------------------------- Supervisor ---------------------------------

class BriefStatus(str, Enum):
    pending = "pending"
    approved = "approved"
    dismissed = "dismissed"


class DecisionBrief(BaseModel):
    brief_id: str = Field(default_factory=new_id)
    created_at: float = Field(default_factory=now_ts)
    status: BriefStatus = BriefStatus.pending
    trigger: dict[str, Any]                 # corridor, cdp, top signals
    scenario: ScenarioImpact
    procurement: ProcurementPlan
    spr: Optional[SPRSchedule] = None
    narrative: str = ""                     # LLM/template narration of computed values
    narrative_source: str = "template"      # template | llm
    economics: dict[str, Any] = {}          # ₹ cost-of-inaction vs plan premium
    elapsed_s: float = 0.0
    audit: dict[str, Any] = {}              # NFR7: inputs, model version, assumptions
