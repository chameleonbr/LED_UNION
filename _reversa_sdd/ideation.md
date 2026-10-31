# Ideation, LED UNION: iPixel Color and CoolLED1248 panels

> Selo 🟡 PLANEJADO em todos os itens, sujeito a validação.

## Brief original
crie um plano de implementação dos aplicativos que pedi

Context: integrate into LED Union (Svelte 5 PWA + Web Bluetooth) the LED panels controlled by **iPixel Color** (com.wifiled.ipixels 3.8.1) and **CoolLED1248** (com.jtkj.led1248 2.7.9). Protocols in `docs/protocol/ipixel.md` and `docs/protocol/coolled.md`.

## Problem
🟡 The user wants to control every light from a single app, without opening the vendor apps, with everything kept up to date and in sync. Felt today by the user each time a panel must be changed: the strip and RGB LEDs live in LED Union, the panel lives in a separate vendor app.

## Value delivered
🟡 Create scenes that drive the LED strip and the LED panel together (e.g. one scene sets strip colour and panel content at once).

## Existing alternatives
🟡 The original vendor apps (iPixel Color, CoolLED1248). They work, but each one is a separate app; none combines with the other devices or with LED Union scenes.

## Target audience (raw)
🟡 The user himself: a car owner with LED installations (strip, door-handle and cup-holder RGB LEDs), who also has LED devices at home.

## Success metrics
🟡 Apply scenes containing the LED strip, the RGB LEDs and the iPixel panel together, without opening any other app. No numeric target given (latency or frequency not specified).

## Assumptions to validate
🟡 1. Chrome Web Bluetooth can connect and write to the iPixel: service `000000fa-…` is not blocklisted and the panel does not require OS pairing.
🟡 2. An iPixel panel in a scene is useful even without a solid-colour command, using power, brightness, saved slot, text or image.
🟡 3. The protocol read from app 3.8.1 works on the user's model, including the upload window size (4096 vs 12288).

## Notes
🟡 The user owns an iPixel panel of unknown model; first deliverable must discover/list it and read its device type (panel size) so it can be tested. The user owns no CoolLED device: CoolLED support is lower priority and cannot be hardware-tested.
🟡 Scope depth (basic controls vs text/image upload) was not explicitly decided; the scene goal implies at least power/brightness/slot, with text/image desirable.

---
Gerado por reversa-ideator em 2026-10-31T18:14:10Z
Fonte: newproject-brief.md
