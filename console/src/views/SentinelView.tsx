// PRAHARI — Intelligence Hub (Sentinel): live feeds, AIS targets, risk telemetry
import MapTwin from "../components/MapTwin";
import { useStore } from "../store";

function timeAgo(ts: number): string {
  const s = Math.max(0, Date.now() / 1000 - ts);
  if (s < 90) return `${Math.round(s)}s ago`;
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

const BAND_RANK = { low: 0, elevated: 1, high: 2, critical: 3 } as const;

/** ambient watch grid: each strait's import share + worst corridor band through it */
function ChokepointWatch() {
  const twin = useStore((s) => s.twin);
  const corridors = useStore((s) => s.corridors);
  if (!twin) return null;
  const cps = twin.features.filter((f) => f.properties.kind === "chokepoint");
  const corridorFeatures = twin.features.filter((f) => f.properties.kind === "corridor");
  const rows = cps.map((cp) => {
    const through = corridorFeatures
      .filter((f) => (f.properties.chokepoints ?? []).includes(cp.properties.id))
      .map((f) => corridors[f.properties.id])
      .filter(Boolean);
    const worst = through.reduce(
      (a, b) => (BAND_RANK[b!.band] > BAND_RANK[a!.band] ? b : a), through[0]);
    return { id: cp.properties.id, name: cp.properties.name,
             share: cp.properties.share_pct, band: worst?.band ?? "low",
             cdp: worst?.cdp ?? 0 };
  }).sort((a, b) => b.share - a.share);
  return (
    <div className="intel-card">
      <div className="intel-head">
        <span>🎯 CHOKEPOINT WATCH</span>
        <span className="hint">share of India's imports</span>
      </div>
      {rows.map((r) => (
        <div key={r.id} className="cpw-row"
          title={`worst corridor through ${r.name}: CDP ${r.cdp.toFixed(2)} (${r.band})`}>
          <span className={`cpw-dot band-${r.band}`}>●</span>
          <span className="cpw-name">{r.name}</span>
          <span className="cpw-share mono">{r.share}%</span>
          <span className={`sb-band band-${r.band}`}>{r.band.toUpperCase()}</span>
        </div>
      ))}
    </div>
  );
}

function SanctionAlerts() {
  const signals = useStore((s) => s.signals);
  const sanctions = signals.filter((s) => s.type === "sanction_update").slice(0, 3);
  return (
    <div className="intel-card">
      <div className="intel-head">
        <span>⚠ SANCTIONS WATCH</span>
        <span className="badge badge-live">OFAC + OpenSanctions</span>
      </div>
      {sanctions.length === 0 ? (
        <div className="intel-empty">
          no fresh SDN additions this session — baseline loaded, watching daily
        </div>
      ) : (
        sanctions.map((s) => (
          <div key={s.signal_id} className="alert-row">
            <span className={`tick-mode tick-mode-${s.mode}`}>{s.mode}</span>
            {s.summary}
          </div>
        ))
      )}
    </div>
  );
}

function AisTargets() {
  const vessels = useStore((s) => s.vessels);
  const aisFeed = useStore((s) => s.status?.feeds?.ais ?? "off");
  const top = vessels.slice(0, 6);
  return (
    <div className="intel-card">
      <div className="intel-head">
        <span>🚢 PRIORITY AIS TARGETS</span>
        <span className={`badge ${String(aisFeed).startsWith("live") ? "badge-live" : "badge-static"}`}>
          {String(aisFeed).startsWith("live") ? "STREAMING" : "LINK DOWN"}
        </span>
      </div>
      {top.length === 0 ? (
        <div className="intel-empty">
          {String(aisFeed).startsWith("live")
            ? "aisstream.io upstream degraded — reconnecting with backoff; monitor boxes armed over Hormuz · Bab el-Mandeb · Suez · Malacca"
            : "AIS feed off (no key)"}
        </div>
      ) : (
        <table className="ais-table">
          <thead>
            <tr><th>VESSEL</th><th>SOG</th><th>POSITION</th></tr>
          </thead>
          <tbody>
            {top.map((v: any) => (
              <tr key={v.mmsi}>
                <td>{v.name || v.mmsi}</td>
                <td>{v.sog?.toFixed(1)} kn</td>
                <td className="mono">{v.lat?.toFixed(2)}, {v.lon?.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function GdeltStream() {
  const signals = useStore((s) => s.signals);
  const news = signals.filter((s) => s.type === "conflict_event").slice(0, 6);
  return (
    <div className="intel-card">
      <div className="intel-head">
        <span>🌐 GDELT SIGNAL STREAM</span>
        <span className="badge badge-live">LIVE · no key required</span>
      </div>
      {news.length === 0 ? (
        <div className="intel-empty">quiet — polling every 5 min</div>
      ) : (
        news.map((s) => (
          <div key={s.signal_id} className="news-row">
            <div className="news-meta">
              <span className={`tick-mode tick-mode-${s.mode}`}>{s.mode}</span>
              <span className="news-time">{timeAgo(s.ts)}</span>
              <span className="news-mag">m{s.magnitude.toFixed(2)}</span>
            </div>
            <div className="news-summary">{s.summary}</div>
          </div>
        ))
      )}
    </div>
  );
}

function RiskTelemetry() {
  const corridors = useStore((s) => s.corridors);
  const selected = useStore((s) => s.selectedCorridor);
  const list = Object.values(corridors);
  if (!list.length) return null;
  const c = (selected && corridors[selected]) || list.reduce((a, b) => (a.cdp > b.cdp ? a : b));
  return (
    <div className="intel-card">
      <div className="intel-head">
        <span>📡 RISK TELEMETRY — {c.corridor_id.toUpperCase()}</span>
        <span className={`sb-band band-${c.band}`}>{(c.cdp * 100).toFixed(0)}%</span>
      </div>
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
            <ul className="evidence">{f.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
          )}
        </div>
      ))}
      <div className="detail-note">
        CDP = σ(scale·(Σ wᵢ·factorᵢ + 0.55·baseline) + bias) — click corridors on the map to switch
      </div>
    </div>
  );
}

export default function SentinelView() {
  return (
    <div className="view view-sentinel">
      <div className="sentinel-map"><MapTwin /></div>
      <div className="sentinel-rail">
        <ChokepointWatch />
        <SanctionAlerts />
        <AisTargets />
        <RiskTelemetry />
        <GdeltStream />
      </div>
    </div>
  );
}
