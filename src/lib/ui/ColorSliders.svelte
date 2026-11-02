<script lang="ts">
  import { t } from '../i18n.svelte.ts'

  // Range inputs fire on every drag step on every phone. The native colour dialog on
  // Android only reports when it closes, so the lights could not follow it live.
  let { value, oninput }: { value: string; oninput: (hex: string) => void } = $props()

  let h = $state(0)
  let l = $state(50)

  function toHsl(hex: string) {
    const n = parseInt(hex.slice(1), 16) || 0
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => x / 255)
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
    let hue = 0
    if (d) hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    return { h: Math.round((hue * 60 + 360) % 360), l: Math.round(((max + min) / 2) * 100) }
  }

  /** Full saturation: an LED has no grey, only dimmer — and brightness has its own slider. */
  function toHex(hue: number, light: number) {
    const L = light / 100
    const a = Math.min(L, 1 - L)
    const f = (k: number) => {
      const x = (k + hue / 30) % 12
      return Math.round((L - a * Math.max(-1, Math.min(x - 3, 9 - x, 1))) * 255)
    }
    return `#${[f(0), f(8), f(4)].map((x) => x.toString(16).padStart(2, '0')).join('')}`
  }

  // Follow outside changes (another row picked) without undoing our own drag: black and
  // white have no hue, so the slider keeps where it was.
  $effect(() => {
    if (value.toLowerCase() === toHex(h, l)) return
    const c = toHsl(value)
    if (c.l > 0 && c.l < 100) h = c.h
    l = c.l
  })

  function move() {
    oninput(toHex(h, l))
  }
</script>

<div class="col" style="gap:4px">
  <label class="field">
    <span>{t('color.hue')}</span>
    <input type="range" class="track hue" min="0" max="359" value={h}
           oninput={(e) => { h = +e.currentTarget.value; move() }} />
  </label>
  <label class="field">
    <span>{t('color.light')}</span>
    <input type="range" class="track" min="0" max="100" value={l}
           oninput={(e) => { l = +e.currentTarget.value; move() }}
           style:--mid={toHex(h, 50)} />
  </label>
</div>

<style>
  .track {
    appearance: none;
    height: 28px;
    border-radius: 14px;
    border: 1px solid var(--line);
    background: linear-gradient(90deg, #000, var(--mid), #fff);
  }
  .hue {
    background: linear-gradient(90deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);
  }
  .track::-webkit-slider-thumb {
    appearance: none;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: transparent;
    border: 3px solid #fff;
    box-shadow: 0 0 0 1px #000, 0 1px 4px rgb(0 0 0 / .5);
  }
  .track::-moz-range-thumb {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: transparent;
    border: 3px solid #fff;
    box-shadow: 0 0 0 1px #000;
  }
</style>
