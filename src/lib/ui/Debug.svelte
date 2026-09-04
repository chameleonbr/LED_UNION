<script lang="ts">
  import {
    conns, connect, inspect, sendRaw, parseHex,
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
      await connect(deviceId)
      services = await inspect(deviceId)
      const n = services.reduce((a, s) => a + s.chars.length, 0)
      note(`${services.length} serviço(s), ${n} característica(s)`)
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

  // First column is the 7E family used by ELK/MELK; second is the public BLEDOM
  // variant with byte 1 = 0x00. Whichever makes the strip react tells us the family.
  const presets: Array<[string, string]> = [
    ['ligar', '7E 04 04 01 00 01 FF 00 EF'],
    ['apagar', '7E 04 04 00 00 00 FF 00 EF'],
    ['vermelho', '7E 07 05 03 FF 00 00 10 EF'],
    ['verde', '7E 07 05 03 00 FF 00 10 EF'],
    ['brilho 100', '7E 04 01 64 FF FF FF 00 EF'],
    ['BLEDOM ligar', '7E 00 04 01 00 00 00 00 EF'],
    ['BLEDOM vermelho', '7E 00 05 03 FF 00 00 00 EF'],
    ['BLEDOM apagar', '7E 00 04 00 00 00 00 00 EF'],
  ]
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
