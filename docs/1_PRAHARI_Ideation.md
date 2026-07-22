# PRAHARI — Ideation Document

**P**redictive **R**isk & **A**daptive **H**ydrocarbon **A**gentic **R**esponse **I**ntelligence

*Prahari (प्रहरी): "the sentinel." A system that stands watch over India's energy lifeline — turning geopolitical noise into an executable decision before the disruption lands.*

**Hackathon PS:** AI-Driven Energy Supply Chain Resilience for Import-Dependent Economies
**Theme:** Supply Chain Intelligence / Energy Security / Geopolitical Risk
**Version:** 1.0 (ideation)

---

## 1. The problem in one breath

India imports ~88% of its crude, and 40–45% of that transits a single 33-km-wide chokepoint — the Strait of Hormuz. The Strategic Petroleum Reserve covers roughly **9.5 days** of national consumption. The threat is not hypothetical: the 2025 US–Iran standoff pushed Brent up 8% in a session and forced Indian refiners onto spot markets at a premium, and through early 2026 the Red Sea / Persian Gulf threat has stayed live.

The gap is **not data** — AIS feeds, news, sanctions registries and price ticks all exist. The gap is a **decision layer**: something that watches all of it continuously, understands what a specific shock does to *India's specific refineries and reserves*, and hands a procurement or policy team a ranked, executable action **in minutes, not weeks**.

> A McKinsey analysis (per the problem brief) found economies without automated rerouting and demand-management took, on average, **47 days longer** to stabilise supply. PRAHARI is a bet on compressing those 47 days toward near-zero response latency.

---

## 2. The core insight (our wedge)

Most "energy risk" tools are one of three things: a **news dashboard**, a **price terminal**, or a **static supply-chain map**. Each is reactive and siloed. None of them closes the loop from *signal* to *action*.

**PRAHARI's wedge is the loop itself:**

```
   SIGNAL  ───▶  SCENARIO  ───▶  RECOMMENDATION  ───▶  HUMAN DECISION
 (what's       (what it does     (what to do          (approve / act)
  happening)    to India)         about it)
      ▲                                                     │
      └──────────────  continuous re-evaluation  ◀──────────┘
```

Three design commitments make this defensible and demo-able:

1. **Physical signals beat headlines.** We fuse **AIS vessel behaviour** (rerouting, speed collapse, "dark" gaps near chokepoints, convoy formation) with news and sanctions. Ships reroute *before* the analysts write it up — that is leading indicator, and almost no competitor uses it.
2. **India-specific propagation, not a global average.** A Hormuz shock does not hurt "India" uniformly — it hurts *Jamnagar, Vadinar and Mangalore* (Hormuz-fed, heavy-sour-capable) far more than a Paradip. Our knowledge graph encodes **refinery↔grade↔corridor dependency**, so impact is concrete and testable.
3. **Explainability with a lead-time number.** Every risk score shows *why it moved* and *how much warning it buys*. Judges (and real procurement heads) trust a number they can interrogate.

**One-line pitch:** *PRAHARI is a multi-agent sentinel that turns geopolitical and maritime signals into ranked, executable crude-procurement and strategic-reserve decisions for India — end-to-end in under a minute.*

---

## 3. What we're building (the system)

A **multi-agent system** sitting on top of a **persistent energy supply-chain knowledge graph + geospatial digital twin**. The graph/twin is the always-on substrate; a swarm of specialised agents reasons over it, coordinated by a supervisor, with a human in the loop for every consequential decision.

This design lets us address **all five** of the problem statement's illustrative builds in *one coherent product* rather than five shallow demos:

| PS illustrative build | PRAHARI component | Role |
|---|---|---|
| Geopolitical Risk Intelligence Agent | **Sentinel Agent** | Continuously scores corridor disruption probability |
| Disruption Scenario Modeller | **Oracle Agent** | Simulates a shock, propagates cascading impact |
| Adaptive Procurement Orchestrator | **Navigator Agent** | Ranks alternative crude sources + routes |
| Strategic Reserve Optimisation Agent | **Custodian Agent** | Optimises SPR drawdown / replenishment |
| Supply Chain Digital Twin | **The KG + geospatial twin** (substrate) | Persistent "what-if" intelligence platform |
| *(agentic glue)* | **Supervisor Agent** | Orchestrates the swarm, composes the decision brief, manages human handoff |

### The five agents at a glance

- **Sentinel** — ingests GDELT events + news, AISStream vessel behaviour, OFAC sanctions, and Brent/freight prices → emits a **Corridor Disruption Probability (CDP)** per corridor/supplier, continuously, with contributing factors + confidence + estimated lead time.
- **Oracle** — given a triggered or hypothetical event (e.g. "Hormuz 50% throughput cut, 30 days"), propagates it through the graph + twin to compute **cascading impact**: refinery run-rate loss, days-of-cover erosion, Brent + India-basket price delta, power-sector stress, and a GDP/import-bill shock proxy — all with **explicit, editable assumptions**.
- **Navigator** — given a supply gap, solves a constrained optimisation over **alternative crude grades and routes** (landed cost, tanker availability, port congestion, corridor risk, refinery grade-compatibility) → a ranked, executable procurement plan.
- **Custodian** — models the optimal **SPR drawdown schedule** to bridge the forecast gap while preserving a tail-risk floor, plus a replenishment window when prices normalise.
- **Supervisor** — the agentic conductor: watches Sentinel, auto-triggers Oracle when CDP crosses a threshold, dispatches Navigator + Custodian, and assembles a single **one-page decision brief** for the human.

---

## 4. The demo money-shot (how we win the room)

The evaluation rewards *"demonstrated end-to-end response time from signal to recommendation."* So we make that the live centrepiece.

**Scenario: a Hormuz incident, watched live.**

1. **T+0s** — A GDELT conflict event + an AIS anomaly (three tankers reverse course south of Hormuz) land in the Sentinel feed.
2. **T+8s** — Sentinel's CDP for the *Hormuz→West-Coast-India* corridor jumps **0.31 → 0.82**, flagging the top three contributing signals and an estimated **lead time**.
3. **T+12s** — Supervisor auto-triggers Oracle. The map twin highlights the affected corridor and the refineries downstream of it.
4. **T+30s** — Console shows: **~42% of imports at risk**, days-of-cover falling to *N*, Brent **+Y%**, India basket premium widening, Jamnagar/Vadinar/Mangalore run-rates stressed.
5. **T+45s** — Navigator returns a **ranked reroute**: West African + US + Brazilian grades via the Cape route, each with landed cost, ETA, corridor risk and grade-fit; Custodian returns an SPR drawdown schedule.
6. **T+55s** — Supervisor composes a **one-page decision brief**. A human clicks *approve*.

**Under a minute, on screen, on a map, with every number explainable.** That single flow touches all five judging criteria at once.

---

## 5. Why this scores on the judging rubric

| Criterion | Weight | How PRAHARI earns it |
|---|---|---|
| **Innovation** | 25% | AIS "physical" signal fused with news; closed signal→decision loop; explainable CDP with lead-time; agentic supervisor with human-in-the-loop brief. Not another dashboard. |
| **Business Impact** | 25% | Directly attacks the "47-days-slower" penalty; quantifies import-bill shock, reroute savings, and SPR-timing value for named users (oil PSUs, MoPNG/PPAC, ISPRL). |
| **Technical Excellence** | 20% | Real-time multi-source fusion, knowledge graph + PostGIS twin, LangGraph multi-agent orchestration, transparent optimisation (OR-Tools), RAG grounding. |
| **Scalability** | 15% | Substrate generalises beyond crude to LNG, coal, fertiliser, and to any import-dependent economy; streaming ingestion + stateless agents scale horizontally. |
| **User Experience** | 15% | One console: map twin + risk dashboard + scenario sandbox + a decision brief a procurement head can act on without reading a manual. |

---

## 6. Target users & their job-to-be-done

- **Oil PSU / refiner procurement desks** (IOCL, BPCL, HPCL, RIL Jamnagar, Nayara) — *"A corridor I depend on is at risk. Give me feasible, priced alternatives I can act on within hours, not a week of spot scrambling."*
- **Policymakers — MoPNG / PPAC** — *"How exposed are we right now, and what does this specific shock do to fuel prices and GDP?"*
- **ISPRL (Strategic Reserve managers)** — *"When and how much do I draw down to bridge the gap without exhausting my floor — and when do I refill?"*

Primary demo persona: the **procurement head at a west-coast refiner** during a Hormuz scare — the highest-stakes, most time-pressured user.

---

## 7. Differentiation vs. what exists

| Existing approach | Limitation | PRAHARI |
|---|---|---|
| News/geopolitical dashboards (e.g. GDELT viewers) | Signal only; no India-specific impact, no action | Propagates signal to *your* refineries and hands you an action |
| Commodity terminals (Bloomberg/price feeds) | Price only; lagging, expensive | Fuses price with physical AIS + news as a *leading* indicator |
| Static supply-chain maps / BI dashboards | No real-time signal, no scenario engine | Live twin with continuous "what-if" and auto-triggered scenarios |
| Generic "AI risk" copilots | Black-box, no domain grounding, not executable | Explainable CDP, grade-compatibility grounding, ranked executable plans, human-in-the-loop |

---

## 8. Scope: full vision vs. hackathon MVP

**We build the spine end-to-end and fake nothing that matters.** Where a live feed is flaky in a demo hall, we replay a *recorded real* window (clearly labelled "replay"), never fabricated data.

**Hackathon MVP (what we demo):**
- Curated seed **knowledge graph** of India's crude supply chain (~15 suppliers, ~8 refineries with grade profiles, 4 chokepoints, 3 SPR sites, ~10 corridors) built from public data.
- **Sentinel** live on GDELT + Brent + an AIS bounding box over Hormuz/Bab-el-Mandeb; CDP computed per corridor.
- **Oracle** with 3 fully-modelled canonical scenarios (Hormuz partial closure, Red Sea suspension, OPEC+ emergency cut) + a free-form "what-if" slider.
- **Navigator** optimisation over a curated alternative-source table.
- **Custodian** SPR drawdown heuristic with a reserve floor.
- **Supervisor + Decision Console:** map twin, risk dashboard, scenario sandbox, decision-brief cards, and the live <60s end-to-end trigger.

**Post-hackathon (the vision):**
- Full historical backtest of CDP lead-time/accuracy against known 2024–2026 shocks.
- Live tanker-availability & port-congestion feeds; refinery telemetry integrations.
- Multi-commodity substrate (LNG, coal, fertiliser, edible oil).
- Multi-country instances for other import-dependent economies.
- Procurement-system write-back (recommendation → tender workflow).

---

## 9. Key risks & how we de-risk them

| Risk | Mitigation |
|---|---|
| Live feeds flake in the demo hall | Pre-record a real signal window; run in labelled "replay" mode; cache aggressively |
| Scenario model looks like a black box | Surface **every assumption** as an editable input; show Monte-Carlo uncertainty bands; cite sources |
| Scope creep across five agents | Build the **Sentinel→Oracle→Navigator** spine first; Custodian and full twin are additive, not blocking |
| Data figures (SPR capacity, refinery specs) are stale | Treat all seed numbers as *to-verify*; keep them in one config file; validate against PPAC/EIA before the pitch |
| "Yet another AI dashboard" perception | Lead the pitch with the **60-second live loop**, not the tech |

---

## 10. Data sources we'll actually use (all real, mostly free)

- **Geopolitical events / news:** GDELT (DOC/GEO API) and **GDELT Cloud** (REST + MCP; ships ACLED-style conflict coding *and energy-asset data*).
- **Maritime / AIS:** **AISStream.io** — free real-time WebSocket, bounding-box + MMSI filters (`wss://stream.aisstream.io/v0/stream`).
- **Sanctions:** OFAC **SDN** list (daily, free).
- **Commodity prices:** **EIA open-data API** (Brent/WTI spot, crude imports by API grade & country, SPR stocks) + a real-time Brent quote API for the ticker.
- **India specifics:** PPAC (Petroleum Planning & Analysis Cell) import/consumption data; ISPRL for SPR site capacities.

*(Detailed integration, schema and models are specified in the TRD.)*

---

## 11. Naming & narrative

**PRAHARI** = "sentinel / watchman." The whole product identity is *the guard who never sleeps on India's energy lifeline*. Agent names extend the metaphor cleanly — **Sentinel** watches, **Oracle** foresees, **Navigator** charts the alternative course, **Custodian** guards the reserve, and the **Supervisor** commands the watch. It reads well on a title slide and every agent's job is obvious from its name.

---

*Next documents: PRD (what we build & for whom), TRD (how it's built), Implementation Plan (how we ship it in the hackathon window).*
