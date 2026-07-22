// PRAHARI — command sidebar: node status, agent fleet, feed roster
import { useStore } from "../store";

const AGENTS = [
  { id: "sentinel", name: "Sentinel", icon: "◎" },
  { id: "oracle", name: "Oracle", icon: "☉" },
  { id: "navigator", name: "Navigator", icon: "▲" },
  { id: "custodian", name: "Custodian", icon: "▣" },
  { id: "supervisor", name: "Supervisor", icon: "⌘" },
] as const;

export default function Sidebar() {
  const status = useStore((s) => s.status);
  const stages = useStore((s) => s.stages);
  const loopRunning = useStore((s) => s.loopRunning);
  const wsConnected = useStore((s) => s.wsConnected);
  const setView = useStore((s) => s.setView);

  const agentState = (id: string): "processing" | "active" | "standby" => {
    if (id === "supervisor") return loopRunning ? "processing" : "active";
    if (id === "sentinel") return "active";               // always watching
    const st = stages.find((s) => s.stage === (id === "custodian" ? "custodian" : id));
    if (st?.status === "running") return "processing";
    return loopRunning || st ? "active" : "standby";
  };
  const viewOf: Record<string, "overview" | "sentinel" | "oracle" | "action"> = {
    sentinel: "sentinel", oracle: "oracle", navigator: "action",
    custodian: "action", supervisor: "action",
  };

  return (
    <aside className="sidebar">
      <div className="node-card">
        <div className="node-title">COMMAND_NODE_01</div>
        <div className={`node-status ${wsConnected ? "" : "node-status-down"}`}>
          ● Operational Status: {wsConnected ? "ACTIVE" : "LINK DOWN"}
        </div>
      </div>

      <div className="side-section">
        <div className="side-head">AGENT FLEET STATUS</div>
        {AGENTS.map((a) => {
          const st = agentState(a.id);
          return (
            <button key={a.id} className="agent-row" onClick={() => setView(viewOf[a.id])}>
              <span className="agent-icon">{a.icon}</span>
              <span className="agent-name">{a.name}</span>
              <span className={`agent-badge agent-${st}`}>
                {st === "processing" ? "PROCESSING" : st === "active" ? "ACTIVE" : "STANDBY"}
              </span>
            </button>
          );
        })}
      </div>

      <div className="side-section">
        <div className="side-head">DATA FEEDS</div>
        {status &&
          Object.entries(status.feeds).map(([name, st]) => {
            const on = String(st).startsWith("live") || String(st).startsWith("loaded") ||
              String(st) === "anthropic";
            return (
              <div key={name} className="feed-row" title={`${name}: ${st}`}>
                <span className={`feed-dot ${on ? "feed-dot-on" : ""}`}>●</span>
                <span className="feed-name">{name.toUpperCase()}</span>
                <span className="feed-state">{String(st).split(" ")[0]}</span>
              </div>
            );
          })}
      </div>
    </aside>
  );
}
