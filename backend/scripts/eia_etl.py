"""PRAHARI — offline ETL over the EIA bulk PET_IMPORTS dataset.

Extracts country -> Total U.S. monthly crude import series and derives a
per-supplier flow-stability metric used as a *reliability proxy* in the KG.

HONESTY NOTE: these are US-bound flows (EIA publishes no India bilateral
series in this bulk file). Volatility of a supplier's exports to a major
buyer is used as a proxy for its global supply reliability — labelled as
such in the output and marked to-verify.

Usage:  python scripts/eia_etl.py [path-to-PET_IMPORTS.txt]
Writes: config/derived_eia.yaml
"""
from __future__ import annotations

import json
import statistics
import sys
import time
from pathlib import Path

import yaml

BACKEND = Path(__file__).resolve().parent.parent
DEFAULT_SRC = BACKEND.parent / "data" / "CrudeOil" / "PET_IMPORTS.txt"
OUT = BACKEND / "config" / "derived_eia.yaml"

# EIA country name (as it appears in series name) -> PRAHARI supplier id
COUNTRY_TO_SUPPLIER = {
    "Saudi Arabia": "saudi_aramco",
    "Iraq": "iraq_somo",
    "Russia": "russia",
    "United Arab Emirates": "adnoc",
    "Kuwait": "kpc",
    "Nigeria": "nigeria_nnpc",
    "Angola": "angola_son",
    "Brazil": "petrobras",
    "Guyana": "guyana_exxon",
    "Colombia": "colombia_eco",
    "Mexico": "mexico_pemex",
    "Kazakhstan": "kazakh",
    "Qatar": "qatar_en",
    "Oman": "omoc",
}

WINDOW_MONTHS = 60          # analysis window (last 5 years of data)
KBBL_MONTH_TO_KBD = 1 / 30.4


def wanted_name(name: str) -> str | None:
    prefix = "Imports of all grades of crude oil from "
    suffix = " to Total U.S. (US), Monthly"
    if name.startswith(prefix) and name.endswith(suffix):
        return name[len(prefix):-len(suffix)]
    return None


def _idx(period: str) -> int:
    return int(period[:4]) * 12 + int(period[4:6])


def derive(series_data: list[list], anchor: str, window: int = WINDOW_MONTHS) -> dict:
    """Derive stability metrics over a fixed calendar window ending at `anchor`.

    EIA bulk series OMIT months with no flow — missing months are real zeros
    (e.g. Russia after the March-2022 US import ban), so we rebuild the
    calendar and fill gaps with 0 before computing activity/volatility.
    """
    by_period = {p: (float(v) if v is not None else 0.0) for p, v in series_data}
    end = _idx(anchor)
    vals = [by_period.get(_period_of(end - k), 0.0) for k in range(window)]
    if not vals:
        return {}
    active = [v for v in vals if v > 0]
    activity = len(active) / len(vals)
    mean_kbd = (statistics.mean(active) if active else 0.0) * KBBL_MONTH_TO_KBD
    cv = (statistics.pstdev(active) / statistics.mean(active)) if len(active) > 2 else 1.5
    stability = 1 - min(cv, 1.5) / 1.5
    # transparent formula, documented in output header. Suppliers with almost no
    # US-bound flow history (e.g. Oman/Qatar sell to Asia) get None — the proxy
    # has no signal there and the KG keeps its seed value instead.
    reliability = (round(0.25 + 0.45 * stability + 0.30 * activity, 2)
                   if len(active) >= 12 else None)
    return {
        "months_analysed": len(vals),
        "active_months": len(active),
        "activity": round(activity, 2),
        "mean_flow_kbd": round(mean_kbd, 1),
        "flow_cv": round(cv, 3),
        "stability": round(stability, 2),
        "reliability_proxy": reliability,
        "window_end": anchor,
    }


def _period_of(idx: int) -> str:
    y, m = divmod(idx - 1, 12)
    return f"{y}{m + 1:02d}"


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SRC
    t0 = time.perf_counter()
    raw: dict[str, dict] = {}          # supplier -> row
    world_row = None
    with open(src, encoding="utf-8") as f:
        for line in f:
            # cheap prefilter before json parse (44 MB file)
            if '-US-ALL.M"' not in line[:80]:
                continue
            row = json.loads(line)
            country = wanted_name(row.get("name", ""))
            if country is None:
                continue
            if country == "World":
                world_row = row
            else:
                sup = COUNTRY_TO_SUPPLIER.get(country)
                if sup:
                    raw[sup] = row

    # anchor every series to the dataset-wide latest month, so omitted recent
    # months (halted flows) count as zeros
    anchor = max(row["data"][0][0] for row in raw.values())
    world = derive(world_row["data"], anchor, window=24) if world_row else None
    found = {
        sup: {"eia_country": wanted_name(row["name"]),
              "series_id": row["series_id"], **derive(row["data"], anchor)}
        for sup, row in raw.items()
    }

    out = {
        "meta": {
            "source": "EIA bulk PET_IMPORTS (monthly, country -> Total U.S.)",
            "generated": time.strftime("%Y-%m-%d %H:%M"),
            "window_months": WINDOW_MONTHS,
            "caveat": ("US-bound flow volatility used as a GLOBAL supply-reliability "
                       "proxy per supplier — not India bilateral flows. to-verify."),
            "formula": "reliability_proxy = 0.25 + 0.45*stability + 0.30*activity; "
                       "stability = 1 - min(cv,1.5)/1.5 over active months",
        },
        "world_to_us": world,
        "suppliers": dict(sorted(found.items())),
    }
    OUT.write_text(yaml.safe_dump(out, sort_keys=False, allow_unicode=True), encoding="utf-8")
    print(f"wrote {OUT.name} with {len(found)} suppliers in {time.perf_counter()-t0:.1f}s")
    for sup, m in sorted(found.items(),
                         key=lambda kv: -(kv[1]["reliability_proxy"] or 0)):
        rel = m["reliability_proxy"]
        print(f"  {sup:15s} rel={rel if rel is not None else 'n/a (keep seed)'} "
              f"(activity {m['activity']:.2f}, cv {m['flow_cv']:.2f}, "
              f"mean {m['mean_flow_kbd']:.0f} kbd)")


if __name__ == "__main__":
    main()
