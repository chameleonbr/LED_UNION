# ERD — LED UNION (localStorage document)

> Reversa Architect · 2026-10-24 · There is no database: a single JSON document `Persisted` lives in `localStorage['led-union/v1']`. The "relations" are string references, with **no referential integrity**; integrity is kept by hand in `forgetDevice` and `removeCustomEffect`.

```mermaid
erDiagram
  PERSISTED ||--o{ SAVED_DEVICE : devices
  PERSISTED ||--o{ GROUP : groups
  PERSISTED ||--o{ SCENE : scenes
  PERSISTED ||--o{ LOOK : "looks (by endpoint key)"
  PERSISTED ||--o{ LABEL : "labels (by endpoint key)"
  PERSISTED ||--o{ SAVED_COLOR : colors
  PERSISTED ||--o{ CUSTOM_EFFECT : customEffects

  SAVED_DEVICE {
    string id PK "BluetoothDevice.id"
    string name "advertised; drives the protocol"
    string label "optional"
    string driverId "bledim|fff0|ffe0"
    json strip "optional StripConfig {pixels, order}"
    int channelMode "optional, BLEDIM 1..4"
  }
  ENDPOINT {
    string key PK "deviceId or deviceId#index"
    string deviceId FK
    int index "into driver.outputs(name)"
  }
  SAVED_DEVICE ||--|{ ENDPOINT : "1 (single light) or N (outputs)"
  LOOK {
    string key PK,FK "endpoint key"
    bool power
    string colorHex
    int brightness
    int speed
    json effect "Effect {id, name, group}"
    string customEffectId FK "optional"
  }
  LABEL {
    string key PK,FK "endpoint key"
    string text
  }
  ENDPOINT ||--o| LOOK : has
  ENDPOINT ||--o| LABEL : "named by"
  GROUP {
    string id PK
    string name
    string_array deviceIds "actually endpoint keys (F2, G6)"
  }
  GROUP }o--o{ ENDPOINT : "members (N:M)"
  SCENE {
    string id PK
    string name
  }
  SCENE_ENTRY {
    string key FK "endpoint key"
    json look "snapshot copy"
  }
  SCENE ||--|{ SCENE_ENTRY : entries
  SCENE_ENTRY }o--|| ENDPOINT : targets
  CUSTOM_EFFECT {
    string id PK
    string name
    string_array colors "1..14 #rrggbb"
    int speed
    bool fade
  }
  LOOK }o--o| CUSTOM_EFFECT : "customEffectId"
  SCENE_ENTRY }o--o| CUSTOM_EFFECT : "look.customEffectId"
  SAVED_COLOR {
    string id PK
    string name
    string hex
    string key "seed key, optional"
  }
```

## Cardinalities and integrity
| Relation | Card. | Kept by | Gap |
|---|---|---|---|
| Device → Endpoint | 1 : 1..N | derived from `driver.outputs(name)`, not stored | 🟢 |
| Endpoint → Look / Label | 1 : 0..1 | `forgetDevice` deletes `id`, `id#*` | 🟢 |
| Group ↔ Endpoint | N : M | `forgetDevice` removes only the exact `id` | 🟢 F2: `id#i` keys are orphaned |
| Scene → Entry → Endpoint | 1 : N, N : 1 | `forgetDevice` prunes entries and empty scenes | 🟢 |
| Look → CustomEffect | N : 0..1 | `removeCustomEffect` clears the looks | 🟢 **Scene entries are not cleared**: a deleted custom effect stays in the scene snapshot and is skipped silently on apply |
| SavedColor | standalone | Looks store the hex, not the id | 🟢 Deleting a colour never breaks a look |

## Runtime (non-persisted)
| Entity | Key | Notes |
|---|---|---|
| Conn | device id | `$state`; state machine SM-1 |
| Live | device id | device, char, WriteQueue |
| Selection | – | endpoint keys |
| BledimDeviceState | **advertised name** | F3 |
