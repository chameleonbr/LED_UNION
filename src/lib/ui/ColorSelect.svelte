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
  /** What was lit before the picker opened, so Cancel puts it back. */
  let before = $state<string | undefined>(undefined)

  // Seeded colours carry a key so their names can be translated; user-added ones keep
  // whatever the user typed.
  const nameOf = (c: { key?: string; name: string }) =>
    c.key ? t(`color.${c.key}`) : c.name

  const current = $derived(store.colors.find((c) => c.hex === value))

  function pick(hex: string) {
    value = hex
    onpick?.(hex)
  }

  function open() {
    before = value
    draftHex = value ?? '#ff8800'
    creating = true
    // Show the starting colour immediately so the picker and the lights agree.
    pick(draftHex)
  }

  function cancel() {
    creating = false
    if (before) pick(before)
  }

  function create() {
    const c = addColor(draftName, draftHex)
    creating = false
    draftName = ''
    pick(c.hex)
  }
</script>

<div class="col" style="gap:8px">
  <div class="grid">
    {#each store.colors as c (c.id)}
      <button
        class="chip"
        class:on={c.hex === value}
        style:background={c.hex}
        title={nameOf(c)}
        aria-label={nameOf(c)}
        aria-pressed={c.hex === value}
        onclick={() => pick(c.hex)}
      ></button>
    {/each}
    <button class="chip add" title={t('color.new')} aria-label={t('color.new')} onclick={open}>
      +
    </button>
  </div>

  <div class="row small" style="gap:8px;min-height:24px">
    {#if current}
      <span class="grow">{nameOf(current)}</span>
      <button class="ghost danger small" title={t('common.remove')}
              onclick={() => { removeColor(current.id); value = store.colors[0]?.hex }}>
        ✕
      </button>
    {:else if value}
      <span class="grow muted">{value}</span>
    {/if}
    {#if store.colors.length === 0}
      <button class="ghost small" onclick={resetColors}>{t('color.restore')}</button>
    {/if}
  </div>

  {#if creating}
    <div class="card col" style="gap:8px">
      <!-- Live: every drag of the picker goes straight to the lights, so the colour
           being named is the colour actually on the wall. -->
      <input type="color" bind:value={draftHex} style="height:52px"
             oninput={() => pick(draftHex)} />
      <input type="text" placeholder={t('color.name')} bind:value={draftName} />
      <div class="row">
        <button class="primary grow" onclick={create}>{t('common.save')}</button>
        <button class="grow" onclick={cancel}>{t('common.cancel')}</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
    gap: 8px;
  }

  .chip {
    aspect-ratio: 1;
    min-height: 0;
    padding: 0;
    border-radius: 10px;
    border: 1px solid var(--line);
    box-shadow: none;
    cursor: pointer;
  }

  /* Two rings, so the mark reads on a light chip and on a dark one alike. */
  .chip.on {
    border-color: var(--text);
    box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--text);
  }

  .chip.add {
    background: var(--surface-2);
    color: var(--muted);
    border-style: dashed;
    font-size: 20px;
    line-height: 1;
  }
</style>
