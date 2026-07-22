# PRAHARI — Product Requirements Document (PRD)

*Predictive Risk & Adaptive Hydrocarbon Agentic Response Intelligence*
**Version:** 1.0 · **Status:** Hackathon MVP · **Owner:** Vaishali (product + architecture)
**Companion docs:** `1_PRAHARI_Ideation.md`, `3_PRAHARI_TRD.md`, `4_PRAHARI_Implementation_Plan.md`

---

## 1. Purpose & vision

**Vision.** Give import-dependent economies a sentinel that converts geopolitical and maritime signals into ranked, executable energy-procurement and strategic-reserve decisions — compressing crisis response from weeks to minutes.

**This PRD's scope.** Defines *what* PRAHARI must do for the hackathon MVP: the users, the jobs it must accomplish, the features, the functional and non-functional requirements, and the success metrics. It deliberately does not prescribe implementation (see TRD).

**Problem being solved.** India imports ~88% of crude, 40–45% via the Strait of Hormuz, with ~9.5 days of strategic reserve cover. Existing tools detect signals *or* show prices *or* map the network — none closes the loop to an executable decision. PRAHARI is that decision layer.

---

## 2. Goals & non-goals

### Goals (MVP)
1. Continuously score **corridor disruption probability** from multi-source live signals, with explainable factors and a lead-time estimate.
2. Simulate a named disruption and compute its **India-specific cascading impact** with explicit, editable assumptions.
3. Generate a **ranked, executable procurement reroute** for any supply gap.
4. Recommend an **SPR drawdown/replenishment schedule** that respects a reserve floor.
5. Deliver an end-to-end **signal→decision brief in under 60 seconds**, live, on a map.

### Non-goals (MVP)
- Automated *execution* of procurement (we recommend; a human approves — no auto-tendering).
- Full historical backtest of model accuracy (post-hackathon).
- Multi-commodity coverage beyond crude oil (architecture supports it; not built).
- Real tanker-availability / port-congestion live feeds (curated/estimated for MVP).
- Trading, hedging, or financial-instrument recommendations.

---

## 3. Users & personas

### P1 — Priya, Procurement Head, west-coast refiner *(primary)*
Runs crude sourcing for a Hormuz-fed refinery. During a scare she scrambles the spot market blind. **Needs:** feasible, priced, grade-compatible alternatives she can act on within hours. **Success:** she leaves the console with a ranked reroute and a rationale she can defend to her CEO.

### P2 — Rahul, Analyst, MoPNG / PPAC *(secondary)*
Advises policymakers on exposure. **Needs:** a live read of national exposure and a credible, assumption-transparent estimate of price/GDP impact per scenario. **Success:** he can brief a minister in one page without a black box.

### P3 — Anjali, Reserve Manager, ISPRL *(secondary)*
Manages strategic reserve drawdown. **Needs:** *when* and *how much* to release to bridge a gap without breaching the floor, plus a refill window. **Success:** a defensible drawdown schedule tied to the gap forecast.

---

## 4. User stories (with acceptance criteria)

### Epic A — Continuous risk sensing (Sentinel)
- **A1.** *As Priya, I want a live disruption-probability score per corridor so I know where my exposure is right now.*
  **Accept:** each corridor shows a 0–1 CDP, a colour band, and a "last updated" timestamp ≤ the refresh interval.
- **A2.** *As Rahul, I want to see why a score moved so I can trust it.*
  **Accept:** clicking a corridor reveals the top 3 contributing signals (news/AIS/sanctions/price) with their individual contributions and a confidence value.
- **A3.** *As Priya, I want an estimated lead time so I know how long I have.*
  **Accept:** a threshold-crossing shows an estimated warning window and the evidence behind it.

### Epic B — Scenario modelling (Oracle)
- **B1.** *As Rahul, I want to run a named scenario (Hormuz cut / Red Sea suspension / OPEC+ cut) and see India-specific impact.*
  **Accept:** output includes refinery run-rate impact, days-of-cover, Brent + India-basket price delta, power-sector stress, and an import-bill/GDP proxy.
- **B2.** *As Rahul, I want to edit the assumptions so the model is testable.*
  **Accept:** severity, duration, and elasticity parameters are user-editable; outputs recompute; a Monte-Carlo band shows uncertainty.
- **B3.** *As Priya, I want a free-form "what-if" so I can stress a corridor I'm worried about.*
  **Accept:** a slider adjusts corridor throughput 0–100% and re-propagates impact.

### Epic C — Procurement rerouting (Navigator)
- **C1.** *As Priya, I want ranked alternative crude sources + routes for a supply gap.*
  **Accept:** ≥3 alternatives ranked, each with landed cost, ETA, corridor risk, and a grade-compatibility flag for the target refinery.
- **C2.** *As Priya, I want infeasible options filtered out.*
  **Accept:** options that violate grade compatibility, tanker availability, or port capacity are excluded or clearly flagged with the reason.

### Epic D — Strategic reserve optimisation (Custodian)
- **D1.** *As Anjali, I want a drawdown schedule that bridges the forecast gap.*
  **Accept:** a per-day release schedule over the horizon that keeps reserve above a configurable floor, plus a replenishment window suggestion.

### Epic E — Orchestration & decision brief (Supervisor + Console)
- **E1.** *As Priya, I want the system to auto-run the analysis when risk spikes.*
  **Accept:** when a corridor CDP crosses the alert threshold, Oracle→Navigator→Custodian run automatically and a brief is assembled.
- **E2.** *As Priya, I want a one-page decision brief I can approve.*
  **Accept:** a single card summarises the shock, the impact, the recommended reroute, the SPR action, and the rationale, with an approve/dismiss action.
- **E3.** *As a judge, I want to see the full loop live in under a minute.*
  **Accept:** a "trigger demo signal" control drives signal→brief end-to-end with a visible timer ≤ 60s.

---

## 5. Feature list & prioritisation (MoSCoW)

| # | Feature | Priority | Maps to |
|---|---|---|---|
| F1 | Corridor risk dashboard with CDP + factors | **Must** | A1, A2 |
| F2 | Geospatial digital-twin map (corridors, chokepoints, refineries, SPR) | **Must** | substrate |
| F3 | Scenario runner (3 canonical + what-if slider) | **Must** | B1, B3 |
| F4 | Impact panel (run-rate, days-of-cover, price, GDP proxy) | **Must** | B1 |
| F5 | Procurement reroute ranking | **Must** | C1, C2 |
| F6 | Decision brief card + approve action | **Must** | E2 |
| F7 | Live end-to-end demo trigger with timer | **Must** | E3 |
| F8 | Editable assumptions + uncertainty band | **Should** | B2 |
| F9 | SPR drawdown schedule | **Should** | D1 |
| F10 | Lead-time estimate on threshold crossing | **Should** | A3 |
| F11 | RAG "explain this signal" (cite source headlines) | **Could** | A2 |
| F12 | Historical replay controls ("replay real window") | **Could** | demo safety |
| F13 | Multi-commodity toggle | **Won't (MVP)** | vision |
| F14 | Procurement-system write-back | **Won't (MVP)** | vision |

---

## 6. Functional requirements

- **FR1.** The system shall ingest signals from ≥3 live sources (geopolitical events, AIS, commodity price) plus sanctions data, and refresh corridor scores at a defined interval.
- **FR2.** The system shall compute a Corridor Disruption Probability per modelled corridor as an explainable fusion of weighted signal components, exposing each component's contribution.
- **FR3.** The system shall estimate a lead-time window when a corridor crosses the alert threshold.
- **FR4.** The system shall simulate a disruption event and propagate it through the supply-chain graph to affected refineries by grade dependency.
- **FR5.** The system shall compute, per scenario: refinery run-rate impact, national days-of-cover, Brent and India-basket price delta, power-sector stress indicator, and an import-bill/GDP shock proxy.
- **FR6.** The system shall expose all scenario assumptions as editable parameters and recompute outputs on change.
- **FR7.** The system shall generate a ranked set of alternative crude sources + routes for a given supply gap, each annotated with landed cost, ETA, corridor risk, and grade compatibility.
- **FR8.** The system shall exclude or flag alternatives that violate hard constraints (grade incompatibility, no tanker, port over capacity).
- **FR9.** The system shall produce an SPR drawdown/replenishment schedule that respects a configurable reserve floor.
- **FR10.** The Supervisor shall auto-trigger the Oracle→Navigator→Custodian chain on a threshold crossing and assemble a decision brief.
- **FR11.** The system shall render a one-page decision brief with an approve/dismiss action and full rationale.
- **FR12.** The system shall provide a demo trigger that drives the full loop with a visible elapsed timer.

## 7. Non-functional requirements

- **NFR1 — Latency.** End-to-end signal→decision brief ≤ **60 s** in demo; individual agent step ≤ 15 s.
- **NFR2 — Explainability.** Every score, impact number, and recommendation must expose its drivers/assumptions; no unexplained outputs.
- **NFR3 — Data integrity.** Only real data or clearly-labelled *replay* of real data — never fabricated figures in a demo.
- **NFR4 — Resilience.** Feed failure must degrade gracefully to cached/replay data without breaking the console.
- **NFR5 — Scalability (design).** Ingestion streaming and stateless agents so corridors/commodities/countries can be added without re-architecting.
- **NFR6 — Usability.** A procurement head can reach a decision from the console without training or documentation.
- **NFR7 — Auditability.** Each recommendation logs its inputs, model version, and assumptions for later review.

---

## 8. Success metrics

### Product / demo metrics
- **M1.** End-to-end loop completes in **< 60 s** (hard target).
- **M2.** ≥ **3** ranked, feasible procurement alternatives per gap, each with all four annotations.
- **M3.** **100%** of displayed scores/impacts have a visible "why" / assumption trail.
- **M4.** Scenario recompute on assumption edit in **< 5 s**.

### Impact metrics (pitched, modelled)
- **M5.** Response-latency reduction framed against the **47-day** penalty from the brief.
- **M6.** Estimated import-bill / spot-premium saving from a faster reroute (modelled per scenario).
- **M7.** SPR-timing value: barrels-days of cover preserved vs. a naive drawdown.

### Judging-rubric coverage (self-check before pitch)
| Criterion | Evidence in product |
|---|---|
| Innovation 25% | AIS+news fusion, closed loop, explainable CDP, agentic brief |
| Business Impact 25% | Quantified savings vs. 47-day penalty; named users |
| Technical Excellence 20% | Multi-source fusion, KG+twin, multi-agent orchestration |
| Scalability 15% | Streaming ingestion, stateless agents, multi-commodity-ready substrate |
| UX 15% | One console; decision brief a real user can act on |

---

## 9. Assumptions & dependencies

- **Data feeds** (GDELT/GDELT Cloud, AISStream, EIA, OFAC SDN, Brent quote API) remain free/available during the build; keys obtained day 1.
- **Seed dataset** figures (refinery capacities/grade profiles, SPR site capacities, corridor distances) are curated from public sources and treated as *to-verify* before pitch.
- **LLM access** available for extraction, adjudication, and brief-writing (Anthropic API).
- **Team bandwidth** sufficient to build the Sentinel→Oracle→Navigator spine before adding Custodian/full twin.

## 10. Open questions

1. How is the CDP alert threshold calibrated for the demo (fixed vs. adaptive)?
2. Which three canonical scenarios ship in the MVP, and with what default durations? *(Working set: Hormuz 50%/30d, Red Sea suspension/45d, OPEC+ 1.5 Mbpd cut/60d.)*
3. Do we show a single primary refinery (Priya's) or all west-coast refiners in the impact panel?
4. Replay vs. live: which feeds run live in the hall, which run from a recorded window?
5. What is the reserve floor Custodian must respect (as % of ISPRL capacity)?

---

## 11. Out-of-scope / future (explicitly deferred)

Automated tender write-back; live tanker/port-congestion feeds; refinery telemetry; full CDP backtest; multi-commodity (LNG/coal/fertiliser); multi-country instances; role-based access control and enterprise auth.
