// PRAHARI — CDP X-Ray: the full explainability waterfall for one corridor.
// Shows exactly how CDP = σ(scale·(Σ wᵢ·factorᵢ + 0.55·baseline) + bias) builds:
// each factor's weighted contribution, the resulting logit, and where the
// corridor sits on the sigmoid relative to the auto-trigger threshold.
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store";

// factor identity colors (labels always accompany them — never color-alone)
const FACTOR_COLOR: Record<string, string> = {
  baseline: "#64748b",
  geo: "#d97706",
  ais: "#22d3ee",
  sanctions: "#a78bfa",
  market: "#34d399",
};

const BAND_HEX: Record<string, string> = {
  low: "#2D9CDB", elevated: "#F2C94C", high: "#F2994A", critical: "#EB5757",
};

interface Params { scale: number; bias: number; threshold: number }

function Sigmoid({ logit, cdp, threshold, params, band }: {
  logit: number; cdp: number; threshold: number; params: Params; band: string;
}) {
  const W = 340, H = 110, PAD = 10;
  const X = (x: number) => PAD + ((x + 6) / 12) * (W - 2 * PAD);   // x ∈ [−6, 6]
  const Y = (p: number) => H - PAD - p * (H - 2 * PAD);
  const pts: string[] = [];
  for (let x = -6; x <= 6.001; x += 0.25)
    pts.push(`${X(x).toFixed(1)},${Y(1 / (1 + Math.exp(-x))).toFixed(1)}`);
  const logitThr = Math.log(threshold / (1 - threshold));
  const cx = X(Math.max(-6, Math.min(6, logit)));
  // how much more weighted-sum until the Supervisor auto-fires
  const deltaSum = (logitThr - logit) / params.scale;

  return (
    <div className="xray-sigmoid">
      <svg width={W} height={H} role="img"
        aria-label={`sigmoid curve, corridor at ${(cdp * 100).toFixed(1)}%`}>
        <line x1={PAD} y1={Y(threshold)} x2={W - PAD} y2={Y(threshold)}
          stroke="#EB5757" strokeDasharray="5 4" strokeWidth="1" opacity="0.75" />
        <text x={W - PAD - 2} y={Y(threshold) - 4} fill="#EB5757" fontSize="9"
          textAnchor="end" fontFamily="var(--mono)">AUTO-TRIGGER {(threshold * 100).toFixed(0)}%</text>
        <polyline points={pts.join(" ")} fill="none" stroke="#22d3ee"
          strokeWidth="2" opacity="0.9" />
        <line x1={cx} y1={Y(0)} x2={cx} y2={Y(cdp)} stroke={BAND_HEX[band]}
          strokeWidth="1" strokeDasharray="2 3" />
        <circle cx={cx} cy={Y(cdp)} r="5" fill={BAND_HEX[band]}
          stroke="#081120" strokeWidth="2" />
        <text x={cx} y={Y(cdp) - 10} fill={BAND_HEX[band]} fontSize="11"
          textAnchor="middle" fontFamily="var(--mono)" fontWeight="700">
          {(cdp * 100).toFixed(1)}%
        </text>
      </svg>
      <div className="xray-delta">
        {deltaSum > 0
          ? <>Δ to auto-trigger: <b>+{deltaSum.toFixed(3)}</b> weighted sum — one more strong signal closes it</>
          : <>above threshold by <b>{(-deltaSum).toFixed(3)}</b> weighted sum — Supervisor loop armed</>}
      </div>
    </div>
  );
}

export default function CdpXray() {
  const xray = useStore((s) => s.xray);
  const setXray = useStore((s) => s.setXray);
  const corridor = useStore((s) => (xray ? s.corridors[xray] : undefined));
  const [params, setParams] = useState<Params | null>(null);

  useEffect(() => {
    if (!xray) return;
    let live = true;
    api.explain(xray).then((r) => {
      if (live) setParams({ scale: r.scale, bias: r.bias,
                            threshold: r.threshold ?? 0.65 });
    }).catch(() => {});
    return () => { live = false; };
  }, [xray]);
  const threshold = useStore((s) => s.status?.alert_threshold ?? 0.65);

  if (!xray || !corridor) return null;
  const p: Params = params ?? { scale: 6.0, bias: -1.9, threshold };

  // rebuild the exact arithmetic the engine ran
  const rows = [
    { name: "baseline", label: `baseline ${corridor.baseline_risk.toFixed(2)} × 0.55`,
      contribution: corridor.baseline_risk * 0.55, evidence: ["structural corridor risk (seed, PPAC/EIA-grounded)"] },
    ...corridor.factors.map((f) => ({
      name: f.factor, label: `${f.factor} ${f.value.toFixed(2)} × w ${f.weight}`,
      contribution: f.contribution, evidence: f.evidence,
    })),
  ];
  const total = rows.reduce((a, r) => a + r.contribution, 0);
  const logit = p.scale * total + p.bias;
  const maxW = Math.max(total, 0.45);
  let cum = 0;

  return (
    <div className="brief-overlay" onClick={() => setXray(null)}>
      <div className="xray-card" onClick={(e) => e.stopPropagation()}>
        <div className="brief-head">
          <div>
            <h2>CDP X-Ray — {corridor.name}</h2>
            <span className="brief-meta">
              every term of σ(scale·(Σ wᵢ·factorᵢ + 0.55·baseline) + bias), live
            </span>
          </div>
          <span className={`cdp-num band-${corridor.band}`} style={{ fontSize: 22 }}>
            {(corridor.cdp * 100).toFixed(1)}%
          </span>
        </div>

        <div className="xray-waterfall">
          {rows.map((r) => {
            const left = (cum / maxW) * 100;
            const width = Math.max((r.contribution / maxW) * 100, 0.6);
            cum += r.contribution;
            return (
              <div key={r.name} className="xray-row" title={r.evidence.join(" · ")}>
                <span className="xray-label">{r.label}</span>
                <div className="xray-track">
                  <div className="xray-bar" style={{
                    left: `${left}%`, width: `${width}%`,
                    background: FACTOR_COLOR[r.name] ?? "#22d3ee",
                  }} />
                </div>
                <span className="xray-num">+{r.contribution.toFixed(3)}</span>
              </div>
            );
          })}
          <div className="xray-row xray-total">
            <span className="xray-label">Σ weighted sum</span>
            <div className="xray-track">
              <div className="xray-bar xray-bar-total"
                style={{ left: 0, width: `${(total / maxW) * 100}%` }} />
            </div>
            <span className="xray-num">{total.toFixed(3)}</span>
          </div>
          <div className="xray-math">
            logit = {p.scale.toFixed(1)} × {total.toFixed(3)} {p.bias >= 0 ? "+" : "−"} {Math.abs(p.bias).toFixed(1)}
            {" "}= <b>{logit.toFixed(2)}</b> → σ(logit) = <b>{(corridor.cdp * 100).toFixed(1)}%</b>
          </div>
        </div>

        <Sigmoid logit={logit} cdp={corridor.cdp} threshold={p.threshold}
          params={p} band={corridor.band} />

        {rows.filter((r) => r.evidence.length > 0 && r.name !== "baseline").length > 0 && (
          <div className="xray-evidence">
            <div className="side-head">EVIDENCE BEHIND THE NUMBERS</div>
            {rows.filter((r) => r.name !== "baseline").flatMap((r) =>
              r.evidence.slice(0, 2).map((e, i) => (
                <div key={`${r.name}${i}`} className="xray-ev-row">
                  <i style={{ background: FACTOR_COLOR[r.name] }} />
                  <span className="xray-ev-factor">{r.name}</span>
                  <span className="xray-ev-text">{e}</span>
                </div>
              )))}
          </div>
        )}

        <div className="brief-buttons">
          <span className="detail-note" style={{ margin: 0 }}>
            hover a bar for its evidence · decays with a 3 h half-life
          </span>
          <button className="btn-close" onClick={() => setXray(null)}>close</button>
        </div>
      </div>
    </div>
  );
}
