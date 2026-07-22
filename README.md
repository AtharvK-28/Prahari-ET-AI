# PRAHARI — प्रहरी

**P**redictive **R**isk & **A**daptive **H**ydrocarbon **A**gentic **R**esponse **I**ntelligence

*A multi-agent sentinel that turns geopolitical and maritime signals into ranked, executable
crude-procurement and strategic-reserve decisions for India — end-to-end in under a minute.*

Hackathon PS: **AI-Driven Energy Supply Chain Resilience for Import-Dependent Economies**
Docs: [Ideation](docs/1_PRAHARI_Ideation.md) · [PRD](docs/2_PRAHARI_PRD.md) · [TRD](docs/3_PRAHARI_TRD.md) · [Plan](docs/4_PRAHARI_Implementation_Plan.md)

---

## The five agents

| Agent | Role |
|---|---|
| **Sentinel** | Fuses GDELT news + AIS vessel behaviour + OFAC sanctions + Brent into an explainable per-corridor **Corridor Disruption Probability** with lead-time |
| **Oracle** | Propagates a shock through the supply-chain knowledge graph → India-specific impact (run-rates, days-of-cover, price, GDP proxy) with Monte-Carlo bands |
| **Navigator** | Ranks alternative crude sources/routes under grade-compatibility, tanker, port and risk constraints |
| **Custodian** | SPR drawdown schedule that never breaches the reserve floor + replenishment window |
| **Supervisor** | Watches CDP, auto-triggers the chain on threshold crossing, composes the one-page decision brief for human approve/dismiss |

## Quickstart (two terminals)

```powershell
# 1 — backend (Python 3.11+)
cd backend
python -m venv .venv && .venv\Scripts\pip install -r requirements.txt
copy .env.example .env          # add keys if you have them — everything degrades gracefully
.venv\Scripts\python -m uvicorn app.main:app --port 8000

# 2 — console (Node 20+)
cd console
npm install
npm run dev                     # http://localhost:5173
```

Open the console, hit **⚡ Trigger demo signal**, and watch the full
signal → CDP spike → Oracle → Navigator → Custodian → decision-brief loop run
with a live timer (target < 60 s; currently ~1 s).

## API keys (all optional, all free)

| Key | Source | Without it |
|---|---|---|
| `AISSTREAM_API_KEY` | [aisstream.io](https://aisstream.io) | AIS live feed off; demo/replay covers it |
| `EIA_API_KEY` | [eia.gov/opendata](https://www.eia.gov/opendata/) | Brent stays at seed baseline (labelled) |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) | brief uses template narration instead of LLM |

GDELT + OFAC need no keys and run live out of the box.

## EIA bulk-data integration (real data grounding)

`data/CrudeOil/PET_IMPORTS.txt` (EIA bulk download, 2009–2026 monthly crude flows by
origin country) feeds `backend/scripts/eia_etl.py`, which derives a **flow-stability
reliability proxy** per supplier (activity × volatility over the last 60 months) into
`backend/config/derived_eia.yaml`. The KG overrides its seed reliability guesses with
these where ≥12 months of real signal exist, and the Navigator prices unreliability
into its ranking (`reliability_weight_usd`). The data catches real events — e.g.
Russia's proxy drops to 0.56 because the series shows flows halting after the
March-2022 US import ban. Suppliers with no US-bound flows (Oman, Qatar) keep their
seed values — labelled honestly rather than mis-scored.

`data/Coal/COAL.txt` is staged for the **multi-commodity vision** (the substrate
generalises to coal per TRD §10); not consumed by the crude MVP.

The bulk files are gitignored (389 MB); re-run the ETL after re-downloading:
`backend\.venv\Scripts\python backend\scripts\eia_etl.py`

## Data honesty rule (NFR3)

Every signal carries a `mode` tag — **live**, **replay** (recorded real window), or
**demo** (the labelled synthetic trigger burst). The console badges each one; nothing
fabricated is ever presented as live. All seed figures live in
[backend/config/seed_data.yaml](backend/config/seed_data.yaml) and are marked **to-verify**
against PPAC/EIA before the pitch.

## Repository layout

```
backend/
  app/
    ingestion/    # GDELT, AISStream, OFAC, EIA/Brent workers → async signal bus (+ replay)
    cognition/    # AIS anomaly detector, CDP fusion engine (explainable)
    knowledge/    # NetworkX supply-chain knowledge graph + GeoJSON twin
    agents/       # Oracle, Navigator, Custodian, Supervisor
    api/          # FastAPI routes + WebSocket stream
  config/         # seed_data.yaml (all figures, to-verify) + weights.yaml (model params)
  data/replay/    # recorded signal windows (demo safety net)
console/          # React + Vite + deck.gl Decision Console
docs/             # Ideation, PRD, TRD, Implementation Plan
```

## Architecture (TRD §1)

Sensing (streaming ingestion) → Cognition (Sentinel CDP) → Knowledge (KG + geo twin) →
Simulation & Decision (Oracle/Navigator/Custodian) → Orchestration (Supervisor) →
Decision Console. In-memory implementations (NetworkX KG, async bus) are the
TRD-sanctioned hackathon fallbacks — interfaces are shaped for Neo4j/Redis/PostGIS swap-in.
