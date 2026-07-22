// PRAHARI — geospatial digital twin (deck.gl over MapLibre, free CARTO basemap)
// Living twin: crude flows animate along corridors (volume-scaled TripsLayer);
// Navigator reroutes draw as green arcs; a triggered corridor pulses red.
import { useEffect, useMemo, useRef, useState } from "react";
import DeckGL from "@deck.gl/react";
import { ArcLayer, PathLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { TripsLayer } from "@deck.gl/geo-layers";
import { Map } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { useStore } from "../store";

const BASEMAP =
  "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json";

const BAND_COLORS: Record<string, [number, number, number, number]> = {
  low: [45, 156, 219, 160],
  elevated: [242, 201, 76, 200],
  high: [242, 153, 74, 230],
  critical: [235, 87, 87, 255],
};

const INITIAL_VIEW = { longitude: 62, latitude: 15, zoom: 3.1, pitch: 30, bearing: 0 };
const LOOP_S = 12;                       // one full particle transit per corridor

/** cumulative timestamps 0..1 along a path, proportional to segment length */
function pathTimestamps(coords: [number, number][]): number[] {
  const d: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    const dx = coords[i][0] - coords[i - 1][0];
    const dy = coords[i][1] - coords[i - 1][1];
    d.push(d[i - 1] + Math.hypot(dx, dy));
  }
  const total = d[d.length - 1] || 1;
  return d.map((v) => v / total);
}

export default function MapTwin() {
  const twin = useStore((s) => s.twin);
  const corridors = useStore((s) => s.corridors);
  const vessels = useStore((s) => s.vessels);
  const plan = useStore((s) => s.plan);
  const brief = useStore((s) => s.brief);
  const select = useStore((s) => s.select);
  const selected = useStore((s) => s.selectedCorridor);
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  const [clock, setClock] = useState(0);
  const raf = useRef(0);

  // animation clock for the flow particles
  useEffect(() => {
    const t0 = performance.now();
    const tick = () => {
      setClock(((performance.now() - t0) / 1000 / LOOP_S) % 1);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, []);

  // flow trips: 3 phase-shifted particles per corridor for continuous motion
  const trips = useMemo(() => {
    if (!twin) return [];
    const out: any[] = [];
    for (const f of twin.features) {
      if (f.properties.kind !== "corridor") continue;
      const coords = f.geometry.coordinates as [number, number][];
      const ts = pathTimestamps(coords);
      for (const phase of [0, 1 / 3, 2 / 3]) {
        out.push({ id: f.properties.id, supply: f.properties.supply_kbd ?? 100,
                   path: coords, timestamps: ts.map((t) => t + phase) });
      }
    }
    return out;
  }, [twin]);

  // Navigator reroute arcs: supplier origin -> India landing, for allocated alts
  const rerouteArcs = useMemo(() => {
    if (!plan || !twin) return [];
    const byId: Record<string, any> = {};
    twin.features.forEach((f) => { if (f.properties.kind === "corridor") byId[f.properties.id] = f; });
    return plan.ranked
      .filter((a) => a.allocated_kbd > 0)
      .map((a) => {
        const c = byId[a.corridor];
        if (!c) return null;
        const coords = c.geometry.coordinates;
        return { from: coords[0], to: coords[coords.length - 1],
                 kbd: a.allocated_kbd, label: `${a.grade} · ${a.allocated_kbd} kbd` };
      })
      .filter(Boolean) as any[];
  }, [plan, twin]);

  const cutCorridor = brief?.trigger?.corridor ?? null;

  const layers = useMemo(() => {
    if (!twin) return [];
    const paths = twin.features.filter((f) => f.properties.kind === "corridor");
    const points = (kind: string) =>
      twin.features.filter((f) => f.properties.kind === kind);

    return [
      new PathLayer({
        id: "corridors",
        data: paths,
        getPath: (f: any) => f.geometry.coordinates,
        getColor: (f: any) => {
          const st = corridors[f.properties.id];
          const c = BAND_COLORS[st?.band ?? "low"];
          return f.properties.id === selected ? [255, 255, 255, 255] : c;
        },
        getWidth: (f: any) => {
          const cdp = corridors[f.properties.id]?.cdp ?? 0.2;
          return 1.5 + cdp * 6;
        },
        widthUnits: "pixels",
        capRounded: true,
        jointRounded: true,
        pickable: true,
        onClick: (info: any) => select(info.object?.properties?.id ?? null),
        onHover: (info: any) =>
          setHover(
            info.object
              ? {
                  x: info.x, y: info.y,
                  text: `${info.object.properties.name} — CDP ${(corridors[info.object.properties.id]?.cdp ?? 0).toFixed(2)}`,
                }
              : null
          ),
        updateTriggers: { getColor: [corridors, selected], getWidth: [corridors] },
      }),
      // living twin: crude-flow particles, width/brightness by corridor volume
      new TripsLayer({
        id: "flows",
        data: trips,
        getPath: (d: any) => d.path,
        getTimestamps: (d: any) => d.timestamps,
        currentTime: clock + 1 / 3,      // particles always mid-path somewhere
        trailLength: 0.18,
        getColor: (d: any) =>
          d.id === cutCorridor
            ? [235, 87, 87, 230]
            : [140, 235, 255, Math.min(220, 90 + d.supply / 6)],
        getWidth: (d: any) => 2 + Math.min(d.supply / 250, 5),
        widthUnits: "pixels",
        capRounded: true,
        jointRounded: true,
        updateTriggers: { currentTime: [clock], getColor: [cutCorridor] },
      }),
      // triggered corridor: pulsing overlay so the cut reads instantly
      !cutCorridor ? null : new PathLayer({
        id: "cut-pulse",
        data: paths.filter((f: any) => f.properties.id === cutCorridor),
        getPath: (f: any) => f.geometry.coordinates,
        getColor: [235, 87, 87, 90 + Math.abs(Math.sin(clock * Math.PI * 6)) * 140],
        getWidth: 14,
        widthUnits: "pixels",
        capRounded: true,
        updateTriggers: { getColor: [clock] },
      }),
      // Navigator reroutes: green supply arcs for allocated alternatives
      rerouteArcs.length === 0 ? null : new ArcLayer({
        id: "reroutes",
        data: rerouteArcs,
        getSourcePosition: (d: any) => d.from,
        getTargetPosition: (d: any) => d.to,
        getSourceColor: [39, 174, 96, 230],
        getTargetColor: [110, 231, 160, 255],
        getWidth: (d: any) => 1.5 + Math.min(d.kbd / 80, 5),
        getHeight: 0.35,
        greatCircle: true,
        pickable: true,
        onHover: (info: any) =>
          setHover(info.object ? { x: info.x, y: info.y, text: `↻ reroute: ${info.object.label}` } : null),
      }),
      new ScatterplotLayer({
        id: "chokepoints",
        data: points("chokepoint"),
        getPosition: (f: any) => f.geometry.coordinates,
        getRadius: 42000,
        getFillColor: (f: any) => {
          const worst = Math.max(
            0,
            ...Object.values(corridors)
              .filter((c) => (twin.features.find((x) => x.properties.id === c.corridor_id)?.properties.chokepoints ?? []).includes(f.properties.id))
              .map((c) => c.cdp)
          );
          return worst > 0.65 ? [235, 87, 87, 220] : worst > 0.4 ? [242, 201, 76, 200] : [86, 204, 242, 160];
        },
        stroked: true,
        getLineColor: [255, 255, 255, 120],
        getLineWidth: 2,
        lineWidthUnits: "pixels",
        pickable: true,
        onHover: (info: any) =>
          setHover(info.object ? { x: info.x, y: info.y, text: `⚠ ${info.object.properties.name} — ${info.object.properties.share_pct}% of imports` } : null),
        updateTriggers: { getFillColor: [corridors] },
      }),
      new ScatterplotLayer({
        id: "refineries",
        data: points("refinery"),
        getPosition: (f: any) => f.geometry.coordinates,
        getRadius: (f: any) => 12000 + f.properties.capacity_kbd * 18,
        getFillColor: [155, 89, 182, 200],
        stroked: true,
        getLineColor: [255, 255, 255, 100],
        getLineWidth: 1,
        lineWidthUnits: "pixels",
        pickable: true,
        onHover: (info: any) =>
          setHover(info.object ? { x: info.x, y: info.y, text: `⛽ ${info.object.properties.name} — ${info.object.properties.capacity_kbd} kbd` } : null),
      }),
      new ScatterplotLayer({
        id: "spr",
        data: points("spr"),
        getPosition: (f: any) => f.geometry.coordinates,
        getRadius: 26000,
        getFillColor: [39, 174, 96, 210],
        stroked: true,
        getLineColor: [255, 255, 255, 120],
        getLineWidth: 1.5,
        lineWidthUnits: "pixels",
        pickable: true,
        onHover: (info: any) =>
          setHover(info.object ? { x: info.x, y: info.y, text: `🛢 ${info.object.properties.name} — ${info.object.properties.capacity_mmt} MMT (${info.object.properties.fill_pct}% full)` } : null),
      }),
      new ScatterplotLayer({
        id: "vessels",
        data: vessels,
        getPosition: (v: any) => [v.lon, v.lat],
        getRadius: 9000,
        getFillColor: [255, 255, 255, 170],
        pickable: true,
        onHover: (info: any) =>
          setHover(info.object ? { x: info.x, y: info.y, text: `🚢 ${info.object.name || info.object.mmsi} — ${info.object.sog?.toFixed(1)} kn` } : null),
      }),
      new TextLayer({
        id: "chokepoint-labels",
        data: points("chokepoint"),
        getPosition: (f: any) => f.geometry.coordinates,
        getText: (f: any) => f.properties.name,
        getSize: 11,
        getColor: [200, 210, 220, 220],
        getPixelOffset: [0, -22],
        fontFamily: "Inter, system-ui, sans-serif",
      }),
    ].filter(Boolean);
  }, [twin, corridors, vessels, selected, select, trips, clock, cutCorridor, rerouteArcs]);

  return (
    <div className="map-wrap">
      <DeckGL initialViewState={INITIAL_VIEW} controller layers={layers}>
        <Map mapStyle={BASEMAP} attributionControl={false} />
      </DeckGL>
      {hover && (
        <div className="map-tooltip" style={{ left: hover.x + 12, top: hover.y + 12 }}>
          {hover.text}
        </div>
      )}
      <div className="map-legend">
        <span><i style={{ background: "#8cebff" }} /> crude flow (kbd-scaled)</span>
        <span><i style={{ background: "#EB5757" }} /> corridor (critical)</span>
        <span><i style={{ background: "#27AE60" }} /> reroute arc</span>
        <span><i style={{ background: "#9B59B6" }} /> refinery</span>
        <span><i style={{ background: "#56CCF2" }} /> chokepoint</span>
      </div>
    </div>
  );
}
