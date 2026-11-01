# Data delta — 003 motion-mode

Over `_reversa_sdd/data-dictionary.md#Persisted (root)`.

## New field `Persisted.motion?` (localStorage `led-union/v1`)
```ts
type MotionInput = 'speed' | 'gLong' | 'gLat' | 'gTotal'
type MotionAction =
  | { kind: 'flash'; color: string; times: number }          // default red ×3
  | { kind: 'look'; power?: boolean; colorHex?: string; effect?: Effect }
  | { kind: 'scene'; sceneId: string }
  | { kind: 'slot'; slot: number; seconds: number }
type MotionRule = {
  id: string; name: string; enabled: boolean
  targets: string[]                                    // endpoint keys
  input: MotionInput
  kind: 'map' | 'trigger' | 'place'
  map?: { from: number; to: number; out: 'brightness' | 'gradient'; min: number; max: number; colors?: string[] }
  trigger?: { op: '>=' | '<=' | 'abs>='; threshold: number; holdMs: number; cooldownMs: number; action: MotionAction }
  place?: { placeId: string; on: 'enter' | 'leave'; action: MotionAction }
}
type Place = { id: string; name: string; lat: number; lon: number; radius: number }   // 50..1000 m
type Calibration = { gravity: [number, number, number]; forward: [number, number, number]; at: string }
motion?: { rules: MotionRule[]; places: Place[]; calibration?: Calibration }
```
- 🟡 `input` is ignored for `kind: 'place'`.
- 🟡 Places are personal location data: stored only here, never traced or sent (NFR-03).

## Migration
- 🟡 `migrate`: keep `motion` only when `rules` and `places` are arrays; else drop it.
- 🟡 `forgetDevice(id)`: remove `id` and `id#*` from every rule's `targets`.
- 🟡 `removeScene(id)`: a rule pointing to it keeps running other actions; its scene action becomes a no-op with an editor warning.

## Not persisted
- 🟡 Live speed, G, fixes, trigger timers, pre-Start snapshot (memory only).
