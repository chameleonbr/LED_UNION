<script lang="ts">
  import {
    conns, inspect, sendRaw, parseHex,
    type ServiceInfo,
  } from '../ble.svelte.ts'

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
      note(`${services.length} serviço(s), ${n} característica(s)`)
      const dropped = conns[deviceId]?.lastLinkMs
      if (dropped !== undefined && dropped < 3000) {
        note(`aviso: aparelho derrubou o link em ${dropped}ms — cheira a handshake faltando`)
      }
      if (!charUuid && writable.length) charUuid = writable[0]
    } catch (e) {
      note(`ERRO: ${e instanceof Error ? e.message : String(e)}`)
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
      note(`enviado ${frame.length}B → ${charUuid || 'padrão'}`)
    } catch (e) {
      note(`ERRO: ${e instanceof Error ? e.message : String(e)}`)
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

  const presets: Array<[string, string]> = [
    ['apagar', '7E 04 04 00 00 00 FF 00 EF'],
    ['vermelho app', '7E 07 05 03 FF 00 00 10 EF'],
    ['vermelho hw', '7E 07 05 03 FF 00 00 0A EF'],
    ['vermelho 00', '7E 00 05 03 FF 00 00 00 EF'],
    ['brilho 100', '7E 04 01 64 FF FF FF 00 EF'],
    ['login MELK 1', '7E 07 83'],
    ['login MELK 2', '7E 04 04'],
    ['consultar', '7E 00 01 FA 00 00 00 00 EF'],
  ]

  /** Static red is unmistakable, so it identifies the effect frame at a glance. */
  const effectCandidates: Array<[string, string]> = [
    ['F · efeito app', '7E 05 03 80 03 FF FF 00 EF'],
    ['G · efeito hw', '7E 07 03 80 03 FF FF 00 EF'],
    ['H · efeito 00', '7E 00 03 80 03 00 00 00 EF'],
    ['I · efeito 06', '7E 05 03 80 06 FF FF 00 EF'],
  ]

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

  /** Fire every candidate with a gap, so the one that works is visible. */
  async function sweep(set = candidates, what = 'ligar') {
    if (!deviceId) return
    busy = true
    note(`--- varredura ${what}: olhe a fita e anote qual letra reagiu ---`)
    for (const [label, frame] of set) {
      try {
        await sendRaw(deviceId, parseHex(frame), charUuid || undefined)
        note(`${label}  →  ${frame}`)
      } catch (e) {
        note(`${label}  ERRO: ${e instanceof Error ? e.message : String(e)}`)
      }
      await wait(1500)
    }
    note('--- fim da varredura ---')
    busy = false
  }
</script>

<div class="col">
  <label class="field card">
    <span>Aparelho</span>
    <select bind:value={deviceId} class="sel">
      <option value="">Escolha…</option>
      {#each list as c (c.id)}
        <option value={c.id}>{c.name} — {c.state}</option>
      {/each}
    </select>
  </label>

  <button class="primary" onclick={run} disabled={!deviceId || busy}>
    Inspecionar GATT
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
        <div class="small muted">sem características legíveis</div>
      {/each}
    </div>
  {/each}

  {#if writable.length}
    <label class="field card">
      <span>Escrever em</span>
      <select bind:value={charUuid} class="sel">
        {#each writable as u}<option value={u}>{u}</option>{/each}
      </select>
    </label>
  {/if}

  <div class="card col">
    <label class="field">
      <span>Frame (hex)</span>
      <input type="text" bind:value={hex} style="font-family:ui-monospace,monospace" />
    </label>
    <button class="primary" onclick={send} disabled={!deviceId || busy}>Enviar</button>
    <button onclick={() => sweep()} disabled={!deviceId || busy}>
      Varrer ligar (5 × 1,5 s)
    </button>
    <button onclick={() => sweep(effectCandidates, 'efeito')} disabled={!deviceId || busy}>
      Varrer efeito → vermelho estático (4 × 1,5 s)
    </button>
    <div class="row wrap" style="gap:6px">
      {#each presets as [label, frame]}
        <button class="small" onclick={() => { hex = frame; send() }} disabled={!deviceId || busy}>
          {label}
        </button>
      {/each}
    </div>
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
  .sel {
    min-height: var(--tap);
    border-radius: var(--radius);
    background: var(--surface-2);
    border: 1px solid var(--line);
    padding: 0 10px;
  }
</style>
