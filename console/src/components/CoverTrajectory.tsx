// PRAHARI — days-of-cover trajectory: the decision's consequence over time.
// Derived strictly from figures the agents already computed — Oracle's cover
// decline (linear draw, exactly its own model), Custodian's daily releases,
// Navigator's allocations arriving at their weather-adjusted ETAs. The plan
// curve caps mitigation at the draw rate: reroutes stop the bleed during a
// cut, they don't mint surplus.
import type { DecisionBrief } from "../lib/types";

interface Pt { t: number; v: number }

export function coverCurves(brief: DecisionBrief) {
  const s = brief.scenario;
  const D = Math.max(1, Number(s.event.duration_days ?? 30));
  const cover0 = s.days_of_cover_baseline;
  const coverD = s.days_of_cover;
  const r = (cover0 - coverD) / D;                      // cover-days lost per day
  const consumption = brief.economics?.consumption_kbd ?? 5486;

  const sprByDay = new Map<number, number>();
  brief.spr?.schedule.forEach((d) => sprByDay.set(d.day, d.release_kbd));
  const reroutes = brief.procurement.ranked
    .filter((a) => a.allocated_kbd > 0)
    .map((a) => ({ eta: a.eta_days * (a.weather_delay_factor || 1), kbd: a.allocated_kbd }));

  const noAction: Pt[] = [], withPlan: Pt[] = [];
  let wp = cover0;
  for (let t = 0; t <= D; t++) {
    noAction.push({ t, v: cover0 - r * t });
    if (t > 0) {
      const spr = (sprByDay.get(t) ?? 0) / consumption;
      const reroute = reroutes.reduce((acc, x) => acc + (t >= x.eta ? x.kbd : 0), 0) / consumption;
      wp += -r + Math.min(spr + reroute, r);            // mitigation caps at the draw
    }
    withPlan.push({ t, v: wp });
  }
  const [p10, p90] = s.uncertainty.days_of_cover ?? [coverD, coverD];
  return { D, cover0, coverD, p10, p90, noAction, withPlan, planEnd: wp };
}

export default function CoverTrajectory({ brief, mode }: {
  brief: DecisionBrief; mode: "screen" | "print";
}) {
  const { D, cover0, coverD, p10, p90, noAction, withPlan, planEnd } = coverCurves(brief);
  const W = 560, H = 120, PL = 30, PR = 8, PT = 10, PB = 16;
  const yMin = Math.min(p10, coverD) - 0.6;
  const yMax = cover0 + 0.6;
  const X = (t: number) => PL + (t / D) * (W - PL - PR);
  const Y = (v: number) => PT + (1 - (v - yMin) / (yMax - yMin)) * (H - PT - PB);
  const path = (pts: Pt[]) =>
    pts.map((p, i) => `${i ? "L" : "M"}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join(" ");

  const c = mode === "print"
    ? { na: "#a00000", wp: "#005a1f", band: "rgba(160,0,0,.10)", ink: "#333", grid: "#bbb" }
    : { na: "#eb5757", wp: "#34d399", band: "rgba(235,87,87,.10)", ink: "#94a3b8", grid: "rgba(255,255,255,.12)" };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={mode === "print" ? "bp-cover" : "cover-chart"}
      role="img" aria-label="days of cover: no action vs with plan">
      {/* P10–P90 wedge on the no-action outcome */}
      <path d={`M${X(0)},${Y(cover0)} L${X(D)},${Y(p10)} L${X(D)},${Y(p90)} Z`}
        fill={c.band} />
      {[cover0, coverD].map((v, i) => (
        <g key={i}>
          <line x1={PL} x2={W - PR} y1={Y(v)} y2={Y(v)} stroke={c.grid} strokeWidth={0.7} />
          <text x={2} y={Y(v) + 3} fill={c.ink} fontSize={8.5} fontFamily="monospace">
            {v.toFixed(1)}d
          </text>
        </g>
      ))}
      <path d={path(noAction)} fill="none" stroke={c.na} strokeWidth={1.6}
        strokeDasharray="6 4" />
      <path d={path(withPlan)} fill="none" stroke={c.wp} strokeWidth={1.8} />
      {/* direct labels — identity never by colour alone */}
      <text x={W - PR - 2} y={Y(coverD) + 10} fill={c.na} fontSize={9}
        fontFamily="monospace" textAnchor="end">
        no action {coverD.toFixed(1)}d (P10 {p10.toFixed(1)})
      </text>
      <text x={W - PR - 2} y={Y(planEnd) - 4} fill={c.wp} fontSize={9}
        fontFamily="monospace" textAnchor="end">
        with plan {planEnd.toFixed(1)}d
      </text>
      {[0, D / 2, D].map((t, i) => (
        <text key={i} x={X(t)} y={H - 3} fill={c.ink} fontSize={8.5}
          fontFamily="monospace"
          textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}>
          day {Math.round(t)}
        </text>
      ))}
    </svg>
  );
}
