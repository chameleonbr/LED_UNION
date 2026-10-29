# C4 — Level 2: Containers

> Reversa Architect · 2026-10-24

```mermaid
C4Container
  title LED Union — Containers
  Person(owner, "Owner")
  System_Boundary(b, "Browser (Chrome / Edge, secure context)") {
    Container(spa, "SPA", "Svelte 5 + TypeScript, Vite bundle", "UI, routing of commands, drivers")
    Container(sw, "Service worker", "vite-plugin-pwa (Workbox), autoUpdate", "Offline caching of the app shell")
    ContainerDb(ls, "localStorage", "JSON under key led-union/v1", "Devices, groups, scenes, looks, labels, palette, custom effects, locale")
    Container(wb, "Web Bluetooth", "navigator.bluetooth", "Chooser, GATT connections, writes")
  }
  System_Ext(ctrls, "BLE LED controllers")
  System_Ext(pages, "GitHub Pages")
  Container_Ext(tools, "Dev tooling", "Python 3 + Node 24", "gen-effects (TSV to TS), difftest (Java vs TS)")

  Rel(owner, spa, "Interacts")
  Rel(spa, ls, "load/save on every mutation", "sync JSON")
  Rel(spa, wb, "requestDevice / getDevices / connect / write")
  Rel(wb, ctrls, "GATT write / writeWithoutResponse")
  Rel(sw, pages, "Fetches and caches assets", "HTTPS")
  Rel(tools, spa, "Generates effects.ts; validates the drivers", "build time")
```

| Container | Tech | Notes |
|---|---|---|
| SPA | Svelte 5.57 (runes), TS 6, Vite 8 | Single bundle; no router, tabs only |
| Service worker | vite-plugin-pwa 1.3 | `registerType: autoUpdate`; manifest: standalone, portrait, relative `start_url` |
| localStorage | browser | Single document, rewritten on every save; legacy key `led-onion/v1` |
| Web Bluetooth | browser | `@types/web-bluetooth`; `getDevices` optional |
| Dev tooling | Python stdlib, Node `--test` | Not shipped |
