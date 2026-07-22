# PRAHARI — Implementation Plan

*Predictive Risk & Adaptive Hydrocarbon Agentic Response Intelligence*
**Version:** 1.0 · **Companion docs:** Ideation, PRD, TRD

---

## 1. Strategy: build the spine, then fan out

The single most important rule: **get the `Sentinel → Oracle → Navigator` spine working end-to-end early**, even on stubbed data, then progressively swap stubs for live feeds and add Custodian + the full twin. A shallow-but-complete loop beats a deep-but-broken one — and the loop *is* the winning demo.

**Critical path (must exist for the demo):**
```
seed KG  →  Sentinel CDP (on ≥1 live feed)  →  Oracle (1 scenario)
        →  Navigator (ranked reroute)  →  Supervisor brief  →  Console with live trigger
```
Everything else (Custodian, what-if slider, RAG explain, uncertainty bands, extra scenarios) is **additive** and can be cut without breaking the demo.

---

## 2. Phased plan (works for a 36–48h sprint *or* a multi-day hackathon)

Phases are ordered by dependency, not clock. Compress or expand each to fit your window. Percentages are share of total build time.

### Phase 0 — Foundation (~10%)
**Goal:** everyone can run the repo; data feeds authenticated; KG seeded.
- Register keys: AISStream, EIA, GDELT Cloud (if used), Brent quote API. *(Do this first — key approval can lag.)*
- Scaffold repo per TRD §8; `docker-compose up` brings up Postgres/PostGIS + Redis + FastAPI + React shell.
- Author `config/seed_data.yaml`: ~15 suppliers, ~8 refineries (with grade profiles), 4 chokepoints, 3 SPR sites, ~10 corridors. **Mark every figure *to-verify*.**
- Load KG (Neo4j or NetworkX) + PostGIS geometries; console renders an empty map with corridors/refineries.
- **Exit test:** map shows the seeded twin; `/corridors` returns the graph.

### Phase 1 — Sentinel spine (~20%)
**Goal:** a live CDP number per corridor, explainable.
- Ingestion workers → Redis Streams, normalising to the common signal schema. Start with **GDELT + Brent** (simplest reliable), add **AISStream** next.
- AIS anomaly detector (reroute / speed-collapse / dark-gap) over a Hormuz + Bab-el-Mandeb bounding box.
- CDP fusion (`cdp.py`) with hand-set weights + factor contributions; `/corridors/{id}/explain`.
- Console: corridor risk dashboard with colour bands + "why it moved" panel; WebSocket live updates.
- **Exit test:** injecting a signal moves the right corridor's CDP and shows top factors.

### Phase 2 — Oracle (~20%)
**Goal:** a triggered/hypothetical shock produces India-specific impact.
- Graph-propagation impact engine (supply loss → refinery run-rate → days-of-cover → price → GDP proxy).
- Ship **1 canonical scenario first** (Hormuz 50% / 30d), then add Red Sea + OPEC+.
- Editable assumptions + Monte-Carlo band.
- Console: impact panel + assumption editor + what-if slider.
- **Exit test:** Hormuz scenario yields plausible days-of-cover ≈ single digits and a positive Brent delta; editing an assumption recomputes < 5 s.

### Phase 3 — Navigator (~15%)
**Goal:** a ranked, executable reroute for the gap Oracle produced.
- Curated alternative-source table (supplier×grade×corridor with landed cost, ETA, tanker availability).
- OR-Tools optimisation (or transparent multi-criteria ranking fallback) with grade-compatibility + risk-ceiling constraints.
- Console: ranked recommendation cards with all four annotations + feasibility flags.
- **Exit test:** ≥3 feasible alternatives returned; grade-incompatible options excluded with a reason.

### Phase 4 — Supervisor + decision brief + live trigger (~15%)
**Goal:** the full loop runs itself in < 60 s.
- LangGraph supervisor: watch CDP → threshold → Oracle → Navigator (→ Custodian) → compose brief → human review.
- LLM composes the one-page brief from **structured outputs only** (narrates computed numbers, invents none).
- Console: decision-brief card + approve/dismiss + a **"Trigger demo signal"** button with a visible elapsed timer.
- **Exit test:** clicking the trigger drives signal→brief end-to-end with timer ≤ 60 s.

### Phase 5 — Custodian + polish + rehearsal (~20%)
**Goal:** complete the five-agent story and make it demo-bulletproof.
- Custodian SPR drawdown heuristic with reserve floor; add its line to the brief.
- Add remaining scenarios; RAG "explain this signal" if time allows.
- **Replay harness:** record a real signal window; run the demo in labelled "replay" mode as a safety net.
- Circuit-breakers on every feed → cache/replay fallback; console never blocks.
- Rehearse the 60-second pitch loop **≥5 times**; freeze scope 3 hours before submission.
- **Exit test:** full rehearsal on venue Wi-Fi (and offline replay) both succeed.

---

## 3. Suggested team split (adapt to your actual team)

| Track | Owns | Phases |
|---|---|---|
| **Data/Ingestion** | Feeds, signal schema, AIS anomaly, seed KG | 0,1 |
| **ML/Agents** | CDP fusion, Oracle propagation, Navigator/Custodian optimisers, LangGraph supervisor | 1–5 |
| **Frontend** | Console: map twin, dashboards, scenario sandbox, brief cards, live trigger | 0–5 |
| **Product/Pitch** | Seed-data verification, scenario calibration, deck, demo video, narrative | throughout |

Solo or duo? Do the phases strictly in order and cut Phase 5 extras first. The spine (Phases 0–4) is the non-negotiable core.

---

## 4. Deliverable mapping (what the hackathon asks for)

| Required deliverable | Produced by | When |
|---|---|---|
| **Working prototype** | The console + spine (Phases 0–4) | by end of Phase 4 |
| **Architecture diagram** | TRD §1 mermaid → exported as an image | Phase 0 draft, finalise Phase 5 |
| **Presentation deck** | Product/Pitch track from Ideation + PRD | drafted Phase 2, finalised Phase 5 |
| **Demo video** | Screen-record the 60-second live loop | Phase 5 |

---

## 5. Demo script (the 90-second pitch)

1. **(10s) Hook:** "India imports 88% of its crude, 40% through one strait, with 9½ days of reserve. When Hormuz twitches, refiners scramble blind for weeks." 
2. **(15s) The idea:** "PRAHARI is a sentinel that turns that signal into an executable decision in under a minute." Show the live map twin.
3. **(55s) The live loop:** click **Trigger demo signal** → CDP spikes with factors → Oracle impact → Navigator reroute → Custodian SPR → one-page brief → *approve*. Narrate the timer.
4. **(10s) Close:** "Five specialised agents, one console, every number explainable — response time from weeks to seconds." Land on the judging-criteria slide.

**Golden rule:** lead with the loop, not the architecture. Show the decision a real procurement head makes.

---

## 6. Risk register & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Live feed fails in the hall | High | High | Labelled replay of a recorded real window; aggressive cache |
| API key approval delayed | Med | High | Register **day 0**; have a recorded dataset ready as fallback |
| Scope creep across 5 agents | High | High | Freeze at the spine; Custodian/extras are cuttable |
| Optimiser too slow / brittle | Med | Med | OR-Tools time-boxed → transparent ranking fallback |
| Scenario numbers implausible | Med | High | Calibrate against the brief's stated facts; show uncertainty bands, not false precision |
| LLM invents numbers in the brief | Med | High | LLM only narrates structured computed values; unit-test the brief composer |
| Seed data is stale/wrong | High | Med | One config file, all marked *to-verify*; validate vs PPAC/EIA pre-pitch |
| Venue Wi-Fi throttles WebSocket | Med | High | Local backend + offline replay mode rehearsed |

---

## 7. Definition of Done (MVP)

- [ ] Console renders the live geospatial twin with corridors, refineries, SPR sites.
- [ ] ≥1 live feed drives a per-corridor CDP with visible top factors + lead-time.
- [ ] ≥1 scenario computes India-specific impact with editable assumptions + uncertainty band.
- [ ] Navigator returns ≥3 feasible, annotated, ranked alternatives; infeasible ones flagged.
- [ ] Custodian returns a drawdown schedule that never breaches the floor.
- [ ] Supervisor drives the full loop and composes a one-page decision brief with approve action.
- [ ] End-to-end demo trigger completes in **< 60 s** with a visible timer.
- [ ] Replay mode works offline as a demo safety net.
- [ ] Architecture diagram, deck, and demo video produced.
- [ ] All seed figures verified or explicitly flagged in the pitch.

---

## 8. First 90 minutes (kick-off checklist)

1. Create repo + `docker-compose.yml`; everyone clones and runs the shell.
2. Register AISStream + EIA + Brent + GDELT keys **now**.
3. Draft `seed_data.yaml` skeleton (even rough numbers) so the KG loads.
4. Stand up FastAPI `/corridors` returning the seeded graph.
5. Render the map twin in the console from `/corridors`.
6. Agree the **one canonical scenario** to ship first (recommend Hormuz 50% / 30d).
7. Assign tracks (§3) and set the Phase-4 spine as the shared deadline.

*Ship the loop. Everything else is garnish.*
