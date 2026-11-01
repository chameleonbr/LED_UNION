<script lang="ts">
  import { onDestroy } from 'svelte'
  import { conns, displayName } from '../ble.svelte.ts'
  import { epKey, parseEp } from '../endpoint.ts'
  import { t } from '../i18n.svelte.ts'
  import { labelOf, lookOf, save, store, uid } from '../store.svelte.ts'
  import type { MotionRule } from '../persist.ts'
  import { accelRule, brakeLight, brightnessBySpeed, cornerRule } from '../motion/engine.ts'
  import { calibrateNow, here, live, start, stop } from '../motion/sensors.svelte.ts'
  import MotionRuleEditor, { type Target } from './MotionRuleEditor.svelte'

  store.motion ??= { rules: [], places: [] }
  const motion = $derived(store.motion!)

  // Every output of every known device, the same list the Effects tab offers.
  const targets = $derived<Target[]>(
    Object.values(conns).flatMap((c) => {
      const panel = !!c.driver.showSlot
      const bledim = c.driver.id === 'bledim'
      const outs = c.driver.outputs?.(c.name) ?? []
      if (outs.length < 2) return [{ key: c.id, label: displayName(c), panel, bledim }]
      return outs.map((o, i) => ({
        key: epKey(c.id, i), label: `${displayName(c)} · ${labelOf(epKey(c.id, i), o.label)}`, panel, bledim,
      }))
    }),
  )

  const offline = $derived(
    new Set(
      motion.rules.filter((r) => r.enabled).flatMap((r) => r.targets)
        .map((k) => parseEp(k).deviceId)
        .filter((id) => conns[id] && conns[id].state !== 'online'),
    ).size,
  )

  // A flash returns to the recorded look; a light with none recorded has nothing to return to.
  const noLook = $derived(
    new Set(
      motion.rules.filter((r) => r.enabled && (r.trigger ?? r.place)?.action.kind === 'flash')
        .flatMap((r) => r.targets)
        .filter((k) => { const l = lookOf(k); return !l.colorHex && !l.effect && !l.customEffectId }),
    ).size,
  )

  let msg = $state('')

  async function toggle() {
    msg = ''
    if (live.running) await stop()
    else await start()
  }

  async function calibrate() {
    msg = ''
    if (!(await calibrateNow())) msg = t('motion.calibrateFailed')
  }

  const presets = {
    brake: brakeLight, speed: brightnessBySpeed, corner: cornerRule, accel: accelRule,
  } as const
  let presetPick = $state('')
  function addPreset(k: keyof typeof presets | 'new') {
    // Presets start on every light except panels, which take no colour.
    const all = targets.filter((x) => !x.panel).map((x) => x.key)
    const rule: MotionRule = k === 'new'
      ? { ...brightnessBySpeed(uid(), t('motion.newRule'), []) }
      : presets[k](uid(), t(`motion.preset.${k}`), k === 'speed' ? all.slice(0, 1) : all)
    motion.rules.push(rule)
    save()
    presetPick = ''
  }

  function removeRule(r: MotionRule) {
    if (!confirm(t('motion.deleteConfirm', { name: r.name }))) return
    motion.rules = motion.rules.filter((x) => x.id !== r.id)
    save()
  }

  // --- places -----------------------------------------------------------------------
  let locating = $state(false)
  async function saveHere() {
    msg = ''
    locating = true
    try {
      const p = await here()
      motion.places.push({
        id: uid(), name: `${t('motion.place')} ${motion.places.length + 1}`,
        lat: p.coords.latitude, lon: p.coords.longitude, radius: 100,
      })
      save()
    } catch {
      msg = t('motion.locateFailed')
    } finally {
      locating = false
    }
  }
  function removePlace(id: string, name: string) {
    if (!confirm(t('motion.deleteConfirm', { name }))) return
    motion.places = motion.places.filter((p) => p.id !== id)
    save()
  }

  // --- dark screen --------------------------------------------------------------------
  let dark = $state(false)
  function enterDark() {
    dark = true
    // The back gesture leaves the dark screen instead of the app.
    history.pushState({ dark: true }, '')
  }
  function leaveDark() {
    if (!dark) return
    dark = false
    if (history.state?.dark) history.back()
  }
  const onPop = () => { dark = false }
  addEventListener('popstate', onPop)
  onDestroy(() => removeEventListener('popstate', onPop))
  $effect(() => { if (!live.running) dark = false })

  const status = $derived(
    [
      live.paused && t(`motion.paused.${live.paused}`),
      live.running && ['waiting', 'denied', 'none'].includes(live.gps) && t(`motion.gps.${live.gps}`),
      live.running && ['waiting', 'lost', 'denied', 'none'].includes(live.accel) && t(`motion.accel.${live.accel}`),
      live.running && live.recalibrate && t('motion.recalibrate'),
      live.running && offline > 0 && t('motion.offline', { n: offline }),
      live.errors > 0 && t('motion.errors', { n: live.errors }),
      noLook > 0 && t('motion.noLook', { n: noLook }),
    ].filter(Boolean) as string[],
  )
  const bar = (g: number) => `${Math.min(50, Math.abs(g) * 50)}%`
</script>

<div class="col">
  <div class="card col gauges">
    <div class="row spread">
      <div class="speed"><b>{Math.round(live.speed)}</b> <span class="muted">{t('motion.speed')}</span></div>
      <div class="ball" aria-hidden="true">
        <span style="left:{50 + Math.max(-1, Math.min(1, live.gLat)) * 45}%; top:{50 - Math.max(-1, Math.min(1, live.gLong)) * 45}%"></span>
      </div>
    </div>
    {#each [['gLong', live.gLong], ['gLat', live.gLat]] as [k, g]}
      <div class="row small">
        <span class="lbl">{t(`motion.${k}`)}</span>
        <div class="axis grow">
          <span class:neg={(g as number) < 0} style="width:{bar(g as number)}"></span>
        </div>
        <span class="num">{(g as number).toFixed(2)}</span>
      </div>
    {/each}
    {#if live.lastTrigger}<div class="small" style="color:var(--accent)">{t('motion.lastTrigger', { name: live.lastTrigger })}</div>{/if}
    {#each status as s}<div class="small" style="color:var(--warn)">{s}</div>{/each}
    {#if msg}<div class="small" style="color:var(--err)">{msg}</div>{/if}

    <button class="primary big" disabled={live.simulating} onclick={toggle}>
      {live.running ? t('motion.stop') : t('motion.start')}
    </button>
    <div class="row">
      <button class="grow" disabled={live.calibrating || live.simulating} onclick={calibrate}>
        {live.calibrating ? t('motion.calibrating') : t('motion.calibrate')}
      </button>
      <button class="grow" disabled={!live.running} onclick={enterDark}>{t('motion.dark')}</button>
    </div>
    <div class="small muted">
      {motion.calibration ? t('motion.calibrateHint') : t('motion.uncalibrated')}
    </div>
    <div class="small muted">{t('motion.screenNote')}</div>
  </div>

  <div class="row spread">
    <b>{t('motion.rules')}</b>
    <select class="sel" bind:value={presetPick}
            onchange={() => presetPick && addPreset(presetPick as keyof typeof presets | 'new')}>
      <option value="">{t('motion.addRule')}…</option>
      <option value="new">{t('motion.newRule')}</option>
      {#each Object.keys(presets) as k}<option value={k}>{t(`motion.preset.${k}`)}</option>{/each}
    </select>
  </div>
  {#if motion.rules.length === 0}<div class="card muted">{t('motion.noRules')}</div>{/if}
  {#each motion.rules as rule (rule.id)}
    <MotionRuleEditor {rule} {targets} ondelete={() => removeRule(rule)} />
  {/each}

  <div class="card col">
    <div class="row spread">
      <b>{t('motion.places')}</b>
      <button disabled={locating} onclick={saveHere}>{locating ? t('motion.locating') : t('motion.saveHere')}</button>
    </div>
    {#if motion.places.length === 0}<div class="small muted">{t('motion.noPlaces')}</div>{/if}
    {#each motion.places as p (p.id)}
      <div class="row" onchange={() => save()}>
        <input type="text" class="grow" bind:value={p.name} aria-label={t('motion.placeName')} />
        <button class="ghost danger small" onclick={() => removePlace(p.id, p.name)} title={t('content.delete')}>✕</button>
      </div>
      <div class="row" onchange={() => save()}>
        <label class="field grow"><span>{t('motion.lat')}</span>
          <input type="number" step="any" min="-90" max="90" bind:value={p.lat} class="coord" />
        </label>
        <label class="field grow"><span>{t('motion.lon')}</span>
          <input type="number" step="any" min="-180" max="180" bind:value={p.lon} class="coord" />
        </label>
        <label class="field"><span>{t('motion.radius')}</span>
          <input type="number" min="50" max="1000" step="10" bind:value={p.radius} />
        </label>
      </div>
    {/each}
    <div class="small muted">{t('motion.placesNote')}</div>
  </div>
</div>

{#if dark}
  <!-- Black on OLED is close to off; the sensors keep running because the page stays visible. -->
  <div class="dark" role="button" tabindex="0" aria-label={t('motion.darkHint')} ondblclick={leaveDark}
       onkeydown={(e) => e.key === 'Escape' && leaveDark()}>
    <span>{Math.round(live.speed)}</span>
  </div>
{/if}

<style>
  .speed b { font-size: 56px; line-height: 1; font-variant-numeric: tabular-nums; }
  .ball {
    position: relative;
    width: 72px;
    height: 72px;
    border-radius: 50%;
    border: 1px solid var(--line);
    background: radial-gradient(circle, var(--surface-2) 30%, transparent 31%);
  }
  .ball span {
    position: absolute;
    width: 12px;
    height: 12px;
    margin: -6px 0 0 -6px;
    border-radius: 50%;
    background: var(--accent);
  }
  .lbl { width: 96px; }
  .num { width: 44px; text-align: right; font-variant-numeric: tabular-nums; }
  .axis {
    position: relative;
    height: 10px;
    border-radius: 5px;
    background: var(--surface-2);
  }
  .axis span {
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    border-radius: 5px;
    background: var(--ok);
  }
  .axis span.neg { left: auto; right: 50%; background: var(--err); }
  .big { min-height: 64px; font-size: 20px; }
  .sel, input[type='number'] {
    min-height: var(--tap);
    border-radius: var(--radius);
    background: var(--surface-2);
    border: 1px solid var(--line);
    padding: 0 10px;
  }
  input[type='number'] { width: 90px; }
  input.coord { width: 100%; }
  .dark {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: #000;
    display: grid;
    place-items: end center;
    padding-bottom: 40px;
  }
  .dark span { color: #300; font-size: 48px; font-variant-numeric: tabular-nums; }
</style>
