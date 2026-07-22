// PRAHARI — one-page decision brief with approve/dismiss (PRD E2)
// + print-styled export: a clean paper document a ministry desk could file.
import { createPortal } from "react-dom";
import { useStore } from "../store";
import type { DecisionBrief } from "../lib/types";

/** print-only rendition — hidden on screen, the ONLY thing visible on print */
function BriefPrint({ brief }: { brief: DecisionBrief }) {
  const s = brief.scenario;
  const econ = brief.economics;
  const allocated = brief.procurement.ranked.filter((a) => a.allocated_kbd > 0);
  const audit = brief.audit as Record<string, any> | undefined;

  return createPortal(
    <div className="brief-print">
      <div className="bp-banner">
        SYNTHETIC DECISION-SUPPORT EXERCISE — NOT AN OFFICIAL GOVERNMENT DOCUMENT
      </div>
      <div className="bp-head">
        <div className="bp-org">PRAHARI · Predictive Risk &amp; Adaptive Hydrocarbon
          Agentic Response Intelligence</div>
        <h1>DECISION BRIEF</h1>
        <div className="bp-sub">Prepared for: Secretary, Ministry of Petroleum &amp;
          Natural Gas (exercise addressee)</div>
      </div>

      <table className="bp-meta">
        <tbody>
          <tr><td>Brief ID</td><td>{brief.brief_id}</td>
              <td>Generated</td><td>{new Date(brief.created_at * 1000).toLocaleString("en-IN")}</td></tr>
          <tr><td>Trigger corridor</td><td>{brief.trigger.corridor_name}</td>
              <td>CDP at trigger</td><td>{(brief.trigger.cdp * 100).toFixed(1)}% ({brief.trigger.band})</td></tr>
          <tr><td>Signal → brief</td><td>{brief.elapsed_s}s</td>
              <td>Status</td><td className="bp-status">{brief.status.toUpperCase()}</td></tr>
          <tr><td>Orchestrator</td><td>{String(audit?.orchestrator ?? "—")}</td>
              <td>Narrative</td><td>{brief.narrative_source}</td></tr>
        </tbody>
      </table>

      <h2>1. Impact assessment (Oracle)</h2>
      <table className="bp-stats">
        <tbody>
          <tr>
            <td><b>{s.imports_at_risk_pct}%</b><span>imports at risk<br />({s.supply_loss_kbd.toLocaleString()} kbd)</span></td>
            <td><b>{s.days_of_cover.toFixed(1)}d</b><span>days of cover<br />(from {s.days_of_cover_baseline.toFixed(1)}d)</span></td>
            <td><b>+{s.brent_delta_pct}%</b><span>Brent → ${s.brent_projected_usd}<br />basket +${s.india_basket_premium_usd}/bbl</span></td>
            <td><b>${s.import_bill_shock_usd_bn}bn</b><span>import-bill shock<br />({s.import_bill_shock_pct_gdp}% of GDP)</span></td>
          </tr>
        </tbody>
      </table>
      {econ && (
        <p className="bp-econ">
          <b>Economic exposure:</b> unmitigated cost of inaction ≈
          ₹{econ.cost_of_inaction_inr_crore_day.toLocaleString("en-IN")} crore/day
          (${econ.cost_of_inaction_usd_mn_day}M/day) vs recommended-plan premium
          ₹{econ.plan_premium_inr_crore_day.toLocaleString("en-IN")} crore/day
          (${econ.plan_premium_usd_mn_day}M/day). FX ₹{econ.inr_per_usd.toFixed(2)}/USD
          ({econ.fx_source === "fred_dexinus" ? "FRED DEXINUS, live" : "seed rate, tagged"}).
        </p>
      )}

      <h2>2. Recommended procurement reroute (Navigator)</h2>
      <table className="bp-table">
        <thead>
          <tr><th>Supplier</th><th>Grade</th><th>Corridor</th><th>kbd</th>
              <th>$/bbl</th><th>ETA</th><th>Reliability</th></tr>
        </thead>
        <tbody>
          {allocated.map((a) => (
            <tr key={a.id}>
              <td>{a.supplier}</td><td>{a.grade}</td><td>{a.corridor_name}</td>
              <td>{a.allocated_kbd}</td><td>{a.landed_cost_usd.toFixed(2)}</td>
              <td>{a.eta_days.toFixed(0)}d</td>
              <td>{(a.supplier_reliability * 100).toFixed(0)}%{a.reliability_source === "eia_derived" ? "*" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="bp-note">* reliability derived from EIA flow-stability history ·
        gap {brief.procurement.gap_kbd.toFixed(0)} kbd, {brief.procurement.filled_kbd.toFixed(0)} kbd covered ·
        ≤50% single-source cap enforced</div>

      {brief.spr && (
        <>
          <h2>3. Strategic Petroleum Reserve action (Custodian)</h2>
          <p className="bp-spr">
            Release <b>{brief.spr.total_release_mbbl} Mbbl</b> over
            <b> {brief.spr.days_bridged} days</b> · reserve floor {brief.spr.reserve_floor_pct}%{" "}
            {brief.spr.floor_respected ? "respected" : "BREACHED"} ·
            replenish window: {brief.spr.replenish_window}
          </p>
        </>
      )}

      <h2>{brief.spr ? "4" : "3"}. Narrative</h2>
      <pre className="bp-narrative">{brief.narrative}</pre>

      <div className="bp-sign">
        <div>
          <div className="bp-sign-line" />
          <span>Reviewing authority</span>
        </div>
        <div>
          <div className="bp-sign-line" />
          <span>Date</span>
        </div>
        <div className="bp-decision">
          Decision recorded: <b>{brief.status.toUpperCase()}</b> (audit-logged)
        </div>
      </div>

      <div className="bp-footer">
        Generated by the PRAHARI multi-agent system (Sentinel · Oracle · Navigator ·
        Custodian · Supervisor). Every figure is computed from the knowledge graph and
        mode-tagged signals (live/replay/demo) — nothing is invented by the narrative layer.
      </div>
    </div>,
    document.body,
  );
}

export default function BriefCard() {
  const brief = useStore((s) => s.brief);
  const open = useStore((s) => s.briefOpen);
  const setOpen = useStore((s) => s.setBriefOpen);
  const decide = useStore((s) => s.decide);
  if (!brief || !open) return null;

  const best = brief.procurement.ranked.find((a) => a.allocated_kbd > 0);
  const s = brief.scenario;
  const econ = brief.economics;

  return (
    <div className="brief-overlay" onClick={() => setOpen(false)}>
      <div className="brief-card" onClick={(e) => e.stopPropagation()}>
        <div className="brief-head">
          <div>
            <h2>Decision Brief</h2>
            <span className="brief-meta">
              {brief.trigger.corridor_name} · CDP {(brief.trigger.cdp * 100).toFixed(0)}% ({brief.trigger.band})
              · loop {brief.elapsed_s}s · narrative: {brief.narrative_source}
            </span>
          </div>
          <span className={`brief-status brief-${brief.status}`}>{brief.status}</span>
        </div>

        <div className="brief-grid">
          <div className="brief-stat">
            <b>{s.imports_at_risk_pct}%</b>
            <span>imports at risk ({s.supply_loss_kbd.toLocaleString()} kbd)</span>
          </div>
          <div className="brief-stat">
            <b>{s.days_of_cover.toFixed(1)}d</b>
            <span>cover (from {s.days_of_cover_baseline.toFixed(1)}d)</span>
          </div>
          <div className="brief-stat">
            <b>+{s.brent_delta_pct}%</b>
            <span>Brent → ${s.brent_projected_usd}</span>
          </div>
          <div className="brief-stat">
            <b>${s.import_bill_shock_usd_bn}bn</b>
            <span>import-bill shock ({s.import_bill_shock_pct_gdp}% GDP)</span>
          </div>
        </div>

        {best && (
          <div className="brief-action">
            <span className="brief-action-label">REROUTE</span>
            {best.allocated_kbd} kbd {best.grade} · {best.supplier} · ${best.landed_cost_usd}/bbl · {best.eta_days}d
            {brief.procurement.ranked.filter((a) => a.allocated_kbd > 0).length > 1 &&
              ` (+${brief.procurement.ranked.filter((a) => a.allocated_kbd > 0).length - 1} more sources)`}
          </div>
        )}
        {brief.spr && (
          <div className="brief-action">
            <span className="brief-action-label">SPR</span>
            release {brief.spr.total_release_mbbl} Mbbl · floor {brief.spr.reserve_floor_pct}%{" "}
            {brief.spr.floor_respected ? "respected ✓" : "BREACHED ✗"}
          </div>
        )}
        {econ && (
          <div className="brief-action brief-econ" title={econ.note}>
            <span className="brief-action-label">₹ EXPOSURE</span>
            inaction ₹{econ.cost_of_inaction_inr_crore_day.toLocaleString("en-IN")} cr/day
            {" "}vs plan premium ₹{econ.plan_premium_inr_crore_day.toLocaleString("en-IN")} cr/day
            <span className="brief-econ-fx"> · ₹{econ.inr_per_usd.toFixed(2)}/$
              {econ.fx_source === "fred_dexinus" ? " LIVE" : " SEED"}</span>
          </div>
        )}

        <pre className="brief-narrative">{brief.narrative}</pre>

        <div className="brief-buttons">
          {brief.status === "pending" ? (
            <>
              <button className="btn-approve" onClick={() => decide(true)}>✓ Approve</button>
              <button className="btn-dismiss" onClick={() => decide(false)}>✗ Dismiss</button>
            </>
          ) : (
            <span className="brief-decided">
              decision recorded: <b>{brief.status}</b> — audit-logged
            </span>
          )}
          <button className="btn-export" onClick={() => window.print()}
            title="print-ready one-pager — clearly banner-marked as a synthetic exercise">
            ⎙ EXPORT PDF
          </button>
          <button className="btn-close" onClick={() => setOpen(false)}>close</button>
        </div>
      </div>
      <BriefPrint brief={brief} />
    </div>
  );
}
