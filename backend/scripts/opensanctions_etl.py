"""PRAHARI — OpenSanctions ETL.

Reads data/OpenSanctions/targets.simple.csv and derives per-supplier-country
counts of sanctioned energy/shipping entities, replacing the hand-set
sanction_exposure levels in the KG with data-derived ones.

Usage: python scripts/opensanctions_etl.py
Writes: config/derived_sanctions.yaml
"""
from __future__ import annotations

import csv
import time
from collections import Counter
from pathlib import Path

import yaml

BACKEND = Path(__file__).resolve().parent.parent
SRC = BACKEND.parent / "data" / "OpenSanctions" / "targets.simple.csv"
OUT = BACKEND / "config" / "derived_sanctions.yaml"

# supplier country (ISO-ish codes used by OpenSanctions) -> PRAHARI supplier ids
COUNTRY_TO_SUPPLIERS = {
    "ru": ["russia"], "iq": ["iraq_somo"], "sa": ["saudi_aramco"],
    "ae": ["adnoc"], "kw": ["kpc"], "ng": ["nigeria_nnpc"], "ao": ["angola_son"],
    "br": ["petrobras"], "gy": ["guyana_exxon"], "om": ["omoc"], "qa": ["qatar_en"],
    "kz": ["kazakh"], "co": ["colombia_eco"], "mx": ["mexico_pemex"],
    "us": ["us_exports"],
}
ENERGY_KEYWORDS = ("oil", "petrol", "crude", "tanker", "shipping", "maritime",
                   "energy", "gas", "lng", "vessel", "fleet", "bunker")


def exposure_level(count: int) -> str:
    if count >= 100:
        return "high"
    if count >= 20:
        return "medium"
    if count >= 1:
        return "low"
    return "none"


def main() -> None:
    counts: Counter[str] = Counter()
    vessels: Counter[str] = Counter()
    total = energy_total = 0
    with open(SRC, encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            total += 1
            blob = f"{row.get('name', '')} {row.get('aliases', '')}".lower()
            is_vessel = row.get("schema") == "Vessel"
            is_energy = is_vessel or any(k in blob for k in ENERGY_KEYWORDS)
            if not is_energy:
                continue
            energy_total += 1
            for cc in (row.get("countries") or "").split(";"):
                cc = cc.strip().lower()
                if cc in COUNTRY_TO_SUPPLIERS:
                    counts[cc] += 1
                    if is_vessel:
                        vessels[cc] += 1

    suppliers = {}
    for cc, sup_ids in COUNTRY_TO_SUPPLIERS.items():
        n = counts.get(cc, 0)
        for sid in sup_ids:
            suppliers[sid] = {
                "country_code": cc,
                "sanctioned_energy_entities": n,
                "sanctioned_vessels": vessels.get(cc, 0),
                "sanction_exposure": exposure_level(n),
            }
    out = {
        "meta": {
            "source": "OpenSanctions targets.simple.csv (data/OpenSanctions/)",
            "generated": time.strftime("%Y-%m-%d %H:%M"),
            "rows_scanned": total,
            "energy_shipping_matches": energy_total,
            "levels": "high>=100, medium>=20, low>=1 sanctioned energy/shipping entities",
        },
        "suppliers": dict(sorted(suppliers.items())),
    }
    OUT.write_text(yaml.safe_dump(out, sort_keys=False), encoding="utf-8")
    print(f"scanned {total} targets, {energy_total} energy/shipping-related")
    for sid, m in sorted(suppliers.items(), key=lambda kv: -kv[1]["sanctioned_energy_entities"]):
        print(f"  {sid:15s} {m['sanction_exposure']:6s} "
              f"({m['sanctioned_energy_entities']} entities, {m['sanctioned_vessels']} vessels)")


if __name__ == "__main__":
    main()
