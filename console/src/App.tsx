import { useEffect } from "react";
import { useStore } from "./store";
import TopNav from "./components/TopNav";
import Sidebar from "./components/Sidebar";
import StatusBar from "./components/StatusBar";
import SignalTicker from "./components/SignalTicker";
import BriefCard from "./components/BriefCard";
import OverviewView from "./views/OverviewView";
import SentinelView from "./views/SentinelView";
import OracleView from "./views/OracleView";
import ActionView from "./views/ActionView";

export default function App() {
  const boot = useStore((s) => s.boot);
  const view = useStore((s) => s.view);
  const status = useStore((s) => s.status);

  useEffect(() => {
    boot().catch((e) => console.error("boot failed — is the backend on :8000?", e));
  }, [boot]);

  return (
    <div className="shell">
      <TopNav />
      <div className="main">
        <Sidebar />
        <div className="workspace">
          {view === "overview" && <OverviewView />}
          {view === "sentinel" && <SentinelView />}
          {view === "oracle" && <OracleView />}
          {view === "action" && <ActionView />}
          {!status && (
            <div className="boot-overlay">connecting to PRAHARI backend on :8000…</div>
          )}
        </div>
      </div>
      <SignalTicker />
      <StatusBar />
      <BriefCard />
    </div>
  );
}
