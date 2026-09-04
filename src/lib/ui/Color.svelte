<script lang="ts">
  import { apply, selection, targets } from '../ble.svelte.ts'

  let color = $state('#ff8800')
  let brightness = $state(100)
  let white = $state(0)
  let warm = $state(50)

  // Show a control if any selected device supports it.
  const caps = $derived.by(() => {
    const on = targets()
    return {
      white: on.some((c) => c.driver.caps(c.name).white && c.driver.white),
      cct: on.some((c) => c.driver.caps(c.name).cct && c.driver.cct),
    }
  })

  const none = $derived(selection.ids.length === 0)

  function rgb(hex: string): [number, number, number] {
    const n = parseInt(hex.slice(1), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }

  const sendColor = () =>
    apply((d, name) => d.rgb(...rgb(color), name), 'rgb')

  const sendBrightness = () =>
    apply((d, name) => d.brightness(brightness, name), 'brightness')

  const sendWhite = () =>
    apply((d, name) => d.white?.(white, name), 'white')

  const sendCct = () =>
    apply((d, name) => d.cct?.(warm, 100 - warm, name), 'cct')

  const power = (on: boolean) => apply((d, name) => d.power(on, name))

  const presets = [
    '#ff0000', '#ff8800', '#ffdd00', '#00ff44',
    '#00ddff', '#0044ff', '#aa00ff', '#ffffff',
  ]

  function pick(hex: string) {
    color = hex
    sendColor()
  }
</script>

<div class="col">
  {#if none}
    <div class="card muted">Selecione ao menos um aparelho na aba <b>Aparelhos</b>.</div>
  {/if}

  <div class="row">
    <button class="primary grow" onclick={() => power(true)} disabled={none}>Ligar</button>
    <button class="grow" onclick={() => power(false)} disabled={none}>Desligar</button>
  </div>

  <div class="card col">
    <input type="color" bind:value={color} oninput={sendColor} disabled={none} />
    <div class="row wrap" style="gap:8px">
      {#each presets as p}
        <button
          aria-label={p}
          onclick={() => pick(p)}
          disabled={none}
          style="background:{p}; width:40px; min-height:40px; padding:0; border-color: var(--line)"
        ></button>
      {/each}
    </div>
  </div>

  <label class="field card">
    <span>Brilho — {brightness}%</span>
    <input type="range" min="0" max="100" bind:value={brightness}
           oninput={sendBrightness} disabled={none} />
  </label>

  {#if caps.white}
    <label class="field card">
      <span>Branco — {white}%</span>
      <input type="range" min="0" max="100" bind:value={white}
             oninput={sendWhite} disabled={none} />
    </label>
  {/if}

  {#if caps.cct}
    <label class="field card">
      <span>Temperatura — {warm}% quente / {100 - warm}% frio</span>
      <input type="range" min="0" max="100" bind:value={warm}
             oninput={sendCct} disabled={none} />
    </label>
  {/if}
</div>
