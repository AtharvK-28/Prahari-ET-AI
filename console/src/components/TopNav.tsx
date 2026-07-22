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

  const voiceEnabled = useStore((s) => s.voiceEnabled);
  const toggleVoice = useStore((s) => s.toggleVoice);
  const corridors = useStore((s) => s.corridors);
  const inCrisis = Object.values(corridors).some((c) => c.band === "critical");

  const stageState = (name: string) => {
    const st = stages.find((s) => s.stage === name);
    return st ? (st.status === "done" ? "done" : "run") : "wait";
  };

  return (
    <header className={`topnav ${inCrisis ? "topnav-crisis" : ""}`}>
      <div className="brand">
        <span className="brand-shield">⬡</span>
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

      {inCrisis && (
        <span className="crisis-chip" title="a corridor CDP is in the critical band">
          ⚠ CRISIS MODE
        </span>
      )}

      <div className="loop-zone">
        <button className={`btn-voice ${voiceEnabled ? "btn-voice-on" : ""}`}
          onClick={toggleVoice}
          title="Supervisor speaks the decision brief aloud (computed values only)">
          {voiceEnabled ? "🔊 VOICE ON" : "🔇 VOICE"}
        </button>
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
