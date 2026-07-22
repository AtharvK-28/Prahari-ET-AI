# PRAHARI — Frontend Work Plan (Custodian / Settings / Ledger drill-down)

Handoff plan for frontend work. Scoped against the **actual repo HEAD** —
several items from the earlier draft plan already exist and must NOT be
rebuilt (inventory below). Read this whole file before generating code.

## Ground rules

1. `git pull` latest `master` FIRST. Today's commits added: ₹ import-bill
   ticker, CDP X-Ray, Perfect Storm, brief PDF export, RESET BOARD,
   chronology strip, hash-chained decision ledger, cover trajectory, demo
   script. Any plan generated before pulling is stale.
2. Work on a feature branch (`feat/custodian-view`, `feat/settings`). Small
   commits, conventional messages. **No history rewrites on master.**
3. **Visual freeze**: do NOT change fonts, the color palette, or `index.css`
   existing rules until the demo video is recorded. New styles are appended
   at the bottom of `index.css` under a `/* === WP<n> === */` marker.
4. Shared-file touch budget (merge-conflict control):
   - `store.ts` — only: extend the `view` union, add one setter if needed
   - `App.tsx` — only: import + two `{view === …}` lines
   - `TopNav.tsx` — only: add entries to the `VIEWS` array / one gear button
   - `MapTwin.tsx`, `ChronologyStrip.tsx`, `fleet.ts` — **do not touch**
5. Before any commit: `npx tsc --noEmit` in `console/` must pass. Verify in
   the browser against the running backend (`:8000`) before marking done.

## Inventory — already exists at HEAD (do not duplicate)

| Capability | Where |
|---|---|
| `/history` (chronology time-series) | `backend/app/api/routes.py`, `backend/app/cognition/history.py` — **name is taken** |
| Audit log UI (NFR7) | `console/src/components/DecisionLedger.tsx` + `/ledger` (hash-chain verified server-side) |
| SPR optimiser endpoint | `POST /spr/optimize` (`SPRRequest{gap_kbd, duration_days, reserve_floor_pct}`) — do not add `/custodian/optimize` |
| Floor enforcement | `custodian.py` line 35: `release = min(gap, max_daily_kbd, headroom_kbd)` — floor is a hard constraint by construction; `floor_respected` re-verifies. **No solver changes.** |
| Audit payloads w/ orchestrator, assumptions, economics, timings | `supervisor.py` (`brief.audit`, `_chain_write`) |
| Loop stage chips + timer | `TopNav.tsx` (oracle/navigator/custodian/brief) |
| Mode tagging (live/replay/demo) | schema-level; rendered in SignalTicker + chronology rail |
| CDP factor breakdown | `RiskPanel.tsx` (inline) + `CdpXray.tsx` (waterfall + sigmoid) |

---

## WP1 — CustodianView (new view, zero backend changes)

**Goal:** a dedicated SPR command view with a real time-series chart —
release d(t), reserve trajectory R(t), and the R_min floor — replacing
nothing (the compact bar chart in ActionView stays).

**Files:**
- `[NEW] console/src/views/CustodianView.tsx`
- `[MODIFY] store.ts` — view union: add `"custodian"`
- `[MODIFY] App.tsx`, `TopNav.tsx` — wire the view (label: `SPR Command`)
- `[APPEND] index.css` — `/* === WP1 custodian === */` section

**Data already available:** `useStore(s => s.spr)` (`SPRSchedule`) or fetch
via `api.spr({gap_kbd, duration_days, reserve_floor_pct})`. Per-day rows:
`SPRDay{day, gap_kbd, release_kbd, unmet_kbd, reserve_mbbl, reserve_pct}`;
top-level: `total_release_mbbl, days_bridged, floor_respected,
reserve_floor_pct, replenish_window, rationale`.

**Chart spec** (follow the house style — plain SVG like
`CoverTrajectory.tsx` / `ChronologyStrip.tsx`, no chart libraries):
- One shared x-axis (day 1..N). Two stacked bands, **never dual-axis**:
  - Band A (kbd): `release_kbd` as thin bars; `gap_kbd` as a dashed step
    line; `unmet_kbd` visible as the gap between them (direct-label it)
  - Band B (%): `reserve_pct` line with `reserve_floor_pct` as a red dashed
    horizontal — annotate "R_min floor — hard constraint"
- Controls above the chart: gap (kbd), duration (days), floor % sliders →
  re-run `api.spr(...)` on release (debounced), plus "restore defaults"
- Sidebar cards: total release, days bridged, floor respected ✓/✗,
  `replenish_window`, `rationale`
- Direct labels + `<title>` hovers; text in text tokens, not series colors

**Acceptance:** view renders from a fresh boot (fetch defaults if store.spr
is null); sliders re-optimise live; `tsc` clean; existing views untouched.

---

## WP2 — SettingsView + `GET/POST /settings` (small backend addition)

**Goal:** runtime-tunable demo parameters with tagged provenance —
NOT a general config editor.

**Scope (exactly three settings, all with "restore default"):**
1. `alert_threshold` (0.40–0.90) → mutates `ENGINE.threshold`
2. `reserve_floor_pct` default (20–50) → used when `SPRRequest.reserve_floor_pct` is null
3. `risk_ceiling` default (0.50–0.90) → Navigator exclusion ceiling default

**Backend files:**
- `[NEW] backend/app/config_runtime.py`:
  ```python
  DEFAULTS = {...captured at import from model_config()/seed_data()...}
  RUNTIME: dict = dict(DEFAULTS)
  ```
- `[MODIFY] routes.py` — `GET /settings` → `{current, defaults}`;
  `POST /settings` body `{key: value}` with validation + clamping; applies
  `ENGINE.threshold` immediately; returns updated state. Broadcast
  `{"event": "settings", ...}` via `MANAGER` so open consoles update the
  threshold line (`status.alert_threshold` is read in several components).
- `[MODIFY] custodian.py` / `navigator.py` — one line each: read the
  default from `config_runtime.RUNTIME` instead of the static config.
  **No other logic changes.**

**Frontend files:**
- `[NEW] console/src/views/SettingsView.tsx` — three sliders + current vs
  default badges + a note: "runtime overrides; restart restores YAML".
  Entry point: a gear (⚙) button on the right side of `TopNav`, not a fifth
  tab (tabs are crowded).
- `[MODIFY] api.ts` — `getSettings()`, `patchSettings()`.

**Explicitly out of scope:** feed on/off toggles (ingestion tasks are
long-running; a mid-demo toggle is a foot-gun), decay half-life (baked into
per-component state at creation — changing it silently does nothing until
reset, which would be dishonest UI).

**Acceptance:** lowering the threshold to 0.45 makes the CDP hero band +
chronology threshold line move on the next status poll; RESET BOARD does
not undo settings; restart does.

---

## WP3 — Ledger drill-down + Sentinel stage chip (polish, no backend)

1. `DecisionLedger.tsx`: row click → drawer/modal fetching `api.brief(id)`
   and rendering the `audit` object: orchestrator, scenario assumptions,
   navigator params, economics, hash + prev_hash (full), created/decided
   timestamps. This replaces the draft plan's separate `AuditLogView` —
   same NFR7 goal, one surface instead of two.
2. `TopNav.tsx`: prepend a `sentinel` chip to the stage strip, state
   `done` whenever a loop is running (Sentinel's detection precedes the
   loop; label it honestly, e.g. `sentinel ✓` not a spinner).

---

## Deferred (post-demo-video, coordinate before starting)

- Global typography/palette pass (Inter + IBM Plex Mono etc.) — restyling a
  verified demo before recording is risk with no judged upside.
- Any change to `custodian.py` solver logic — bring a failing test case
  first; `floor_respected` has never been false in verification runs.
- New `/history`-adjacent endpoints — the name is taken by chronology; if
  more audit query power is needed, extend `/ledger`.
