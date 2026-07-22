// PRAHARI — Action Center: Navigator route ranking + Custodian SPR + authorization
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store";
import DecisionLedger from "../components/DecisionLedger";
import type { Alternative } from "../lib/types";

const MMT_TO_MBBL = 7.33;

/** current strategic reserve posture — from the twin's SPR sites */
function ReservePosture() {
  const twin = useStore((s) => s.twin);
  const sites = (twin?.features ?? []).filter((f) => f.properties.kind === "spr");
  if (!sites.length) return null;
  const capMbbl = sites.reduce((a, f) => a + f.properties.capacity_mmt * MMT_TO_MBBL, 0);
  const fillMbbl = sites.reduce(
    (a, f) => a + f.properties.capacity_mmt * (f.properties.fill_pct / 100) * MMT_TO_MBBL, 0);
  return (
    <div className="intel-card">
      <div className="intel-head">
        <span>🛢 RESERVE POSTURE</span>
        <span className="hint">{fillMbbl.toFixed(1)} / {capMbbl.toFixed(1)} Mbbl</span>
      </div>
      {sites.map((f) => (
        <div key={f.properties.id} className="posture-row"
          title={`${f.properties.name} — ${f.properties.capacity_mmt} MMT capacity, ${f.properties.fill_pct}% filled`}>
          <span className="posture-name">{f.properties.name}</span>
          <div className="posture-bar">
            <div className="posture-fill" style={{ width: `${f.properties.fill_pct}%` }} />
          </div>
          <span className="posture-pct mono">{f.properties.fill_pct}%</span>
        </div>
      ))}
      <div className="detail-note">
        Custodian draws against this inventory — floor is a hard constraint, never breached
      </div>
    </div>
  );
}

function chip(a: Alternative, rank: number): { label: string; cls: string } {
  if (!a.feasible) return { label: "EXCLUDED", cls: "chip-risk" };
  if (a.allocated_kbd > 0 && rank === 0) return { label: "OPTIMAL", cls: "chip-optimal" };
  if (a.allocated_kbd > 0) return { label: "ALLOCATED", cls: "chip-allocated" };
  return { label: "VIABLE", cls: "chip-viable" };
}

export default function ActionView() {
  const plan = useStore((s) => s.plan);
  const spr = useStore((s) => s.spr);
  const brief = useStore((s) => s.brief);
  const setPlan = useStore((s) => s.setPlan);
  const setSpr = useStore((s) => s.setSpr);
  const decide = useStore((s) => s.decide);
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

  // ambient posture: optimise against current conditions on first open (pure
  // computation), so the tables never sit empty waiting for a crisis
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || plan || spr) return;
    autoRan.current = true;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="view view-action">
      <div className="action-main">
        <div className="action-header">
          <div>
            <h2>Execution &amp; Reserve Management</h2>
            <span className="panel-sub">
              live telemetry and authoritative action interface for crude routing and SPR drawdown
            </span>
          </div>
          <div className="action-params">
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
              λ risk aversion <b>{lambda.toFixed(2)}</b>
              <input type="range" min={0} max={0.5} step={0.05} value={lambda}
                onChange={(e) => setLambda(+e.target.value)} />
            </label>
            <button className="btn-run" onClick={run} disabled={busy}>
              {busy ? "OPTIMISING…" : "OPTIMISE"}
            </button>
          </div>
        </div>

        <div className="intel-card">
          <div className="intel-head">
            <span>🧭 NAVIGATOR ROUTE RANKING</span>
            {plan && <span className="hint">
              {plan.filled_kbd}/{plan.gap_kbd} kbd covered · {plan.computed_in_ms}ms
            </span>}
          </div>
          {!plan ? (
            <div className="intel-empty">run the optimiser or trigger the demo loop</div>
          ) : (
            <table className="route-table">
              <thead>
                <tr>
                  <th>SOURCE / ROUTE</th><th>RELIABILITY</th><th>LANDED</th>
                  <th>ETA</th><th>RISK</th><th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {[...plan.ranked.filter((a) => a.feasible), ...plan.excluded].map((a, i) => {
                  const c = chip(a, i);
                  return (
                    <tr key={a.id} className={a.feasible ? "" : "route-excluded"}
                      title={a.exclusion_reason ?? `${a.grade_category} · yield penalty ${(a.yield_penalty * 100).toFixed(0)}% · reliability source: ${a.reliability_source}`}>
                      <td>
                        <div className="route-name">{a.grade} · {a.supplier}
                          {a.reliability_source === "eia_derived" && <em className="eia-tag">EIA</em>}
                        </div>
                        <div className="route-sub">{a.corridor_name}
                          {a.allocated_kbd > 0 && <b className="route-alloc"> — {a.allocated_kbd} kbd</b>}
                        </div>
                      </td>
                      <td>
                        <div className="rel-cell">
                          <div className="rel-bar">
                            <div className={`rel-fill ${a.supplier_reliability < 0.7 ? "rel-low" : ""}`}
                              style={{ width: `${a.supplier_reliability * 100}%` }} />
                          </div>
                          <span className="mono">{a.supplier_reliability.toFixed(2)}</span>
                        </div>
                      </td>
                      <td className="mono">${a.landed_cost_usd}</td>
                      <td className="mono">
                        {a.eta_days}d
                        {a.weather_delay_factor > 1 && (
                          <span className="weather-tag" title={`sea state ${a.max_wave_m} m`}> 🌊×{a.weather_delay_factor}</span>
                        )}
                      </td>
                      <td className={`mono ${a.corridor_risk > 0.5 ? "risk-hot" : ""}`}>{a.corridor_risk.toFixed(2)}</td>
                      <td><span className={`chip ${c.cls}`}>{c.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {plan && plan.excluded.length > 0 && (
            <div className="excluded-note">
              excluded rows carry their reason on hover — hard constraints, never silent drops
            </div>
          )}
        </div>

        <div className="intel-card">
          <div className="intel-head">
            <span>🛢 CUSTODIAN SPR MANAGER</span>
            {spr && (
              <span className={spr.floor_respected ? "grade-ok" : "risk-hot"}>
                floor {spr.reserve_floor_pct}% {spr.floor_respected ? "respected ✓" : "BREACHED ✗"}
              </span>
            )}
          </div>
          {!spr ? (
            <div className="intel-empty">no drawdown schedule yet</div>
          ) : (
            <div className="spr-grid">
              <div className="spr-stats">
                <div className="spr-stat">
                  <b>{spr.total_release_mbbl}</b><span>Mbbl total release</span>
                </div>
                <div className="spr-stat">
                  <b>{spr.days_bridged}</b><span>days fully bridged</span>
                </div>
                <div className="spr-stat">
                  <b>{spr.schedule[spr.schedule.length - 1]?.reserve_pct}%</b>
                  <span>reserve at horizon</span>
                </div>
              </div>
              <div>
                <div className="spr-chart">
                  {spr.schedule.filter((_, i) => i % 2 === 0).map((d) => (
                    <div key={d.day} className="spr-col"
                      title={`day ${d.day}: release ${d.release_kbd} kbd · reserve ${d.reserve_pct}%`}>
                      <div className="spr-release" style={{ height: `${(d.release_kbd / 600) * 26}px` }} />
                      <div className="spr-reserve" style={{ height: `${d.reserve_pct * 0.22}px` }} />
                    </div>
                  ))}
                </div>
                <div className="spr-legend">
                  <span><i className="spr-i-release" /> daily release</span>
                  <span><i className="spr-i-reserve" /> reserve %</span>
                  <span className="spr-floor-note">— floor is a hard constraint</span>
                </div>
                <p className="spr-rationale">{spr.rationale}</p>
                <p className="spr-replenish">↻ {spr.replenish_window}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="action-rail">
        <div className="intel-card terminal">
          <div className="intel-head"><span>📋 DECISION BRIEF</span>
            {brief && <span className={`brief-status brief-${brief.status}`}>{brief.status}</span>}
          </div>
          {!brief ? (
            <div className="intel-empty">
              the Supervisor composes a brief when CDP crosses the threshold or on demo trigger
            </div>
          ) : (
            <pre className="terminal-body">{brief.narrative}</pre>
          )}
        </div>
        {brief && (
          <div className="intel-card auth-card">
            <div className="intel-head"><span>FINAL AUTHORIZATION</span></div>
            {brief.status === "pending" ? (
              <>
                <button className="btn-authorize" onClick={() => decide(true)}>
                  ◉ AUTHORIZE EXECUTION
                </button>
                <button className="btn-dismiss-full" onClick={() => decide(false)}>
                  Dismiss Recommendation
                </button>
                <div className="auth-note">
                  human-in-the-loop: nothing executes without this click · decision is audit-logged
                </div>
              </>
            ) : (
              <div className="auth-done">
                decision recorded: <b>{brief.status.toUpperCase()}</b> · loop {brief.elapsed_s}s ·
                orchestrator {String((brief as any).audit?.orchestrator ?? "langgraph")}
              </div>
            )}
          </div>
        )}
        <ReservePosture />
        <DecisionLedger />
      </div>
    </div>
  );
}
