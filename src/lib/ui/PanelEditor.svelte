<script lang="ts">
  import { applyTo, leaveStealth, upload, UploadError } from '../ble.svelte.ts'
  import { patchPanel, setLook, store } from '../store.svelte.ts'
  import { t } from '../i18n.svelte.ts'
  import { newTextFormat, textPayload, type ContentKind } from '../protocol/ipixel-content.ts'
  import {
    DEFAULT_FRAMES, MAX_BYTES, RenderError, encodeGif, encodePng, glyphFrame, hexRgb,
    rasterText, renderGif, renderImage, type Fit, type Frame,
  } from '../panel/render.ts'
  import { putItem, StorageFull, type PanelItem } from '../panel/library.ts'
  import { textPrefs } from '../panel/prefs.svelte.ts'

  let { item = $bindable(), deviceId, onclose, onsaved }: {
    item: PanelItem
    deviceId: string
    onclose: () => void
    onsaved: () => void
  } = $props()

  const panel = $derived(store.devices.find((d) => d.id === deviceId)?.panel)
  const w = $derived(panel?.width ?? 0)
  const h = $derived(panel?.height ?? 0)

  item.fit ??= { mode: 'cover', maxFrames: DEFAULT_FRAMES }
  // Re-sending an item goes back to its own slot; new content gets the next free one.
  // Only the starting value: the owner edits it from here.
  // svelte-ignore state_referenced_locally
  let slot = $state(item.slots[deviceId] ?? Math.min(100, (panel?.lastSlot ?? 0) + 1))
  let frames = $state<Frame[]>([])
  let error = $state('')
  let status = $state('')
  let progress = $state<{ sent: number; total: number }>()
  let abort: AbortController | undefined

  const glyphs = $derived(item.kind === 'text' && h ? rasterText(item.text!.value || ' ', h) : [])

  // Re-render whenever the source or a setting changes; a stale render must not win.
  let token = 0
  $effect(() => {
    const mine = ++token
    const { kind, source } = item
    const fit = item.fit!.mode as Fit
    const max = item.fit!.maxFrames
    const rgb = item.text ? hexRgb(item.text.color) : undefined
    error = ''
    if (!w || !h) return
    if (kind === 'text') {
      frames = [glyphFrame(glyphs, rgb!, w, h)]
      return
    }
    ;(kind === 'gif' ? renderGif(source!, w, h, fit, max) : renderImage(source!, w, h, fit))
      .then((f) => { if (mine === token) frames = f })
      .catch((e) => { if (mine === token) error = describe(e) })
  })

  // --- preview --------------------------------------------------------------------
  let canvas = $state<HTMLCanvasElement>()
  $effect(() => {
    if (!canvas || !frames.length) return
    const ctx = canvas.getContext('2d')!
    let i = 0
    let timer: ReturnType<typeof setTimeout>
    const show = () => {
      ctx.putImageData(frames[i].image, 0, 0)
      if (frames.length > 1) timer = setTimeout(show, Math.max(20, frames[i].delay))
      i = (i + 1) % frames.length
    }
    show()
    return () => clearTimeout(timer)
  })

  function describe(e: unknown) {
    if (e instanceof RenderError) return t(`content.${e.code}`)
    if (e instanceof StorageFull) return t('content.storageFull')
    return e instanceof Error ? e.message : String(e)
  }

  async function encode(): Promise<{ kind: ContentKind; bytes: Uint8Array }> {
    if (item.kind === 'text') {
      const tx = item.text!
      const bytes = textPayload(glyphs, {
        rgb: hexRgb(tx.color), effect: tx.effect, speed: tx.speed,
        newFormat: newTextFormat(panel?.mcu), msbFirst: textPrefs.msbFirst,
      })
      return { kind: 'text', bytes }
    }
    // A one-frame GIF is just a picture to the panel.
    if (frames.length > 1) return { kind: 'gif', bytes: encodeGif(frames) }
    return { kind: 'image', bytes: await encodePng(frames[0]) }
  }

  async function send() {
    if (progress || !frames.length) return
    if (!leaveStealth()) return
    error = ''
    status = ''
    const n = Math.min(100, Math.max(1, Math.round(slot) || 1))
    try {
      const { kind, bytes } = await encode()
      if (bytes.length > MAX_BYTES) {
        error = t('content.tooBig', { kb: Math.ceil(bytes.length / 1024) })
        return
      }
      // Kept even if the upload fails: the import is not lost to a bad first try.
      await save()
      abort = new AbortController()
      progress = { sent: 0, total: 1 }
      await upload(deviceId, kind, n, bytes, {
        signal: abort.signal,
        onProgress: (sent, total) => (progress = { sent, total }),
      })
      await applyTo([deviceId], (d, name) => d.showSlot?.(n, name), undefined, { force: true, source: `upload:${kind}` })
      setLook(deviceId, { panel: { kind: 'slot', slot: n } })
      patchPanel(deviceId, { lastSlot: n })
      status = t('content.sent', { n })
      await save(n)
    } catch (e) {
      error = e instanceof UploadError ? e.message : describe(e)
    } finally {
      progress = undefined
      abort = undefined
    }
  }

  async function close() {
    if (!progress && frames.length) await save()
    onclose()
  }

  async function save(n?: number) {
    if (!frames.length) return
    const thumb = frames[0] && new Blob([(await encodePng(frames[0])) as BlobPart], { type: 'image/png' })
    const next = { ...item, thumb, updatedAt: new Date().toISOString() }
    if (n) next.slots = { ...item.slots, [deviceId]: n }
    try {
      await putItem(next)
      item = next
      onsaved()
    } catch (e) {
      error = describe(e)
    }
  }
</script>

<div class="card col">
  <div class="row spread">
    <input type="text" class="grow" aria-label={t('content.name')} bind:value={item.name} />
    <button class="ghost small" onclick={close}>{t('content.close')}</button>
  </div>

  {#if !w}
    <div class="small" style="color:var(--warn)">{t('content.sizeFirst')}</div>
  {:else}
    <canvas bind:this={canvas} width={w} height={h} class="preview"
            style="aspect-ratio:{w}/{h}"></canvas>
    {#if item.kind === 'text'}<div class="small muted">{t('content.textPreviewNote')}</div>{/if}
  {/if}

  {#if item.kind === 'text'}
    <label class="field"><span>{t('content.text')}</span>
      <input type="text" bind:value={item.text!.value} />
    </label>
    <div class="row">
      <label class="field"><span>{t('content.color')}</span>
        <input type="color" bind:value={item.text!.color} />
      </label>
      <label class="field grow"><span>{t('content.effect')}</span>
        <select class="sel" bind:value={item.text!.effect}>
          {#each [0, 1, 2, 3, 4, 5, 6, 7, 8] as e}<option value={e}>{t(`content.effect.${e}`)}</option>{/each}
        </select>
      </label>
    </div>
    <label class="field"><span>{t('content.speed')} {item.text!.speed}</span>
      <input type="range" min="0" max="100" bind:value={item.text!.speed} />
    </label>
  {:else}
    <div class="row">
      <label class="field grow"><span>{t('content.fit')}</span>
        <select class="sel" bind:value={item.fit!.mode}>
          {#each ['cover', 'contain', 'stretch'] as m}<option value={m}>{t(`content.fit.${m}`)}</option>{/each}
        </select>
      </label>
      {#if item.kind === 'gif'}
        <label class="field"><span>{t('content.frames')}</span>
          <input type="number" min="1" max="300" bind:value={item.fit!.maxFrames} />
        </label>
      {/if}
    </div>
  {/if}

  <div class="row">
    <label class="field"><span>{t('panel.slot')}</span>
      <input type="number" min="1" max="100" bind:value={slot} />
    </label>
    {#if progress}
      <progress class="grow" value={progress.sent} max={progress.total}></progress>
      <button onclick={() => abort?.abort()}>{t('content.cancel')}</button>
    {:else}
      <button class="primary grow" disabled={!w || !frames.length} onclick={send}>
        {t('content.send', { n: Math.min(100, Math.max(1, Math.round(slot) || 1)) })}
      </button>
    {/if}
  </div>
  {#if progress}<div class="small muted">{t('content.sending', progress)}</div>{/if}
  {#if status}<div class="small" style="color:var(--ok)">{status}</div>{/if}
  {#if error}<div class="small" style="color:var(--err)">{error}</div>{/if}
</div>

<style>
  .preview {
    width: 100%;
    max-width: 320px;
    align-self: center;
    image-rendering: pixelated;
    background: #000;
    border-radius: 6px;
  }
</style>
