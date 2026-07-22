// PRAHARI — top command bar: brand, Brent tick, feed badges, demo trigger + timer
import { useStore } from "../store";

export default function TopBar() {
  const status = useStore((s) => s.status);
  const wsConnected = useStore((s) => s.wsConnected);
  const fireTrigger = useStore((s) => s.fireTrigger);
  const loopRunning = useStore((s) => s.loopRunning);
  const loopElapsed = useStore((s) => s.loopElapsed);
  const stages = useStore((s) => s.stages);
  const brief = useStore((s) => s.brief);
  const setBriefOpen = useStore((s) => s.setBriefOpen);

  const stageLabel = (name: string) => {
    const st = stages.find((s) => s.stage === name);
    return st ? (st.status === "done" ? "done" : "run") : "wait";
  };

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">प्रहरी</span>
        <span className="brand-name">PRAHARI</span>
        <span className="brand-sub">energy sentinel · India crude</span>
      </div>

      <div className="ticker">
        <span className="ticker-label">BRENT</span>
        <span className="ticker-value">${status?.brent_usd?.toFixed(2) ?? "—"}</span>
        <span className={`badge badge-${status?.brent_source === "eia_live" ? "live" : status?.brent_source === "demo" ? "demo" : "static"}`}>
          {status?.brent_source === "eia_live" ? "LIVE" : status?.brent_source === "demo" ? "DEMO" : "SEED"}
        </span>
      </div>

      <div className="feeds">
        {status &&
          Object.entries(status.feeds).map(([name, st]) => (
            <span key={name} className={`feed ${String(st).startsWith("live") || String(st) === "anthropic" ? "feed-on" : "feed-off"}`}
              title={`${name}: ${st}`}>
              {name}
            </span>
          ))}
        <span className={`feed ${wsConnected ? "feed-on" : "feed-off"}`} title="websocket">ws</span>
      </div>

      <div className="loop-zone">
        {(loopRunning || stages.length > 0) && (
          <div className="stages">
            {["oracle", "navigator", "custodian", "brief"].map((s) => (
              <span key={s} className={`stage stage-${stageLabel(s)}`}>{s}</span>
            ))}
            <span className={`timer ${loopElapsed < 60 ? "timer-ok" : "timer-over"}`}>
              {loopElapsed.toFixed(1)}s
            </span>
          </div>
        )}
        {brief && !loopRunning && (
          <button className="btn-brief" onClick={() => setBriefOpen(true)}>
            📋 brief {brief.status !== "pending" ? `· ${brief.status}` : ""}
          </button>
        )}
        <button className="btn-trigger" onClick={fireTrigger} disabled={loopRunning}>
          {loopRunning ? "⏳ loop running…" : "⚡ Trigger demo signal"}
        </button>
      </div>
    </header>
  );
}
