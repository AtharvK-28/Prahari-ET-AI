// PRAHARI — one-page decision brief with approve/dismiss (PRD E2)
import { useStore } from "../store";

export default function BriefCard() {
  const brief = useStore((s) => s.brief);
  const open = useStore((s) => s.briefOpen);
  const setOpen = useStore((s) => s.setBriefOpen);
  const decide = useStore((s) => s.decide);
  if (!brief || !open) return null;

  const best = brief.procurement.ranked.find((a) => a.allocated_kbd > 0);
  const s = brief.scenario;

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
          <button className="btn-close" onClick={() => setOpen(false)}>close</button>
        </div>
      </div>
    </div>
  );
}
