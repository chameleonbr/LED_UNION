# LED Union

*[Leia em português](README.pt-BR.md)*

One app for every Bluetooth LED controller you own — a PWA, no install, no account.

The original apps (Magic Lantern, Lotus Lantern, LED+LAMP, BLEDIM) each talk to one
family, control one device at a time, and none of them are maintained. Here you pick
**one device, several, all of them, or a named group** and apply a colour, brightness,
effect or scene in one go.

## Status

| family | service / characteristic | status |
|---|---|---|
| MELK-* (Magic Lantern) | `FFF0` / `FFF3` | ✅ implemented |
| ELK- / XSL- / CLK- (Lotus Lantern) | `FFF0` / `FFF3` | ✅ implemented |
| LEDBLE / LEDSTAGE / LEDLIGHT | `FFE0` / `FFE1` | ✅ **confirmed on hardware** |
| LEDDMX-00/01/03, LEDCAR-01 | `FFE0` / `FFE1` | ✅ implemented (`7B FF … BF`) |
| LEDDMX-02/04, LEDCAR-02 | `FFE0` / `FFE1` | ✅ implemented (`7B … BF`, shifted) |
| LEDSMART | `FFE0` / `FFE1` | ✅ implemented (`7D … DF`) |
| LEDSUN | `FFE0` / `FFE1` | ✅ implemented (`7A … AF`, white/CCT only) |
| LEDLIKE | `FFE0` / `FFE1` | ✅ implemented (`70 … 0F`, white/CCT only) |
| LEDPHO | `FFE0` / `FFE1` | ✅ implemented (`72 … 2F`, group-addressed) |
| BLEDIM / LanQianTech | `FFF0` / **`FFF1`** | ✅ implemented (`55 AA`, variable length) |

Be clear about what "implemented" means here. The `ffe0` driver is **confirmed on real
hardware** — connecting, the `2A` handshake and the colour command all work on an
actual LEDBLE-00. Every other family is derived from decompiling the original apps and
matches them byte for byte (see [Differential testing](#differential-testing)), but has
never been tried on a device.

**Open question:** the controller we tested drives several physical outputs (a strip,
a door handle, a door sill) and the default colour frame only reaches one of them. See
the channels section in [`docs/protocol/ledble.md`](docs/protocol/ledble.md).

## Deployment

Pushing to `main` builds and publishes to
**https://chameleonbr.github.io/LED_UNION/** via GitHub Actions and GitHub Pages. The
workflow runs the tests and the type check first — a red build never ships.

It is served as a *project* page, so the site lives under `/LED_UNION/` and Vite builds
with that `base`. Development stays at the root, because the adb-tunnel workflow points
a phone at `http://localhost:5173`.

The built `dist/` is deliberately **not** committed: it would conflict on every build
(asset hashes change), and a stale artifact silently diverging from the source is worse
than no artifact.

## Running it on your phone

Web Bluetooth needs a secure context. In development `localhost` counts, so an adb
tunnel avoids HTTPS and certificates entirely:

```bash
npm install
npm run dev
adb reverse tcp:5173 tcp:5173
```

Open `http://localhost:5173` in Chrome on Android. In production, serve `dist/` over
HTTPS from any domain.

iOS does not support Web Bluetooth.

## Commands

```bash
npm run dev          # development server
npm run build        # builds dist/ with a service worker and manifest
npm test             # frame builders and the write queue
npm run check        # svelte-check + tsc
npm run gen:effects  # regenerates src/lib/protocol/effects.ts from docs/protocol/*.tsv
```

## Layout

```
src/lib/protocol/      pure frame builders, one module per family
src/lib/queue.ts       serial per-device write queue, with coalescing
src/lib/ble.svelte.ts  GATT connections and applying a command to a group
src/lib/ui/            screens
docs/protocol/         wire specs and effect tables (.tsv)
docs/protocol-pt-br/   the same specs, in Portuguese
tools/gen-effects.py   effect table generator
tools/difftest/        checks our builders against the original apps
```

Adding a family is one file in `src/lib/protocol/` implementing `Driver`, plus one line
in the registry. The builders are pure functions, so each gets a test comparing its
bytes against the documented frame.

## How you control things

Each **logical device** — one physical output, not one controller — is its own card in
the Effects tab, with its own colour and effect. A controller driving a strip and a door
handle shows up as two cards, so one can be blue while the other is amber.

An **Everything** card at the bottom sets colour and brightness across the lot. Effect is
deliberately not there: effect ids are per family, so id 42 is one effect on LEDDMX and a
different one on MELK.

Some controllers pick an output by switching protocol rather than by a channel number.
LEDCAR-01 drives a plain RGB light on the `7E` envelope and an addressable strip on
`7B`; the original app threads an `isCAR01DMX` flag through every call for exactly this.
Splitting one of those gives an **RGB** card and an **SPI** card, and only the SPI one
offers strip configuration.

Which channel byte reaches which physical output is firmware-specific, so the outputs
are editable: add one, remove one, and change its channel number until the right light
responds. If only one of two outputs reacts, the other is on a different number.

Tick the devices you want and **save a scene**. Applying it touches only those devices
and leaves everything else alone, reconnecting anything that dropped offline.

What each card shows is **the last command sent**, not a reading — BLE gives nothing
back. Use the vendor app in between and it will drift.

The **White** control is an intent, not a channel. Hardware with a real white wire gets
that channel driven; on an RGB-only controller the same slider sets r = g = b, which is
what "white at this intensity" means there. Sending the white channel to an RGB
controller zeroes the colour and turns the strip off.

BLEDIM exposes a **channel mode** (1 DIM, 2 CCT, 3 RGB, 4 RGBW) at the top of its card,
because it changes what the other controls mean.

## Colours and custom effects

The palette is editable: pick from saved colours, add your own from the full 0–255 RGB
range, remove any of them.

A **custom effect** is an ordered colour sequence with a speed and a jump/fade choice.
Black counts as a colour, so green → black → amber is a strobe. LEDBLE, LEDDMX and
BLEDIM support it; **MELK and ELK do not** — those apps have no colour-list command at
all, so the editor stays hidden on those cards.

## Language

English by default, switching to the browser's language when a translation exists, with
a selector in the header to override it.

## Addressable strips

LEDDMX and LEDCAR drive individually addressable strips. In the **Effects** tab, with
one of those selected, an **Addressable strip** panel appears: pixel count, channel
order and direction.

Without that configured the 211 effects render with the wrong colours or on only part
of the strip — and nothing reports an error, which makes the symptom hard to diagnose.
The configuration is saved per device.

## Sound-reactive mode

Also in the **Effects** tab, the **React to sound** panel enables the controller's own
microphone and sets its sensitivity. All three drivers support it.

Switching to "music" mode changes the mode on the device, but **streaming the phone's
audio is not implemented** — that would mean capturing PCM and pushing it over BLE
continuously.

## Protocol

See [`docs/protocol/`](docs/protocol/). The things that are easy to get wrong:

- On the `FFE0` and `FFF0` families, brightness, speed, white and CCT are **0–100**
  while RGB is 0–255. On BLEDIM everything is **0–255**.
- The `FFE0` family **requires a handshake** (`2A 02 …`) right after connecting, or the
  controller ignores every command.
- The `FFE0` and `FFF0` families use fixed 9-byte frames with no checksum. BLEDIM uses
  variable-length frames **with** an additive checksum, and mandates 20-byte fragments.
- These controllers choke on concurrent writes. There is a serial queue per device with
  a minimum gap — 50 ms for `FFE0`, 5 ms for `FFF0`, 30 ms per fragment for BLEDIM.

## Differential testing

The drivers were transcribed by hand from decompiled Java, and a hand-written test only
confirms what the author understood — not what the app does. `tools/difftest/`
mechanically extracts every frame the original apps build and diffs it against ours.

**221 of 221 frames match**, across three drivers and nine wire layouts. The process
found five real bugs that unit tests could not have. See
[`tools/difftest/README.md`](tools/difftest/README.md).

## Licence

MIT.

This is interoperability work with proprietary protocols. The repository contains only
protocol facts derived from observation — no code, assets or strings from the original
apps, and no copies of the apps themselves.
