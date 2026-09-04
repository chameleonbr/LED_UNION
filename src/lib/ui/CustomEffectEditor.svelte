<script lang="ts">
  import {
    store, addCustomEffect, updateCustomEffect, removeCustomEffect,
    type CustomEffect,
  } from '../store.svelte.ts'
  import { t } from '../i18n.svelte.ts'

  let { onclose, onsaved }: {
    onclose: () => void
    onsaved?: (fx: CustomEffect) => void
  } = $props()

  let editingId = $state<string | undefined>(undefined)
  let name = $state('')
  let colors = $state<string[]>(['#00ff00', '#000000', '#ffbb00'])
  let speed = $state(50)
  let fade = $state(false)

  function load(fx: CustomEffect) {
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
  }

  function submit() {
    const trimmed = name.trim()
    if (!trimmed || colors.length === 0) return
    const payload = { name: trimmed, colors: [...colors], speed, fade }
    if (editingId) {
      updateCustomEffect(editingId, payload)
      onsaved?.({ id: editingId, ...payload })
    } else {
      onsaved?.(addCustomEffect(payload))
    }
    reset()
    onclose()
  }
</script>

<div class="card col">
  <div class="row spread">
    <strong>{t('custom.title')}</strong>
    <button class="ghost small" onclick={onclose}>✕</button>
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
        <input type="color" bind:value={colors[i]} style="height:38px" />
        <button class="ghost small" onclick={() => move(i, -1)} disabled={i === 0}>↑</button>
        <button
          class="ghost small"
          onclick={() => move(i, 1)}
          disabled={i === colors.length - 1}
        >↓</button>
        <button
          class="ghost danger small"
          onclick={() => (colors = colors.filter((_, k) => k !== i))}
        >✕</button>
      </div>
    {/each}
    <!-- 14 is BLEDIM's MAX_COLOR_QTY; the other families take more, but a sequence
         that works everywhere is worth more than one that silently truncates. -->
    <button
      class="ghost small"
      onclick={() => (colors = [...colors, '#ffffff'])}
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

  <button class="primary" onclick={submit} disabled={!name.trim() || !colors.length}>
    {t('common.save')}
  </button>
</div>

<style>
  .chip {
    border: 1px solid var(--line);
    border-radius: var(--radius);
    gap: 0;
  }
</style>
