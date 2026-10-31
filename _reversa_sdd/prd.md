# PRD: LED UNION, iPixel and CoolLED panels

> Selo 🟡 PLANEJADO. Documento gerado a partir de ideation + personas.

**Version:** 1.0
**Date:** 2026-10-31T18:26:40Z
**Author:** reversa-drafter
**Status:** draft

---

## 1. Problem

🟡 The user controls the LED strip and RGB LEDs (door handle, cup holder) in LED Union, but the iPixel LED matrix (car and balcony) and CoolLED panels need their own vendor apps. There is no single place to drive everything together, keep it in sync, build scenes that mix strip and panel, react to driving, or show dynamic content (playlists, live data). The vendor iPixel app UI is poor and inflexible.

### Who feels it
- 🟡 **Driver**: in the car with the phone in the holder, when setting a driving look, reacting to the drive, or blacking everything out (stealth).
- 🟡 **Resident**: at home, when changing what the balcony iPixel shows (house number, cat eyes, fun effects).
- 🟡 **Content creator**: on the phone, when importing internet GIFs or wanting live social data on the panel.

---

## 2. Target personas

🟡 Full reference in [`personas.md`](./personas.md). Summary:

- **Driver**: 🟡 car owner with strip, RGB LEDs and an iPixel; pain: one app per device, nothing reacts to the drive.
- **Resident**: 🟡 balcony iPixel showing house number and fun effects; pain: vendor UI inflexible for dynamic content.
- **Content creator**: 🟡 makes humour/identity content from internet GIFs and APIs; pain: no GIF import, no live data.

---

## 3. Success metrics

| Metric | Unit | Target | Deadline |
|---|---|---|---|
| 🟡 Scenes applying strip + RGB LEDs + iPixel together from LED Union | scene applied without vendor app (yes/no) | yes | 🟡 [INDEFINIDO, validar com usuário] (ideation says "in 3 months") |
| 🟡 Vendor app opened for daily control | times per month | 0 | 3 months |
| 🟡 User's iPixel listed, connected and its model/size read | device recognised (yes/no) | yes | end of phase 1 |
| 🟡 Scene apply latency | seconds | 🟡 [INDEFINIDO, validar com usuário] | — |

---

## 4. Scope (in)

Delivered in phases, agreed with the user:

- 🟡 **Cross-cutting, existing LEDs**: every current driver (fff0, ffe0 layouts, bledim, LEDCAR-01 ble/dmx) keeps working unchanged, and every new feature (scenes with panels, stealth, motion mode, action buttons, data-driven triggers) works on existing LEDs together with the new panels.

- 🟡 **Phase 1, iPixel basics + stealth**
  - Discover and connect iPixel (name contains `LED_BLE`, service `000000fa-…`), read device info and map type to panel size.
  - Power, brightness, show saved slot; iPixel included in scenes.
  - Stealth mode: one tap switches every connected device off; turning it off restores the last scene.
- 🟡 **Phase 2, panel content**
  - Library of panel items: text (style, scroll effect), GIF/image import from the phone with crop, scale and preview.
  - Upload to the matrix (windowed upload with CRC32 + ACK).
  - Playlist: ordered items, per-item duration, loop; plays on its own.
- 🟡 **Phase 3, driving**
  - Motion mode: lights and panel effects react to GPS speed, accelerometer and G-force (foreground only).
  - Custom action buttons that fire a GIF or scene.
- 🟡 **Phase 4, data sources**
  - Generic data source: JSON URL + field path + refresh interval, bound into text items (e.g. "Followers: {n}").
  - Ready-to-import n8n example workflows acting as proxy for third-party APIs (channel followers, X followers/posts, live comments).
- 🟡 **Phase 5, CoolLED1248**
  - Family detection by name and manufacturer data; power, brightness, speed, 8 modes; text/image upload later. No hardware available for testing.

---

## 5. Non-goals (out)

- 🟡 Native app (stays a PWA).
- 🟡 Own backend in LED Union; third-party API integrations are not developed inside the app, only easy-to-adopt n8n examples.
- 🟡 Background operation with the screen off (browser limitation).
- 🟡 Guaranteed CoolLED support before hardware is available.

---

## 6. Constraints

| Type | Description |
|---|---|
| 🟡 Technical | Svelte 5 PWA + Web Bluetooth on Chrome, deployed on GitHub Pages (`/LED_UNION/`); no server. One user gesture per `requestDevice`; reconnect relies on the `getDevices()` flag. Pure frame builders per driver (ADR-002), serial write queue (ADR-004). DeviceMotion/Geolocation need permission and an open, visible page. |
| 🟡 Technical | No regression on existing drivers: current tests (`node --test`) and difftest emitter md5 `98622b8733585ad72d2b82a0aa7767e0` must stay green/unchanged. |
| 🟡 Technical | Third-party APIs called through a user-owned n8n proxy (CORS and secrets stay out of the browser). |
| 🟡 Deadline | 🟡 [INDEFINIDO, validar com usuário] |
| 🟡 Compliance | 🟡 [INDEFINIDO, validar com usuário] (location data stays on device) |
| 🟡 Budget | 🟡 [INDEFINIDO, validar com usuário] |

---

## 7. External dependencies

- 🟡 iPixel panel firmware (protocol from com.wifiled.ipixels 3.8.1, `docs/protocol/ipixel.md`).
- 🟡 CoolLED firmware (protocol from com.jtkj.led1248 2.7.9, `docs/protocol/coolled.md`).
- 🟡 Browser APIs: Web Bluetooth, Geolocation, DeviceMotion, Canvas (text rasterisation, GIF frame decode).
- 🟡 User-owned n8n instance as API proxy (phase 4).
- 🟡 Third-party APIs reached only via n8n: YouTube/channel, X, live-stream comments.

---

## 8. Risks

| Risk | Impact | Probability | Proposed mitigation |
|---|---|---|---|
| 🟡 Chrome blocks iPixel service or panel needs OS pairing | high | low | Phase 1 starts with a connect/probe spike on the real panel before anything else. |
| 🟡 Protocol from app 3.8.1 differs on user's model (window size 4096 vs 12288) | high | medium | Read device type first; make window size per type; test both on hardware. |
| 🟡 No solid colour on iPixel makes scene integration weak | medium | medium | Scene step uses power, brightness, slot or a library item. |
| 🟡 GIF upload too slow or too large for panel memory | medium | medium | Downscale, frame cap, progress UI; measure on hardware. |
| 🟡 Motion mode stops when screen locks / page hidden | medium | high | Document foreground-only; keep-awake (Wake Lock) while active. |
| 🟡 Sensor-driven frequent writes flood BLE queue | medium | medium | Reuse queue coalescing (ADR-004), rate limit updates. |
| 🟡 Third-party API terms/rate limits change | low | medium | Kept outside the app in n8n examples. |
| 🟡 CoolLED untested | medium | high | Last phase, marked experimental. |

---

## 9. Acceptance criteria (high level)

- 🟡 **Given** the user's iPixel is powered, **When** the Driver taps "Add device" and picks it, **Then** it appears in the device list with its detected panel size and responds to power and brightness.
- 🟡 **Given** a scene with strip, RGB LEDs and iPixel, **When** the Driver applies it, **Then** all three change without opening any vendor app.
- 🟡 **Given** devices are on, **When** the Driver taps stealth, **Then** all connected devices switch off; **When** tapped again, **Then** the last scene is restored.
- 🟡 **Given** existing strip/RGB LEDs already supported, **When** any phase ships, **Then** they behave as before, and motion mode, action buttons and stealth also drive them alongside the panels.
- 🟡 **Given** a playlist with GIFs and texts, **When** the Resident sends it, **Then** the balcony matrix plays the items in order with their durations, in loop.
- 🟡 **Given** a text item bound to an n8n JSON URL, **When** the value changes, **Then** the panel shows the new value within the refresh interval.
- 🟡 **Given** motion mode is on and the page is visible, **When** speed or G-force changes, **Then** the configured light/panel effect follows.

---

## Coverage pending

- 🟡 Deadline, budget and compliance constraints.
- 🟡 Target date for the 3-month success metric and scene-apply latency target.
- 🟡 User's iPixel model (to be discovered by phase 1).

---

Gerado por reversa-drafter em 2026-10-31T18:26:40Z
Fontes: ideation.md, personas.md
