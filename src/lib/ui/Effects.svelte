<script lang="ts">
  import { conns, applyTo, displayName } from '../ble.svelte.ts'
  import type { Effect } from '../protocol/index.ts'
  import { epKey } from '../endpoint.ts'
  import { store, addScene, setLook, labelOf } from '../store.svelte.ts'
  import { t } from '../i18n.svelte.ts'
  import DeviceCard from './DeviceCard.svelte'
  import ColorSelect from './ColorSelect.svelte'
  import CustomEffectEditor from './CustomEffectEditor.svelte'

  /** One controllable entry: a whole device, or one of its outputs. */
  type Logical = {
    key: string
    conn: (typeof conns)[string]
    ch?: number
    /** Set when the output is a protocol variant rather than a channel number. */
    variant?: string
    label: string
  }

  const logicals = $derived<Logical[]>(
    Object.values(conns).flatMap((c) => {
      // How many lights a controller drives is a property of the model, so the driver
      // says. The vendor apps do the same — they never ask.
      const outs = c.driver.outputs?.(c.name) ?? []
      if (outs.length < 2) return [{ key: c.id, conn: c, label: displayName(c) }]
      return outs.map((o, i) => ({
        key: epKey(c.id, i),
        conn: c,
        ch: o.ch,
        variant: o.variant,
        label: labelOf(epKey(c.id, i), o.label),
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

  // --- the Everything card and one card per group ---------------------------------
  // Colour, brightness and power always. Effect ids are per family — 42 is one effect
  // on LEDDMX and a different one on MELK — so effects are offered only when every
  // member shares the same table.
  const allKeys = $derived(logicals.map((l) => l.key))

  type Target = { id: string; name: string; hint?: string; keys: string[]; effects: Effect[] }

  function sharedEffects(keys: string[]): Effect[] {
    const members = logicals.filter((l) => keys.includes(l.key))
    const tables = members.map((l) => l.conn.driver.effects(l.conn.name, l.variant))
    const sig = (fx: Effect[]) => JSON.stringify(fx.map((e) => [e.id, e.group]))
    const same =
      members.length > 0 &&
      members.every((l) => l.conn.driver.id === members[0].conn.driver.id) &&
      tables.every((fx) => sig(fx) === sig(tables[0]))
    return same ? tables[0] : []
  }

  // A group saved before a device gained outputs holds its bare id: it means all of them.
  const expand = (k: string) =>
    allKeys.includes(k) ? [k] : allKeys.filter((x) => x.startsWith(`${k}#`))

  const targets = $derived<Target[]>([
    ...store.groups
      .map((g) => ({ id: g.id, name: g.name, keys: [...new Set(g.deviceIds.flatMap(expand))] }))
      .filter((g) => g.keys.length > 0)
      .map((g) => ({ ...g, effects: sharedEffects(g.keys) })),
    {
      id: '',
      name: t('effects.everything'),
      hint: t('effects.everythingHint'),
      keys: allKeys,
      effects: [],
    },
  ])

  function rgb(hex: string) {
    const n = parseInt(hex.slice(1), 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
  }

  async function allColor(keys: string[], hex: string) {
    const { r, g, b } = rgb(hex)
    await applyTo(keys, (d, n, c, v) => d.rgb(r, g, b, n, c, v), 'rgb')
    for (const k of keys) {
      setLook(k, { colorHex: hex, white: undefined, cct: undefined, effect: undefined, customEffectId: undefined })
    }
  }

  async function allBrightness(keys: string[], v: number) {
    await applyTo(keys, (d, n, c, vr) => d.brightness(v, n, c, vr), 'brightness')
    for (const k of keys) setLook(k, { brightness: v })
  }

  async function allPower(keys: string[], on: boolean) {
    await applyTo(keys, (d, n, c, v) => d.power(on, n, c, v))
    for (const k of keys) setLook(k, { power: on })
  }

  async function allEffect(keys: string[], e: Effect) {
    await applyTo(keys, (d, n, c, v) => d.effect(e, n, c, v))
    for (const k of keys) setLook(k, { effect: e, customEffectId: undefined })
  }

  let bright = $state<Record<string, number>>({})
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
        variant={l.variant}
        label={l.label}
        checked={picked[l.key] ?? false}
        onToggle={(v) => (picked[l.key] = v)}
        onEditCustom={() => (editing = true)}
      />
    {/each}

    {#if editing}
      <CustomEffectEditor onclose={() => (editing = false)} />
    {/if}



    {#each targets as tg (tg.id)}
      <div class="card col" style="border-style:dashed">
        <strong>{tg.name}</strong>
        {#if tg.hint}<div class="small muted">{tg.hint}</div>{/if}
        <div class="row">
          <button class="primary grow" onclick={() => allPower(tg.keys, true)}>{t('effects.on')}</button>
          <button class="grow" onclick={() => allPower(tg.keys, false)}>{t('effects.off')}</button>
        </div>
        <label class="field">
          <span>{t('effects.color')}</span>
          <ColorSelect onpick={(hex) => allColor(tg.keys, hex)} />
        </label>
        <label class="field">
          <span>{t('effects.brightness')} — {bright[tg.id] ?? 100}%</span>
          <input type="range" min="0" max="100" value={bright[tg.id] ?? 100}
                 oninput={(e) => {
                   const v = +(e.currentTarget as HTMLInputElement).value
                   bright[tg.id] = v
                   allBrightness(tg.keys, v)
                 }} />
        </label>
        {#if tg.effects.length > 0}
          <label class="field">
            <span>{t('effects.effect')}</span>
            <select onchange={(e) => {
              const value = (e.currentTarget as HTMLSelectElement).value
              if (value === '') return
              const fx = tg.effects[+value]
              if (fx) allEffect(tg.keys, fx)
            }}>
              <option value="">—</option>
              {#each tg.effects as fx, i}<option value={i}>{fx.name}</option>{/each}
            </select>
          </label>
        {/if}
      </div>
    {/each}

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
