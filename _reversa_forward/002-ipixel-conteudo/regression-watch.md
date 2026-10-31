# Regression watch — 002 ipixel-conteudo

| ID | Origin (file, section) | Expected rule after change | Check type | Violation signal |
|---|---|---|---|---|
| W001 | `_reversa_sdd/domain.md#Commanding` (BR-13) | Writes per device are serialized; **a content upload is one queue op that holds the device until every window is ACKed or it fails/cancels**. | redação | Re-extraction describes uploads as coalesced or interleaved with other writes. |
| W002 | `_reversa_sdd/domain.md#Commanding` (BR-14) | Coalescing applies to sliders only; **upload windows are never dropped or superseded**. | presença | Upload described through `pushLatest`, or windows dropped. |
| W003 | `_reversa_sdd/domain.md#State and persistence` (BR-30) | Look `panel.slot` is recorded **only after the panel ACKs `03` (done)**. | redação | Re-extraction says the look is set before or regardless of the upload result. |
| W004 | `_reversa_sdd/domain.md#State and persistence` (BR-38) | Storage failures never block a command; **IndexedDB quota errors show "Storage full" and do not stop sending**. | presença | Library error described as blocking uploads. |
| W005 | `_reversa_sdd/domain.md#Engineering policy` | Difftest emitter md5 `98622b8733585ad72d2b82a0aa7767e0` unchanged by this feature. | presença | md5 differs without a deliberate driver change. |

## Observations (no regression weight)

- 🟡 Window size 12288 for type `0x81`, chunk 244, text bit order LSB-first and the legacy/new text block choice are unverified on hardware.
- 🟡 GIPHY API and media hosts sent `access-control-allow-origin: *` on 2026-10-31.
- 🟡 Phase 1 helper `setOrientation` is now `patchPanel`; 001 docs still name the old helper.

## Re-extraction history

## Archived
