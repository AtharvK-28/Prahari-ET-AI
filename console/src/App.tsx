import { useEffect } from "react";
import { useStore } from "./store";
import TopBar from "./components/TopBar";
import MapTwin from "./components/MapTwin";
import RiskPanel from "./components/RiskPanel";
import ScenarioPanel from "./components/ScenarioPanel";
import PlanPanel from "./components/PlanPanel";
import BriefCard from "./components/BriefCard";
import SignalTicker from "./components/SignalTicker";

export default function App() {
  const boot = useStore((s) => s.boot);
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const status = useStore((s) => s.status);

  useEffect(() => {
    boot().catch((e) => console.error("boot failed — is the backend on :8000?", e));
  }, [boot]);

  return (
    <div className="shell">
      <TopBar />
      <div className="main">
        <div className="map-pane">
          <MapTwin />
          {!status && (
            <div className="boot-overlay">
              connecting to PRAHARI backend on :8000…
            </div>
          )}
        </div>
        <aside className="rail">
          <nav className="tabs">
            {(["risk", "scenario", "plan"] as const).map((t) => (
              <button key={t} className={`tab ${tab === t ? "tab-on" : ""}`}
                onClick={() => setTab(t)}>
                {t === "risk" ? "⚡ Risk" : t === "scenario" ? "🌀 Scenario" : "🧭 Plan"}
              </button>
            ))}
          </nav>
          {tab === "risk" && <RiskPanel />}
          {tab === "scenario" && <ScenarioPanel />}
          {tab === "plan" && <PlanPanel />}
        </aside>
      </div>
      <SignalTicker />
      <BriefCard />
    </div>
  );
}
