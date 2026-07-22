// PRAHARI — decision ledger: every brief + human decision, hash-chained.
// Governance surface (NFR7): the chain is verified server-side by re-walking
// the audit file — any edit or deletion breaks it from that point on.
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store";
import type { LedgerResponse } from "../lib/types";

const fmt = (ts: number) =>
  new Date(ts * 1000).toLocaleTimeString("en-IN", { hour12: false });

export default function DecisionLedger() {
  const [ledger, setLedger] = useState<LedgerResponse | null>(null);
  const brief = useStore((s) => s.brief);

  useEffect(() => {
    let live = true;
    const load = () => api.ledger().then((l) => live && setLedger(l)).catch(() => {});
    load();
    const iv = setInterval(load, 20000);
    return () => { live = false; clearInterval(iv); };
  }, [brief?.brief_id, brief?.status]);

  if (!ledger) return null;

  return (
    <div className="intel-card ledger-card">
      <div className="intel-head">
        <span>⛓ DECISION LEDGER</span>
        <span className={ledger.chain.intact ? "grade-ok" : "risk-hot"}
          title={`${ledger.chain.checked} hash-chained audit entries re-verified server-side`}>
          {ledger.chain.intact ? `chain intact ✓ (${ledger.chain.checked})` : "CHAIN BROKEN ✗"}
        </span>
      </div>
      {ledger.entries.length === 0 ? (
        <div className="intel-empty">no briefs this session — trigger a loop</div>
      ) : (
        <table className="ledger-table">
          <thead>
            <tr><th>TIME</th><th>CORRIDOR</th><th>CDP</th>
                <th>DECISION</th><th>HASH</th></tr>
          </thead>
          <tbody>
            {[...ledger.entries].reverse().map((e) => (
              <tr key={e.brief_id}
                title={`loop ${e.elapsed_s}s · orchestrator ${e.orchestrator ?? "—"} · narrative ${e.narrative_source}`}>
                <td className="mono">{fmt(e.created_at)}</td>
                <td className="ledger-corridor" title={e.corridor_name}>{e.corridor_name}</td>
                <td className={`mono band-${e.band}`}>{(e.cdp * 100).toFixed(0)}%</td>
                <td>
                  <span className={`ledger-chip ledger-${e.status}`}>
                    {e.status.toUpperCase()}
                  </span>
                  {e.decided_at && <span className="ledger-when"> {fmt(e.decided_at)}</span>}
                </td>
                <td className="mono ledger-hash"
                  title={`brief ${e.hash ?? "—"}\ndecision ${e.decision_hash ?? "—"}\neach entry: sha256(prev_hash + payload)`}>
                  {e.hash ? e.hash.slice(0, 8) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="detail-note">
        sha256 chain over the append-only audit log · orchestrator + assumptions
        recorded per brief · human decision timestamped
      </div>
    </div>
  );
}
