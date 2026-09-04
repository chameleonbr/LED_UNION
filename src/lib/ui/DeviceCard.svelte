<script lang="ts">
  import { applyTo, sendFrames, sendRaw, displayName, type Conn } from '../ble.svelte.ts'
  import { lookOf, setLook, store, setStrip, setChannelMode } from '../store.svelte.ts'
  import type { CustomEffect } from '../store.svelte.ts'
  import type { Effect } from '../protocol/index.ts'
  import {
    isAddressable, rgbOrdersFor, spiConfigFrame, directionFrame,
  } from '../protocol/ffe0.ts'
  import { switchChannelsFrame } from '../protocol/bledim.ts'
  import { t } from '../i18n.svelte.ts'
  import ColorSelect from './ColorSelect.svelte'

  let {
    dkey,
    conn,
    ch,
    variant,
    label,
    checked,
    onToggle,
    onEditCustom,
  }: {
    dkey: string
    conn: Conn
    ch?: number
    variant?: string
    label: string
    checked: boolean
    onToggle: (next: boolean) => void
    onEditCustom: () => void
  } = $props()

  let open = $state(false)

  const look = $derived(lookOf(dkey))
  const caps = $derived(conn.driver.caps(conn.name, variant))
  const builtIn = $derived<Effect[]>(conn.driver.effects(conn.name, variant))
  const supportsCustom = $derived(
    (conn.driver.customEffect?.({ colors: [{ r: 1, g: 1, b: 1 }], fade: false }, conn.name)
      ?.length ?? 0) > 0,
  )

  const groupNames = $derived([
    ...new Set(builtIn.map((e) => e.group).filter(Boolean)),
  ] as string[])

  const activeCustom = $derived(
    store.customEffects.find((f) => f.id === look.customEffectId),
  )
  const summary = $derived(
    activeCustom?.name ?? look.effect?.name ?? t('effects.none'),
  )

  function rgb(hex: string) {
    const n = parseInt(hex.slice(1), 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
  }

  // Every control writes the look after sending, so the card reflects the last command
  // even though the device never reports anything back.
  async function power(on: boolean) {
    await applyTo([dkey], (d, n, c) => d.power(on, n, c))
    setLook(dkey, { power: on })
  }

  async function pickColor(hex: string) {
    const { r, g, b } = rgb(hex)
    await applyTo([dkey], (d, n, c) => d.rgb(r, g, b, n, c), 'rgb')
    // A static colour replaces whatever effect was playing.
    setLook(dkey, { colorHex: hex, effect: undefined, customEffectId: undefined })
  }

  async function setBrightness(v: number) {
    await applyTo([dkey], (d, n, c) => d.brightness(v, n, c), 'brightness')
    setLook(dkey, { brightness: v })
  }

  async function setSpeed(v: number) {
    await applyTo([dkey], (d, n, c) => d.speed(v, n, c), 'speed')
    setLook(dkey, { speed: v })
  }

  /**
   * "White" is an intent, not a channel. On hardware with a real W wire it drives that
   * channel; on an RGB-only controller the same intent is r = g = b. Driving the W
   * channel there sends [W,0,0,0], which zeroes the colour and turns the strip off —
   * which is exactly what it did before this.
   */
  async function setWhite(v: number) {
    if (hasRealWhite) {
      await applyTo([dkey], (d, n) => d.white?.(v, n), 'white')
      return
    }
    const k = Math.round((v * 255) / 100)
    await applyTo([dkey], (d, n, c) => d.rgb(k, k, k, n, c), 'rgb')
    const hex = `#${[k, k, k].map((x) => x.toString(16).padStart(2, '0')).join('')}`
    setLook(dkey, { colorHex: hex, effect: undefined, customEffectId: undefined })
  }
  const setCct = (v: number) =>
    applyTo([dkey], (d, n) => d.cct?.(v, 100 - v, n), 'cct')

  async function chooseEffect(e: Event) {
    const v = (e.currentTarget as HTMLSelectElement).value
    if (v === '__new__') {
      onEditCustom()
      return
    }
    if (v === '') return
    const [kind, rest] = [v.slice(0, 1), v.slice(2)]
    if (kind === 'b') {
      const fx = builtIn[Number(rest)]
      if (!fx) return
      await applyTo([dkey], (d, n, c) => d.effect(fx, n, c))
      setLook(dkey, { effect: fx, customEffectId: undefined })
    } else {
      const fx = store.customEffects.find((x) => x.id === rest)
      if (!fx) return
      await runCustom(fx)
    }
  }

  async function runCustom(fx: CustomEffect) {
    // sendFrames uses the non-coalescing queue: dropping a colour mid-upload would
    // leave the controller with a truncated sequence.
    await sendFrames(dkey, (d, n, c) =>
      d.customEffect?.(
        { colors: fx.colors.map(rgb), fade: fx.fade },
        n,
        c,
      ) ?? [],
    )
    await applyTo([dkey], (d, n, c) => d.speed(fx.speed, n, c))
    setLook(dkey, { customEffectId: fx.id, effect: undefined })
  }

  // --- addressable strip ------------------------------------------------------------
  const addressable = $derived(isAddressable(conn.name, variant))
  const savedStrip = $derived(store.devices.find((d) => d.id === conn.id)?.strip)
  let showStrip = $state(false)
  let pixels = $state(60)
  let order = $state(1)
  let stripMsg = $state('')

  $effect(() => {
    if (savedStrip) {
      pixels = savedStrip.pixels
      order = savedStrip.order
    }
  })

  async function applyStrip() {
    stripMsg = ''
    try {
      const cfg = { pixels, order }
      await sendRaw(conn.id, spiConfigFrame(conn.name, cfg))
      setStrip(conn.id, cfg)
      stripMsg = t('strip.saved')
    } catch (e) {
      stripMsg = e instanceof Error ? e.message : String(e)
    }
  }

  const setDirection = (forward: boolean) =>
    sendRaw(conn.id, directionFrame(conn.name, forward)).catch(() => {})

  // --- BLEDIM channel mode -----------------------------------------------------------
  // 1 = dimming, 2 = CCT, 3 = RGB, 4 = RGBW. There is physically no white wire in RGB
  // mode, so offering a white slider there promises something the hardware cannot do.
  const isBledim = $derived(conn.driver.id === 'bledim')
  const channelMode = $derived(
    store.devices.find((d) => d.id === conn.id)?.channelMode ?? 3,
  )
  /** True only when the controller actually has a separate white wire. */
  const hasRealWhite = $derived(
    caps.white && !!conn.driver.white && (!isBledim || channelMode !== 3),
  )
  // Offered on RGB-only hardware too, where it means r = g = b.
  const showWhite = $derived(hasRealWhite || caps.rgb)

  let modeMsg = $state('')

  async function pickChannelMode(mode: number) {
    // Save first: this describes how the hardware is wired, which stays true whether or
    // not the frame reaches the device. Losing the choice because the strip was out of
    // range would be worse than a stale controller.
    setChannelMode(conn.id, mode)
    modeMsg = ''
    try {
      await sendRaw(conn.id, switchChannelsFrame(mode))
    } catch (e) {
      modeMsg = e instanceof Error ? e.message : String(e)
    }
  }

  const CHANNEL_MODES = [
    [1, '1CH · DIM'],
    [2, '2CH · CCT'],
    [3, '3CH · RGB'],
    [4, '4CH · RGBW'],
  ] as const

  // --- sound ------------------------------------------------------------------------
  const hasSound = $derived(!!conn.driver.soundMode || !!conn.driver.soundEnable)
  let showSound = $state(false)
  let source = $state<'mic' | 'music'>('mic')
  let sensitivity = $state(50)
  let soundModeId = $state(0)
</script>

<div class="card col" style:border-color={checked ? 'var(--accent)' : undefined}>
  <div class="row">
    <input
      type="checkbox"
      {checked}
      onchange={(e) => onToggle((e.currentTarget as HTMLInputElement).checked)}
    />
    <span class="dot {conn.state}"></span>
    <button class="ghost head grow" onclick={() => (open = !open)}>
      <span class="truncate">{label}</span>
      <span class="row small muted" style="gap:6px">
        {#if look.colorHex}
          <span class="swatch" style:background={look.colorHex}></span>
        {/if}
        <span class="truncate">{summary}</span>
        <span>{open ? '▲' : '▼'}</span>
      </span>
    </button>
  </div>

  {#if conn.error}
    <div class="small" style="color:var(--err)">{conn.error}</div>
  {/if}

  {#if open}
    <div class="row">
      <button class="primary grow" onclick={() => power(true)}>{t('effects.on')}</button>
      <button class="grow" onclick={() => power(false)}>{t('effects.off')}</button>
    </div>

    {#if isBledim}
      <label class="field">
        <span>{t('bledim.channels')}</span>
        <select class="sel" value={channelMode}
                onchange={(e) => pickChannelMode(+(e.currentTarget as HTMLSelectElement).value)}>
          {#each CHANNEL_MODES as [v, lbl]}<option value={v}>{lbl}</option>{/each}
        </select>
      </label>
      <div class="small muted">{t('bledim.channelsHint')}</div>
      {#if modeMsg}<div class="small" style="color:var(--err)">{modeMsg}</div>{/if}
    {/if}

    {#if caps.rgb}
      <label class="field">
        <span>{t('effects.color')}</span>
        <ColorSelect value={look.colorHex} onpick={pickColor} />
      </label>
    {/if}

    {#if caps.effects}
      <label class="field">
        <span>{t('effects.effect')}</span>
        <select
          class="sel"
          value={look.customEffectId
            ? `c:${look.customEffectId}`
            : look.effect
              ? `b:${builtIn.findIndex((e) => e.id === look.effect!.id && e.group === look.effect!.group)}`
              : ''}
          onchange={chooseEffect}
        >
          <option value="">{t('effects.none')}</option>

          {#if supportsCustom}
            {#if store.customEffects.length}
              <optgroup label={t('effects.myEffects')}>
                {#each store.customEffects as fx (fx.id)}
                  <option value={`c:${fx.id}`}>{fx.name}</option>
                {/each}
              </optgroup>
            {/if}
            <option value="__new__">{t('effects.newEffect')}</option>
          {/if}

          {#if groupNames.length}
            {#each groupNames as g}
              <optgroup label={g}>
                {#each builtIn as e, i}
                  {#if e.group === g}<option value={`b:${i}`}>{e.name}</option>{/if}
                {/each}
              </optgroup>
            {/each}
          {:else}
            <optgroup label={t('effects.builtIn')}>
              {#each builtIn as e, i}
                <option value={`b:${i}`}>{e.name}</option>
              {/each}
            </optgroup>
          {/if}
        </select>
      </label>

      {#if !supportsCustom}
        <div class="small muted">{t('custom.unsupported')}</div>
      {/if}
    {/if}

    <label class="field">
      <span>{t('effects.brightness')} — {look.brightness ?? 100}%</span>
      <input
        type="range" min="0" max="100" value={look.brightness ?? 100}
        oninput={(e) => setBrightness(+(e.currentTarget as HTMLInputElement).value)}
      />
    </label>

    {#if caps.speed}
      <label class="field">
        <span>{t('effects.speed')} — {look.speed ?? 50}%</span>
        <input
          type="range" min="0" max="100" value={look.speed ?? 50}
          oninput={(e) => setSpeed(+(e.currentTarget as HTMLInputElement).value)}
        />
      </label>
    {/if}

    {#if showWhite}
      <label class="field">
        <span>{t('effects.white')}{hasRealWhite ? '' : ` · ${t('effects.whiteRgb')}`}</span>
        <input type="range" min="0" max="100" value="0"
               oninput={(e) => setWhite(+(e.currentTarget as HTMLInputElement).value)} />
      </label>
    {/if}

    {#if caps.cct && conn.driver.cct}
      <label class="field">
        <span>{t('effects.cct')}</span>
        <input type="range" min="0" max="100" value="50"
               oninput={(e) => setCct(+(e.currentTarget as HTMLInputElement).value)} />
      </label>
    {/if}

    {#if hasSound}
      <button class="ghost row spread" onclick={() => (showSound = !showSound)}>
        <span>{t('sound.title')}</span><span class="muted">{showSound ? '▲' : '▼'}</span>
      </button>
      {#if showSound}
        {#if conn.driver.soundEnable}
          <div class="row">
            <button class="primary grow"
              onclick={() => applyTo([dkey], (d, n) => d.soundEnable?.(true, n))}>
              {t('sound.on')}
            </button>
            <button class="grow"
              onclick={() => applyTo([dkey], (d, n) => d.soundEnable?.(false, n))}>
              {t('sound.off')}
            </button>
          </div>
        {/if}
        {#if conn.driver.soundMode}
          <div class="row">
            {#each ['mic', 'music'] as const as src}
              <button class="grow" class:primary={source === src}
                onclick={() => {
                  source = src
                  applyTo([dkey], (d, n, c) => d.soundMode?.(soundModeId, n, src, c))
                }}>{t(`sound.${src}`)}</button>
            {/each}
          </div>
          <label class="field">
            <span>{t('sound.mode')} — {soundModeId}</span>
            <input type="range" min="0" max="15" bind:value={soundModeId}
              onchange={() =>
                applyTo([dkey], (d, n, c) => d.soundMode?.(soundModeId, n, source, c))} />
          </label>
        {/if}
        {#if conn.driver.soundSensitivity}
          <label class="field">
            <span>{t('sound.sensitivity')} — {sensitivity}%</span>
            <input type="range" min="0" max="100" bind:value={sensitivity}
              oninput={() =>
                applyTo([dkey], (d, n) => d.soundSensitivity?.(sensitivity, n), 'sens')} />
          </label>
        {/if}
        <div class="small muted">{t('sound.note')}</div>
      {/if}
    {/if}

    {#if addressable}
      <button class="ghost row spread" onclick={() => (showStrip = !showStrip)}>
        <span>{t('strip.title')} — {pixels} px</span>
        <span class="muted">{showStrip ? '▲' : '▼'}</span>
      </button>
      {#if showStrip}
        <label class="field">
          <span>{t('strip.pixels')}</span>
          <input type="text" inputmode="numeric" value={pixels}
            oninput={(e) => (pixels = Math.max(1, Math.min(65535,
              Number((e.currentTarget as HTMLInputElement).value) || 1)))} />
        </label>
        <label class="field">
          <span>{t('strip.order')}</span>
          <select class="sel" bind:value={order}>
            {#each rgbOrdersFor(conn.name) as o}
              <option value={o.id}>{o.name}</option>
            {/each}
          </select>
        </label>
        <button class="primary" onclick={applyStrip}>{t('strip.apply')}</button>
        <div class="row">
          <button class="grow" onclick={() => setDirection(true)}>{t('strip.forward')}</button>
          <button class="grow" onclick={() => setDirection(false)}>{t('strip.reverse')}</button>
        </div>
        {#if stripMsg}<div class="small muted">{stripMsg}</div>{/if}
      {/if}
    {/if}

    <div class="small muted truncate">
      {displayName(conn)} · {conn.driver.label}{#if ch !== undefined} · ch {ch}{/if}
    </div>
  {/if}
</div>

<style>
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    text-align: left;
    min-width: 0;
  }

  .swatch {
    width: 14px;
    height: 14px;
    flex: none;
    border-radius: 4px;
    border: 1px solid var(--line);
  }

  .sel {
    min-height: var(--tap);
    border-radius: var(--radius);
    background: var(--surface-2);
    border: 1px solid var(--line);
    padding: 0 10px;
  }
</style>
