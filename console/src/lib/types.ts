// PRAHARI — TS mirrors of backend schemas
export interface FactorContribution {
  factor: string;
  value: number;
  weight: number;
  contribution: number;
  evidence: string[];
}

export interface CorridorState {
  corridor_id: string;
  name: string;
  cdp: number;
  band: "low" | "elevated" | "high" | "critical";
  confidence: number;
  factors: FactorContribution[];
  lead_time_hours: [number, number] | null;
  updated_at: number;
  baseline_risk: number;
}

export interface Signal {
  signal_id: string;
  source: string;
  mode: "live" | "replay" | "demo";
  ts: number;
  type: string;
  magnitude: number;
  confidence: number;
  summary: string;
  chokepoint_id?: string | null;
  corridor_ids: string[];
}

export interface RefineryImpact {
  id: string;
  name: string;
  capacity_kbd: number;
  runrate_impact_pct: number;
  supply_loss_kbd: number;
}

export interface ScenarioImpact {
  scenario_id: string;
  event: Record<string, unknown>;
  imports_at_risk_pct: number;
  supply_loss_kbd: number;
  days_of_cover: number;
  days_of_cover_baseline: number;
  brent_delta_pct: number;
  brent_projected_usd: number;
  india_basket_premium_usd: number;
  refineries: RefineryImpact[];
  power_stress_index: number;
  import_bill_shock_usd_bn: number;
  import_bill_shock_pct_gdp: number;
  assumptions: Record<string, number>;
  uncertainty: Record<string, [number, number]>;
  computed_in_ms: number;
}

export interface Alternative {
  id: string;
  supplier: string;
  grade: string;
  grade_category: string;
  corridor: string;
  corridor_name: string;
  allocated_kbd: number;
  landed_cost_usd: number;
  landed_premium_usd: number;
  eta_days: number;
  corridor_risk: number;
  grade_fit: boolean;
  yield_penalty: number;
  supplier_reliability: number;
  reliability_source: "seed" | "eia_derived";
  weather_delay_factor: number;
  max_wave_m: number | null;
  score: number;
  feasible: boolean;
  exclusion_reason: string | null;
}

export interface ProcurementPlan {
  plan_id: string;
  refinery_id: string;
  gap_kbd: number;
  filled_kbd: number;
  ranked: Alternative[];
  excluded: Alternative[];
  params: Record<string, number>;
  computed_in_ms: number;
}

export interface SPRDay {
  day: number;
  gap_kbd: number;
  release_kbd: number;
  unmet_kbd: number;
  reserve_mbbl: number;
  reserve_pct: number;
}

export interface SPRSchedule {
  schedule_id: string;
  total_release_mbbl: number;
  days_bridged: number;
  floor_respected: boolean;
  reserve_floor_pct: number;
  replenish_window: string;
  schedule: SPRDay[];
  rationale: string;
  computed_in_ms: number;
}

export interface DecisionBrief {
  brief_id: string;
  created_at: number;
  status: "pending" | "approved" | "dismissed";
  trigger: {
    corridor: string;
    corridor_name: string;
    cdp: number;
    band: string;
    lead_time_hours: [number, number] | null;
    top_factors: FactorContribution[];
  };
  scenario: ScenarioImpact;
  procurement: ProcurementPlan;
  spr: SPRSchedule | null;
  narrative: string;
  narrative_source: string;
  economics?: {
    inr_per_usd: number;
    fx_source: string;
    cost_of_inaction_usd_mn_day: number;
    cost_of_inaction_inr_crore_day: number;
    plan_premium_usd_mn_day: number;
    plan_premium_inr_crore_day: number;
    note: string;
  };
  elapsed_s: number;
  audit?: Record<string, unknown>;
}

export interface StageEvent {
  stage: "oracle" | "navigator" | "custodian" | "brief";
  status: "running" | "done";
  t: number;
}

export interface EconomicsTicker {
  import_volume_kbd: number;
  import_bill_usd_mn_day: number;
  import_bill_inr_crore_day: number;
  inr_per_usd: number;
  fx_source: string;
  fx_date: string | null;
}

export interface SystemStatus {
  model_version: string;
  brent_usd: number;
  brent_source: string;
  economics?: EconomicsTicker;
  feeds: Record<string, string>;
  alert_threshold: number;
  signals_seen: number;
}

export interface ShockCalibration {
  calibration: {
    series: string;
    years: number;
    episodes: number;
    median_shock_pct: number | null;
    max_shock_pct: number | null;
    note: string;
  } | Record<string, never>;
  all_moves_pct: number[];
  recent: Array<{ start: string; end: string; from_usd: number; to_usd: number; move_pct: number }>;
}

export interface CorridorWeather {
  max_wave_m: number;
  delay_factor: number;
  updated: number;
}

export type TwinGeoJSON = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry:
      | { type: "LineString"; coordinates: [number, number][] }
      | { type: "Point"; coordinates: [number, number] };
    properties: Record<string, any>;
  }>;
};
