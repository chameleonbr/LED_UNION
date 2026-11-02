<script lang="ts">
  import {
    store, addCustomEffect, updateCustomEffect, removeCustomEffect, lookOf, setLook,
    type CustomEffect,
  } from '../store.svelte.ts'
  import { t } from '../i18n.svelte.ts'
  import { applyTo, sendFrames } from '../ble.svelte.ts'
  import { applyLook } from '../look.ts'
  import ColorSliders from './ColorSliders.svelte'

  let { onclose, onsaved, previewKey }: {
    onclose: () => void
    onsaved?: (fx: CustomEffect) => void
    /** The light that opened the editor: every colour touched shows there at once. */
    previewKey?: string
  } = $props()

  let sel = $state(0)
  /** Something was sent, so closing without saving has a look to put back. */
  let touched = false

  function rgb(hex: string) {
    const n = parseInt(hex.slice(1), 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
  }

  function show(hex: string) {
    if (!previewKey) return
    touched = true
    const { r, g, b } = rgb(hex)
    void applyTo([previewKey], (d, n, c, v) => d.rgb(r, g, b, n, c, v), 'rgb')
  }

  function select(i: number) {
    sel = i
    show(colors[i])
  }

  function setColor(hex: string) {
    colors[sel] = hex
    show(hex)
  }

  /** Plays the sequence as it stands, saved or not. */
  async function play() {
    if (!previewKey || !colors.length) return false
    touched = true
    const sent = await sendFrames(previewKey, (d, n, c, v) =>
      d.customEffect?.({ colors: colors.map(rgb), fade }, n, c, v) ?? [])
    return sent && (await applyTo([previewKey], (d, n, c, v) => d.speed(speed, n, c, v)))
  }

  function close() {
    if (previewKey && touched) void applyLook(previewKey, lookOf(previewKey), undefined, false)
    reset()
    onclose()
  }

  let editingId = $state<string | undefined>(undefined)
  let name = $state('')
  let colors = $state<string[]>(['#00ff00', '#000000', '#ffbb00'])
  let speed = $state(50)
  let fade = $state(false)

  function load(fx: CustomEffect) {
    sel = 0
    editingId = fx.id
    name = fx.name
    colors = [...fx.colors]
    speed = fx.speed
    fade = fx.fade
  }

  function reset() {
    editingId = undefined
    name = ''
    colors = ['#00ff00', '#000000', '#ffbb00']
    speed = 50
    fade = false
  }

  function move(i: number, by: number) {
    const j = i + by
    if (j < 0 || j >= colors.length) return
    ;[colors[i], colors[j]] = [colors[j], colors[i]]
    if (sel === i) sel = j
  }

  function remove(i: number) {
    colors = colors.filter((_, k) => k !== i)
    sel = Math.min(sel, colors.length - 1)
  }

  async function submit() {
    const trimmed = name.trim()
    if (!trimmed || colors.length === 0) return
    const payload = { name: trimmed, colors: [...colors], speed, fade }
    let fx: CustomEffect
    if (editingId) {
      updateCustomEffect(editingId, payload)
      fx = { id: editingId, ...payload }
    } else {
      fx = addCustomEffect(payload)
    }
    onsaved?.(fx)
    // The light ends up playing what was just saved, and its card says so.
    if (previewKey && (await play())) setLook(previewKey, { customEffectId: fx.id, effect: undefined })
    reset()
    onclose()
  }
</script>

<div class="card col">
  <div class="row spread">
    <strong>{t('custom.title')}</strong>
    <button class="ghost small" onclick={close} aria-label={t('common.cancel')}>✕</button>
  </div>

  <p class="small muted" style="margin:0">{t('custom.hint')}</p>

  {#if store.customEffects.length}
    <div class="row wrap" style="gap:6px">
      {#each store.customEffects as fx (fx.id)}
        <span class="row chip">
          <button class="ghost small" onclick={() => load(fx)}>{fx.name}</button>
          <button class="ghost danger small" onclick={() => removeCustomEffect(fx.id)}>
            ✕
          </button>
        </span>
      {/each}
    </div>
  {/if}

  <input type="text" placeholder={t('custom.name')} bind:value={name} />

  <div class="col" style="gap:6px">
    {#each colors as c, i (i)}
      <div class="row" style="gap:6px">
        <span class="muted small" style="width:1.5em">{i + 1}</span>
        <button class="swatch grow" class:on={sel === i} style:background={c}
                aria-label={`${i + 1}: ${c}`} aria-pressed={sel === i} onclick={() => select(i)}></button>
        <button class="ghost small" onclick={() => move(i, -1)} disabled={i === 0}>↑</button>
        <button
          class="ghost small"
          onclick={() => move(i, 1)}
          disabled={i === colors.length - 1}
        >↓</button>
        <button class="ghost danger small" onclick={() => remove(i)}>✕</button>
      </div>
    {/each}
    {#if colors[sel]}
      <div class="card col edit" style="gap:8px">
        <ColorSliders value={colors[sel]} oninput={setColor} />
        <div class="swipe">
          {#each store.colors as p (p.id)}
            <button class="dot" style:background={p.hex} aria-label={p.name} onclick={() => setColor(p.hex)}></button>
          {/each}
          <button class="dot" style:background="#000" aria-label="#000000" onclick={() => setColor('#000000')}></button>
        </div>
      </div>
    {/if}
    <!-- 14 is BLEDIM's MAX_COLOR_QTY; the other families take more, but a sequence
         that works everywhere is worth more than one that silently truncates. -->
    <button
      class="ghost small"
      onclick={() => { colors = [...colors, '#ffffff']; select(colors.length - 1) }}
      disabled={colors.length >= 14}
    >{t('custom.addColor')}</button>
  </div>

  <label class="field">
    <span>{t('effects.speed')} — {speed}%</span>
    <input type="range" min="0" max="100" bind:value={speed} />
  </label>

  <div class="row">
    <button class="grow" class:primary={!fade} onclick={() => (fade = false)}>
      {t('custom.jump')}
    </button>
    <button class="grow" class:primary={fade} onclick={() => (fade = true)}>
      {t('custom.fade')}
    </button>
  </div>

  <div class="row">
    {#if previewKey}
      <button class="grow" onclick={play} disabled={!colors.length}>{t('custom.try')}</button>
    {/if}
    <button class="primary grow" onclick={submit} disabled={!name.trim() || !colors.length}>
      {t('common.save')}
    </button>
  </div>
</div>

<style>
  .swatch {
    min-height: 38px;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow: none;
  }
  .swatch.on { box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--accent); }
  .edit { border-color: var(--accent); }
  .dot {
    width: 32px;
    height: 32px;
    min-height: 0;
    padding: 0;
    border-radius: 50%;
    border: 1px solid var(--line);
    box-shadow: none;
  }
  .chip {
    border: 1px solid var(--line);
    border-radius: var(--radius);
    gap: 0;
  }
</style>
