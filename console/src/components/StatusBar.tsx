// PRAHARI — footer status ticker: brent tick, worst chokepoint, signal count
import { useStore } from "../store";

export default function StatusBar() {
  const status = useStore((s) => s.status);
  const corridors = useStore((s) => s.corridors);
  const list = Object.values(corridors);
  const worst = list.length
    ? list.reduce((a, b) => (a.cdp > b.cdp ? a : b))
    : null;

  const brentBadge = status?.brent_source === "eia_live" || status?.brent_source === "fred_daily"
    ? "LIVE" : status?.brent_source === "demo" ? "DEMO" : "SEED";

  return (
    <footer className="statusbar">
      <span className="sb-item">
        <span className="sb-key">BRENT_CRUDE:</span>{" "}
        <span className="sb-val">${status?.brent_usd?.toFixed(2) ?? "—"}</span>
        <span className={`badge badge-${brentBadge === "LIVE" ? "live" : brentBadge === "DEMO" ? "demo" : "static"}`}>{brentBadge}</span>
      </span>
      {worst && (
        <span className="sb-item">
          <span className="sb-key">TOP_RISK_CORRIDOR:</span>{" "}
          <span className="sb-val">{worst.corridor_id.toUpperCase()}</span>
          <span className={`sb-band band-${worst.band}`}>{worst.band.toUpperCase()} {worst.cdp.toFixed(2)}</span>
        </span>
      )}
      <span className="sb-item">
        <span className="sb-key">SIGNALS_SEEN:</span>{" "}
        <span className="sb-val">{status?.signals_seen ?? 0}</span>
      </span>
      <span className="sb-item sb-right">
        <span className="sb-key">MODEL:</span>{" "}
        <span className="sb-val">{status?.model_version ?? "—"}</span>
      </span>
    </footer>
  );
}
