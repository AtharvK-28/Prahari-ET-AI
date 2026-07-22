// PRAHARI — historical grounding: FRED Brent 5-day shock distribution with the
// current scenario's projected move marked on it. Single series -> no legend;
// palette (#2286C3 bars / #B8860B marker) validated on the dark surface.
import { useMemo, useState } from "react";
import { useStore } from "../store";

const W = 360, H = 96, PAD_L = 8, PAD_R = 8, PAD_B = 18, PAD_T = 6;
const BAR = "#2286C3", MARKER = "#B8860B";

export default function ShockCalibration({ currentPct }: { currentPct: number }) {
  const calibration = useStore((s) => s.calibration);
  const [hover, setHover] = useState<string | null>(null);

  const model = useMemo(() => {
    const moves = calibration?.all_moves_pct ?? [];
    if (moves.length < 5) return null;
    const min = 6, max = Math.max(...moves, currentPct);
    const binW = 3;                                     // % per bin
    const nBins = Math.ceil((max - min) / binW) + 1;
    const bins = Array.from({ length: nBins }, () => 0);
    moves.forEach((m) => bins[Math.min(Math.floor((m - min) / binW), nBins - 1)]++);
    const maxCount = Math.max(...bins);
    const below = moves.filter((m) => m < currentPct).length;
    const percentile = Math.round((below / moves.length) * 100);
    return { min, max, binW, bins, maxCount, percentile, n: moves.length };
  }, [calibration, currentPct]);

  if (!calibration || !model) return null;
  const cal = calibration.calibration as { years?: number; episodes?: number; median_shock_pct?: number };

  const x = (pct: number) =>
    PAD_L + ((pct - model.min) / (model.max - model.min || 1)) * (W - PAD_L - PAD_R);
  const plotH = H - PAD_B - PAD_T;
  const bw = (W - PAD_L - PAD_R) / model.bins.length;
  const markerX = Math.min(x(currentPct), W - PAD_R);
  const inEnvelope = currentPct <= model.max;

  return (
    <div className="calib">
      <h4>
        Historical grounding — Brent 5-day shocks (FRED, {cal.years ?? 12}y)
      </h4>
      <svg viewBox={`0 0 ${W} ${H}`} className="calib-svg" role="img"
        aria-label={`Histogram of ${model.n} historical Brent shock episodes with this scenario marked at +${currentPct}%`}>
        {model.bins.map((count, i) => {
          const bx = PAD_L + i * bw;
          const bh = count === 0 ? 0 : Math.max((count / model.maxCount) * plotH, 2);
          const lo = model.min + i * model.binW;
          const key = `${lo}`;
          return (
            <g key={key}>
              {/* oversized hover target */}
              <rect x={bx} y={PAD_T} width={bw} height={plotH + 4} fill="transparent"
                onMouseEnter={() => setHover(`${count} episode${count === 1 ? "" : "s"} of +${lo}–${lo + model.binW}%`)}
                onMouseLeave={() => setHover(null)} />
              {count > 0 && (
                <rect x={bx + 1} y={PAD_T + plotH - bh} width={Math.max(bw - 2, 2)}
                  height={bh} rx={2} fill={BAR} pointerEvents="none" />
              )}
            </g>
          );
        })}
        {/* baseline */}
        <line x1={PAD_L} x2={W - PAD_R} y1={PAD_T + plotH} y2={PAD_T + plotH}
          stroke="#232d3f" strokeWidth={1} />
        {/* scenario marker: line + direct label (identity not by color alone) */}
        <line x1={markerX} x2={markerX} y1={PAD_T - 2} y2={PAD_T + plotH}
          stroke={MARKER} strokeWidth={2} strokeDasharray="4 3" />
        <text x={markerX} y={H - 6} textAnchor={markerX > W - 90 ? "end" : "middle"}
          className="calib-marker-label">
          ▲ this scenario +{currentPct}%
        </text>
        {/* x-axis extremes */}
        <text x={PAD_L} y={H - 6} className="calib-axis">+{model.min}%</text>
        <text x={W - PAD_R} y={H - 6} textAnchor="end" className="calib-axis">
          +{Math.ceil(model.max)}%
        </text>
      </svg>
      <div className="calib-note">
        {hover ?? (
          <>
            {cal.episodes} episodes · median +{cal.median_shock_pct}% · this scenario ={" "}
            <b>P{model.percentile}</b>{" "}
            {inEnvelope ? "— inside the historical envelope" : "— beyond any observed episode"}
          </>
        )}
      </div>
    </div>
  );
}
