// PRAHARI — live signal feed ticker (bottom strip)
import { useStore } from "../store";

const TYPE_ICON: Record<string, string> = {
  conflict_event: "🌐",
  ais_anomaly: "🚢",
  sanction_update: "⚖️",
  price_move: "📈",
};

export default function SignalTicker() {
  const signals = useStore((s) => s.signals);
  return (
    <div className="ticker-strip">
      <span className="ticker-title">SIGNALS</span>
      <div className="ticker-scroll">
        {signals.length === 0 && (
          <span className="ticker-empty">watching GDELT · AIS · OFAC · Brent — quiet for now</span>
        )}
        {signals.map((sig) => (
          <span key={sig.signal_id} className={`tick tick-${sig.mode}`}>
            <span className={`tick-mode tick-mode-${sig.mode}`}>{sig.mode}</span>
            {TYPE_ICON[sig.type] ?? "•"} {sig.summary || sig.type}
            <em>m{sig.magnitude.toFixed(2)}</em>
          </span>
        ))}
      </div>
    </div>
  );
}
