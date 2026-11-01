# Investigation — 003 motion-mode

## Browser APIs (Chrome Android)
- 🟢 **Geolocation** `watchPosition`: `coords.speed` (m/s, may be null), `accuracy` (m). Needs a secure context (GitHub Pages HTTPS). Stops delivering while the page is hidden.
- 🟢 **DeviceMotionEvent** `accelerationIncludingGravity` (m/s², device frame) at ~60 Hz on Android; no permission prompt on Chrome Android (only iOS has `requestPermission`); not fired to hidden pages.
- 🟢 **Screen Wake Lock** `navigator.wakeLock.request('screen')`: released automatically when the page is hidden; must be re-requested on `visibilitychange` to visible.
- 🟢 **Vibration** `navigator.vibrate`: user-activation gated; may be ignored when hidden.
- 🔴 **Locked screen**: no web API keeps sensors or JS alive in a locked phone. Background Sync / Periodic Sync do not stream sensors. A native Android shell (e.g. a WebView app or Capacitor with a foreground service and native BLE/location) is the only route — out of this phase.

## Alternatives considered
| Option | Verdict |
|---|---|
| Dark full-black overlay + Wake Lock | **Chosen**: works in PWA; OLED near zero light |
| Keep running when hidden | Not possible (APIs stop) |
| Native wrapper now | Breaks PRD "stays a PWA, no install" constraint; bigger scope |
| Generic Sensor API (`LinearAccelerationSensor`) | Chrome-only behind permissions policy; DeviceMotion is enough |

## Signal processing
- 🟡 Exponential low-pass `y += α(x − y)`, `α = dt / (τ + dt)`, τ = 0.3 s.
- 🟡 Projection: remove calibrated gravity; horizontal = a − (a·ĝ)ĝ; G long = horizontal·f̂ / 9.81; G lat = horizontal·(ĝ × f̂) / 9.81.
- 🟡 Typical car: braking 0.3–0.8 G, cornering 0.2–0.6 G, normal acceleration 0.1–0.3 G — defaults (−0.4, ±0.4, +0.3) fire on firm events only.

## Legacy patterns reused
- 🟢 Snapshot/restore from `stealth.ts`.
- 🟢 Coalescing per key in `WriteQueue.pushLatest` (ADR-004).
- 🟢 `applyLook` ordering (BR-33).
