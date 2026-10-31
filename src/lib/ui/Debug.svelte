<script lang="ts">
  import {
    conns, inspect, sendRaw, parseHex, displayName, BadHexError, lastNotify,
    type ServiceInfo,
  } from '../ble.svelte.ts'
  import { t } from '../i18n.svelte.ts'
  import { store } from '../store.svelte.ts'
  import { traceLog, clearTrace, downloadTrace, type TraceEntry } from '../trace.ts'
  import { onMount } from 'svelte'

  let deviceId = $state('')
  let services = $state<ServiceInfo[]>([])
  let charUuid = $state('')
  let hex = $state('7E 04 04 01 00 01 FF 00 EF')
  let log = $state<string[]>([])
  let busy = $state(false)

  const list = $derived(Object.values(conns))
  const writable = $derived(
    services.flatMap((s) =>
      s.chars
        .filter((c) => c.props.includes('WRITE') || c.props.includes('WRITE_NR'))
        .map((c) => c.uuid),
    ),
  )

  // The log lives outside Svelte state so writes stay cheap; this view polls it.
  let recording = $state(traceLog.on)
  let recent = $state<TraceEntry[]>([])
  const refresh = () => (recent = traceLog.entries.slice(-100).reverse())
  onMount(() => {
    refresh()
    const timer = setInterval(refresh, 1000)
    return () => clearInterval(timer)
  })
  const nameOf = (id: string) => (conns[id] ? displayName(conns[id]) : id.slice(0, 6))

  function note(msg: string) {
    log = [`${new Date().toLocaleTimeString()}  ${msg}`, ...log].slice(0, 40)
  }

  async function run() {
    if (!deviceId) return
    busy = true
    services = []
    try {
      // Deliberately not connect() first: driver resolution is exactly what fails
      // on an unknown device, and we still want to see what it exposes.
      services = await inspect(deviceId)
      const n = services.reduce((a, s) => a + s.chars.length, 0)
      note(t('dbg.found', { s: services.length, c: n }))
      const dropped = conns[deviceId]?.lastLinkMs
      if (dropped !== undefined && dropped < 3000) {
        note(t('dbg.dropped', { ms: dropped }))
      }
      if (!charUuid && writable.length) charUuid = writable[0]
    } catch (e) {
      note(t('dbg.error', { msg: e instanceof Error ? e.message : String(e) }))
    } finally {
      busy = false
    }
  }

  async function send() {
    if (!deviceId) return
    busy = true
    try {
      const frame = parseHex(hex)
      await sendRaw(deviceId, frame, charUuid || undefined)
      note(t('dbg.sent', { n: frame.length, target: charUuid || t('dbg.default') }))
    } catch (e) {
      const msg = e instanceof BadHexError ? t('err.badHex') : e instanceof Error ? e.message : String(e)
      note(t('dbg.error', { msg }))
    } finally {
      busy = false
    }
  }

  /**
   * Candidate power-on frames from both sources: the decompiled apps and the
   * elkbledom project's hardware sniffing. Byte 1 and the padding differ between
   * firmwares, so for an unknown device the fastest identification is to fire each
   * one and watch which makes the strip react. See docs/protocol/variants.md.
   */
  const candidates: Array<[string, string]> = [
    ['A · ELK app', '7E 04 04 01 00 01 FF 00 EF'],
    ['B · ELK hw', '7E 04 04 F0 00 01 FF 00 EF'],
    ['C · byte1=00', '7E 00 04 01 00 00 00 00 EF'],
    ['D · byte1=FF', '7E FF 04 01 00 FF FF 00 EF'],
    ['E · ELK 07', '7E 07 04 01 00 01 FF 00 EF'],
  ]

  const presets = $derived<Array<[string, string]>>([
    [t('dbg.pOff'), '7E 04 04 00 00 00 FF 00 EF'],
    [t('dbg.pRedApp'), '7E 07 05 03 FF 00 00 10 EF'],
    [t('dbg.pRedHw'), '7E 07 05 03 FF 00 00 0A EF'],
    [t('dbg.pRed00'), '7E 00 05 03 FF 00 00 00 EF'],
    [t('dbg.pBright'), '7E 04 01 64 FF FF FF 00 EF'],
    ['login MELK 1', '7E 07 83'],
    ['login MELK 2', '7E 04 04'],
    [t('dbg.pQuery'), '7E 00 01 FA 00 00 00 00 EF'],
  ])

  /**
   * LEDBLE-02 puts the output selector in byte 7: 0 = all, 1 = LED1, 2 = LED2.
   * If only part of the wiring reacts, the controller really is multi-output.
   */
  const channelCandidates = $derived<Array<[string, string]>>([
    [t('dbg.ch0'), '7E FF 05 03 FF 00 00 00 EF'],
    [t('dbg.ch1'), '7E FF 05 03 00 FF 00 01 EF'],
    [t('dbg.ch2'), '7E FF 05 03 00 00 FF 02 EF'],
    [t('dbg.ch3'), '7E FF 05 03 FF FF FF 03 EF'],
  ])

  /** Static red is unmistakable, so it identifies the effect frame at a glance. */
  const effectCandidates = $derived<Array<[string, string]>>([
    [t('dbg.fxApp'), '7E 05 03 80 03 FF FF 00 EF'],
    [t('dbg.fxHw'), '7E 07 03 80 03 FF FF 00 EF'],
    [t('dbg.fx00'), '7E 00 03 80 03 00 00 00 EF'],
    [t('dbg.fx06'), '7E 05 03 80 06 FF FF 00 EF'],
  ])

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

  /** Fire every candidate with a gap, so the one that works is visible. */
  async function sweep(set = candidates, what = t('dbg.whatPower')) {
    if (!deviceId) return
    busy = true
    note(t('dbg.sweepStart', { what }))
    for (const [label, frame] of set) {
      try {
        await sendRaw(deviceId, parseHex(frame), charUuid || undefined)
        note(`${label}  →  ${frame}`)
      } catch (e) {
        note(`${label}  ${t('dbg.error', { msg: e instanceof Error ? e.message : String(e) })}`)
      }
      await wait(1500)
    }
    note(t('dbg.sweepEnd'))
    busy = false
  }
</script>

<div class="col">
  <label class="field card">
    <span>{t('dbg.device')}</span>
    <select bind:value={deviceId} class="sel">
      <option value="">{t('dbg.choose')}</option>
      {#each list as c (c.id)}
        <option value={c.id}>{displayName(c)} — {c.state}</option>
      {/each}
    </select>
  </label>

  <button class="primary" onclick={run} disabled={!deviceId || busy}>
    {t('dbg.inspect')}
  </button>

  {#each services as s (s.uuid)}
    <div class="card col" style="gap:6px">
      <div class="small" style="font-family:ui-monospace,monospace">{s.uuid}</div>
      {#each s.chars as c (c.uuid)}
        <div class="row small" style="font-family:ui-monospace,monospace">
          <span class="grow truncate">{c.uuid}</span>
          <span class="muted">{c.props.join(' ') || '—'}</span>
        </div>
      {:else}
        <div class="small muted">{t('dbg.noChars')}</div>
      {/each}
    </div>
  {/each}

  {#if writable.length}
    <label class="field card">
      <span>{t('dbg.writeTo')}</span>
      <select bind:value={charUuid} class="sel">
        {#each writable as u}<option value={u}>{u}</option>{/each}
      </select>
    </label>
  {/if}

  <div class="card col">
    <label class="field">
      <span>{t('dbg.frame')}</span>
      <input type="text" bind:value={hex} style="font-family:ui-monospace,monospace" />
    </label>
    <button class="primary" onclick={send} disabled={!deviceId || busy}>{t('dbg.send')}</button>
    <button onclick={() => sweep()} disabled={!deviceId || busy}>
      {t('dbg.sweepPower')}
    </button>
    <button onclick={() => sweep(effectCandidates, t('dbg.whatEffect'))} disabled={!deviceId || busy}>
      {t('dbg.sweepEffect')}
    </button>
    <button onclick={() => sweep(channelCandidates, t('dbg.whatChannels'))} disabled={!deviceId || busy}>
      {t('dbg.sweepChannels')}
    </button>
    <div class="row wrap" style="gap:6px">
      {#each presets as [label, frame]}
        <button class="small" onclick={() => { hex = frame; send() }} disabled={!deviceId || busy}>
          {label}
        </button>
      {/each}
    </div>
  </div>

  <div class="card col" style="gap:6px">
    <div class="row spread">
      <b>{t('trace.title')} ({traceLog.entries.length})</b>
      <label class="row small" style="gap:4px">
        <input type="checkbox" bind:checked={recording}
               onchange={() => (traceLog.on = recording)} />
        {t('trace.record')}
      </label>
    </div>
    <div class="row">
      <button class="primary small grow" onclick={() => downloadTrace(store.devices)}>
        {t('trace.download')}
      </button>
      <button class="small grow" onclick={() => { clearTrace(); refresh() }}>
        {t('trace.clear')}
      </button>
    </div>
    {#each Object.entries(lastNotify) as [id, h] (id)}
      <div class="small mono">⇠ {nameOf(id)}: {h}</div>
    {/each}
    {#if recent.length === 0}
      <div class="small muted">{t('trace.empty')}</div>
    {/if}
    {#each recent as e, i (i)}
      <div class="small mono" class:err={e.ok === false || e.kind === 'error'}>
        {e.t.slice(11, 23)} {e.kind === 'write' ? '⇢' : e.kind === 'notify' ? '⇠' : '•'}
        {nameOf(e.id)} {e.source ?? ''} {e.hex ?? e.kind} {e.err ?? ''}
      </div>
    {/each}
  </div>

  {#if log.length}
    <div class="card col" style="gap:4px">
      {#each log as line}
        <div class="small muted" style="font-family:ui-monospace,monospace">{line}</div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .mono {
    font-family: ui-monospace, monospace;
    color: var(--muted);
    word-break: break-all;
  }

  .err {
    color: var(--err);
  }

  .sel {
    min-height: var(--tap);
    border-radius: var(--radius);
    background: var(--surface-2);
    border: 1px solid var(--line);
    padding: 0 10px;
  }
</style>
