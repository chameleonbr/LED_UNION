<script lang="ts">
  import { apply, selection, targets, sendRaw } from '../ble.svelte.ts'
  import type { Effect } from '../protocol/index.ts'
  import {
    isAddressable, chipModels, rgbOrdersFor, spiConfigFrame, chipModelFrame,
    directionFrame,
  } from '../protocol/ffe0.ts'
  import { store, setStrip } from '../store.svelte.ts'

  let speed = $state(50)
  let query = $state('')
  let group = $state('')

  // Effect tables differ per driver; show the first selected device's set and
  // send by id, which is what every driver in a family expects anyway.
  const lead = $derived(targets()[0])
  const all = $derived<Effect[]>(lead ? lead.driver.effects(lead.name) : [])
  const groups = $derived([...new Set(all.map((e) => e.group).filter(Boolean))] as string[])

  const shown = $derived(
    all.filter(
      (e) =>
        (!group || e.group === group) &&
        (!query || e.name.toLowerCase().includes(query.toLowerCase())),
    ),
  )

  const none = $derived(selection.ids.length === 0)

  const send = (e: Effect) => apply((d, name) => d.effect(e, name))
  const sendSpeed = () => apply((d, name) => d.speed(speed, name), 'speed')

  // --- addressable strip wiring -------------------------------------------------
  // Effects only render correctly once the controller knows the strip's IC, pixel
  // count and channel order. Wrong values look like wrong colours or a half-lit
  // strip, not like an error, so this lives next to the effect list.
  const addressable = $derived(!!lead && isAddressable(lead.name))
  const saved = $derived(store.devices.find((d) => d.id === lead?.id)?.strip)

  let showStrip = $state(false)
  let chip = $state(1)
  let pixels = $state(60)
  let order = $state(1)
  let stripMsg = $state('')

  $effect(() => {
    if (saved) {
      chip = saved.chip
      pixels = saved.pixels
      order = saved.order
    }
  })

  const orders = $derived(lead ? rgbOrdersFor(lead.name) : [])

  async function applyStrip() {
    if (!lead) return
    stripMsg = ''
    try {
      const cfg = { chip, pixels, order }
      await sendRaw(lead.id, chipModelFrame(lead.name, chip))
      await sendRaw(lead.id, spiConfigFrame(lead.name, cfg))
      setStrip(lead.id, cfg)
      stripMsg = 'Enviado e salvo'
    } catch (e) {
      stripMsg = e instanceof Error ? e.message : String(e)
    }
  }

  async function setDirection(forward: boolean) {
    if (!lead) return
    try {
      await sendRaw(lead.id, directionFrame(lead.name, forward))
      stripMsg = forward ? 'Sentido: normal' : 'Sentido: invertido'
    } catch (e) {
      stripMsg = e instanceof Error ? e.message : String(e)
    }
  }
</script>

<div class="col">
  {#if none}
    <div class="card muted">Selecione ao menos um aparelho na aba <b>Aparelhos</b>.</div>
  {:else}
    <label class="field card">
      <span>Velocidade — {speed}%</span>
      <input type="range" min="0" max="100" bind:value={speed} oninput={sendSpeed} />
    </label>

    {#if addressable}
      <div class="card col">
        <button class="ghost row spread" onclick={() => (showStrip = !showStrip)}>
          <span>Fita endereçável — {pixels} px, {orders.find((o) => o.id === order)?.name ?? '?'}</span>
          <span class="muted">{showStrip ? '▲' : '▼'}</span>
        </button>

        {#if showStrip}
          <label class="field">
            <span>Pixels</span>
            <input type="text" inputmode="numeric" value={pixels}
                   oninput={(e) => (pixels = Math.max(1, Math.min(65535,
                     Number((e.currentTarget as HTMLInputElement).value) || 1)))} />
          </label>

          <label class="field">
            <span>Ordem dos canais</span>
            <select class="sel" bind:value={order}>
              {#each orders as o}<option value={o.id}>{o.name}</option>{/each}
            </select>
          </label>

          <label class="field">
            <span>Chip da fita</span>
            <select class="sel" bind:value={chip}>
              {#each chipModels as c}<option value={c.id}>{c.name}</option>{/each}
            </select>
          </label>

          <button class="primary" onclick={applyStrip}>Aplicar configuração</button>
          <div class="row">
            <button class="grow" onclick={() => setDirection(true)}>Sentido normal</button>
            <button class="grow" onclick={() => setDirection(false)}>Inverter</button>
          </div>
          {#if stripMsg}<div class="small muted">{stripMsg}</div>{/if}
        {/if}
      </div>
    {/if}

    <input type="text" placeholder="Buscar efeito…" bind:value={query} />

    {#if groups.length}
      <div class="row wrap" style="gap:8px">
        <button class="small" class:primary={group === ''} onclick={() => (group = '')}>
          Todos
        </button>
        {#each groups as g}
          <button class="small" class:primary={group === g} onclick={() => (group = g)}>
            {g}
          </button>
        {/each}
      </div>
    {/if}

    <div class="small muted">{shown.length} de {all.length} efeitos</div>

    <div class="col" style="gap:6px">
      {#each shown as e (e.group ?? '' + e.id)}
        <button class="card row spread" style="text-align:left" onclick={() => send(e)}>
          <span class="truncate">{e.name}</span>
          <span class="small muted">#{e.id}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .sel {
    min-height: var(--tap);
    border-radius: var(--radius);
    background: var(--surface-2);
    border: 1px solid var(--line);
    padding: 0 10px;
  }
</style>
