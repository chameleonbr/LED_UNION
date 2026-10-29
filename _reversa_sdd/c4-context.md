# C4 — Level 1: System Context

> Reversa Architect · 2026-10-24 · 🟢 unless marked

```mermaid
C4Context
  title LED Union — System Context
  Person(owner, "Owner", "Controls their own LED controllers in the car and at home, from a phone or desktop")
  System(app, "LED Union PWA", "Cross-family BLE LED controller: multi-device, per-output, scenes")
  System_Ext(browser, "Chromium browser", "Web Bluetooth, localStorage, service worker")
  System_Ext(ctrl_ffe0, "LED+LAMP controllers", "LEDBLE, LEDDMX, LEDCAR, LEDSMART, LEDSUN, LEDLIKE, LEDPHO. GATT FFE0/FFE1")
  System_Ext(ctrl_fff0, "ELK / MELK controllers", "Magic Lantern and Lotus Lantern. GATT FFF0/FFF3")
  System_Ext(ctrl_bledim, "BLEDIM controllers", "BLEDIM / LanQianTech. GATT FFF0/FFF1")
  System_Ext(pages, "GitHub Pages", "Static HTTPS hosting at /LED_UNION/")
  System_Ext(gha, "GitHub Actions", "CI: test, then check, then build, then deploy")
  System_Ext(vendor, "Vendor Android apps", "Decompiled reference: protocol source of truth, offline only")

  Rel(owner, app, "Uses", "touch UI")
  Rel(app, browser, "Runs in")
  Rel(browser, ctrl_ffe0, "Writes 9-byte frames", "BLE GATT")
  Rel(browser, ctrl_fff0, "Writes 7E..EF frames", "BLE GATT")
  Rel(browser, ctrl_bledim, "Writes 55AA frames, chunks of 20 bytes, with response", "BLE GATT")
  Rel(pages, app, "Serves", "HTTPS")
  Rel(gha, pages, "Deploys dist/")
  Rel(vendor, app, "Protocol facts via docs/protocol and difftest", "dev time")
```

## Actors
| Actor | Role |
|---|---|
| Owner | The only persona. No accounts and no roles (see `permissions.md`) |
| LED controllers | Passive BLE peripherals. **No state is ever read back**; the app only writes |
| Vendor apps | Dev-time reference only (decompiled or memory-dumped); never contacted at runtime |
