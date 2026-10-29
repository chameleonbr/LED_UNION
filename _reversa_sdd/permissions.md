# Permissions — LED UNION

> Reversa Detective · 2026-10-24

## Roles 🟢
**None.** There are no accounts, no backend and no RBAC. Everyone who opens the PWA in a supported browser has full control of every device that browser has permission for. All data is local to the browser profile (`localStorage`).

## Access is governed by the platform 🟢

| Gate | Enforced by | Rule | Evidence |
|---|---|---|---|
| Secure context | Browser | Web Bluetooth works only over HTTPS or `localhost`. Production is GitHub Pages (HTTPS); development uses an adb tunnel to localhost or a `*.ts.net` tailnet TLS host | `deploy.yml`, `vite.config.ts` |
| Device permission | Browser chooser | A device becomes reachable only after the user picks it in `requestDevice` (one per call, filtered by known service UUIDs) | `addDevice()` |
| Re-adoption | Browser (`getDevices`, may sit behind a flag) | Devices already granted can be reconnected without the chooser | `restore()` |
| User gesture | Browser | The first connect after a load may need a gesture, so silent auto-connect is best effort and "Connect all" is the reliable path | `restore()` comment |
| Declared services | Browser | Only services listed in `optionalServices` can be accessed; Debug probes the known UUIDs as a fallback | `inspect()` |
| Platform support | Browser | Chrome or Edge on desktop or Android; **iOS is unsupported**; a warning banner keeps the app usable | `App.svelte`, `common.unsupportedHint` |

## Device-side authentication 🟢 / 🟡
| Family | Mechanism | Real security? |
|---|---|---|
| ffe0 (LEDBLE/LEDDMX/LEDCAR) | `2A 02` frame with the **fixed default password** `A1 23 45 67` + day of week and time | 🟡 No: a constant password plus the clock. The controller ignores commands until it gets the frame |
| BLEDIM | `0x89` serial code from the current seconds and ms | 🟢 Checked only on the phone side; nothing shows the device refusing unauthenticated commands (code comment) |
| ELK/MELK | none | — |

🟡 **Implication:** anyone within BLE range who has a compatible app can control these controllers. This is a property of the hardware that LED Union neither adds nor mitigates.

## Feature-level permission matrix

| Feature | Anyone with the page | Needs a device grant | Needs online |
|---|---|---|---|
| View saved devices, groups, scenes, palette | ✔ | – | – |
| Add a device | ✔ | chooser | – |
| Control, apply a scene | ✔ | ✔ | auto-reconnect |
| Debug: inspect, raw send, sweeps | ✔ | ✔ | GATT connect |
| Forget a device / delete data | ✔ | – | – |

🟢 **G7 (answered by the owner, 2026-10-24):** The Debug tab sends arbitrary frames without confirmation **by design**. It is the tool for catching devices and frames that misbehave, and it stays in production, ungated.
