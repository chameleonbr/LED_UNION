# User Stories: Connect and Control

> Reversa Writer · 2026-10-26 · global · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Persona 🟡 (from `domain.md` and the commits): an owner of several BLE LED controllers (car strip, door handle, headlight, home lights) who is tired of the vendor apps (each speaks one family and one device at a time) and uses a phone browser.
> Units: `device-connection/`, `device-control/`, `effects/`, `protocol-drivers/`, `debug/`, `i18n/`

## US-01 Add a controller 🟢
**As** an owner, **I want** to add a controller from the browser's device chooser, **so that** I can control it without the vendor app.

Acceptance:
- Only compatible devices (FFF0 / FFE0 services) appear in the chooser.
- After a pick, the device is listed, connects, and receives its handshake before any command.
- A device whose name lies about its family still works (GATT probe).
- Cancelling the chooser shows no error.

Trace: `device-connection/requirements.md` RF-02..07, RF-14 · Status: ✅ implemented

## US-02 Come back without re-pairing 🟢
**As** an owner, **I want** my controllers to reconnect when I open the app, **so that** walking up to the car "just works".

Acceptance:
- Saved devices are listed on load.
- Granted devices reconnect without the chooser when the browser allows it.
- "Connect all" is the reliable fallback.
- A command on an offline device reconnects it first.

Trace: `device-connection/` RF-09, RF-12; `device-control/` RF-03 · Status: ✅ best effort (depends on `getDevices` support and on the user-gesture rule)

## US-03 Name my lights 🟢
**As** an owner, **I want** to rename a controller and each of its outputs ("Car · strip", "Door handle"), **so that** I recognise them.

Acceptance:
- The advertised name is never changed.
- Clearing a name restores the model's label.
- Names persist.

Trace: `persistence/` RF-06, RF-07; `domain.md` BR-01 · Status: ✅

## US-04 Control one light 🟢
**As** an owner, **I want** power, colour, brightness, speed and white on each light, **so that** I set exactly what I want.

Acceptance:
- Only the controls the model supports are shown.
- Dragging a slider ends on the last value I chose.
- White works on RGB-only strips (r = g = b) and drives the real white channel where one exists.
- The card shows the last thing I sent.

Trace: `device-control/` RF-08..13, RF-19 · Status: ✅

Known gaps:
- 🟢 White, CCT and sound changes are not remembered (F5).
- 🟢 Failed writes are silent (F9).

## US-05 Control one output of a multi-output controller 🟡
**As** an owner of a controller that feeds two lights, **I want** to set each output separately, **so that** the strip and the handle can differ.

Acceptance:
- The model's outputs appear as separate cards.
- A command on one output never changes the other.

Trace: `device-control/` RF-01, BR-10; `protocol-drivers/contracts.md` C1, C2 · Status: ⚠ **partial**
- 🟢 LEDCAR-01 (RGB / SPI by envelope) works and is verified on hardware (G4).
- 🟢 LEDBLE-02: the channel byte is carried in power, colour, brightness, speed and effect, but not in white, CCT or custom effects (BR-CT8, BR-CE10).
- 🟢 LEDCAR-02: only the effect carries the channel byte; power, colour, brightness and speed frames are byte-identical for output 1 and 2 (F18). 🟡 That both physical outputs react is unverified on hardware. [external review R11]
- 🔴 The owner's controller "often ends up setting the same colour on everything" (G2). It needs a hardware session with the Debug channel sweep.

## US-06 Play a built-in effect 🟢
**As** an owner, **I want** to pick one of the controller's own animations, **so that** I get motion without building one.

Acceptance:
- The list matches the model and output (LEDCAR-01 strip: 211 effects; RGB: 23).
- MELK effects are grouped.
- A chosen effect is shown after a reload.

Trace: `effects/` RF-01..04 · Status: ✅ (BLEDIM effects untested on hardware, G5)

## US-07 Everything at once 🟢
**As** an owner, **I want** one control to switch every light on or off, colour them, or dim them together, **so that** I don't have to touch each card.

Acceptance:
- Power, colour and brightness go to every light.
- Effects are not offered, because they differ per family.
- One unreachable device does not stop the others.

Trace: `device-control/` RF-17, BR-11 · Status: ✅

## US-08 Set up an addressable strip 🟢
**As** an owner of a pixel strip, **I want** to tell the controller the pixel count, colour order and direction, **so that** effects render correctly.

Acceptance:
- Shown only on addressable models.
- The config is saved only when it reaches the device.
- It persists.

Trace: `device-control/` RF-15 · Status: ✅ (verified on LEDCAR-01, G4)

## US-09 Tell the app how my BLEDIM is wired 🟢
**As** a BLEDIM owner, **I want** to choose DIM / CCT / RGB / RGBW, **so that** the controls match the wiring.

Acceptance:
- The choice is saved even when the device is out of range.
- RGB wiring hides the real-white control.

Trace: `device-control/` RF-16, BR-16 · Status: ✅

## US-10 Diagnose a misbehaving device 🟢
**As** a tinkerer, **I want** to see what a device exposes, send raw frames, and sweep candidate frames, **so that** I can identify an unknown controller or a wrong byte.

Acceptance:
- Inspect works even when driver resolution fails.
- Raw frames go through the device queue.
- Sweeps are 1.5 s apart, with a log.

Trace: `debug/` RF-02..09; G7 (ungated by design) · Status: ✅ (UI in Portuguese only, F6)

## US-11 Use the app in my language 🟢
**As** a user, **I want** the app in English or Portuguese, following my browser unless I choose, **so that** I can read it.

Acceptance:
- An explicit choice persists and beats the browser.
- Missing translations fall back to English.

Trace: `i18n/` RF-01..05 · Status: ⚠ partial
- Debug and the BLE errors are Portuguese only (F6).
- `<html lang>` is fixed to `pt-BR` (F17).

## Out of scope
- 🟢 Phone-audio (music) streaming to the lights: planned for the future (G3).
- 🟢 iOS: Web Bluetooth is unsupported; a banner explains it.
