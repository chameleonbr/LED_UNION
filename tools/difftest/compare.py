#!/usr/bin/env python3
"""Diff our TypeScript frame builders against the literals in the decompiled apps.

Our drivers were transcribed by hand. This checks the transcription two ways:

  UNMATCHED  a frame we emit that no literal in the original app is compatible with —
             the app never sends that shape, so we probably got a byte wrong.
  UNCOVERED  a literal the app sends that we emit nothing compatible with — a command
             we have not implemented, or implemented with different bytes.

Compatibility: same length, and every position the Java literal pins to a constant
must equal ours. Positions the Java literal fills from a variable are free.
"""
import json
import sys
import collections

HEX = lambda f: " ".join("--" if b is None else f"{b:02x}" for b in f)


def compatible(java, ts):
    if len(java) != len(ts):
        return False
    return all(j is None or j == t for j, t in zip(java, ts))


def prefix_compatible(java, ts):
    """Some payloads are memcpy'd in a loop, so the literal only pins the header."""
    if len(java) >= len(ts) or len(java) < 4:
        return False
    return all(j is None or j == t for j, t in zip(java, ts[: len(java)]))


def main(java_path, ts_path):
    java = json.load(open(java_path))
    ts = json.load(open(ts_path))

    # Group the originals by header so a LEDSMART frame is never matched against a
    # LEDBLE literal that happens to share a shape. The trailer cannot be part of the
    # key: families that end in a computed checksum have no constant there.
    by_head = collections.defaultdict(list)
    for r in java:
        by_head[r["head"]].append(r)

    unmatched, matched, prefix_hits = [], [], []
    for t in ts:
        cands = [
            j for j in by_head.get(t["frame"][0], [])
            if j["tail"] is None or j["tail"] == t["frame"][-1]
        ]
        hit = next((j for j in cands if compatible(j["template"], t["frame"])), None)
        kind = "exato"
        if not hit:
            hit = next(
                (j for j in cands if prefix_compatible(j["template"], t["frame"])), None
            )
            kind = "prefixo"
        (matched if hit else unmatched).append((t, hit))
        if hit and kind == "prefixo":
            prefix_hits.append((t, hit))

    used = {id(h) for _, h in matched if h}
    uncovered = [
        j for j in java
        if id(j) not in used and not any(
            compatible(j["template"], t["frame"]) for t in ts
        )
    ]

    print(f"frames nossos: {len(ts)}   literais do app: {len(java)}")
    print(f"casados: {len(matched)} (dos quais {len(prefix_hits)} só por prefixo)"
          f"   sem correspondência: {len(unmatched)}")
    for t, j in prefix_hits:
        print(f"    prefixo: {t['driver']} {t['command']} ~ {j['method']}"
              f" (payload copiado em loop, só o cabeçalho é verificável)")

    if unmatched:
        print("\n=== SEM CORRESPONDÊNCIA (provável erro nosso) ===")
        for t, _ in unmatched:
            print(f"  {t['driver']:7} {t['name']:16} {t['command']:12} {HEX(t['frame'])}")

    # Most uncovered literals are per-model variants of a command we do implement.
    # Grouping by envelope plus opcode shows whether a whole command is missing.
    print(f"\n=== literais que não emitimos: {len(uncovered)} ===")
    groups = collections.defaultdict(list)
    for j in uncovered:
        t = j["template"]
        opcode = next((b for b in t[1:4] if b is not None), None)
        groups[(j["app"], t[0], j["tail"], opcode)].append(j)
    for (app, head, tail, op), items in sorted(
        groups.items(), key=lambda kv: (kv[0][0], kv[0][1] or 0, kv[0][3] or 0)
    ):
        tl = "--" if tail is None else f"{tail:02x}"
        opx = "--" if op is None else f"{op:02x}"
        names = sorted({i["method"].split("[")[0] for i in items})[:4]
        print(
            f"  {app:8} {head:02x}..{tl} op={opx}  x{len(items):<4} {', '.join(names)}"
        )

    return 1 if unmatched else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
