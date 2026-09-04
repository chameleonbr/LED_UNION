<script lang="ts">
  import {
    conns, selection, addDevice, connect, disconnect, displayName,
  } from '../ble.svelte.ts'
  import {
    store, forgetDevice, addGroup, removeGroup, renameDevice,
    setOutputs, renameOutput, defaultOutputs,
  } from '../store.svelte.ts'
  import { epKey } from '../endpoint.ts'

  const outputsOf = (id: string) => store.devices.find((d) => d.id === id)?.outputs

  /** Every selectable entry: a plain device, or one row per configured output. */
  function keysOf(id: string): string[] {
    const outs = outputsOf(id)
    return outs?.length ? outs.map((o) => epKey(id, o.ch)) : [id]
  }

  let editing = $state('')
  let draft = $state('')

  function startRename(id: string, current: string) {
    editing = id
    draft = current
  }

  function commitRename() {
    if (!editing) return
    renameDevice(editing, draft)
    const c = conns[editing]
    if (c) c.label = draft.trim() || undefined
    editing = ''
  }

  let busy = $state(false)
  let error = $state('')
  let newGroupName = $state('')

  const list = $derived(Object.values(conns))

  function toggle(id: string) {
    const i = selection.ids.indexOf(id)
    if (i >= 0) selection.ids.splice(i, 1)
    else selection.ids.push(id)
  }

  const allKeys = $derived(list.flatMap((c) => keysOf(c.id)))
  const allSelected = $derived(
    allKeys.length > 0 && allKeys.every((k) => selection.ids.includes(k)),
  )

  function selectAll() {
    selection.ids = allSelected ? [] : allKeys
  }

  function selectGroup(keys: string[]) {
    selection.ids = keys.filter((k) => conns[k.split('#')[0]])
  }

  function toggleOutputs(id: string) {
    const has = outputsOf(id)?.length
    setOutputs(id, has ? undefined : defaultOutputs())
    selection.ids = selection.ids.filter((k) => !k.startsWith(id))
  }

  let editingOut = $state('')
  let outDraft = $state('')

  function commitOutRename(id: string, ch: number) {
    renameOutput(id, ch, outDraft)
    editingOut = ''
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
    {@const outs = outputsOf(c.id)}
    {@const selected = keysOf(c.id).some((k) => selection.ids.includes(k))}
    <div class="card row" style:border-color={selected ? 'var(--accent)' : undefined}>
      {#if !outs?.length}
        <input type="checkbox" checked={selection.ids.includes(c.id)}
               onchange={() => toggle(c.id)} />
      {/if}
      <span class="dot {c.state}"></span>
      <div class="grow col" style="gap:2px">
        {#if editing === c.id}
          <input
            type="text"
            bind:value={draft}
            placeholder="Ex: Carro · fita + maçaneta + soleira"
            onkeydown={(e) => e.key === 'Enter' && commitRename()}
            onblur={commitRename}
          />
        {:else}
          <button
            class="ghost rename"
            onclick={() => startRename(c.id, c.label ?? '')}
            title="Renomear"
          >
            {displayName(c)}
          </button>
          <div class="small muted truncate">
            {#if c.label}{c.name} · {/if}{c.driver.label}
            {#if c.error}· <span style="color:var(--err)">{c.error}</span>{/if}
          </div>
        {/if}
      </div>
      {#if c.state === 'online'}
        <button class="ghost small" onclick={() => disconnect(c.id)}>Desconectar</button>
      {:else}
        <button class="ghost small" onclick={() => connect(c.id)}>Conectar</button>
      {/if}
      <button class="ghost danger small" onclick={() => forgetDevice(c.id)}>✕</button>
    </div>

    {#if outs?.length}
      <div class="outputs">
        {#each outs as o (o.ch)}
          {@const key = epKey(c.id, o.ch)}
          <div class="card row" style:border-color={selection.ids.includes(key) ? 'var(--accent)' : undefined}>
            <input type="checkbox" checked={selection.ids.includes(key)}
                   onchange={() => toggle(key)} />
            {#if editingOut === key}
              <input type="text" bind:value={outDraft}
                     onkeydown={(e) => e.key === 'Enter' && commitOutRename(c.id, o.ch)}
                     onblur={() => commitOutRename(c.id, o.ch)} />
            {:else}
              <button class="ghost rename grow"
                      onclick={() => { editingOut = key; outDraft = o.label }}>
                {o.label}
              </button>
              <span class="small muted">ch {o.ch}</span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    {#if c.driver.hasChannels}
      <button class="ghost small outputs-toggle" onclick={() => toggleOutputs(c.id)}>
        {outs?.length ? 'Remover saídas' : 'Esta controladora tem saídas separadas'}
      </button>
    {/if}
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

<style>
  .outputs {
    margin-left: 22px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-left: 2px solid var(--line);
    padding-left: 10px;
  }

  .outputs-toggle {
    align-self: flex-start;
    margin-left: 22px;
  }

  .rename {
    min-height: 0;
    padding: 0;
    border: none;
    background: none;
    text-align: left;
    border-bottom: 1px dashed var(--line);
    align-self: flex-start;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
