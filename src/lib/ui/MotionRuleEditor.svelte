<script lang="ts">
  import { t } from '../i18n.svelte.ts'
  import { save, store } from '../store.svelte.ts'
  import type { MotionAction, MotionInput, MotionRule } from '../persist.ts'
  import { live } from '../motion/sensors.svelte.ts'
  import { tryRule } from '../motion/run.ts'
  import { amountOf, eventOf, setAmount, setEvent, type MotionEvent } from '../motion/events.ts'
  import Stepper from './Stepper.svelte'

  /** `device` is set on each output of a multi-output controller: the editor titles them with it. */
  export type Target = { key: string; label: string; device?: string; panel: boolean; bledim: boolean }

  let { rule, targets, ondelete, startOpen = false }: {
    rule: MotionRule
    targets: Target[]
    ondelete: () => void
    startOpen?: boolean
  } = $props()

  // svelte-ignore state_referenced_locally
  let open = $state(startOpen)

  // The card lights up for a moment each time this rule fires (try the demo).
  let glow = $state(false)
  $effect(() => {
    if (live.lastTriggerId !== rule.id || !live.lastTriggerAt) return
    glow = true
    const id = setTimeout(() => (glow = false), 1200)
    return () => clearTimeout(id)
  })

  const defaults: Record<MotionAction['kind'], () => MotionAction> = {
    flash: () => ({ kind: 'flash', color: '#ff0000', times: 3 }),
    look: () => ({ kind: 'look', colorHex: '#ffffff' }),
    scene: () => ({ kind: 'scene', sceneId: store.scenes[0]?.id ?? '' }),
    slot: () => ({ kind: 'slot', slot: 1, seconds: 3 }),
  }

  /** km/h in whole steps, G in twentieths. */
  const unitOf = (i: MotionInput) =>
    i === 'speed' ? { step: 1, min: 0, max: 300, unit: 'km/h' } : { step: 0.05, min: -2, max: 2, unit: 'G' }

  function setKind(kind: MotionRule['kind']) {
    rule.kind = kind
    if (kind === 'map' && !rule.map) {
      rule.map = { from: 0, to: 100, out: 'brightness', min: 20, max: 100 }
      rule.input = 'speed'
    }
    if (kind === 'trigger' && !rule.trigger) {
      rule.trigger = { op: '<=', threshold: -0.4, holdMs: 200, cooldownMs: 2000, action: defaults.flash() }
      rule.input = 'gLong'
    }
    if (kind === 'place') {
      rule.place ??= { placeId: store.motion?.places[0]?.id ?? '', on: 'enter', action: defaults.scene() }
    }
    save()
  }

  /** A map's range only makes sense in its own unit, so a new unit starts a fresh range. */
  function follow(i: MotionInput) {
    if (!rule.map) return
    const was = rule.input === 'speed'
    rule.input = i
    if (was !== (i === 'speed')) {
      ;[rule.map.from, rule.map.to] = i === 'speed' ? [0, 100] : i === 'gLong' ? [-0.5, 0.5] : [0, 0.5]
    }
    save()
  }

  let trying = $state(false)
  async function tryIt() {
    trying = true
    try { await tryRule($state.snapshot(rule) as MotionRule) } finally { trying = false }
  }

  function setOut(out: 'brightness' | 'gradient') {
    if (!rule.map) return
    rule.map.out = out
    if (out === 'gradient') rule.map.colors ??= ['#00ff44', '#ffdd00', '#ff0000']
    save()
  }

  const action = $derived(rule.kind === 'trigger' ? rule.trigger?.action : rule.place?.action)
  function setAction(kind: MotionAction['kind']) {
    const a = kind === 'look' && action?.kind === 'look' ? action : defaults[kind]()
    if (rule.kind === 'trigger' && rule.trigger) rule.trigger.action = a
    if (rule.kind === 'place' && rule.place) rule.place.action = a
    save()
  }
  /** "Turn on" is a look with power only; "Set colour" is a look with a colour. */
  const actionKind = $derived(action?.kind === 'look' && action.power && !action.colorHex ? 'power' : action?.kind)
  function pickAction(v: string) {
    if (v === 'power') {
      setAction('look')
      const a = rule.kind === 'trigger' ? rule.trigger!.action : rule.place!.action
      if (a.kind === 'look') { a.power = true; a.colorHex = undefined }
      save()
    } else setAction(v as MotionAction['kind'])
  }

  function toggleTarget(key: string, on: boolean) {
    rule.targets = on ? [...rule.targets, key] : rule.targets.filter((k) => k !== key)
    save()
  }

  const picked = $derived(targets.filter((x) => rule.targets.includes(x.key)))
  // Single lights first, then each multi-output controller under its own title.
  const ordered = $derived([...targets.filter((x) => !x.device), ...targets.filter((x) => x.device)])

  // --- the one-line summary shown while the card is closed ---------------------------
  const num = (v: number) => String(+(+v).toFixed(2)).replace('-', '−')
  const inputName = $derived(
    rule.input === 'speed' ? t('motion.short.speed')
      : rule.input === 'gTotal' ? t('motion.input.gTotal')
        : t(`motion.${rule.input}`),
  )
  function actionText(a: MotionAction): string {
    if (a.kind === 'flash') return `${t('motion.action.flash')} ×${a.times}`
    if (a.kind === 'look') return a.power && !a.colorHex ? t('motion.action.power') : t('motion.action.look')
    if (a.kind === 'scene') return `${t('motion.action.scene')} ${store.scenes.find((x) => x.id === a.sceneId)?.name ?? '?'}`
    return `${t('motion.action.slot')} ${a.slot}`
  }
  const opText = (op: string) => t(op === '>=' ? 'motion.op.ge' : op === '<=' ? 'motion.op.le' : 'motion.op.abs')
  const sentence = $derived.by(() => {
    const m = rule.map, tr = rule.trigger, pl = rule.place
    let what = ''
    if (rule.kind === 'map' && m) {
      what = `${inputName} ${num(m.from)}–${num(m.to)} → ` +
        (m.out === 'brightness' ? `${t('motion.out.brightness')} ${m.min}–${m.max}%` : t('motion.out.gradient'))
    } else if (rule.kind === 'trigger' && tr) {
      const ev = eventOf(rule)
      what = ev
        ? `${t(`motion.ev.${ev}`)} ${num(amountOf(rule))} ${rule.input === 'speed' ? 'km/h' : 'G'} → ${actionText(tr.action)}`
        : `${inputName} ${opText(tr.op)} ${num(tr.threshold)} → ${actionText(tr.action)}`
    } else if (pl) {
      const place = store.motion?.places.find((p) => p.id === pl.placeId)?.name ?? '?'
      what = `${t(`motion.on.${pl.on}`)} ${place} → ${actionText(pl.action)}`
    }
    if (action?.kind === 'scene') return what
    const n = rule.targets.length
    return `${what} · ${n === 1 ? t('motion.lights1') : t('motion.lightsN', { n })}`
  })
  /** The rail shows what the rule paints: its flash or colour, or the gradient's ends. */
  const rail = $derived.by(() => {
    if (rule.kind === 'map' && rule.map?.out === 'gradient') {
      const cs = rule.map.colors ?? []
      return cs.length ? `linear-gradient(${cs.join(', ')})` : undefined
    }
    if (action?.kind === 'flash') return action.color
    if (action?.kind === 'look') return action.colorHex
    return undefined
  })
</script>

<div class="card col lit rule" class:off={!rule.enabled} class:glow onchange={() => save()}
     style:--rail={rail?.startsWith('linear') ? undefined : rail} style:--rail-image={rail?.startsWith('linear') ? rail : undefined}>
  <div class="row">
    <input type="checkbox" class="switch" bind:checked={rule.enabled} aria-label={t('motion.enabled')} />
    <button class="ghost head grow" aria-expanded={open} onclick={() => (open = !open)}>
      <span class="what">
        <b class="truncate">{rule.name}</b>
        <span class="small muted">{sentence}</span>
      </span>
      <span class="muted" aria-hidden="true">{open ? '▲' : '▼'}</span>
    </button>
  </div>

  {#if open}
  <input type="text" bind:value={rule.name} aria-label={t('motion.name')} />

  <div class="field">
    <span>{t('motion.kind')}</span>
    <div class="seg">
      {#each ['trigger', 'map', 'place'] as k}
        <button aria-pressed={rule.kind === k} onclick={() => setKind(k as MotionRule['kind'])}>{t(`motion.kind.${k}`)}</button>
      {/each}
    </div>
    <span class="small muted">{t(`motion.kindHint.${rule.kind}`)}</span>
  </div>

  {#if rule.kind === 'map' && rule.map}
    {@const m = rule.map}
    {@const u = unitOf(rule.input)}
    <div class="field">
      <span>{t('motion.follow')}</span>
      <div class="seg">
        {#each ['speed', 'gLong', 'gLat'] as i}
          <button aria-pressed={rule.input === i} onclick={() => follow(i as MotionInput)}>{t(`motion.follow.${i}`)}</button>
        {/each}
      </div>
    </div>
    <div class="pair">
      <Stepper label={t('motion.from')} value={m.from} {...u} onchange={(v) => { m.from = v; save() }} />
      <Stepper label={t('motion.to')} value={m.to} {...u} onchange={(v) => { m.to = v; save() }} />
    </div>
    <div class="field">
      <span>{t('motion.out')}</span>
      <div class="seg">
        {#each ['brightness', 'gradient'] as o}
          <button aria-pressed={m.out === o} onclick={() => setOut(o as 'brightness' | 'gradient')}>{t(`motion.out.${o}`)}</button>
        {/each}
      </div>
    </div>
    {#if m.out === 'brightness'}
      <div class="pair">
        <Stepper label={t('motion.min')} value={m.min} step={5} min={0} max={100} unit="%" onchange={(v) => { m.min = v; save() }} />
        <Stepper label={t('motion.max')} value={m.max} step={5} min={0} max={100} unit="%" onchange={(v) => { m.max = v; save() }} />
      </div>
      {#if picked.some((x) => x.bledim)}<div class="small muted">{t('motion.bledimHint')}</div>{/if}
    {:else}
      {@const colors = m.colors ?? []}
      <div class="row wrap swatches"><span class="small">{t('motion.colors')}</span>
        {#each colors as _, i}<input type="color" bind:value={colors[i]} />{/each}
        {#if colors.length < 5}<button class="ghost small" onclick={() => { colors.push('#ffffff'); save() }}>+</button>{/if}
        {#if colors.length > 2}<button class="ghost small" onclick={() => { colors.pop(); save() }}>−</button>{/if}
      </div>
    {/if}
  {:else if rule.kind === 'trigger' && rule.trigger}
    {@const tr = rule.trigger}
    {@const ev = eventOf(rule)}
    <div class="field">
      <span>{t('motion.when')}</span>
      <!-- G events on one bar, speed events on the other: each fits a narrow phone. -->
      {#each [['brake', 'accel', 'corner'], ['faster', 'slower']] as row}
        <div class="seg">
          {#each row as k}
            <button aria-pressed={ev === k} onclick={() => { setEvent(rule, k as MotionEvent); save() }}>{t(`motion.ev.${k}`)}</button>
          {/each}
        </div>
      {/each}
    </div>
    {#if rule.input === 'speed'}
      <Stepper label={t('motion.amount.speed')} value={amountOf(rule)} step={1} min={1} max={300} unit="km/h"
               onchange={(v) => { setAmount(rule, v); save() }} />
    {:else}
      <Stepper label={t('motion.amount.g')} value={amountOf(rule)} step={0.05} min={ev ? 0.05 : -2} max={2} unit="G"
               onchange={(v) => { setAmount(rule, v); save() }} />
      <span class="small muted">{t('motion.gHint')}</span>
    {/if}
    <details>
      <summary class="small muted">{t('motion.advanced')}</summary>
      <div class="pair">
        <Stepper label={t('motion.hold')} value={tr.holdMs / 1000} step={0.1} min={0} max={5} unit="s"
                 onchange={(v) => { tr.holdMs = Math.round(v * 1000); save() }} />
        <Stepper label={t('motion.cooldown')} value={tr.cooldownMs / 1000} step={0.5} min={0} max={60} unit="s"
                 onchange={(v) => { tr.cooldownMs = Math.round(v * 1000); save() }} />
      </div>
    </details>
  {:else if rule.kind === 'place' && rule.place}
    <div class="row wrap">
      <label class="field grow"><span>{t('motion.place')}</span>
        <select class="sel" bind:value={rule.place.placeId}>
          {#each store.motion?.places ?? [] as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
        </select>
      </label>
    </div>
    <div class="seg">
      {#each ['enter', 'leave'] as o}
        <button aria-pressed={rule.place.on === o} onclick={() => { rule.place!.on = o as 'enter' | 'leave'; save() }}>{t(`motion.on.${o}`)}</button>
      {/each}
    </div>
  {/if}

  {#if action}
    <div class="field">
      <span>{t('motion.action')}</span>
      <div class="seg">
        {#each ['flash', 'look', 'power', 'scene', 'slot'] as a}
          <button aria-pressed={actionKind === a} onclick={() => pickAction(a)}>{t(`motion.act.${a}`)}</button>
        {/each}
      </div>
    </div>
    {#if action.kind === 'flash'}
      {@const fl = action}
      <div class="row" style="align-items:flex-end">
        <input type="color" bind:value={fl.color} aria-label={t('motion.action.flash')} />
        <div class="grow"><Stepper label={t('motion.times')} value={fl.times} step={1} min={1} max={10} onchange={(v) => { fl.times = v; save() }} /></div>
      </div>
    {:else if action.kind === 'look' && actionKind === 'look'}
      <input type="color" class="one" bind:value={action.colorHex} aria-label={t('motion.action.look')} />
    {:else if action.kind === 'scene'}
      <label class="field grow"><span>{t('motion.scene')}</span>
        <select class="sel" bind:value={action.sceneId}>
          {#each store.scenes as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
        </select>
      </label>
      {#if !store.scenes.some((s) => s.id === action.sceneId)}<div class="small" style="color:var(--warn)">{t('motion.sceneMissing')}</div>{/if}
    {:else if action.kind === 'slot'}
      {@const sl = action}
      <div class="pair">
        <Stepper label={t('motion.slot')} value={sl.slot} step={1} min={1} max={100} onchange={(v) => { sl.slot = v; save() }} />
        <Stepper label={t('motion.seconds')} value={sl.seconds} step={1} min={1} max={600} unit="s" onchange={(v) => { sl.seconds = v; save() }} />
      </div>
    {/if}
  {/if}

  {#if !(action?.kind === 'scene')}
    <div class="field">
      <span>{t('motion.targets')}</span>
      {#if targets.length === 0}<span class="small muted">{t('motion.noTargets')}</span>{/if}
      <div class="chips">
        {#each ordered as x, i (x.key)}
          <!-- A controller's outputs sit under its name once, not "Name · RGB", "Name · SPI". -->
          {#if x.device && x.device !== ordered[i - 1]?.device}<span class="chip-group">{x.device}</span>{/if}
          <button class="chip" aria-pressed={rule.targets.includes(x.key)}
                  aria-label={x.device ? `${x.device} · ${x.label}` : x.label}
                  onclick={() => toggleTarget(x.key, !rule.targets.includes(x.key))}>{x.label}</button>
        {/each}
      </div>
      {#if picked.some((x) => x.panel)}<div class="small muted">{t('motion.panelOnly')}</div>{/if}
    </div>
  {/if}

  <div class="row spread">
    {#if action}
      <button onclick={tryIt} disabled={trying || live.running || live.simulating}>
        {trying ? t('motion.trying') : t('motion.try')}
      </button>
    {/if}
    <button class="ghost danger small" onclick={ondelete}>{t('motion.deleteRule')}</button>
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
  .swatches input[type='color'], .row > input[type='color'] { width: 56px; height: var(--tap); flex: none; }
  label.field > span { white-space: nowrap; }

  .head { display: flex; align-items: center; gap: 8px; text-align: left; min-width: 0; padding: 0 4px; height: auto; min-height: 56px; }
  .what { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
  .rule.lit::before { background: var(--rail-image, var(--rail, var(--line))); }
  .rule.off { opacity: .6; }
  .rule.off::before { box-shadow: none; filter: grayscale(1); }
  .rule { transition: border-color .2s ease; }
  .rule.glow { border-color: var(--accent); }
  .rule.glow::before { box-shadow: 0 0 16px 3px var(--accent); }
  /* Side by side when both steppers fit, stacked on a narrow phone. */
  .pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(136px, 1fr)); gap: 8px; }
  input.one { height: 48px; }
  details summary { cursor: pointer; padding: 6px 0; }

  /* On/off as a switch: a rule is something you arm, not something you tick. */
  .switch {
    appearance: none;
    width: 44px;
    height: 26px;
    flex: none;
    border-radius: 13px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    position: relative;
    cursor: pointer;
    transition: background-color .15s ease;
  }
  .switch::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--muted);
    transition: transform .15s ease;
  }
  .switch:checked { background: var(--accent); border-color: var(--accent); }
  .switch:checked::after { background: var(--on-accent); transform: translateX(18px); }
</style>
