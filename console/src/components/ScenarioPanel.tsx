// PRAHARI — scenario sandbox: presets + what-if slider + editable assumptions
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store";
import ImpactView from "./ImpactView";
import ShockCalibration from "./ShockCalibration";

export default function ScenarioPanel() {
  const scenario = useStore((s) => s.scenario);
  const setScenario = useStore((s) => s.setScenario);
  const [presets, setPresets] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  // free-form what-if
  const [chokepoint, setChokepoint] = useState("hormuz");
  const [cut, setCut] = useState(50);
  const [duration, setDuration] = useState(30);
  // editable assumptions (PRD B2)
  const [elasticity, setElasticity] = useState(0.08);
  const [stockDays, setStockDays] = useState(12);
  const [substitutability, setSubstitutability] = useState(0.65);

  useEffect(() => {
    api.scenarioPresets().then((r) => setPresets(r.presets)).catch(() => {});
  }, []);

  const run = async (req: any) => {
    setBusy(true);
    try {
      setScenario(await api.runScenario(req));
    } finally {
      setBusy(false);
    }
  };

  const runCustom = () =>
    run({
      kind: "chokepoint_cut", chokepoint, cut_pct: cut, duration_days: duration,
      supply_elasticity: elasticity, commercial_stock_days: stockDays,
      substitutability,
    });

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Scenario Sandbox</h2>
        <span className="panel-sub">Oracle · graph propagation + Monte-Carlo band</span>
      </div>

      <div className="preset-row">
        {Object.entries(presets).map(([id, p]) => (
          <button key={id} className="btn-preset" disabled={busy}
            onClick={() => run(p.kind === "supply_cut"
              ? { kind: "supply_cut", volume_kbd: p.volume_kbd, duration_days: p.duration_days, cut_pct: 0 }
              : { kind: "chokepoint_cut", chokepoint: p.chokepoint, cut_pct: p.cut_pct, duration_days: p.duration_days })}>
            {p.name}
          </button>
        ))}
      </div>

      <div className="whatif">
        <h3>What-if</h3>
        <label>
          chokepoint
          <select value={chokepoint} onChange={(e) => setChokepoint(e.target.value)}>
            <option value="hormuz">Hormuz</option>
            <option value="bab_el_mandeb">Bab el-Mandeb</option>
            <option value="suez">Suez</option>
            <option value="malacca">Malacca</option>
          </select>
        </label>
        <label>
          throughput cut <b>{cut}%</b>
          <input type="range" min={0} max={100} step={5} value={cut}
            onChange={(e) => setCut(+e.target.value)} />
        </label>
        <label>
          duration <b>{duration}d</b>
          <input type="range" min={5} max={90} step={5} value={duration}
            onChange={(e) => setDuration(+e.target.value)} />
        </label>

        <h3>Assumptions <span className="hint">(editable — model is testable)</span></h3>
        <label>
          supply elasticity <b>{elasticity.toFixed(2)}</b>
          <input type="range" min={0.03} max={0.15} step={0.01} value={elasticity}
            onChange={(e) => setElasticity(+e.target.value)} />
        </label>
        <label>
          commercial stock <b>{stockDays}d</b>
          <input type="range" min={8} max={18} step={1} value={stockDays}
            onChange={(e) => setStockDays(+e.target.value)} />
        </label>
        <label>
          grade substitutability <b>{(substitutability * 100).toFixed(0)}%</b>
          <input type="range" min={0.3} max={0.9} step={0.05} value={substitutability}
            onChange={(e) => setSubstitutability(+e.target.value)} />
        </label>
        <button className="btn-run" onClick={runCustom} disabled={busy}>
          {busy ? "propagating…" : "Run scenario"}
        </button>
      </div>

      {scenario && (
        <>
          <ImpactView impact={scenario} />
          <ShockCalibration currentPct={scenario.brent_delta_pct} />
        </>
      )}
    </div>
  );
}
