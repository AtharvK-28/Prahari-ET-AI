// PRAHARI — REST client
const BASE = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

export const api = {
  status: () => get<import("./types").SystemStatus>("/status"),
  corridors: () => get<{ corridors: import("./types").CorridorState[] }>("/corridors"),
  explain: (id: string) => get<any>(`/corridors/${id}/explain`),
  twin: () => get<import("./types").TwinGeoJSON>("/twin"),
  vessels: () => get<{ vessels: any[] }>("/vessels"),
  recentSignals: () => get<{ signals: import("./types").Signal[] }>("/signals/recent"),
  scenarioPresets: () => get<{ presets: Record<string, any> }>("/scenario/presets"),
  runScenario: (req: unknown) => post<import("./types").ScenarioImpact>("/scenario/run", req),
  whatIf: (req: unknown) => post<import("./types").ScenarioImpact>("/scenario/whatif", req),
  optimize: (req: unknown) => post<import("./types").ProcurementPlan>("/procurement/optimize", req),
  spr: (req: unknown) => post<import("./types").SPRSchedule>("/spr/optimize", req),
  calibration: () => get<import("./types").ShockCalibration>("/calibration/shocks"),
  weather: () => get<{ corridors: Record<string, import("./types").CorridorWeather> }>("/weather"),
  trigger: () => post<{ brief_id: string; elapsed_s: number }>("/supervisor/trigger", {}),
  perfectStorm: () =>
    post<{ brief_id: string; elapsed_s: number; storm: boolean }>("/supervisor/perfect_storm", {}),
  brief: (id: string) => get<import("./types").DecisionBrief>(`/brief/${id}`),
  decide: (id: string, approve: boolean) =>
    post<import("./types").DecisionBrief>(`/brief/${id}/approve`, { approve }),
};

export const WS_URL = BASE.replace(/^http/, "ws") + "/stream/signals";
