// PRAHARI — chronology strip: the lead-time claim, drawn.
// Three bands sharing one time axis (never dual-axis): CDP curves per corridor,
// a Brent mini-band, and a signal rail — with brief/decision flags, so the
// signal → threshold-cross → brief sequence is visible and datable.
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store";
import type { HistorySnapshot } from "../lib/types";

// stable identity colors: keyed by corridor id, never by rank (no red — red
// is reserved for the threshold/critical semantics)
const CANON = [
  "pg_west_india", "pg_east_india", "redsea_west_india", "cape_west_india_urals",
  "espo_east_india", "wafr_west_india", "usgc_cape_india", "usgc_suez_india",
  "brazil_west_india", "guyana_west_india",
];
const PALETTE = ["#22d3ee", "#f2c94c", "#a78bfa", "#34d399", "#f2994a",
                 "#7dd3fc", "#c084fc", "#86efac", "#fda4af", "#93c5fd"];
const colorOf = (cid: string) => PALETTE[Math.max(0, CANON.indexOf(cid)) % PALETTE.length];

const SIGNAL_COLOR: Record<string, string> = {
  conflict_event: "#d97706", ais_anomaly: "#22d3ee",
  sanction_update: "#a78bfa", price_move: "#34d399",
};

const H_CDP = 92, H_BRENT = 26, H_RAIL = 16, PAD_T = 6, PAD_B = 14;
const H = PAD_T + H_CDP + 6 + H_BRENT + 4 + H_RAIL + PAD_B;

function fmtT(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString("en-IN", { hour12: false });
}

export default function ChronologyStrip() {
  const [snap, setSnap] = useState<HistorySnapshot | null>(null);
  const [minutes, setMinutes] = useState(60);
  const [open, setOpen] = useState(true);
  const [cursor, setCursor] = useState<number | null>(null);   // x px
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const brief = useStore((s) => s.brief);

  useEffect(() => {
    // clientWidth includes the panel's 20px horizontal padding — subtract it,
    // or right-edge labels and the last time tick get clipped at the border
    const measure = () =>
      setWidth(Math.max(360, (wrapRef.current?.clientWidth ?? 820) - 20));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open]);

  useEffect(() => {
    let live = true;
    const load = () => api.history(minutes).then((s) => live && setSnap(s)).catch(() => {});
    load();
    const iv = setInterval(load, 10000);
    return () => { live = false; clearInterval(iv); };
  }, [minutes, brief?.brief_id]);

  if (!open) {
    return (
      <button className="chrono-pill" onClick={() => setOpen(true)}>
        ▴ CHRONOLOGY
      </button>
    );
  }
  if (!snap) return null;

  const now = Date.now() / 1000;
  const t0 = now - minutes * 60;
  const X = (ts: number) => ((ts - t0) / (minutes * 60)) * width;
  const yCdp = (v: number) => PAD_T + H_CDP - v * H_CDP;

  // top-4 corridors by latest value; each keeps its canonical entity color
  const latest = Object.entries(snap.corridors)
    .map(([cid, pts]) => ({ cid, pts, last: pts.length ? pts[pts.length - 1][1] : 0 }))
    .filter((c) => c.pts.length > 0)
    .sort((a, b) => b.last - a.last);
  const shown = latest.slice(0, 4);

  const brentVals = snap.brent.map(([, v]) => v);
  const bMin = Math.min(...brentVals, Infinity), bMax = Math.max(...brentVals, -Infinity);
  const bY0 = PAD_T + H_CDP + 6;
  const yBrent = (v: number) =>
    bY0 + H_BRENT - (bMax > bMin ? ((v - bMin) / (bMax - bMin)) : 0.5) * (H_BRENT - 6) - 3;
  const railY = bY0 + H_BRENT + 4 + H_RAIL / 2;

  const line = (pts: [number, number][], y: (v: number) => number) =>
    pts.map(([ts, v], i) => `${i ? "L" : "M"}${X(ts).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  return (
    <div className="chrono" ref={wrapRef}>
      <div className="chrono-head">
        <span className="chrono-title">CHRONOLOGY — signal → alert → decision</span>
        <span className="chrono-windows">
          {[15, 60, 360].map((m) => (
            <button key={m} className={`chrono-win ${minutes === m ? "chrono-win-on" : ""}`}
              onClick={() => setMinutes(m)}>
              {m < 60 ? `${m}m` : `${m / 60}h`}
            </button>
          ))}
          <button className="chrono-win" onClick={() => setOpen(false)}>▾</button>
        </span>
      </div>
      <svg width={width} height={H} className="chrono-svg"
        onMouseMove={(e) => {
          const r = (e.target as SVGElement).closest("svg")!.getBoundingClientRect();
          setCursor(e.clientX - r.left);
        }}
        onMouseLeave={() => setCursor(null)}>
        {/* threshold */}
        <line x1={0} x2={width} y1={yCdp(snap.threshold)} y2={yCdp(snap.threshold)}
          stroke="#EB5757" strokeDasharray="5 4" strokeWidth={1} opacity={0.7} />
        <text x={4} y={yCdp(snap.threshold) - 3} fill="#EB5757" fontSize={8.5}
          fontFamily="var(--mono)">AUTO-TRIGGER {(snap.threshold * 100).toFixed(0)}%</text>

        {/* CDP curves + direct labels (dodged so co-located lines stay legible) */}
        {(() => {
          const byY = [...shown].sort((a, b) => yCdp(a.last) - yCdp(b.last));
          let lastY = -Infinity;
          const labelY = byY.map((c) => {
            const y = Math.max(yCdp(c.last) + 3, lastY + 10, PAD_T + 8);
            lastY = y;
            return { cid: c.cid, y };
          });
          return shown.map((c) => (
            <g key={c.cid}>
              <path d={line(c.pts, yCdp)} fill="none" stroke={colorOf(c.cid)}
                strokeWidth={1.6} opacity={0.92} />
              <text x={width - 4} className="chrono-label"
                y={labelY.find((l) => l.cid === c.cid)!.y}
                fill={colorOf(c.cid)} fontSize={8.5}
                fontFamily="var(--mono)" textAnchor="end" opacity={0.95}>
                {c.cid.replace(/_/g, " ").toUpperCase().slice(0, 14)} {c.last.toFixed(2)}
              </text>
            </g>
          ));
        })()}

        {/* brief flags: created (flag) + decided (check) */}
        {snap.briefs.map((b) => (
          <g key={b.brief_id}>
            <line x1={X(b.created_at)} x2={X(b.created_at)} y1={PAD_T} y2={railY + 6}
              stroke="#fff" strokeWidth={1} opacity={0.55} strokeDasharray="2 3" />
            <text x={X(b.created_at) + 2} y={PAD_T + 8} fontSize={9}>
              🏁<title>{`brief ${b.brief_id} · ${b.corridor_name} · CDP ${(b.cdp * 100).toFixed(0)}% · ${fmtT(b.created_at)}`}</title>
            </text>
            {b.decided_at && (
              <text x={X(b.decided_at) + 2} y={PAD_T + 18} fontSize={9}
                fill={b.status === "approved" ? "#6ee7a0" : "#eb5757"}>
                {b.status === "approved" ? "✓" : "✗"}
                <title>{`${b.status} at ${fmtT(b.decided_at)}`}</title>
              </text>
            )}
          </g>
        ))}

        {/* brent mini-band (own scale — a small multiple, not a second axis) */}
        <rect x={0} y={bY0} width={width} height={H_BRENT} fill="rgba(255,255,255,.025)" />
        {snap.brent.length > 1 && (
          <path d={line(snap.brent, yBrent)} fill="none" stroke="#cbd5e1"
            strokeWidth={1.2} opacity={0.8} />
        )}
        <text x={4} y={bY0 + 9} fill="#94a3b8" fontSize={8.5} fontFamily="var(--mono)">
          BRENT {brentVals.length ? `$${brentVals[brentVals.length - 1].toFixed(2)}` : ""}
        </text>

        {/* signal rail: filled=live, half=replay, hollow=demo (honesty encoding) */}
        {snap.signals.map((s, i) => (
          <circle key={i} cx={X(s.ts)} cy={railY} r={3 + s.magnitude * 2}
            fill={s.mode === "demo" ? "transparent" : SIGNAL_COLOR[s.type] ?? "#94a3b8"}
            fillOpacity={s.mode === "replay" ? 0.45 : 0.9}
            stroke={SIGNAL_COLOR[s.type] ?? "#94a3b8"} strokeWidth={1.2}>
            <title>{`${s.type} · ${s.mode.toUpperCase()} · ${fmtT(s.ts)}\n${s.summary}`}</title>
          </circle>
        ))}

        {/* time ticks */}
        {[t0, t0 + minutes * 30, now].map((ts, i) => (
          <text key={i} x={i === 0 ? 2 : i === 1 ? width / 2 : width - 2}
            y={H - 3} fill="#64748b" fontSize={8.5} fontFamily="var(--mono)"
            textAnchor={i === 0 ? "start" : i === 1 ? "middle" : "end"}>
            {fmtT(ts)}
          </text>
        ))}

        {/* crosshair */}
        {cursor !== null && (
          <g pointerEvents="none">
            <line x1={cursor} x2={cursor} y1={PAD_T} y2={H - PAD_B}
              stroke="#fff" strokeWidth={0.7} opacity={0.4} />
            <text x={Math.min(cursor + 4, width - 44)} y={H - PAD_B - 2}
              fill="#cbd5e1" fontSize={8.5} fontFamily="var(--mono)">
              {fmtT(t0 + (cursor / width) * minutes * 60)}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
