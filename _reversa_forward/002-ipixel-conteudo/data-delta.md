# Data delta — 002 ipixel-conteudo

> Over `_reversa_sdd/data-dictionary.md` and feature 001 `data-delta.md`.

## localStorage `led-union/v1` (additive, optional)

| Entity | Field | Type | Note |
|---|---|---|---|
| `SavedDevice.panel` | `mcu?` | number | `major*100 + minor` from HW-info reply. |
| `SavedDevice.panel` | `lastSlot?` | number 1..100 | Last slot LED Union uploaded to; default for next send. |

| `Persisted` | `giphyKey?` | string | User's GIPHY API key; device only, never traced. |

`rekeyDevice` / `forgetDevice` already move / drop the whole `panel` object: no change.

## IndexedDB `led-union-items` v1 (new)

Store `items`, keyPath `id`.

```
PanelItem {
  id: string
  name: string
  kind: 'image' | 'gif' | 'text'
  source?: Blob                    // original file (image, gif)
  fit?: { mode: 'cover' | 'contain' | 'stretch'; maxFrames: number }
  text?: { value: string; color: string; effect: number; speed: number }
  thumb?: Blob                     // PNG at last panel size, for the grid
  giphyId?: string                // when imported from GIPHY search
  slots: Record<string, number>    // deviceId → slot last sent to
  updatedAt: string                // ISO
}
```

No rendered bytes are cached: rendering a 32×32 item is cheap and depends on panel size.

## Migrations

None. Old builds ignore the new fields and the IndexedDB db.

## Cache Storage `led-union-share` (new)

One transient entry written by the service worker on a share and deleted by the app after reading it.
