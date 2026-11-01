# State Machines — LED UNION

> Reversa Detective · 2026-10-24

## SM-1 Connection state (`Conn.state`) 🟢
Values: `offline | connecting | online | error`. Source: `src/lib/ble.svelte.ts`.

```mermaid
stateDiagram-v2
  [*] --> offline: track() / restore() seeds from store
  offline --> connecting: connect() (manual, Connect all, restore, or auto before a command)
  error --> connecting: connect()
  connecting --> online: GATT connected and driver resolved
  connecting --> error: 3 GATT attempts failed / no writable char
  online --> offline: gattserverdisconnected (records lastLinkMs)
  online --> offline: disconnect()
  online --> online: connect() is a no-op while char is set
  offline --> [*]: forget()
  error --> [*]: forget()
  online --> [*]: forget() (disconnects first)
```

| Transition | Trigger | Side effects |
|---|---|---|
| → connecting | `connect(id)` | `error` cleared |
| connecting → online | `resolveDriver` ok | driver/queue may be swapped; `onConnect` handshake queued **after** state = online 🟢 |
| connecting → error | exception | `error = explain(e)`; rethrown |
| online → offline | device drop | `lastLinkMs = now - connectedAt`; `live.char` cleared |

Notes:
- 🟡 Handshake frames are queued after the state goes online, so a command racing the handshake goes through the same queue. The order is preserved, because the queue is FIFO.
- 🟢 `disconnect()` sets `offline` synchronously. The `gattserverdisconnected` event later sets it again; this is idempotent.
- 🟢 There is no `error → offline` transition except via a drop event.
- 🟢 (2026-11-01) Inside `connecting`, a "no longer in range" failure waits up to 6 s for an advertisement and retries; it stays in `connecting` meanwhile (PR #6).
- 🟢 (001) On `→ online`: `listen` before the handshake (iPixel replies give size/mcu); if stealth is on, every output is powered off and joins the snapshot.

## SM-2 Look / endpoint "mode" 🟢 (derived)
`Look` has no status field. Which mode an endpoint is in follows from which fields are set. Source: `DeviceCard.svelte`, `Effects.svelte`, `Scenes.svelte`.

```mermaid
stateDiagram-v2
  [*] --> Unknown: no look yet
  Unknown --> StaticColour: pickColor / white on RGB-only hardware
  Unknown --> BuiltInEffect: choose an effect
  Unknown --> CustomEffect: run a custom effect
  StaticColour --> BuiltInEffect: choose an effect (effect set, colour kept)
  StaticColour --> CustomEffect: run a custom effect
  BuiltInEffect --> StaticColour: pickColor (effect + customEffectId cleared)
  BuiltInEffect --> CustomEffect: custom (effect cleared)
  CustomEffect --> StaticColour: pickColor
  CustomEffect --> BuiltInEffect: choose an effect (customEffectId cleared)
  CustomEffect --> StaticColour: custom effect deleted (customEffectId removed)
```
Orthogonal fields: `power`, `brightness` and `speed` are updated independently.
- 🟡 Choosing an effect keeps `colorHex`, so the card still shows the colour swatch while an effect plays.
- 🟢 Real-white, CCT and sound changes do not touch the look (F5).

## SM-3 BLEDIM driver memory (`DeviceState.color`) 🟢
Source: `src/lib/protocol/bledim.ts`.

```mermaid
stateDiagram-v2
  [*] --> EffectMode: default (color undefined)
  EffectMode --> ColourMode: rgb()
  ColourMode --> ColourMode: rgb() / brightness() rescales the colour
  ColourMode --> EffectMode: effect()
  ColourMode --> EffectMode: customEffect(): also triggered by the UI supportsCustom probe (F4)
  EffectMode --> EffectMode: brightness() / speed() send 0x88
```
- 🟢 `white()` does **not** change `color`, so after a white change, brightness rescales the *previous* RGB colour. 🟡 This is probably unintended.
- 🟢 The state is keyed by advertised name (F3).

## SM-4 WriteQueue slot (per coalescing key) 🟢
```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Waiting: pushLatest(k): slot chained
  Waiting --> Waiting: pushLatest(k): op replaced, no new slot
  Waiting --> Running: slot reaches the head and the gap has elapsed
  Running --> Idle: op done / failed (chain continues)
```

## SM-5 UI panels (minor) 🟢
- `Devices`: `editing` (rename device) and `editingOut` (rename output) toggles; `busy` while adding or connecting all.
- `ColorSelect`: `creating` (picker open), Cancel restores `before`.
- `CustomEffectEditor`: new or editing (`editingId`); Save calls `reset()` and closes.
- `Scenes`: `busy = sceneId` while applying, so a second click is blocked for that scene only.

## SM-6 Panel upload (`upload`, `PanelEditor.send`) 🟢 — 2026-11-01
```mermaid
stateDiagram-v2
  [*] --> encoding: send() (after leaveStealth)
  encoding --> refused: > 512 KB
  encoding --> saving: putItem (StorageFull shown, not fatal)
  saving --> queued: upload() → queue.push
  queued --> preselect: mcu ≥ 500
  queued --> window: mcu < 500
  preselect --> window: ack 08 80 or 2 s silence
  window --> window: ack next (01), more windows
  window --> done: last window acked (01 or 03)
  window --> failed: ack rejected (00) / full (02) / 6 s timeout / write error
  window --> cancelled: AbortController
  done --> shown: showSlot (force) → setLook(panel.slot) → patchPanel(lastSlot) → save(slot)
  refused --> [*]
  failed --> [*]
  cancelled --> [*]
  shown --> [*]
```
- 🟢 The device queue is held for the whole upload; other writes wait.
- 🟡 `done` does not insist on status `03` (TD-16).

## SM-7 Stealth (`store.stealth`) 🟢 — 2026-11-01
```mermaid
stateDiagram-v2
  [*] --> normal
  normal --> stealth: enterStealth (snapshot online endpoints, power off, look power:false)
  stealth --> stealth: device connects → powered off, added to snapshot
  stealth --> normal: command + user confirms leave (no restore)
  stealth --> stealth: command + user declines → nothing sent, nothing recorded
  stealth --> normal: exitStealth → replay snapshot looks, report unreachable
```
- 🟢 Persisted, so stealth survives a reload.
