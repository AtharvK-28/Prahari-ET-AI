// PRAHARI — simulated tanker fleet, derived from real flows (clearly SIM-tagged).
//
// Physics: Little's law L = λ·W. A corridor flowing `supply_kbd` with transit
// time `transit_days` carries  supply_kbd × transit_days / 2,000 kbbl  laden
// VLCC-equivalents en route at any instant. Vessel COUNT and relative SPEED
// are therefore real; positions are simulated (labelled SIM, never live AIS).
//
// Sim clock: 1 voyage-day = 5 s wall time — Gulf hops zip, Cape routes crawl.

import type { TwinGeoJSON } from "./types";

export const VLCC_KBBL = 2000;     // 2.0 Mbbl per VLCC
export const DAY_S = 5;            // seconds of wall time per simulated day

export interface SimVessel {
  id: string;
  corridor: string;
  corridorName: string;
  pos: [number, number];
  bearing: number;                 // degrees CCW for TextLayer glyph rotation
  state: "normal" | "queued" | "reversing" | "recovery";
  fleetCount: number;
  supply: number;
  transit: number;
}

interface CorridorGeom {
  id: string;
  name: string;
  coords: [number, number][];
  cum: number[];                   // cumulative fraction 0..1 per vertex
  supply: number;
  transit: number;
  count: number;
  phases: number[];                // stable per-vessel start offsets
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = (h ^ s.charCodeAt(i)) * 16777619;
  return (h >>> 0) / 4294967295;
}

export function buildFleetGeometry(twin: TwinGeoJSON): CorridorGeom[] {
  const out: CorridorGeom[] = [];
  for (const f of twin.features) {
    if (f.properties.kind !== "corridor") continue;
    const coords = f.geometry.coordinates as [number, number][];
    const d: number[] = [0];
    for (let i = 1; i < coords.length; i++)
      d.push(d[i - 1] + Math.hypot(coords[i][0] - coords[i - 1][0],
                                   coords[i][1] - coords[i - 1][1]));
    const total = d[d.length - 1] || 1;
    const supply = f.properties.supply_kbd ?? 100;
    const transit = f.properties.transit_days ?? 10;
    const count = Math.max(1, Math.min(10, Math.round(supply * transit / VLCC_KBBL)));
    out.push({
      id: f.properties.id, name: f.properties.name, coords,
      cum: d.map((v) => v / total), supply, transit, count,
      phases: Array.from({ length: count }, (_, i) => hash(`${f.properties.id}:${i}`)),
    });
  }
  return out;
}

function pointAt(g: CorridorGeom, p: number): { pos: [number, number]; bearing: number } {
  const t = Math.min(Math.max(p, 0), 0.999);
  let i = 1;
  while (i < g.cum.length - 1 && g.cum[i] < t) i++;
  const f = (t - g.cum[i - 1]) / (g.cum[i] - g.cum[i - 1] || 1e-9);
  const [x0, y0] = g.coords[i - 1];
  const [x1, y1] = g.coords[i];
  return {
    pos: [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f],
    bearing: (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI - 90, // ▲ points +y
  };
}

/**
 * Fleet snapshot at wall-time `timeS`.
 *  - cutCorridor: vessels queue short of the chokepoint (red) — a blockade you can see
 *  - reversalUntilS: for its duration, the 3 lead vessels on the cut corridor
 *    steam backwards (the "3 laden VLCCs reverse course" signal, made visible)
 *  - recoveryCorridors: Navigator-allocated corridors — vessels run green
 */
export function fleetAt(
  geoms: CorridorGeom[], timeS: number, cutCorridor: string | null,
  reversalActive: boolean, recoveryCorridors: Set<string>,
): SimVessel[] {
  const out: SimVessel[] = [];
  for (const g of geoms) {
    const loopS = g.transit * DAY_S;
    for (let i = 0; i < g.count; i++) {
      let p = (g.phases[i] + timeS / loopS) % 1;
      let state: SimVessel["state"] = "normal";
      let bearingFlip = 0;
      if (g.id === cutCorridor) {
        const hold = 0.26 - i * 0.035;           // stack short of the chokepoint
        if (reversalActive && i < 3) {
          state = "reversing";
          p = Math.max(hold - (timeS % loopS) * 0.0015, 0.06);
          bearingFlip = 180;
        } else {
          state = "queued";
          p = Math.min(p, Math.max(hold, 0.04));
        }
      } else if (recoveryCorridors.has(g.id)) {
        state = "recovery";
      }
      const { pos, bearing } = pointAt(g, p);
      out.push({
        id: `${g.id}-${i}`, corridor: g.id, corridorName: g.name,
        pos, bearing: bearing + bearingFlip, state,
        fleetCount: g.count, supply: g.supply, transit: g.transit,
      });
    }
  }
  return out;
}
