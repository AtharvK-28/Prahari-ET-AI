# PRAHARI — Demo Script (≈3.5 min live / video)

One story: **the world happened → PRAHARI understood it → a human decided —
before the market reacted.** Every beat below points at a pixel that proves a
claim. Never claim what you can't click.

---

## Rehearsal setup (do this every time)

| When | Action | Why |
|---|---|---|
| T-30 min | Start backend (`uvicorn app.main:app --port 8000`, cwd `backend/`) + console (`npm run dev`) and **leave them running** | The chronology strip needs runtime to look alive; feeds warm up (marine/calibration take ~1 min) |
| T-25 min | Check sidebar DATA FEEDS: GDELT/EIA/OFAC/FRED/MARINE green | If AIS is down it's aisstream.io's edge, not us — the sim fleet doesn't depend on it |
| T-2 min | **↺ RESET BOARD** (sidebar, STRESS TEST) | Calm board; the chronology keeps the morning's history as backdrop — the reset cliff is itself a talking point |
| T-1 min | Confirm footer: `BRENT [LIVE]`, `IMPORT_BILL $…M/day ₹… cr/day` | Opening line depends on it |
| optional | 🔊 VOICE ON only if the room is quiet | It speaks the brief aloud on completion |

Browser: hard-refresh once. If projecting small, deep-link zoom:
`http://localhost:5173/?lon=62&lat=15&zoom=3.4`.

---

## Beat 1 — The living twin (0:00–0:30)

Strategic Overview. Don't touch anything yet.

> "This is India's crude supply chain as a living digital twin. Every corridor,
> every chokepoint. The triangles are the tanker fleet — counts derived from
> Little's law on real flow volumes." **Hover a vessel** — the tooltip shows the
> arithmetic. "And this footer number is India's import bill, live: today's
> Brent × PPAC-verified 4,936 kbd × the live FRED rupee rate."

## Beat 2 — It reads the real world (0:30–1:00)

> "The board isn't seeded — it's fed." Point at the signal ticker: real GDELT
> headlines, tagged **LIVE**. **Click the big CDP number** → X-Ray.
> "Explainability isn't a slide — it's a click. Every term of the fusion
> equation, the evidence behind each factor, and exactly how far this corridor
> sits from auto-trigger." Close it.

## Beat 3 — Replay of a real crisis (1:00–1:30)

**⏵ REPLAY REAL WINDOW** (sidebar).

> "These are 13 real signals from July 22nd — the Iran–US escalation — replayed
> at 40×, honestly tagged REPLAY. Watch the corridors climb."
>
> ⚠ If the Supervisor **auto-triggers** during this: don't fight it — say
> *"and it just fired the response loop by itself; nobody clicked anything"*
> (that's FR10, the strongest 5 seconds available). The brief announces
> quietly on the BRIEF button.

## Beat 4 — Perfect Storm (1:30–2:30)

**⛈ PERFECT STORM** (sidebar).

> "Now the nightmare: Hormuz AND Bab el-Mandeb, cut simultaneously." Map goes
> red; vessels U-turn and queue at both chokepoints; CRISIS MODE lights.
> "Four agents — scenario, procurement, reserves, brief — in about one second,
> against a sixty-second budget."
>
> Brief modal, in order: the four impact stats → the **₹ EXPOSURE** row
> ("inaction ₹X crore per day, plan premium ₹Y — that's the decision, in
> rupees") → the **cover trajectory** ("red is doing nothing; green is the
> plan bending the curve back") → the reroute line: "with both eastern lanes
> excluded, it solved from the Cape and the Atlantic — different crisis,
> different answer, computed live, not scripted."
>
> **✓ Approve.** Point at the green recovery arcs on the map.

## Beat 5 — Proof and paper (2:30–3:20)

1. **Chronology strip** (bottom of map): "Time is the product. Signal dots —
   filled means live, hollow means demo, we never blur that — threshold
   crossing, brief flag, decision check. And the Brent band below: the market
   hadn't moved yet. That gap is the warning window."
2. **Action Center → Decision Ledger**: "Every brief and every human decision,
   hash-chained. Edit one byte of the audit log and this flips to CHAIN
   BROKEN. Governance is built in, not promised."
3. Back to the brief → **⎙ EXPORT PDF**: "And the output is a one-page
   ministry brief — banner-marked as a synthetic exercise, because the same
   honesty tags run end to end."

Close (3:20–3:30):

> "Signal to authorized decision: about a second, every figure traceable to a
> source or a tagged simulation. That's PRAHARI — a praharī, a sentinel, for
> the barrels India runs on."

---

## Failure fallbacks

- **Auto-loop fires mid-demo** (hot real news): feature, not bug — narrate it.
- **Board already red at start**: you skipped RESET BOARD; hit it, keep talking
  ("standing the board down — note the chronology keeps the record: resets are
  cliffs, never rewrites").
- **AISStream down** (white live-AIS dots absent): sim fleet is unaffected;
  mention live AIS renders as distinct white dots when the feed is up.
- **Brief modal doesn't pop**: only manual triggers pop it — use the BRIEF
  button, top right.
- **Anthropic key absent**: narrative says `template` — "the LLM narrates only
  computed values; without a key it falls back to a deterministic template —
  the numbers never change."

## Judge Q&A crib

- **"Is this real data?"** — GDELT/Brent/FRED/weather/sanctions live; national
  figures PPAC-verified; supplier reliability derived from 20 years of EIA
  flows; anything synthetic is mode-tagged `demo`/`replay` in the schema itself.
- **"Why in-memory graph / no Neo4j-Redis-PostGIS?"** — TRD-sanctioned demo
  fallbacks behind the same interfaces; swap targets documented.
- **"How do agents coordinate?"** — LangGraph StateGraph
  (sentinel→oracle→navigator→custodian→brief) with a deterministic sequential
  fallback; orchestrator recorded per-brief in the audit.
- **"What don't you know?"** — seed elasticities and India-share terms are
  marked to-verify in the config; uncertainty is surfaced as P10–P90 bands,
  not hidden.
