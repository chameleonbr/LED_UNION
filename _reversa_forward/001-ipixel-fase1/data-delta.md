# Data delta — 001 ipixel-fase1

> Diff over `_reversa_sdd/data-dictionary.md` and `src/lib/persist.ts`. Store key unchanged: `led-union/v1`.

## New fields (all optional)

| Entity | Field | Type | Meaning | Conf. |
|---|---|---|---|---|
| `SavedDevice` | `panel` | `{ type: number; width?: number; height?: number; locked?: boolean; orientation?: 0\|1\|2\|3 }` | Last device-info reply (type byte, size from table, password flag) and the orientation the user set. Hardware fact, saved regardless of write success (BR-36). | 🟡 |
| `Look` | `panel` | `{ kind: 'slot'; slot: number }` (1..100) | Panel action last sent; captured by scene snapshots. Phase 2 adds `item` / `playlist` kinds. | 🟡 |
| `Persisted` | `stealth` | `{ since: string; snapshot: Record<string, Look> }` | Present = stealth on. Snapshot of `looks` for endpoints online at tap time. | 🟡 |

| localStorage `led-union/trace` | entries | `TraceEntry[]` (max 2000) | Separate key, not part of `Persisted`; losing it never affects the app. | 🟡 |

`TraceEntry = { t: string; kind: 'write' | 'notify' | 'connect' | 'disconnect' | 'error'; id: string; name?: string; driver?: string; char?: string; hex?: string; source?: string; ok?: boolean; err?: string }`

## New types (not persisted)

| Type | Shape | Conf. |
|---|---|---|
| `PanelInfo` | `{ type: number; width?: number; height?: number; locked?: boolean }` | 🟡 |
| `DeviceReport` | `{ panel?: PanelInfo }` returned by `Driver.onNotify` | 🟡 |

## Removed fields

None. 🟢

## Migrations

None. 🟢 `persist.ts` merge must copy the three new optional fields through (check `load()` merge keeps unknown `SavedDevice` fields; it spreads saved objects today — verify in tests). Old builds reading a new store ignore the extra fields.

## Forget device (BR-35)

`forgetDevice` already removes looks and scene entries by key; `SavedDevice.panel` goes with the device. `stealth.snapshot` entries for that device must be removed too. 🟡
