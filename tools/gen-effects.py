#!/usr/bin/env python3
"""Regenerate src/lib/protocol/effects.ts from the tables in docs/protocol/*.tsv."""
import json, os

DOCS = "docs/protocol"
OUT = "src/lib/protocol/effects.ts"


def tsv(fname, cols):
    rows = []
    for line in open(os.path.join(DOCS, fname)):
        parts = line.rstrip("\n").split("\t")
        if len(parts) < len(cols):
            continue
        rows.append(dict(zip(cols, parts)))
    return rows


def main():
    tables = [
        ("melk", [{"id": int(r["id"]), "group": r["group"], "name": r["name"]}
                  for r in tsv("melk_effects.tsv", ["id", "group", "name"])]),
        ("elk", [{"id": int(r["id"]), "name": r["name"]}
                 for r in tsv("elk_effects.tsv", ["id", "name"])]),
        ("ledble", [{"id": int(r["id"]), "name": r["name"]}
                    for r in tsv("ble_mode.tsv", ["id", "name"])]),
        ("ledcar", [{"id": int(r["id"]), "name": r["name"]}
                    for r in tsv("car_mode.tsv", ["id", "name"])]),
        ("leddmx", [{"id": int(r["id"]), "name": r["name"]}
                    for r in tsv("dmx_model.tsv", ["id", "name"])]),
    ]
    with open(OUT, "w") as fh:
        fh.write("// GENERATED from docs/protocol/*.tsv by tools/gen-effects.py"
                 " — do not edit by hand.\n")
        fh.write("import type { Effect } from './types'\n\n")
        for name, rows in tables:
            fh.write(f"export const {name}: Effect[] = [\n")
            for r in rows:
                fh.write("  " + json.dumps(r, ensure_ascii=False) + ",\n")
            fh.write("]\n\n")
        fh.write("export default { melk, elk, ledble, ledcar, leddmx }\n")
    print(OUT, {n: len(r) for n, r in tables})


if __name__ == "__main__":
    main()
