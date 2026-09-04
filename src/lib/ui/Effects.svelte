<script lang="ts">
  import { conns, applyTo, displayName } from '../ble.svelte.ts'
  import { epKey } from '../endpoint.ts'
  import { store, addScene, setLook } from '../store.svelte.ts'
  import { t } from '../i18n.svelte.ts'
  import DeviceCard from './DeviceCard.svelte'
  import ColorSelect from './ColorSelect.svelte'
  import CustomEffectEditor from './CustomEffectEditor.svelte'

  /** One controllable entry: a whole device, or one of its outputs. */
  type Logical = { key: string; conn: (typeof conns)[string]; ch?: number; label: string }

  const logicals = $derived<Logical[]>(
    Object.values(conns).flatMap((c) => {
      const outs = store.devices.find((d) => d.id === c.id)?.outputs
      if (!outs?.length) return [{ key: c.id, conn: c, label: displayName(c) }]
      return outs.map((o) => ({
        key: epKey(c.id, o.ch),
        conn: c,
        ch: o.ch,
        // The output's own name is what the user sees; the controller name is context
        // and lives in the card's footer.
        label: o.label,
      }))
    }),
  )

  let picked = $state<Record<string, boolean>>({})
  let sceneName = $state('')
  let editing = $state(false)

  const pickedKeys = $derived(logicals.filter((l) => picked[l.key]).map((l) => l.key))

  function saveScene() {
    const name = sceneName.trim()
    if (!name || pickedKeys.length === 0) return
    addScene(name, pickedKeys)
    sceneName = ''
    picked = {}
  }

  // --- the Everything card ------------------------------------------------------
  // Colour and brightness only. Effect ids are per family — 42 is one effect on
  // LEDDMX and a different one on MELK — so broadcasting one would be arbitrary.
  const allKeys = $derived(logicals.map((l) => l.key))

  function rgb(hex: string) {
    const n = parseInt(hex.slice(1), 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
  }

  async function allColor(hex: string) {
    const { r, g, b } = rgb(hex)
    await applyTo(allKeys, (d, n, c) => d.rgb(r, g, b, n, c), 'rgb')
    for (const k of allKeys) {
      setLook(k, { colorHex: hex, effect: undefined, customEffectId: undefined })
    }
  }

  async function allBrightness(v: number) {
    await applyTo(allKeys, (d, n, c) => d.brightness(v, n, c), 'brightness')
    for (const k of allKeys) setLook(k, { brightness: v })
  }

  async function allPower(on: boolean) {
    await applyTo(allKeys, (d, n, c) => d.power(on, n, c))
    for (const k of allKeys) setLook(k, { power: on })
  }

  let allBright = $state(100)
</script>

<div class="col">
  {#if logicals.length === 0}
    <div class="card muted">{t('effects.empty')}</div>
  {:else}
    {#each logicals as l (l.key)}
      <DeviceCard
        dkey={l.key}
        conn={l.conn}
        ch={l.ch}
        label={l.label}
        bind:checked={picked[l.key]}
        onEditCustom={() => (editing = true)}
      />
    {/each}

    {#if editing}
      <CustomEffectEditor onclose={() => (editing = false)} />
    {/if}

    <div class="card col" style="border-style:dashed">
      <strong>{t('effects.everything')}</strong>
      <div class="small muted">{t('effects.everythingHint')}</div>
      <div class="row">
        <button class="primary grow" onclick={() => allPower(true)}>{t('effects.on')}</button>
        <button class="grow" onclick={() => allPower(false)}>{t('effects.off')}</button>
      </div>
      <label class="field">
        <span>{t('effects.color')}</span>
        <ColorSelect onpick={allColor} />
      </label>
      <label class="field">
        <span>{t('effects.brightness')} — {allBright}%</span>
        <input type="range" min="0" max="100" bind:value={allBright}
               oninput={() => allBrightness(allBright)} />
      </label>
    </div>

    <div class="card col">
      <strong>{t('effects.saveScene')}</strong>
      <div class="small muted">{t('effects.pickToSave')}</div>
      <div class="row">
        <input class="grow" type="text" placeholder={t('effects.sceneName')}
               bind:value={sceneName} />
        <button class="primary" onclick={saveScene}
                disabled={!sceneName.trim() || pickedKeys.length === 0}>
          {t('common.save')} ({pickedKeys.length})
        </button>
      </div>
    </div>
  {/if}
</div>
