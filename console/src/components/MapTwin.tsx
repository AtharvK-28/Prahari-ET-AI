// PRAHARI — geospatial digital twin (deck.gl over MapLibre, free CARTO basemap)
import { useMemo, useState } from "react";
import DeckGL from "@deck.gl/react";
import { PathLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
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

export default function MapTwin() {
  const twin = useStore((s) => s.twin);
  const corridors = useStore((s) => s.corridors);
  const vessels = useStore((s) => s.vessels);
  const select = useStore((s) => s.select);
  const selected = useStore((s) => s.selectedCorridor);
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);

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
    ];
  }, [twin, corridors, vessels, selected, select]);

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
        <span><i style={{ background: "#2D9CDB" }} /> corridor (low)</span>
        <span><i style={{ background: "#EB5757" }} /> corridor (critical)</span>
        <span><i style={{ background: "#9B59B6" }} /> refinery</span>
        <span><i style={{ background: "#27AE60" }} /> SPR site</span>
        <span><i style={{ background: "#56CCF2" }} /> chokepoint</span>
      </div>
    </div>
  );
}
