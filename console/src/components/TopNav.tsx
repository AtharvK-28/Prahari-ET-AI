// PRAHARI — top command bar: brand, view nav, loop stages + timer, demo trigger
import { useStore } from "../store";

const VIEWS = [
  { id: "overview", label: "Strategic Overview" },
  { id: "sentinel", label: "Intelligence Hub" },
  { id: "oracle", label: "Simulation" },
  { id: "action", label: "Action Center" },
] as const;

export default function TopNav() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const fireTrigger = useStore((s) => s.fireTrigger);
  const loopRunning = useStore((s) => s.loopRunning);
  const loopElapsed = useStore((s) => s.loopElapsed);
  const stages = useStore((s) => s.stages);
  const brief = useStore((s) => s.brief);
  const setBriefOpen = useStore((s) => s.setBriefOpen);

  const stageState = (name: string) => {
    const st = stages.find((s) => s.stage === name);
    return st ? (st.status === "done" ? "done" : "run") : "wait";
  };

  return (
    <header className="topnav">
      <div className="brand">
        <span className="brand-shield">🛡</span>
        <span className="brand-name">PRAHARI</span>
      </div>
      <nav className="viewnav">
        {VIEWS.map((v) => (
          <button key={v.id} className={`viewtab ${view === v.id ? "viewtab-on" : ""}`}
            onClick={() => setView(v.id)}>
            {v.label}
          </button>
        ))}
      </nav>

      <div className="loop-zone">
        {(loopRunning || stages.length > 0) && (
          <div className="stages">
            {["oracle", "navigator", "custodian", "brief"].map((s) => (
              <span key={s} className={`stage stage-${stageState(s)}`}>{s}</span>
            ))}
            <span className={`timer ${loopElapsed < 60 ? "timer-ok" : "timer-over"}`}>
              {loopElapsed.toFixed(1)}s
            </span>
          </div>
        )}
        {brief && !loopRunning && (
          <button className="btn-brief" onClick={() => setBriefOpen(true)}>
            📋 BRIEF{brief.status !== "pending" ? ` · ${brief.status.toUpperCase()}` : ""}
          </button>
        )}
        <button className="btn-trigger" onClick={fireTrigger} disabled={loopRunning}>
          {loopRunning ? "⏳ LOOP RUNNING" : "▶ TRIGGER DEMO SIGNAL"}
        </button>
      </div>
    </header>
  );
}
