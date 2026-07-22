// PRAHARI — Navigator reroute ranking + Custodian SPR schedule
import { useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store";

export default function PlanPanel() {
  const plan = useStore((s) => s.plan);
  const spr = useStore((s) => s.spr);
  const setPlan = useStore((s) => s.setPlan);
  const setSpr = useStore((s) => s.setSpr);
  const [refinery, setRefinery] = useState("jamnagar");
  const [gap, setGap] = useState(600);
  const [lambda, setLambda] = useState(0.15);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const [p, s] = await Promise.all([
        api.optimize({ refinery_id: refinery, gap_kbd: gap, risk_aversion_lambda: lambda }),
        api.spr({ gap_kbd: gap * 0.6, duration_days: 30 }),
      ]);
      setPlan(p);
      setSpr(s);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Procurement & Reserve</h2>
        <span className="panel-sub">Navigator ranking + Custodian drawdown</span>
      </div>

      <div className="plan-controls">
        <label>
          refinery
          <select value={refinery} onChange={(e) => setRefinery(e.target.value)}>
            {["jamnagar", "vadinar", "mangalore", "kochi", "paradip", "visakh", "koyali", "panipat"]
              .map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label>
          gap <b>{gap} kbd</b>
          <input type="range" min={100} max={1500} step={50} value={gap}
            onChange={(e) => setGap(+e.target.value)} />
        </label>
        <label>
          risk aversion λ <b>{lambda.toFixed(2)}</b>
          <input type="range" min={0} max={0.5} step={0.05} value={lambda}
            onChange={(e) => setLambda(+e.target.value)} />
        </label>
        <button className="btn-run" onClick={run} disabled={busy}>
          {busy ? "optimising…" : "Optimise reroute + SPR"}
        </button>
      </div>

      {plan && (
        <>
          <h3>
            Ranked alternatives — {plan.filled_kbd}/{plan.gap_kbd} kbd covered
            <span className="hint"> · {plan.computed_in_ms}ms</span>
          </h3>
          {plan.ranked.filter((a) => a.feasible).map((a, i) => (
            <div key={a.id} className={`alt-card ${a.allocated_kbd > 0 ? "alt-active" : ""}`}>
              <div className="alt-rank">#{i + 1}</div>
              <div className="alt-body">
                <div className="alt-title">
                  {a.grade} · {a.supplier}
                  {a.allocated_kbd > 0 && <span className="alt-alloc">{a.allocated_kbd} kbd</span>}
                </div>
                <div className="alt-route">{a.corridor_name}</div>
                <div className="alt-meta">
                  <span>💰 ${a.landed_cost_usd}/bbl</span>
                  <span>🕐 {a.eta_days}d ETA</span>
                  <span className={a.corridor_risk > 0.5 ? "risk-hot" : ""}>⚠ risk {a.corridor_risk}</span>
                  <span className="grade-ok">✓ grade fit ({(a.yield_penalty * 100).toFixed(0)}% penalty)</span>
                  <span className={a.supplier_reliability < 0.7 ? "risk-hot" : ""}
                    title={a.reliability_source === "eia_derived"
                      ? "flow-stability derived from EIA monthly import data"
                      : "seed estimate (to-verify)"}>
                    ⛴ reliability {a.supplier_reliability}
                    {a.reliability_source === "eia_derived" && <em className="eia-tag">EIA</em>}
                  </span>
                </div>
              </div>
            </div>
          ))}
          {plan.excluded.length > 0 && (
            <div className="excluded">
              <h4>Excluded (hard constraints)</h4>
              {plan.excluded.map((a) => (
                <div key={a.id} className="excluded-row">
                  <span>{a.grade} · {a.supplier}</span>
                  <span className="excluded-reason">{a.exclusion_reason}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {spr && (
        <div className="spr-block">
          <h3>SPR drawdown — {spr.total_release_mbbl} Mbbl total</h3>
          <div className="spr-meta">
            <span className={spr.floor_respected ? "grade-ok" : "risk-hot"}>
              {spr.floor_respected ? "✓" : "✗"} floor {spr.reserve_floor_pct}% respected
            </span>
            <span>{spr.days_bridged} days fully bridged</span>
          </div>
          <div className="spr-chart">
            {spr.schedule.filter((_, i) => i % 2 === 0).map((d) => (
              <div key={d.day} className="spr-col" title={`day ${d.day}: release ${d.release_kbd} kbd, reserve ${d.reserve_pct}%`}>
                <div className="spr-release" style={{ height: `${(d.release_kbd / 600) * 46}px` }} />
                <div className="spr-reserve" style={{ height: `${d.reserve_pct * 0.46}px` }} />
              </div>
            ))}
          </div>
          <div className="spr-legend">
            <span><i className="spr-i-release" /> daily release</span>
            <span><i className="spr-i-reserve" /> reserve %</span>
          </div>
          <p className="spr-rationale">{spr.rationale}</p>
          <p className="spr-replenish">↻ {spr.replenish_window}</p>
        </div>
      )}
    </div>
  );
}
