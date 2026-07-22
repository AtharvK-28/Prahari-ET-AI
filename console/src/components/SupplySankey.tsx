// PRAHARI — supply-chain Sankey: supplier -> chokepoint/open-ocean -> coast.
// The knowledge graph made visible: link width = real kbd (PPAC-verified base).
// Single-hue magnitude encoding (width); identity via direct labels (dataviz rules).
import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";

interface FlowLink {
  supplier: string;
  supplier_id: string;
  via: string;
  coast: string;
  kbd: number;
  corridor_id: string;
}

const W = 720, H = 380, COL = [10, 320, 640], NODE_W = 8, PAD_Y = 26, GAP = 6;
const VIA_LABEL: Record<string, string> = {
  hormuz: "Strait of Hormuz", bab_el_mandeb: "Bab el-Mandeb / Suez",
  suez: "Bab el-Mandeb / Suez", malacca: "Strait of Malacca", open_ocean: "Open ocean",
};

type Node = { id: string; label: string; total: number; y0: number; y1: number };

function layoutColumn(items: Map<string, number>, scale: number): Map<string, Node> {
  const out = new Map<string, Node>();
  let y = PAD_Y;
  const sorted = [...items.entries()].sort((a, b) => b[1] - a[1]);
  for (const [id, total] of sorted) {
    const h = Math.max(total * scale, 3);
    out.set(id, { id, label: id, total, y0: y, y1: y + h });
    y += h + GAP;
  }
  return out;
}

export default function SupplySankey() {
  const [links, setLinks] = useState<FlowLink[]>([]);
  const [hover, setHover] = useState<string | null>(null);
  const corridors = useStore((s) => s.corridors);
  const cutCorridors = useMemo(() => {
    // corridors currently high/critical are drawn stressed
    return new Set(Object.values(corridors)
      .filter((c) => c.band === "high" || c.band === "critical")
      .map((c) => c.corridor_id));
  }, [corridors]);

  useEffect(() => {
    fetch((import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000") + "/flows")
      .then((r) => r.json()).then((d) => setLinks(d.links ?? [])).catch(() => {});
  }, []);

  const model = useMemo(() => {
    if (!links.length) return null;
    const suppliers = new Map<string, number>();
    const vias = new Map<string, number>();
    const coasts = new Map<string, number>();
    for (const l of links) {
      suppliers.set(l.supplier, (suppliers.get(l.supplier) ?? 0) + l.kbd);
      const via = VIA_LABEL[l.via] ?? l.via;
      vias.set(via, (vias.get(via) ?? 0) + l.kbd);
      coasts.set(l.coast, (coasts.get(l.coast) ?? 0) + l.kbd);
    }
    const total = [...suppliers.values()].reduce((a, b) => a + b, 0);
    const usable = H - 2 * PAD_Y - GAP * Math.max(suppliers.size, vias.size);
    const scale = usable / total;
    const c0 = layoutColumn(suppliers, scale);
    const c1 = layoutColumn(vias, scale);
    const c2 = layoutColumn(coasts, scale);
    // per-node running offsets for ribbon stacking
    const off0 = new Map<string, number>(), off1L = new Map<string, number>(),
      off1R = new Map<string, number>(), off2 = new Map<string, number>();
    const ribbons: any[] = [];
    const sorted = [...links].sort((a, b) => b.kbd - a.kbd);
    for (const l of sorted) {
      const via = VIA_LABEL[l.via] ?? l.via;
      const h = Math.max(l.kbd * scale, 1.5);
      const s = c0.get(l.supplier)!, v = c1.get(via)!, c = c2.get(l.coast)!;
      const sy = s.y0 + (off0.get(l.supplier) ?? 0);
      const vyL = v.y0 + (off1L.get(via) ?? 0);
      const vyR = v.y0 + (off1R.get(via) ?? 0);
      const cy = c.y0 + (off2.get(l.coast) ?? 0);
      off0.set(l.supplier, (off0.get(l.supplier) ?? 0) + h);
      off1L.set(via, (off1L.get(via) ?? 0) + h);
      off1R.set(via, (off1R.get(via) ?? 0) + h);
      off2.set(l.coast, (off2.get(l.coast) ?? 0) + h);
      ribbons.push({ l, h, sy, vyL, vyR, cy, via });
    }
    return { c0, c1, c2, ribbons, total };
  }, [links]);

  if (!model) return null;

  const ribbon = (x0: number, y0: number, x1: number, y1: number, h: number) => {
    const mx = (x0 + x1) / 2;
    return `M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1}
            L${x1},${y1 + h} C${mx},${y1 + h} ${mx},${y0 + h} ${x0},${y0 + h} Z`;
  };

  return (
    <div className="intel-card sankey-card">
      <div className="intel-head">
        <span>🕸 SUPPLY-CHAIN DEPENDENCY GRAPH</span>
        <span className="hint">
          link width = kbd (PPAC-verified base) · stressed corridors glow red
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="sankey-svg" role="img"
        aria-label="Crude supply flows from suppliers through chokepoints to Indian coasts">
        {model.ribbons.map((r, i) => {
          const stressed = cutCorridors.has(r.l.corridor_id);
          const isHover = hover === `${r.l.supplier}|${r.via}`;
          return (
            <g key={i}>
              <path d={ribbon(COL[0] + NODE_W, r.sy, COL[1], r.vyL, r.h)}
                className={`sankey-ribbon ${stressed ? "sankey-stressed" : ""} ${isHover ? "sankey-hover" : ""}`}
                onMouseEnter={() => setHover(`${r.l.supplier}|${r.via}`)}
                onMouseLeave={() => setHover(null)}>
                <title>{`${r.l.supplier} → ${r.via}: ${r.l.kbd} kbd${stressed ? " — corridor stressed" : ""}`}</title>
              </path>
              <path d={ribbon(COL[1] + NODE_W, r.vyR, COL[2], r.cy, r.h)}
                className={`sankey-ribbon ${stressed ? "sankey-stressed" : ""} ${isHover ? "sankey-hover" : ""}`}
                onMouseEnter={() => setHover(`${r.l.supplier}|${r.via}`)}
                onMouseLeave={() => setHover(null)}>
                <title>{`${r.via} → ${r.l.coast} India: ${r.l.kbd} kbd`}</title>
              </path>
            </g>
          );
        })}
        {[model.c0, model.c1, model.c2].map((col, ci) =>
          [...col.values()].map((n) => (
            <g key={`${ci}-${n.id}`}>
              <rect x={COL[ci]} y={n.y0} width={NODE_W} height={n.y1 - n.y0}
                rx={2} className="sankey-node" />
              <text x={ci === 2 ? COL[ci] - 4 : COL[ci] + NODE_W + 5}
                y={(n.y0 + n.y1) / 2 + 3}
                textAnchor={ci === 2 ? "end" : "start"} className="sankey-label">
                {n.label} <tspan className="sankey-kbd">{Math.round(n.total)} kbd</tspan>
              </text>
            </g>
          ))
        )}
        <text x={COL[0]} y={14} className="sankey-col">SUPPLIERS</text>
        <text x={COL[1]} y={14} className="sankey-col">TRANSIT</text>
        <text x={COL[2]} y={14} textAnchor="end" className="sankey-col">INDIA</text>
      </svg>
    </div>
  );
}
