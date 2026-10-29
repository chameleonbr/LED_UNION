# C4 — Level 3: Components (SPA)

> Reversa Architect · 2026-10-24

```mermaid
C4Component
  title LED Union SPA — Components
  Container_Boundary(spa, "SPA") {
    Component(app, "App.svelte", "Shell", "Tabs, locale picker, restore() on mount")
    Component(devices, "Devices.svelte", "UI", "Add, connect, select, rename, groups")
    Component(effects, "Effects.svelte", "UI", "Logical endpoints, Everything card, save scene")
    Component(card, "DeviceCard.svelte", "UI", "Per-endpoint controls")
    Component(scenes, "Scenes.svelte", "UI", "Apply or delete scenes")
    Component(debug, "Debug.svelte", "UI", "GATT inspect, raw send, sweeps")
    Component(color, "ColorSelect / CustomEffectEditor", "UI", "Palette, custom sequences")
    Component(ble, "ble.svelte.ts", "Service", "conns, selection, connect, resolveDriver, applyTo, sendFrames, sendRaw, inspect")
    Component(queue, "WriteQueue", "queue.ts", "Serial, gap, coalescing")
    Component(ep, "endpoint.ts / hex.ts", "Util", "Endpoint keys, hex parsing")
    Component(store, "store.svelte.ts", "State", "Reactive Persisted plus mutators")
    Component(persist, "persist.ts", "Pure", "Types, seed, migrate")
    Component(i18n, "i18n.svelte.ts / dict.ts", "Util", "t(), locale")
    Component(reg, "protocol/index.ts", "Registry", "drivers, driverFor, allServices")
    Component(fff0, "fff0.ts", "Driver", "ELK/MELK")
    Component(ffe0, "ffe0.ts", "Driver", "7 layouts, outputs, auth, SPI")
    Component(bledim, "bledim.ts", "Driver", "55AA, ScenePara, per-name state")
    Component(fx, "effects.ts", "Generated data", "Effect tables")
  }
  Rel(app, devices, "renders")
  Rel(app, effects, "renders")
  Rel(app, scenes, "renders")
  Rel(app, debug, "renders")
  Rel(effects, card, "one per endpoint")
  Rel(card, color, "uses")
  Rel(devices, ble, "add/connect/forget/selection")
  Rel(card, ble, "applyTo / sendFrames / sendRaw")
  Rel(effects, ble, "applyTo for every key")
  Rel(scenes, ble, "applyTo / sendFrames")
  Rel(debug, ble, "inspect / sendRaw")
  Rel(card, ffe0, "spiConfigFrame / directionFrame (direct import)")
  Rel(card, bledim, "switchChannelsFrame (direct import)")
  Rel(ble, queue, "push / pushLatest")
  Rel(ble, reg, "driverFor / drivers")
  Rel(ble, store, "rememberDevice / forgetDevice")
  Rel(reg, fff0, "")
  Rel(reg, ffe0, "")
  Rel(reg, bledim, "")
  Rel(fff0, fx, "")
  Rel(ffe0, fx, "")
  Rel(store, persist, "migrate / seed")
  Rel(i18n, store, "locale")
```

## Notes
- 🟢 The UI imports family-specific helpers directly (`ffe0.spiConfigFrame`, `bledim.switchChannelsFrame`), outside the `Driver` interface. This leaks the abstraction; see debt TD-05.
- 🟢 `ble.svelte.ts` and `store.svelte.ts` are module singletons holding Svelte `$state`. There is no DI, so they cannot be tested without the Svelte runtime and Web Bluetooth mocks.
- 🟢 `persist.ts` was split out of the store specifically so it can be tested (commit `50de5fb`).
