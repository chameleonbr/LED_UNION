<script lang="ts">
  import {
    conns, selection, addDevice, connect, connectOrRelink, disconnect, displayName, forget,
    linked, relink,
  } from '../ble.svelte.ts'
  import {
    store, addGroup, removeGroup, renameDevice, renameEndpoint, labelOf, lookOf,
  } from '../store.svelte.ts'
  import { epKey, parseEp } from '../endpoint.ts'
  import { t } from '../i18n.svelte.ts'

  // The model says how many lights a controller drives; nobody has to declare it.
  const outputsOf = (c: (typeof conns)[string]) => {
    const outs = c.driver.outputs?.(c.name) ?? []
    return outs.length < 2 ? [] : outs
  }

  /** Every selectable entry: a plain device, or one row per output the model has. */
  function keysOf(c: (typeof conns)[string]): string[] {
    const outs = outputsOf(c)
    return outs.length ? outs.map((_, i) => epKey(c.id, i)) : [c.id]
  }

  /** The colour last sent to the first lit one of these lights; unlit when off or unknown. */
  const railOf = (keys: string[]) =>
    keys.map(lookOf).find((l) => l.power !== false && l.colorHex)?.colorHex

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

  const allKeys = $derived(list.flatMap((c) => keysOf(c)))
  const allSelected = $derived(
    allKeys.length > 0 && allKeys.every((k) => selection.ids.includes(k)),
  )

  function selectAll() {
    selection.ids = allSelected ? [] : allKeys
  }

  function selectGroup(keys: string[]) {
    selection.ids = keys.filter((k) => conns[k.split('#')[0]])
  }

  let editingOut = $state('')
  let outDraft = $state('')

  function commitOutRename(key: string) {
    renameEndpoint(key, outDraft)
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

  // Devices this session has no handle to. Chrome allows one chooser per tap, so
  // Connect all re-pairs them one at a time and says how many are left.
  const missing = $derived(list.filter((c) => !linked(c.id)))

  async function connectAll() {
    busy = true
    error = ''
    // relink first, before any await: the chooser needs this tap's user activation.
    const next = missing[0] && relink(missing[0].id).catch((e) => {
      const msg = e instanceof Error ? e.message : String(e)
      if (!/cancel/i.test(msg)) error = msg
    })
    await Promise.allSettled([next, ...list.filter((c) => linked(c.id)).map((c) => connect(c.id))])
    busy = false
  }

  let help = $state(false)
  let copied = $state(false)
  const FLAG = 'chrome://flags/#enable-web-bluetooth-new-permissions-backend'

  async function copyFlag() {
    try {
      await navigator.clipboard.writeText(FLAG)
      copied = true
    } catch {
      // No clipboard permission: the address stays selectable in the field.
    }
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
    <button class="primary" onclick={add} disabled={busy}>{t('devices.add')}</button>
    <button onclick={connectAll} disabled={busy || list.length === 0}>
      {missing.length ? t('devices.connectNext', { n: missing.length }) : t('devices.connectAll')}
    </button>
    <button class="ghost" onclick={selectAll} disabled={list.length === 0}>
      {allSelected ? t('devices.clearSelection') : t('devices.selectAll')}
    </button>
    <button class="ghost" onclick={() => (help = !help)} aria-expanded={help}>{t('help.button')}</button>
  </div>

  {#if help}
    <div class="card col">
      <strong>{t('help.title')}</strong>
      <div class="small muted">{t('help.why')}</div>
      <ol class="small">
        <li>{t('help.step1')}</li>
        <li>{t('help.step2')}</li>
        <li>{t('help.step3')}</li>
      </ol>
      <div class="row">
        <input class="grow" type="text" readonly value={FLAG}
               onfocus={(e) => e.currentTarget.select()} />
        <button onclick={copyFlag}>{copied ? t('help.copied') : t('help.copy')}</button>
      </div>
      <div class="small muted">{t('help.after')}</div>
    </div>
  {/if}

  {#if error}
    <div class="card" style="border-color: var(--err); color: var(--err)">{error}</div>
  {/if}

  {#if list.length === 0}
    <div class="card muted">
      {t('devices.empty')}
    </div>
  {/if}

  {#each list as c (c.id)}
    {@const outs = outputsOf(c)}
    {@const selected = keysOf(c).some((k) => selection.ids.includes(k))}
    <div class="card row lit" style:border-color={selected ? 'var(--accent)' : undefined}
         style:--rail={railOf(outs.length ? keysOf(c) : [c.id])}>
      {#if !outs.length}
        <input type="checkbox" checked={selection.ids.includes(c.id)}
               onchange={() => toggle(c.id)} />
      {/if}
      <span class="dot {c.state}"></span>
      <div class="grow col" style="gap:2px">
        {#if editing === c.id}
          <input
            type="text"
            bind:value={draft}
            placeholder={t('devices.renameHint')}
            onkeydown={(e) => e.key === 'Enter' && commitRename()}
            onblur={commitRename}
          />
        {:else}
          <button
            class="ghost rename"
            onclick={() => startRename(c.id, c.label ?? '')}
            title={t('devices.renameHint')}
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
        <button class="ghost small" onclick={() => disconnect(c.id)}>{t('devices.disconnect')}</button>
      {:else}
        <button class="ghost small" onclick={() => connectOrRelink(c.id).catch((e) => {
          const msg = e instanceof Error ? e.message : String(e)
          if (!/cancel/i.test(msg)) error = msg
        })}>{t('devices.connect')}</button>
      {/if}
      <button class="ghost danger small" onclick={() => forget(c.id)}>✕</button>
    </div>

    {#if outs.length}
      <div class="outputs">
        {#each outs as o, i (i)}
          {@const key = epKey(c.id, i)}
          <div class="card row lit" style:border-color={selection.ids.includes(key) ? 'var(--accent)' : undefined}
               style:--rail={railOf([key])}>
            <input type="checkbox" checked={selection.ids.includes(key)}
                   onchange={() => toggle(key)} />
            {#if editingOut === key}
              <input type="text" bind:value={outDraft}
                     onkeydown={(e) => e.key === 'Enter' && commitOutRename(key)}
                     onblur={() => commitOutRename(key)} />
            {:else}
              <button class="ghost rename grow"
                      onclick={() => { editingOut = key; outDraft = labelOf(key, o.label) }}>
                {labelOf(key, o.label)}
              </button>
              <span class="small muted">{o.label}</span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {/each}

  <h3 style="margin:14px 0 0">{t('devices.groups')}</h3>

  <div class="row">
    <input
      class="grow"
      type="text"
      placeholder={t('devices.groupName')}
      bind:value={newGroupName}
    />
    <button onclick={saveGroup} disabled={!newGroupName.trim() || selection.ids.length === 0}>
      {t('devices.saveSelection')}
    </button>
  </div>

  {#each store.groups as g (g.id)}
    <div class="card row">
      <div class="grow col" style="gap:2px">
        <div class="truncate">{g.name}</div>
        <div class="small muted">{t('devices.count', { n: new Set(g.deviceIds.map((k) => parseEp(k).deviceId)).size })}</div>
      </div>
      <button class="ghost small" onclick={() => selectGroup(g.deviceIds)}>{t('devices.select')}</button>
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
