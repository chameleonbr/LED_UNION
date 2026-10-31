# Regression watch — 001 ipixel-fase1

| ID | Origin (file, section) | Expected rule after change | Check type | Violation signal |
|---|---|---|---|---|
| W001 | `_reversa_sdd/domain.md#Device identity and model knowledge` (BR-02) | Name is a hint; the GATT probe confirms the family **and the confirmed driver id is persisted and preferred on reload**. | redação | Re-extraction states the name alone decides the driver, or misses the persisted `driverId` preference. |
| W002 | `_reversa_sdd/domain.md#Commanding` (BR-12) | A command on an offline device reconnects it first, **unless stealth is on and the user declines to leave it**. | redação | Re-extraction describes reconnect-and-write without the stealth gate. |
| W003 | `_reversa_sdd/domain.md#State and persistence` (BR-30) | Looks record what was sent; **panel info is read back** from families that reply (iPixel). | redação | Re-extraction says no device ever replies, or treats looks as device state. |
| W004 | `_reversa_sdd/domain.md#State and persistence` (BR-33) | Scene apply order power → brightness → speed → colour → effect → **panel slot**. | presença | Panel slot missing from the order, or sent before power/brightness. |
| W005 | `_reversa_sdd/domain.md#State and persistence` (BR-35) | Forgetting a device also drops its **stealth snapshot** entries. | presença | Forget rule lists looks/labels/scenes but not the stealth snapshot. |
| W006 | `_reversa_sdd/domain.md#Device identity and model knowledge` (BR-04) | bledim before fff0; **ffe0 keeps `LED_BLE_xx` as name guess, ipixel last**. | presença | Driver order changed so an `LED_BLE_xx` FFE0 controller resolves to ipixel by name. |
| W007 | `_reversa_sdd/domain.md#Engineering policy` | Difftest emitter md5 `98622b8733585ad72d2b82a0aa7767e0` unchanged by this feature. | presença | md5 differs without a deliberate driver change. |

## Observations (no regression weight)

- 🟡 iPixel protocol details (window size, reply format, `fa03`) are unverified on hardware; see `docs/protocol/ipixel.md#Open questions`.
- 🟡 Stealth restore treats a look without `power` as "was on".

## Re-extraction history

_(empty — filled by `/reversa` on the next extraction)_

## Archived

_(empty)_
