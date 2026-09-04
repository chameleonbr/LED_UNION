<script lang="ts">
  import { conns, selection, addDevice, connect, disconnect } from '../ble.svelte.ts'
  import { store, forgetDevice, addGroup, removeGroup } from '../store.svelte.ts'

  let busy = $state(false)
  let error = $state('')
  let newGroupName = $state('')

  const list = $derived(Object.values(conns))

  function toggle(id: string) {
    const i = selection.ids.indexOf(id)
    if (i >= 0) selection.ids.splice(i, 1)
    else selection.ids.push(id)
  }

  const allSelected = $derived(list.length > 0 && selection.ids.length === list.length)

  function selectAll() {
    selection.ids = allSelected ? [] : list.map((c) => c.id)
  }

  function selectGroup(deviceIds: string[]) {
    selection.ids = deviceIds.filter((id) => conns[id])
  }

  async function add() {
    busy = true
    error = ''
    try {
      await addDevice()
    } catch (e) {
      // A cancelled chooser is a normal outcome, not an error worth showing.
      const msg = e instanceof Error ? e.message : String(e)
      if (!/cancel|User cancelled/i.test(msg)) error = msg
    } finally {
      busy = false
    }
  }

  async function connectAll() {
    busy = true
    await Promise.allSettled(list.map((c) => connect(c.id)))
    busy = false
  }

  function saveGroup() {
    const name = newGroupName.trim()
    if (!name || selection.ids.length === 0) return
    addGroup(name, [...selection.ids])
    newGroupName = ''
  }
</script>

<div class="col">
  <div class="row wrap">
    <button class="primary" onclick={add} disabled={busy}>+ Adicionar aparelho</button>
    <button onclick={connectAll} disabled={busy || list.length === 0}>Conectar todos</button>
    <button class="ghost" onclick={selectAll} disabled={list.length === 0}>
      {allSelected ? 'Limpar seleção' : 'Selecionar todos'}
    </button>
  </div>

  {#if error}
    <div class="card" style="border-color: var(--err); color: var(--err)">{error}</div>
  {/if}

  {#if list.length === 0}
    <div class="card muted">
      Nenhum aparelho ainda. Ligue as fitas e toque em <b>Adicionar aparelho</b>.
    </div>
  {/if}

  {#each list as c (c.id)}
    {@const selected = selection.ids.includes(c.id)}
    <div class="card row" style:border-color={selected ? 'var(--accent)' : undefined}>
      <input type="checkbox" checked={selected} onchange={() => toggle(c.id)} />
      <span class="dot {c.state}"></span>
      <div class="grow col" style="gap:2px">
        <div class="truncate">{c.name}</div>
        <div class="small muted">
          {c.driver.label}
          {#if c.error}· <span style="color:var(--err)">{c.error}</span>{/if}
        </div>
      </div>
      {#if c.state === 'online'}
        <button class="ghost small" onclick={() => disconnect(c.id)}>Desconectar</button>
      {:else}
        <button class="ghost small" onclick={() => connect(c.id)}>Conectar</button>
      {/if}
      <button class="ghost danger small" onclick={() => forgetDevice(c.id)}>✕</button>
    </div>
  {/each}

  <h3 style="margin:14px 0 0">Grupos</h3>

  <div class="row">
    <input
      class="grow"
      type="text"
      placeholder="Nome do grupo"
      bind:value={newGroupName}
    />
    <button onclick={saveGroup} disabled={!newGroupName.trim() || selection.ids.length === 0}>
      Salvar seleção
    </button>
  </div>

  {#each store.groups as g (g.id)}
    <div class="card row">
      <div class="grow col" style="gap:2px">
        <div class="truncate">{g.name}</div>
        <div class="small muted">{g.deviceIds.length} aparelhos</div>
      </div>
      <button class="ghost small" onclick={() => selectGroup(g.deviceIds)}>Selecionar</button>
      <button class="ghost danger small" onclick={() => removeGroup(g.id)}>✕</button>
    </div>
  {/each}
</div>
