<script lang="ts">
  import { onMount } from 'svelte'
  import { conns, displayName } from '../ble.svelte.ts'
  import { save, store } from '../store.svelte.ts'
  import { t } from '../i18n.svelte.ts'
  import { listItems, putItem, removeItem, type PanelItem } from '../panel/library.ts'
  import { DEFAULT_FRAMES } from '../panel/render.ts'
  import { search, GiphyError, PAGE, type GiphyHit } from '../panel/giphy.ts'
  import { uid } from '../store.svelte.ts'
  import PanelEditor from './PanelEditor.svelte'

  // Every known panel, online or not: an upload reconnects like any other command (BR-12).
  const panels = $derived(Object.values(conns).filter((c) => !!c.driver.showSlot))
  let deviceId = $state('')
  $effect(() => {
    if (!panels.some((p) => p.id === deviceId)) deviceId = panels[0]?.id ?? ''
  })

  let items = $state<PanelItem[]>([])
  let editing = $state<PanelItem>()
  let msg = $state('')
  let libraryOk = $state(true)

  async function reload() {
    try {
      items = await listItems()
    } catch {
      libraryOk = false
    }
  }

  // Thumbnails are Blobs; their URLs are released when the list changes.
  const thumbs = $derived(new Map(items.map((i) => [i.id, i.thumb && URL.createObjectURL(i.thumb)])))
  $effect(() => {
    const m = thumbs
    return () => m.forEach((u) => u && URL.revokeObjectURL(u))
  })

  const base = (kind: PanelItem['kind'], name: string): PanelItem => ({
    id: uid(), name, kind, slots: {}, updatedAt: new Date().toISOString(),
    fit: { mode: 'cover', maxFrames: DEFAULT_FRAMES },
  })

  // The file type is not always set (shared files, some servers), the bytes are.
  async function isGif(b: Blob) {
    const head = new Uint8Array(await b.slice(0, 4).arrayBuffer())
    return String.fromCharCode(...head) === 'GIF8'
  }

  async function open(blob: Blob, name: string, extra: Partial<PanelItem> = {}) {
    msg = ''
    editing = { ...base((await isGif(blob)) ? 'gif' : 'image', name), source: blob, ...extra }
  }

  let fileInput = $state<HTMLInputElement>()
  async function pickFile(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0]
    if (f) await open(f, f.name.replace(/\.[^.]+$/, ''))
    ;(e.currentTarget as HTMLInputElement).value = ''
  }

  async function fromUrl(url: string, extra?: Partial<PanelItem>) {
    msg = ''
    try {
      const res = await fetch(url, { mode: 'cors' })
      if (!res.ok) throw new Error(String(res.status))
      const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'image').replace(/\.[^.]+$/, '')
      await open(await res.blob(), name, extra)
    } catch {
      msg = t('content.cors')
    }
  }

  function importUrl() {
    const url = prompt(t('content.urlPrompt'))?.trim()
    if (url) fromUrl(url)
  }

  function newText() {
    msg = ''
    editing = { ...base('text', t('content.newText')), text: { value: 'Nº 123', color: '#ff2200', effect: 1, speed: 80 } }
  }

  async function duplicate(i: PanelItem) {
    await putItem({ ...i, id: uid(), name: `${i.name} 2`, slots: {}, updatedAt: new Date().toISOString() })
    await reload()
  }

  async function remove(i: PanelItem) {
    if (!confirm(t('content.deleteConfirm', { name: i.name }))) return
    await removeItem(i.id)
    await reload()
  }

  // --- GIPHY ------------------------------------------------------------------------
  let keyDraft = $state('')
  let query = $state('')
  let hits = $state<GiphyHit[]>([])
  let searched = $state(false)
  let giphyMsg = $state('')
  let busy = $state(false)

  function saveKey() {
    store.giphyKey = keyDraft.trim() || undefined
    keyDraft = ''
    save()
  }
  function removeKey() {
    store.giphyKey = undefined
    save()
  }

  async function runSearch(more = false) {
    if (!store.giphyKey || !query.trim() || busy) return
    busy = true
    giphyMsg = ''
    try {
      const page = await search(store.giphyKey, query.trim(), more ? hits.length : 0)
      hits = more ? [...hits, ...page] : page
      searched = true
    } catch (e) {
      giphyMsg = e instanceof GiphyError ? t(`giphy.${e.code}`) : String(e)
    } finally {
      busy = false
    }
  }

  // --- share target ------------------------------------------------------------------
  // public/share-target.js leaves what was shared in this cache and opens ?share=1.
  async function takeShared() {
    if (!new URLSearchParams(location.search).has('share') || typeof caches === 'undefined') return
    history.replaceState(null, '', location.pathname)
    const cache = await caches.open('led-union-share')
    const res = await cache.match('shared')
    await cache.delete('shared')
    if (!res) return
    // share-target.js names files and only files; their MIME type can be empty.
    if (res.headers.has('x-name')) {
      const name = decodeURIComponent(res.headers.get('x-name') ?? 'shared').replace(/\.[^.]+$/, '')
      await open(await res.blob(), name)
      return
    }
    const url = (await res.text()).match(/https?:\/\/\S+/)?.[0]
    if (url) await fromUrl(url)
    else msg = t('content.nothingShared')
  }

  onMount(() => {
    reload()
    takeShared()
  })
</script>

<div class="col">
  {#if !libraryOk}<div class="card small" style="color:var(--warn)">{t('content.storageOff')}</div>{/if}

  {#if panels.length === 0}
    <div class="card muted">{t('content.noPanel')}</div>
  {:else if panels.length > 1}
    <label class="field card"><span>{t('content.device')}</span>
      <select class="sel" bind:value={deviceId}>
        {#each panels as p (p.id)}<option value={p.id}>{displayName(p)}</option>{/each}
      </select>
    </label>
  {/if}

  {#if editing && deviceId}
    <!-- A fresh editor per item: its slot, status and error belong to that item. -->
    {#key editing.id}
      <PanelEditor bind:item={editing} {deviceId} onclose={() => (editing = undefined)} onsaved={reload} />
    {/key}
  {/if}

  {#if msg}<div class="card small" style="color:var(--err)">{msg}</div>{/if}

  <div class="row wrap">
    <button class="primary" onclick={() => fileInput?.click()}>{t('content.importFile')}</button>
    <button onclick={importUrl}>{t('content.importUrl')}</button>
    <button onclick={newText}>{t('content.newText')}</button>
    <input bind:this={fileInput} type="file" accept="image/*" hidden onchange={pickFile} />
  </div>

  {#if items.length === 0}
    <div class="card muted">{t('content.empty')}</div>
  {:else}
    <div class="grid">
      {#each items as i (i.id)}
        <div class="card col tile">
          <button class="ghost thumb" onclick={() => { msg = ''; editing = { ...i } }} title={t('content.edit')}>
            {#if thumbs.get(i.id)}<img src={thumbs.get(i.id)} alt="" />{:else}<span class="muted">{i.kind}</span>{/if}
          </button>
          <div class="small truncate">{i.name}</div>
          {#if i.slots[deviceId]}<div class="small muted">{t('panel.slot')} {i.slots[deviceId]}</div>{/if}
          <div class="row">
            <button class="ghost small" onclick={() => duplicate(i)}>{t('content.duplicate')}</button>
            <button class="ghost danger small" onclick={() => remove(i)} title={t('content.delete')}>✕</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <div class="card col">
    <strong>{t('giphy.title')}</strong>
    {#if store.giphyKey}
      <form class="row" onsubmit={(e) => { e.preventDefault(); runSearch() }}>
        <input type="text" class="grow" bind:value={query} aria-label={t('giphy.search')} />
        <button class="primary" disabled={busy}>{t('giphy.search')}</button>
      </form>
      {#if giphyMsg}<div class="small" style="color:var(--err)">{giphyMsg}</div>{/if}
      {#if searched && hits.length === 0}<div class="small muted">{t('giphy.none')}</div>{/if}
      {#if hits.length}
        <div class="grid">
          {#each hits as hit (hit.id)}
            <button class="ghost thumb" title={hit.title}
                    onclick={() => fromUrl(hit.gif, { name: hit.title, giphyId: hit.id })}>
              <img src={hit.thumb} alt={hit.title} loading="lazy" />
            </button>
          {/each}
        </div>
        {#if hits.length % PAGE === 0}
          <button disabled={busy} onclick={() => runSearch(true)}>{t('giphy.more')}</button>
        {/if}
      {/if}
      <div class="row spread small">
        <span class="muted">{t('giphy.powered')}</span>
        <button class="ghost small" onclick={removeKey}>{t('giphy.removeKey')}</button>
      </div>
    {:else}
      <div class="small muted">{t('giphy.needKey')}</div>
      <label class="field"><span>{t('giphy.key')}</span>
        <input type="text" bind:value={keyDraft} autocomplete="off" />
      </label>
      <div class="small muted">
        <a href="https://developers.giphy.com/dashboard/" target="_blank" rel="noopener">{t('giphy.keyHelp')}</a>
      </div>
      <button disabled={!keyDraft.trim()} onclick={saveKey}>{t('giphy.saveKey')}</button>
    {/if}
  </div>
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: 8px;
  }
  .tile { padding: 8px; gap: 4px; }
  .thumb {
    padding: 0;
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    overflow: hidden;
    background: #000;
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  /* Library thumbs are panel-size renders; GIPHY previews are ordinary images. */
  .tile .thumb img { image-rendering: pixelated; }
</style>
