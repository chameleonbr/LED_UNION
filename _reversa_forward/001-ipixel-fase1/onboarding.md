# Onboarding — testing 001 ipixel-fase1

## Prerequisites

- Chrome on Android (or desktop) with Bluetooth on; optional flag `chrome://flags/#enable-web-bluetooth-new-permissions-backend` for reconnect without chooser.
- The iPixel panel powered on and **disconnected from the vendor app** (BLE allows one central).
- Strip and RGB LEDs already saved in LED Union.
- Branch build: Web Bluetooth needs a secure context, so plain `http://<lan-ip>:5173` will not work. Use one of:
  - Android over USB: `npm install && npm run dev`, then `adb reverse tcp:5173 tcp:5173`, open `http://localhost:5173` in Chrome on the phone.
  - Tailnet: `npm run dev` and open the `https://<host>.ts.net:5173` address (allowed in `vite.config.ts`).
  - GitHub Pages only after the PR is merged to `main` (production deploy, on explicit request).

## Steps

1. **Spike** — Devices → Add device → pick `LED_BLE_…` (or the device listed by service). Open Debug → Inspect: note services and characteristics.
2. **Size** — Back on Devices: the iPixel card shows `W×H` within 5 s. If "size unknown", tap Retry and check Debug for notifications.
3. **Basics** — Toggle power; move brightness from 10 to 100; set orientation 0..3; enter slot 1 and tap Show.
4. **Scene** — Select strip, RGB LEDs and iPixel; set colours and slot 2; Effects → save scene "Test". Change everything; Scenes → apply "Test": all three return.
5. **Stealth** — Tap Stealth in the header: every light goes off. Reload the page: still Stealth ON, nothing turns on. Tap Stealth again: each light returns to its look.
6. **Stealth guard** — With stealth on, move a slider: "Leave stealth?" appears; Cancel writes nothing.
7. **Regression** — Run an old scene and the usual strip/RGB controls: same behaviour as before.
8. **Automated** — `npm test`, `npm run check`, `npm run build`; difftest md5 `98622b8733585ad72d2b82a0aa7767e0`.

## Report back

What the log must show:
- The `connect` entry for the panel has `driver: "ipixel"`. If it says `ffe0` or `fff0`, the panel also exposes that service and the probe took it before `00FA`; then ipixel's service must be probed first for names both claim.
- The first `notify` after `08 00 01 80 …` has `01 80` at bytes 2–3 (e.g. `xx 00 01 80 81 …`). If not, the size stays "unknown" and the device-info check must be loosened.


Panel name, size shown, and the file from Debug → **Download log** (`led-union-trace-*.json`): it holds every frame sent and every panel reply, so it can be checked byte by byte.
