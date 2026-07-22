// PRAHARI — corridor risk dashboard: CDP list + "why it moved" explainability
import { useStore } from "../store";
import type { CorridorState } from "../lib/types";

const BAND_CLASS: Record<string, string> = {
  low: "band-low", elevated: "band-elevated", high: "band-high", critical: "band-critical",
};

function CorridorRow({ c }: { c: CorridorState }) {
  const select = useStore((s) => s.select);
  const selected = useStore((s) => s.selectedCorridor);
  const open = selected === c.corridor_id;

  return (
    <div className={`corridor-row ${open ? "open" : ""}`}
      onClick={() => select(open ? null : c.corridor_id)}>
      <div className="corridor-head">
        <div className="corridor-name">{c.name}</div>
        <div className="corridor-cdp">
          <div className="cdp-bar">
            <div className={`cdp-fill ${BAND_CLASS[c.band]}`} style={{ width: `${c.cdp * 100}%` }} />
          </div>
          <span className={`cdp-num ${BAND_CLASS[c.band]}`}>{c.cdp.toFixed(2)}</span>
        </div>
      </div>
      {open && (
        <div className="corridor-detail">
          <div className="detail-meta">
            <span>band <b className={BAND_CLASS[c.band]}>{c.band}</b></span>
            <span>confidence <b>{(c.confidence * 100).toFixed(0)}%</b></span>
            <span>baseline <b>{c.baseline_risk.toFixed(2)}</b></span>
            {c.lead_time_hours && (
              <span className="lead-time">⏱ warning window <b>{c.lead_time_hours[0]}–{c.lead_time_hours[1]}h</b></span>
            )}
          </div>
          <div className="factors">
            {c.factors.map((f) => (
              <div key={f.factor} className="factor">
                <div className="factor-head">
                  <span className="factor-name">{f.factor}</span>
                  <span className="factor-math">{f.value.toFixed(2)} × w {f.weight} = {f.contribution.toFixed(3)}</span>
                </div>
                <div className="factor-bar">
                  <div className="factor-fill" style={{ width: `${Math.min(f.value * 100, 100)}%` }} />
                </div>
                {f.evidence.length > 0 && (
                  <ul className="evidence">
                    {f.evidence.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
          <div className="detail-note">
            CDP = σ(scale·(Σ wᵢ·factorᵢ + 0.55·baseline) + bias) — every driver above is inspectable
          </div>
        </div>
      )}
    </div>
  );
}

export default function RiskPanel() {
  const corridors = useStore((s) => s.corridors);
  const list = Object.values(corridors).sort((a, b) => b.cdp - a.cdp);
  const threshold = useStore((s) => s.status?.alert_threshold ?? 0.65);

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Corridor Disruption Probability</h2>
        <span className="panel-sub">auto-trigger at CDP ≥ {threshold} · click a corridor for “why”</span>
      </div>
      {list.map((c) => <CorridorRow key={c.corridor_id} c={c} />)}
    </div>
  );
}
