<script lang="ts">
  import { apply, selection, targets } from '../ble.svelte.ts'
  import { store, addScene, removeScene, type Scene } from '../store.svelte.ts'
  import type { Effect } from '../protocol/index.ts'

  let name = $state('')
  let color = $state('#ff8800')
  let brightness = $state(100)
  let speed = $state(50)
  let effect = $state<Effect | undefined>(undefined)
  let useColor = $state(true)
  let useBrightness = $state(true)
  let useSpeed = $state(false)

  const none = $derived(selection.ids.length === 0)
  const lead = $derived(targets()[0])
  const effects = $derived<Effect[]>(lead ? lead.driver.effects(lead.name) : [])

  function rgb(hex: string): [number, number, number] {
    const n = parseInt(hex.slice(1), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }

  function save() {
    const trimmed = name.trim()
    if (!trimmed) return
    addScene({
      name: trimmed,
      color: useColor ? color : undefined,
      brightness: useBrightness ? brightness : undefined,
      speed: useSpeed ? speed : undefined,
      effect,
    })
    name = ''
  }

  /**
   * Order matters: an effect overrides a static colour on these controllers, so
   * whichever the scene sets last is what the strip actually shows.
   */
  async function run(s: Scene) {
    await apply((d, n) => d.power(true, n))
    if (s.brightness !== undefined) await apply((d, n) => d.brightness(s.brightness!, n))
    if (s.speed !== undefined) await apply((d, n) => d.speed(s.speed!, n))
    if (s.color) await apply((d, n) => d.rgb(...rgb(s.color!), n))
    if (s.effect) await apply((d, n) => d.effect(s.effect!, n))
  }
</script>

<div class="col">
  {#if none}
    <div class="card muted">
      Selecione aparelhos na aba <b>Aparelhos</b> — as cenas se aplicam à seleção atual.
    </div>
  {/if}

  {#each store.scenes as s (s.id)}
    <div class="card row">
      <div class="grow col" style="gap:2px">
        <div class="truncate">{s.name}</div>
        <div class="small muted">
          {#if s.color}<span style="color:{s.color}">■</span> {s.color}{/if}
          {#if s.brightness !== undefined}· {s.brightness}%{/if}
          {#if s.speed !== undefined}· vel {s.speed}%{/if}
          {#if s.effect}· {s.effect.name}{/if}
        </div>
      </div>
      <button class="primary small" onclick={() => run(s)} disabled={none}>Aplicar</button>
      <button class="ghost danger small" onclick={() => removeScene(s.id)}>✕</button>
    </div>
  {/each}

  <h3 style="margin:14px 0 0">Nova cena</h3>

  <div class="card col">
    <input type="text" placeholder="Nome da cena" bind:value={name} />

    <label class="row"><input type="checkbox" bind:checked={useColor} /> Cor</label>
    {#if useColor}<input type="color" bind:value={color} style="height:60px" />{/if}

    <label class="row"><input type="checkbox" bind:checked={useBrightness} /> Brilho</label>
    {#if useBrightness}
      <label class="field">
        <span>{brightness}%</span>
        <input type="range" min="0" max="100" bind:value={brightness} />
      </label>
    {/if}

    <label class="row"><input type="checkbox" bind:checked={useSpeed} /> Velocidade</label>
    {#if useSpeed}
      <label class="field">
        <span>{speed}%</span>
        <input type="range" min="0" max="100" bind:value={speed} />
      </label>
    {/if}

    {#if effects.length}
      <label class="field">
        <span>Efeito (opcional)</span>
        <select
          style="min-height:var(--tap); border-radius:var(--radius); background:var(--surface-2); border:1px solid var(--line); padding:0 10px"
          onchange={(e) => {
            const i = (e.currentTarget as HTMLSelectElement).value
            effect = i === '' ? undefined : effects[Number(i)]
          }}
        >
          <option value="">Nenhum</option>
          {#each effects as e, i}
            <option value={i}>{e.group ? `${e.group} · ` : ''}{e.name}</option>
          {/each}
        </select>
      </label>
    {/if}

    <button class="primary" onclick={save} disabled={!name.trim()}>Salvar cena</button>
  </div>
</div>
