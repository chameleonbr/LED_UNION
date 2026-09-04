#!/usr/bin/env python3
"""Extract every literal BLE frame from the decompiled original apps.

The LED+LAMP and easylink apps build their frames as `new int[]{...}` / `new byte[]{...}`
literals inside the method that sends them. That makes them mechanically extractable,
which is the point: our TypeScript drivers were transcribed by hand from these same
literals, and a hand transcription is exactly the kind of thing that silently drifts.

Emits JSON on stdout: one record per literal, with the enclosing method, the raw
template, and the resolved byte template (numbers as ints, anything else as null).
"""
import json
import os
import re
import sys

# jadx resolves some plain integers to unrelated library constants that merely happen
# to share the value. These are decompiler artifacts, not real dependencies.
CONSTANTS = {
    "WebSocketProtocol.PAYLOAD_SHORT": 126,   # 0x7E
    "HttpStatus.SC_MULTI_STATUS": 207,        # 0xCF
    "Opcodes.OP_": None,
}

METHOD_RE = re.compile(
    r"(?:public|private|protected)\s+(?:static\s+)?[\w<>\[\], .]+?\s+(\w+)\s*\(([^)]*)\)\s*\{",
)
ARRAY_RE = re.compile(
    # Both `new byte[]{...}` and the bare initialiser `byte[] x = {...}` appear.
    r"(?:new\s+(?:int|byte)\s*\[\]\s*|(?:int|byte)\s*\[\]\s*\w+\s*=\s*)\{([^{}]*)\}"
)
# A trailing checksum is computed, not constant, so the frame must not be discarded
# for it. Mark the slot as variable instead.
CHECKSUM_RE = re.compile(r"\b(calAcc|checksum|crc|sum)\s*\(", re.I)
# The easylink and forwell apps do not use array literals: they fill a shared buffer
# by index, e.g. `sendDatas1[0] = 126;`. Reconstruct those into the same shape.
ASSIGN_RE = re.compile(r"(\w+)\s*\[\s*(\d+)\s*\]\s*=\s*([^;]+);")
# jadx re-aliases the same buffer several times inside one method
# (`byte[] bArr = sendDatas2; ... byte[] bArr2 = sendDatas2;`), scattering a single
# frame across names. Aliases must be merged or every frame comes out truncated.
ALIAS_RE = re.compile(r"\b(?:byte|int)\s*\[\]\s*(\w+)\s*=\s*(\w+)\s*;")


def resolve(token: str):
    """Return an int for a literal byte, or None for a variable/expression."""
    t = token.strip()
    if not t:
        return None
    if t in CONSTANTS:
        return CONSTANTS[t]
    # jadx writes bytes as signed values; the wire is unsigned.
    m = re.fullmatch(r"\(byte\)\s*(-?\d+)", t)
    if m:
        return int(m.group(1)) & 0xFF
    if re.fullmatch(r"-?\d+", t):
        return int(t) & 0xFF
    if re.fullmatch(r"0[xX][0-9a-fA-F]+", t):
        return int(t, 16) & 0xFF
    return None


def split_args(body: str):
    """Split an array literal on commas that are not inside nested parens."""
    out, depth, cur = [], 0, ""
    for ch in body:
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth -= 1
        if ch == "," and depth == 0:
            out.append(cur)
            cur = ""
        else:
            cur += ch
    out.append(cur)
    return out


def methods_of(src: str):
    """Yield (name, args, body) for each method, using brace matching."""
    for m in METHOD_RE.finditer(src):
        start = m.end() - 1
        depth, i = 0, start
        while i < len(src):
            if src[i] == "{":
                depth += 1
            elif src[i] == "}":
                depth -= 1
                if depth == 0:
                    break
            i += 1
        yield m.group(1), m.group(2), src[start : i + 1]


def buffer_frames(body: str):
    """Reconstruct frames written as indexed assignments into a shared buffer."""
    alias = {}
    for m in ALIAS_RE.finditer(body):
        alias[m.group(1)] = m.group(2)

    def root(n, depth=0):
        while n in alias and depth < 10:
            n, depth = alias[n], depth + 1
        return n

    bufs = {}
    for m in ASSIGN_RE.finditer(body):
        buf, idx, val = root(m.group(1)), int(m.group(2)), m.group(3)
        if idx > 200:
            continue
        bufs.setdefault(buf, {})[idx] = resolve(val)
        if CHECKSUM_RE.search(val):
            bufs[buf][idx] = None
            bufs.setdefault("__checksum__", {})[0] = buf
    out = []
    for buf, slots in bufs.items():
        size = max(slots) + 1
        if size < 5:
            continue
        out.append((buf, [slots.get(i) for i in range(size)]))
    return out


def extract(path: str, app: str):
    src = open(path, encoding="utf-8", errors="replace").read()
    rows = []
    for name, args, body in methods_of(src):
        for buf, template in buffer_frames(body):
            if buf == "__checksum__" or template[0] is None:
                continue
            rows.append({
                "app": app, "file": os.path.basename(path), "method": f"{name}[{buf}]",
                "args": args.strip(), "len": len(template),
                "head": template[0], "tail": template[-1],
                "template": template, "raw": [],
            })
        for am in ARRAY_RE.finditer(body):
            raw = [t.strip() for t in split_args(am.group(1))]
            resolved = [resolve(t) for t in raw]
            # A frame is bracketed by two known constants; anything else is data.
            if len(resolved) < 5 or resolved[0] is None or resolved[-1] is None:
                continue
            rows.append(
                {
                    "app": app,
                    "file": os.path.basename(path),
                    "method": name,
                    "args": args.strip(),
                    "len": len(resolved),
                    "head": resolved[0],
                    "tail": resolved[-1],
                    "template": resolved,
                    "raw": raw,
                }
            )
    return rows


def main():
    targets = json.load(open(sys.argv[1])) if len(sys.argv) > 1 else None
    if not targets:
        print("usage: extract_java_frames.py <targets.json>", file=sys.stderr)
        return 1
    rows = []
    for t in targets:
        path = t["path"]
        if not os.path.exists(path):
            print(f"missing: {path}", file=sys.stderr)
            continue
        if os.path.isdir(path):
            # Frame builders are not always in the service class; walk the tree.
            for root, _, files in os.walk(path):
                for fn in files:
                    if fn.endswith(".java"):
                        rows += extract(os.path.join(root, fn), t["app"])
        else:
            rows += extract(path, t["app"])
    json.dump(rows, sys.stdout, indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
