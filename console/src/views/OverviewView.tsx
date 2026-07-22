// PRAHARI — Strategic Overview: full-bleed map twin + CDP hero + corridor board
import ChronologyStrip from "../components/ChronologyStrip";
import MapTwin from "../components/MapTwin";
import RiskPanel from "../components/RiskPanel";
import { useStore } from "../store";

function CdpHero() {
  const corridors = useStore((s) => s.corridors);
  const threshold = useStore((s) => s.status?.alert_threshold ?? 0.65);
  const setXray = useStore((s) => s.setXray);
  const list = Object.values(corridors);
  if (!list.length) return null;
  const worst = list.reduce((a, b) => (a.cdp > b.cdp ? a : b));
  const pct = worst.cdp * 100;

  return (
    <div className="cdp-hero cdp-hero-click" onClick={() => setXray(worst.corridor_id)}
      title="open the CDP X-ray: every term of the fusion equation, live">
      <div className="cdp-hero-head">
        <span>CORRIDOR DISRUPTION PROBABILITY</span>
        <span className="cdp-hero-xray">⊕ X-RAY</span>
      </div>
      <div className="cdp-hero-row">
        <span className={`cdp-hero-num band-${worst.band}`}>{pct.toFixed(1)}%</span>
        <span className="cdp-hero-corridor">{worst.name}</span>
      </div>
      <div className="cdp-hero-track">
        <div className="cdp-hero-seg seg-nominal" />
        <div className="cdp-hero-seg seg-elevated" />
        <div className="cdp-hero-seg seg-critical" />
        <div className="cdp-hero-needle" style={{ left: `${Math.min(pct, 100)}%` }} />
      </div>
      <div className="cdp-hero-labels">
        <span>NOMINAL</span>
        <span>ELEVATED</span>
        <span>CRITICAL ≥{(threshold * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

export default function OverviewView() {
  return (
    <div className="view view-overview">
      <div className="overview-map">
        <MapTwin />
        <ChronologyStrip />
      </div>
      <div className="overview-rail">
        <CdpHero />
        <RiskPanel />
      </div>
    </div>
  );
}
