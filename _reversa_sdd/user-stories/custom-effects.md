# User Stories: Custom Effects

> Reversa Writer · 2026-10-26 · global · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Persona 🟡: the same owner, who wants an animation the firmware doesn't have (e.g. a green → black → amber strobe).
> Units: `custom-effects/`, `effects/`, `protocol-drivers/`, `scenes/`

## US-30 Build my own colour sequence 🟢
**As** an owner, **I want** to build a named sequence of up to 14 colours, with jump or fade and a speed, **so that** I get an animation the built-in list lacks.

Acceptance:
- Colours can be added (up to 14), reordered and removed.
- Black is allowed (strobe).
- Save needs a name and at least one colour.
- Effects are shared by every light, not stored per device.

Trace: `custom-effects/` RF-02..06, BR-20, BR-CE9 · Status: ✅ (no live preview while editing 🟡)

## US-31 Run it on a light 🟢
**As** an owner, **I want** to pick my sequence in a light's effect list, **so that** that light plays it.

Acceptance:
- It appears under "My effects" only on lights whose family supports it.
- It uploads in order without dropping frames, then sets its speed.
- The card shows its name.

Trace: `custom-effects/` RF-08..11, BR-15, BR-CE6 · Status: ✅ on ffe0 (LEDBLE, LEDDMX, LEDCAR, LEDSMART, LEDSTAGE); ⚠ BLEDIM untested on hardware (G5)

Known gaps:
- 🟢 An upload failure gives no feedback (an unhandled rejection).
- 🟢 Multi-output controllers cannot run a sequence on one output (BR-CE10).

## US-32 Know when a light can't do it 🟢
**As** an owner, **I want** to be told when a light has no custom-effect support, **so that** I don't wonder why nothing happens.

Acceptance:
- ELK/MELK, LEDSUN, LEDLIKE and LEDPHO show the "unsupported" hint and offer no custom options.
- No fake frame is ever sent.

Trace: `custom-effects/` RF-08, BR-21 · Status: ✅

Known gap:
- 🟡 **F4:** on BLEDIM, the support check itself rewrites the driver's colour memory, so brightness can change behaviour after a re-render.

## US-33 Edit or delete a sequence 🟢
**As** an owner, **I want** to edit a saved sequence, or delete it, **so that** I can refine it.

Acceptance:
- Editing keeps the same identity, so lights showing it keep the reference.
- Deleting clears it from every light that showed it.

Trace: `custom-effects/` RF-03, RF-07, BR-CE8 · Status: ✅

## US-34 Include it in a scene 🟡
**As** an owner, **I want** a scene to replay my custom sequence, **so that** arrival scenes can animate.

Acceptance:
- The scene uploads the sequence and its speed.
- It shows the sequence name.

Trace: `scenes/` RF-05, RF-07 · Status: ⚠ partial
- 🟢 **F12:** the speed is not resent.
- 🟢 **F14:** saving the scene in the first place fails for used lights.

## Out of scope / future
- 🟡 Live preview while editing, as the colour picker has.
- 🟡 Running a newly saved sequence right away (`onsaved` exists but is unused).
