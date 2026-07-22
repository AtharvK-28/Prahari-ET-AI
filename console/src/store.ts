// PRAHARI — zustand store + WebSocket wiring
import { create } from "zustand";
import { api, WS_URL } from "./lib/api";
import type {
  CorridorState, CorridorWeather, DecisionBrief, ProcurementPlan,
  ScenarioImpact, ShockCalibration, Signal, SPRSchedule, SystemStatus,
  TwinGeoJSON,
} from "./lib/types";

interface Stage {
  stage: string;
  status: "running" | "done";
  t: number;
}

interface PrahariState {
  status: SystemStatus | null;
  twin: TwinGeoJSON | null;
  corridors: Record<string, CorridorState>;
  signals: Signal[];
  vessels: any[];
  selectedCorridor: string | null;
  scenario: ScenarioImpact | null;
  plan: ProcurementPlan | null;
  spr: SPRSchedule | null;
  brief: DecisionBrief | null;
  briefOpen: boolean;
  stages: Stage[];
  loopRunning: boolean;
  loopStarted: number | null;
  loopElapsed: number;
  tab: "risk" | "scenario" | "plan";
  view: "overview" | "sentinel" | "oracle" | "action";
  wsConnected: boolean;
  calibration: ShockCalibration | null;
  weather: Record<string, CorridorWeather>;
  voiceEnabled: boolean;
  replaying: boolean;
  manualLoop: boolean;   // modal auto-opens only for user-fired loops
  xray: string | null;   // corridor whose CDP X-ray waterfall is open

  boot: () => Promise<void>;
  select: (id: string | null) => void;
  setXray: (id: string | null) => void;
  setTab: (tab: "risk" | "scenario" | "plan") => void;
  setView: (view: "overview" | "sentinel" | "oracle" | "action") => void;
  setScenario: (s: ScenarioImpact) => void;
  setPlan: (p: ProcurementPlan) => void;
  setSpr: (s: SPRSchedule) => void;
  fireTrigger: () => Promise<void>;
  fireStorm: () => Promise<void>;
  decide: (approve: boolean) => Promise<void>;
  setBriefOpen: (open: boolean) => void;
  toggleVoice: () => void;
  playReplay: () => Promise<void>;
}

/** speak a short computed summary — Web Speech API, no deps, no invented numbers */
export function speak(text: string) {
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.04;
    u.pitch = 0.95;
    window.speechSynthesis.speak(u);
  } catch { /* unsupported browser — silent */ }
}

export const useStore = create<PrahariState>((set, get) => ({
  status: null,
  twin: null,
  corridors: {},
  signals: [],
  vessels: [],
  selectedCorridor: null,
  scenario: null,
  plan: null,
  spr: null,
  brief: null,
  briefOpen: false,
  stages: [],
  loopRunning: false,
  loopStarted: null,
  loopElapsed: 0,
  tab: "risk",
  view: "overview",
  wsConnected: false,
  calibration: null,
  weather: {},
  voiceEnabled: false,
  replaying: false,
  manualLoop: false,
  xray: null,

  boot: async () => {
    const [status, twin, corridorsRes, recent] = await Promise.all([
      api.status(), api.twin(), api.corridors(), api.recentSignals(),
    ]);
    const corridors: Record<string, CorridorState> = {};
    corridorsRes.corridors.forEach((c) => (corridors[c.corridor_id] = c));
    set({ status, twin, corridors, signals: recent.signals.slice().reverse() });
    connectWS(set, get);
    // calibration + weather warm up server-side; retry until present
    const loadAux = async () => {
      try {
        const [cal, w] = await Promise.all([api.calibration(), api.weather()]);
        set({ calibration: cal, weather: w.corridors });
        if (!cal.all_moves_pct?.length) setTimeout(loadAux, 15000);
      } catch { setTimeout(loadAux, 15000); }
    };
    loadAux();
    // periodic refresh of status + vessels (AIS overlay) + weather
    setInterval(async () => {
      try {
        const [s, v, w] = await Promise.all([api.status(), api.vessels(), api.weather()]);
        set({ status: s, vessels: v.vessels, weather: w.corridors });
      } catch { /* backend briefly away — keep last state (NFR4) */ }
    }, 30000);
    // loop timer tick
    setInterval(() => {
      const { loopRunning, loopStarted } = get();
      if (loopRunning && loopStarted)
        set({ loopElapsed: (Date.now() - loopStarted) / 1000 });
    }, 100);
  },

  select: (id) => set({ selectedCorridor: id }),
  setXray: (xray) => set({ xray }),
  setTab: (tab) => set({ tab }),
  setView: (view) => set({ view }),
  setScenario: (scenario) => set({ scenario }),
  setPlan: (plan) => set({ plan }),
  setSpr: (spr) => set({ spr }),

  fireTrigger: async () => {
    set({ loopRunning: true, loopStarted: Date.now(), loopElapsed: 0, stages: [],
          brief: null, briefOpen: false, manualLoop: true });
    try {
      await api.trigger();
    } catch {
      set({ loopRunning: false });
    }
  },

  fireStorm: async () => {
    set({ loopRunning: true, loopStarted: Date.now(), loopElapsed: 0, stages: [],
          brief: null, briefOpen: false, manualLoop: true });
    try {
      await api.perfectStorm();
    } catch {
      set({ loopRunning: false });
    }
  },

  decide: async (approve) => {
    const { brief } = get();
    if (!brief) return;
    const updated = await api.decide(brief.brief_id, approve);
    set({ brief: updated });
  },

  setBriefOpen: (briefOpen) => set({ briefOpen }),

  toggleVoice: () => {
    const on = !get().voiceEnabled;
    set({ voiceEnabled: on });
    if (on) speak("PRAHARI voice briefing enabled.");
    else window.speechSynthesis?.cancel();
  },

  playReplay: async () => {
    if (get().replaying) return;
    set({ replaying: true });
    try {
      const { windows } = await (await fetch(
        (import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000") + "/replay/windows")).json();
      // prefer the curated real window, else the newest recording
      const file = windows.find((w: string) => w.startsWith("real_window")) ?? windows.at(-1);
      if (!file) return;
      await fetch((import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000") + "/replay/play", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ file, speed: 40 }),
      });
    } finally {
      set({ replaying: false });
    }
  },
}));

function connectWS(set: any, get: any) {
  const ws = new WebSocket(WS_URL);
  ws.onopen = () => {
    set({ wsConnected: true });
    setInterval(() => ws.readyState === 1 && ws.send("ping"), 20000);
  };
  ws.onclose = () => {
    set({ wsConnected: false });
    setTimeout(() => connectWS(set, get), 3000);
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    switch (msg.event) {
      case "signal":
        set((st: PrahariState) => ({ signals: [msg.signal, ...st.signals].slice(0, 80) }));
        break;
      case "cdp_update":
        set((st: PrahariState) => ({
          corridors: { ...st.corridors, [msg.state.corridor_id]: msg.state },
        }));
        break;
      case "loop_started":
        set({ loopRunning: true, loopStarted: get().loopStarted ?? Date.now(), stages: [] });
        break;
      case "stage": {
        const stages = [...get().stages.filter((s: Stage) => s.stage !== msg.stage),
          { stage: msg.stage, status: msg.status, t: msg.t }];
        const patch: any = { stages };
        if (msg.impact) patch.scenario = msg.impact;
        if (msg.plan) patch.plan = msg.plan;
        if (msg.spr) patch.spr = msg.spr;
        set(patch);
        break;
      }
      case "brief_ready": {
        // auto-triggered loops announce quietly (BRIEF button + voice);
        // only a user-fired trigger pops the modal
        set({ brief: msg.brief, briefOpen: get().manualLoop,
              loopRunning: false, manualLoop: false });
        // refresh the ₹ import-bill ticker right away (demo spike moved Brent)
        api.status().then((s) => set({ status: s })).catch(() => {});
        if (get().voiceEnabled) {
          const b = msg.brief;
          const s = b.scenario;
          const best = b.procurement?.ranked?.find((a: any) => a.allocated_kbd > 0);
          speak(
            `PRAHARI alert. Corridor disruption probability ${(b.trigger.cdp * 100).toFixed(0)} percent, ` +
            `${b.trigger.band}, on ${b.trigger.corridor_name}. ` +
            `${s.imports_at_risk_pct} percent of imports at risk. ` +
            `Days of cover falls to ${s.days_of_cover.toFixed(1)}. ` +
            (best ? `Recommended reroute: ${best.allocated_kbd} thousand barrels per day of ${best.grade} from ${best.supplier}. ` : "") +
            `Decision brief ready. Awaiting authorization.`
          );
        }
        break;
      }
    }
  };
}
