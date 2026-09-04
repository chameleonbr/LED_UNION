<script lang="ts">
  import { store, addColor, removeColor, resetColors } from '../store.svelte.ts'
  import { t } from '../i18n.svelte.ts'

  let {
    value = $bindable<string | undefined>(undefined),
    onpick,
  }: {
    value?: string
    onpick?: (hex: string) => void
  } = $props()

  let creating = $state(false)
  let draftHex = $state('#ff8800')
  let draftName = $state('')

  // Seeded colours carry a key so their names can be translated; user-added ones keep
  // whatever the user typed.
  const nameOf = (c: { key?: string; name: string }) =>
    c.key ? t(`color.${c.key}`) : c.name

  const current = $derived(store.colors.find((c) => c.hex === value))

  function pick(hex: string) {
    value = hex
    onpick?.(hex)
  }

  function onSelect(e: Event) {
    const v = (e.currentTarget as HTMLSelectElement).value
    if (v === '__new__') {
      creating = true
      // Keep the select showing the current colour while the form is open.
      ;(e.currentTarget as HTMLSelectElement).value = value ?? ''
      return
    }
    pick(v)
  }

  function create() {
    const c = addColor(draftName, draftHex)
    creating = false
    draftName = ''
    pick(c.hex)
  }
</script>

<div class="col" style="gap:6px">
  <div class="row" style="gap:8px">
    <span class="swatch" style:background={value ?? 'transparent'}></span>
    <select class="sel grow" value={value ?? ''} onchange={onSelect}>
      {#if !current}
        <option value="" disabled>—</option>
      {/if}
      {#each store.colors as c (c.id)}
        <option value={c.hex}>{nameOf(c)}</option>
      {/each}
      <option value="__new__">{t('color.new')}</option>
    </select>

    {#if current}
      <button
        class="ghost danger small"
        title={t('common.remove')}
        onclick={() => {
          removeColor(current.id)
          value = store.colors[0]?.hex
        }}
      >✕</button>
    {/if}
  </div>

  {#if store.colors.length === 0}
    <button class="ghost small" onclick={resetColors}>{t('color.restore')}</button>
  {/if}

  {#if creating}
    <div class="card col" style="gap:8px">
      <input type="color" bind:value={draftHex} style="height:52px" />
      <input type="text" placeholder={t('color.name')} bind:value={draftName} />
      <div class="row">
        <button class="primary grow" onclick={create}>{t('common.save')}</button>
        <button class="grow" onclick={() => (creating = false)}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .swatch {
    width: 28px;
    height: 28px;
    flex: none;
    border-radius: 6px;
    border: 1px solid var(--line);
  }

  .sel {
    min-height: var(--tap);
    border-radius: var(--radius);
    background: var(--surface-2);
    border: 1px solid var(--line);
    padding: 0 10px;
  }
</style>
