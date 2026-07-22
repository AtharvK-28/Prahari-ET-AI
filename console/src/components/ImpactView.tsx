// PRAHARI — India-specific impact panel (Oracle output)
import type { ScenarioImpact } from "../lib/types";

function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className={`stat ${warn ? "stat-warn" : ""}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export default function ImpactView({ impact }: { impact: ScenarioImpact }) {
  const cov = impact.uncertainty["days_of_cover"];
  const brent = impact.uncertainty["brent_delta_pct"];
  return (
    <div className="impact">
      <div className="impact-head">
        <h3>India-specific impact</h3>
        <span className="hint">computed in {impact.computed_in_ms}ms · P10–P90 bands from {" "}Monte-Carlo</span>
      </div>
      <div className="stat-grid">
        <Stat label="imports at risk" value={`${impact.imports_at_risk_pct}%`}
          sub={`${impact.supply_loss_kbd.toLocaleString()} kbd`} warn={impact.imports_at_risk_pct > 15} />
        <Stat label="days of cover" value={impact.days_of_cover.toFixed(1)}
          sub={`from ${impact.days_of_cover_baseline.toFixed(1)} · band ${cov?.[0]}–${cov?.[1]}`}
          warn={impact.days_of_cover < 10} />
        <Stat label="Brent" value={`+${impact.brent_delta_pct}%`}
          sub={`→ $${impact.brent_projected_usd} · band +${brent?.[0]}–${brent?.[1]}%`}
          warn={impact.brent_delta_pct > 10} />
        <Stat label="basket premium" value={`$${impact.india_basket_premium_usd}`} sub="vs Brent baseline" />
        <Stat label="import-bill shock" value={`$${impact.import_bill_shock_usd_bn}bn`}
          sub={`${impact.import_bill_shock_pct_gdp}% of GDP`} warn={impact.import_bill_shock_usd_bn > 2} />
        <Stat label="power stress" value={impact.power_stress_index.toFixed(2)}
          sub="diesel-exposed load index" warn={impact.power_stress_index > 0.3} />
      </div>

      <h4>Refinery run-rate impact</h4>
      <div className="refinery-list">
        {impact.refineries.slice(0, 8).map((r) => (
          <div key={r.id} className="refinery-row">
            <span className="refinery-name">{r.name}</span>
            <div className="refinery-bar">
              <div className="refinery-fill"
                style={{ width: `${Math.min(Math.abs(r.runrate_impact_pct) * 3, 100)}%` }} />
            </div>
            <span className="refinery-num">{r.runrate_impact_pct}%</span>
          </div>
        ))}
      </div>

      <div className="assumptions">
        assumptions: elasticity {impact.assumptions.supply_elasticity} · commercial stock{" "}
        {impact.assumptions.commercial_stock_days}d · substitutability{" "}
        {impact.assumptions.substitutability} — all editable above
      </div>
    </div>
  );
}
