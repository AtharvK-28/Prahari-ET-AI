// PRAHARI — Simulation (Oracle): shock injector + telemetry + terminal narrative
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store";
import ImpactView from "../components/ImpactView";
import ShockCalibration from "../components/ShockCalibration";

export default function OracleView() {
  const scenario = useStore((s) => s.scenario);
  const setScenario = useStore((s) => s.setScenario);
  const brief = useStore((s) => s.brief);
  const [presets, setPresets] = useState<Record<string, any>>({});
  const [preset, setPreset] = useState<string>("hormuz_50");
  const [busy, setBusy] = useState(false);
  const [chokepoint, setChokepoint] = useState("hormuz");
  const [cut, setCut] = useState(50);
  const [duration, setDuration] = useState(30);
  const [elasticity, setElasticity] = useState(0.08);
  const [stockDays, setStockDays] = useState(12);
  const [substitutability, setSubstitutability] = useState(0.65);

  useEffect(() => {
    api.scenarioPresets().then((r) => setPresets(r.presets)).catch(() => {});
  }, []);

  useEffect(() => {
    const p = presets[preset];
    if (p?.kind === "chokepoint_cut") {
      setChokepoint(p.chokepoint);
      setCut(p.cut_pct);
      setDuration(p.duration_days);
    }
  }, [preset, presets]);

  const inject = async () => {
    setBusy(true);
    try {
      const p = presets[preset];
      const req = p?.kind === "supply_cut"
        ? { kind: "supply_cut", volume_kbd: p.volume_kbd, duration_days: duration, cut_pct: 0,
            supply_elasticity: elasticity, commercial_stock_days: stockDays, substitutability }
        : { kind: "chokepoint_cut", chokepoint, cut_pct: cut, duration_days: duration,
            supply_elasticity: elasticity, commercial_stock_days: stockDays, substitutability };
      setScenario(await api.runScenario(req));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="view view-oracle">
      <div className="oracle-controls">
        <div className="intel-card">
          <div className="intel-head"><span>⚡ SHOCK IMPACT SIMULATOR</span></div>
          <label className="ctl">
            DISRUPTION VECTOR
            <select value={preset} onChange={(e) => setPreset(e.target.value)}>
              {Object.entries(presets).map(([id, p]) => (
                <option key={id} value={id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label className="ctl">
            CHOKEPOINT
            <select value={chokepoint} onChange={(e) => setChokepoint(e.target.value)}>
              <option value="hormuz">Strait of Hormuz</option>
              <option value="bab_el_mandeb">Bab el-Mandeb</option>
              <option value="suez">Suez Canal</option>
              <option value="malacca">Strait of Malacca</option>
            </select>
          </label>
          <label className="ctl">
            INTENSITY — THROUGHPUT CUT <b>{cut}%</b>
            <input type="range" min={0} max={100} step={5} value={cut}
              onChange={(e) => setCut(+e.target.value)} />
          </label>
          <label className="ctl">
            DURATION <b>{duration}d</b>
            <input type="range" min={5} max={90} step={5} value={duration}
              onChange={(e) => setDuration(+e.target.value)} />
          </label>
          <button className="btn-inject" onClick={inject} disabled={busy}>
            {busy ? "PROPAGATING…" : "INJECT DISRUPTION"}
          </button>
        </div>

        <div className="intel-card">
          <div className="intel-head">
            <span>⚙ MODEL ASSUMPTIONS</span>
            <span className="hint">editable — the model is testable</span>
          </div>
          <label className="ctl">
            SUPPLY ELASTICITY <b>{elasticity.toFixed(2)}</b>
            <input type="range" min={0.03} max={0.15} step={0.01} value={elasticity}
              onChange={(e) => setElasticity(+e.target.value)} />
          </label>
          <label className="ctl">
            COMMERCIAL STOCK <b>{stockDays}d</b>
            <input type="range" min={8} max={18} step={1} value={stockDays}
              onChange={(e) => setStockDays(+e.target.value)} />
          </label>
          <label className="ctl">
            GRADE SUBSTITUTABILITY <b>{(substitutability * 100).toFixed(0)}%</b>
            <input type="range" min={0.3} max={0.9} step={0.05} value={substitutability}
              onChange={(e) => setSubstitutability(+e.target.value)} />
          </label>
        </div>

        {scenario && <ShockCalibration currentPct={scenario.brent_delta_pct} />}
      </div>

      <div className="oracle-main">
        {scenario ? (
          <>
            <ImpactView impact={scenario} />
            <div className="intel-card terminal">
              <div className="intel-head"><span>🖥 AI NARRATIVE BRIEF</span>
                <span className="hint">narrates computed values only — invents nothing</span>
              </div>
              <pre className="terminal-body">
                {brief
                  ? brief.narrative
                  : `> ORACLE PROPAGATION COMPLETE (${scenario.computed_in_ms}ms)
> VECTOR: ${String(scenario.event.chokepoint ?? "supply_cut").toUpperCase()} -${scenario.event.cut_pct}% / ${scenario.event.duration_days}d
> IMPACT: ${scenario.imports_at_risk_pct}% of imports at risk (${scenario.supply_loss_kbd} kbd).
> Days of cover ${scenario.days_of_cover_baseline.toFixed(1)} -> ${scenario.days_of_cover.toFixed(1)} (P10-P90 ${scenario.uncertainty.days_of_cover?.[0]}-${scenario.uncertainty.days_of_cover?.[1]}).
> Brent +${scenario.brent_delta_pct}% -> $${scenario.brent_projected_usd}. Import bill +$${scenario.import_bill_shock_usd_bn}bn (${scenario.import_bill_shock_pct_gdp}% GDP).
> Full supervisor brief composes when the loop runs (Trigger Demo Signal).`}
              </pre>
            </div>
          </>
        ) : (
          <div className="oracle-placeholder">
            <div className="oracle-placeholder-mark">☉</div>
            select a disruption vector and INJECT DISRUPTION —<br />
            the Oracle propagates it through the knowledge graph in ~100 ms
          </div>
        )}
      </div>
    </div>
  );
}
