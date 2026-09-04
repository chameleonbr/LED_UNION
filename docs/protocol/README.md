# Protocol specs

Wire protocols for every Bluetooth LED controller family this project speaks to,
derived from decompiling the original Android apps.

| file | families |
|---|---|
| [`ledble.md`](ledble.md) | LEDBLE, LEDDMX, LEDCAR, LEDSMART, LEDSUN, LEDLIKE, LEDPHO — service `FFE0` |
| [`elk-melk.md`](elk-melk.md) | ELK, XSL, CLK, MELK — service `FFF0`, characteristic `FFF3` |
| [`bledim.md`](bledim.md) | BLEDIM, LanQianTech — service `FFF0`, characteristic `FFF1` |
| [`variants.md`](variants.md) | cross-check against the `elkbledom` project |

Portuguese translations live in [`../protocol-pt-br/`](../protocol-pt-br/).

## Effect tables

The `.tsv` files are data rather than prose — the effect names come from the apps
themselves, already in English — so they live here only. `tools/gen-effects.py` reads
them to generate `src/lib/protocol/effects.ts`.

| file | entries | family |
|---|---|---|
| `melk_effects.tsv` | 241 | MELK (`id \t group \t name`) |
| `elk_effects.tsv` | 29 | ELK, ids `0x80..0x9C` |
| `ble_mode.tsv` | 23 | LEDBLE, ids 135..157 |
| `car_mode.tsv` | 23 | LEDCAR, ids 135..157 |
| `dmx_model.tsv` | 211 | LEDDMX, ids 1..255 (`255 = AUTO`) |
| `dmx03_model.tsv` | 211 | LEDDMX-03 |
| `like_mode.tsv` | 8 | LEDLIKE |
| `pho_mode.tsv` | 16 | LEDPHO |
| `rgb_order.tsv` | 12 | addressable strip channel order |
| `rgb_order_dmx02.tsv` | 6 | channel order, shifted layout |
| `select_mode.tsv` | 5 | channel type (W, BW, RGB, RGBW, RGBWCP) |
