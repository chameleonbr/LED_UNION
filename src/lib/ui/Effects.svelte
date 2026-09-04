<script lang="ts">
  import { apply, selection, targets } from '../ble.svelte.ts'
  import type { Effect } from '../protocol/index.ts'

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
</script>

<div class="col">
  {#if none}
    <div class="card muted">Selecione ao menos um aparelho na aba <b>Aparelhos</b>.</div>
  {:else}
    <label class="field card">
      <span>Velocidade — {speed}%</span>
      <input type="range" min="0" max="100" bind:value={speed} oninput={sendSpeed} />
    </label>

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
