# User Stories: Scenes and Groups

> Reversa Writer · 2026-10-26 · global · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Persona 🟡: the same multi-controller owner; the headline scenario is "walk back to the car and hit a scene" (`domain.md`, commits).
> Units: `scenes/`, `groups/`, `device-control/`, `persistence/`

## US-20 Save the current look as a scene 🟢 intent / ❌ broken
**As** an owner, **I want** to tick the lights I care about and save how they look now as a named scene, **so that** I can get back to it with one tap.

Acceptance:
- Only the ticked lights are saved.
- The scene is a snapshot: changing the lights later does not change it.
- The form clears after saving.

Trace: `scenes/requirements.md` RF-01, RF-02, BR-32 · Status: ❌ **broken for any light that has been used**
- 🟢 **F14:** `structuredClone` on the Svelte state proxy throws `DataCloneError` (reproduced under node), so the scene is not saved and no message appears.
- Fix: `scenes/tasks.md` T-02 / `persistence/tasks.md` T-08.
- 🟢 Backed by the Svelte docs (`$state.snapshot` exists because `structuredClone` rejects proxies) and two independent V8 reproductions. [Reviewer]

## US-21 Apply a scene when I arrive 🟢
**As** an owner, **I want** to tap a scene and have every saved light go to its saved state, reconnecting as needed, **so that** arriving at the car is one tap.

Acceptance:
- Offline devices reconnect.
- Each light gets power → brightness → speed → colour → effect, in that order.
- Lights not in the scene are untouched.
- Each light's card then shows the scene's look.

Trace: `scenes/` RF-04..06, BR-31, BR-33, BR-12 · Status: ⚠ partial
- 🟢 **F1:** the variant is dropped, so the LEDCAR-01 RGB output replays through the strip envelope and plays the wrong effect.
- 🟢 **F12:** a custom effect replays without its speed.
- 🟢 **F5:** white, CCT and sound are not part of a scene.
- 🟢 One untracked device carrying a custom effect aborts the rest of the scene.

## US-22 Keep my scenes tidy 🟢
**As** an owner, **I want** to delete scenes, and have scenes clean themselves up when I forget a device, **so that** they never point to lights I no longer have.

Acceptance:
- ✕ deletes the scene.
- Forgetting a device removes its entries, and a scene left empty disappears.
- Old single-colour scenes from earlier versions are dropped, not misapplied.

Trace: `scenes/` RF-08, RF-09; `persistence/` BR-35, BR-34 · Status: ✅ (no confirmation on delete 🟡)

## US-23 Group lights by place 🟡 intent (G6)
**As** an owner, **I want** to save a named group ("Car", "Living room") of devices or outputs, **so that** I can treat them as one.

Acceptance:
- I can tick devices and outputs, save the selection as a group, and re-select it later.
- Forgetting a device removes it from every group.

Trace: `groups/` RF-01..05 · Status: ⚠ partial
- ✅ Save, list, select and delete work.
- 🟢 **F2:** forgotten devices' output keys stay in groups; counts are per key.

## US-24 Command a group 🔴 not implemented (G6)
**As** an owner, **I want** to set power, colour and brightness on a whole group at once, **so that** "Car" or "Living room" changes together.

Acceptance:
- Every member receives the command.
- Each member's look updates.
- Multi-output members are addressed per output, never with the default byte.
- Effects are offered only when every member shares the family and table (🟢 owner decision [Owner, 2026-10-26]).

Trace: `groups/` RF-07, RF-08, `groups/design.md` "Intended design" · Status: ❌ **missing**
- 🟢 **F15:** no command reads the selection or the groups (`apply()` and `targets()` have no callers).
- Planned in `groups/tasks.md` T-07..T-09.

## US-25 Scenes and groups survive reloads 🟢
**As** an owner, **I want** scenes and groups to be there next time, **so that** I set them up once.

Acceptance:
- They are stored locally and survive reloads.
- With storage blocked, the app still works for the session.

Trace: `persistence/` RF-01..05 · Status: ✅

## Story map

| Step | Story | Works today? |
|---|---|---|
| 1. Pick lights | US-23 (selection) | ✅ |
| 2. Save as a group | US-23 | ✅ (F2 cleanup issue) |
| 3. Command the group | US-24 | ❌ (F15) |
| 4. Save a scene | US-20 | ❌ for used lights (F14) |
| 5. Apply it on arrival | US-21 | ⚠ (F1, F12, F5) |
| 6. Keep it tidy | US-22 | ✅ |

> The headline flow (steps 4–5) is blocked by F14 and degraded by F1. These two fixes, plus F15, are the highest-value work in this area.
