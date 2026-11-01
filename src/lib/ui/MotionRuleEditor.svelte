<script lang="ts">
  import { t } from '../i18n.svelte.ts'
  import { save, store } from '../store.svelte.ts'
  import type { MotionAction, MotionRule } from '../persist.ts'

  export type Target = { key: string; label: string; panel: boolean; bledim: boolean }

  let { rule, targets, ondelete }: {
    rule: MotionRule
    targets: Target[]
    ondelete: () => void
  } = $props()

  const defaults: Record<MotionAction['kind'], () => MotionAction> = {
    flash: () => ({ kind: 'flash', color: '#ff0000', times: 3 }),
    look: () => ({ kind: 'look', colorHex: '#ffffff' }),
    scene: () => ({ kind: 'scene', sceneId: store.scenes[0]?.id ?? '' }),
    slot: () => ({ kind: 'slot', slot: 1, seconds: 3 }),
  }

  function setKind(kind: MotionRule['kind']) {
    rule.kind = kind
    if (kind === 'map') rule.map ??= { from: 0, to: 100, out: 'brightness', min: 20, max: 100 }
    if (kind === 'trigger') {
      rule.trigger ??= { op: '<=', threshold: -0.4, holdMs: 200, cooldownMs: 2000, action: defaults.flash() }
      if (rule.input === 'speed') rule.input = 'gLong'
    }
    if (kind === 'place') {
      rule.place ??= { placeId: store.motion?.places[0]?.id ?? '', on: 'enter', action: defaults.scene() }
    }
    save()
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
</script>

<div class="card col" onchange={() => save()}>
  <div class="row">
    <input type="checkbox" bind:checked={rule.enabled} aria-label={t('motion.enabled')} />
    <input type="text" class="grow" bind:value={rule.name} aria-label={t('motion.name')} />
    <button class="ghost danger small" onclick={ondelete} title={t('content.delete')}>✕</button>
  </div>

  <div class="row wrap">
    <label class="field"><span>{t('motion.kind')}</span>
      <select class="sel" value={rule.kind} onchange={(e) => setKind(e.currentTarget.value as MotionRule['kind'])}>
        {#each ['map', 'trigger', 'place'] as k}<option value={k}>{t(`motion.kind.${k}`)}</option>{/each}
      </select>
    </label>
    {#if rule.kind !== 'place'}
      <label class="field grow"><span>{t('motion.input')}</span>
        <select class="sel" bind:value={rule.input}>
          {#each ['speed', 'gLong', 'gLat', 'gTotal'] as i}<option value={i}>{t(`motion.input.${i}`)}</option>{/each}
        </select>
      </label>
    {/if}
  </div>

  {#if rule.kind === 'map' && rule.map}
    <div class="row wrap">
      <label class="field"><span>{t('motion.from')}</span><input type="number" step="any" bind:value={rule.map.from} /></label>
      <label class="field"><span>{t('motion.to')}</span><input type="number" step="any" bind:value={rule.map.to} /></label>
      <label class="field"><span>{t('motion.out')}</span>
        <select class="sel" value={rule.map.out} onchange={(e) => setOut(e.currentTarget.value as 'brightness' | 'gradient')}>
          <option value="brightness">{t('motion.out.brightness')}</option>
          <option value="gradient">{t('motion.out.gradient')}</option>
        </select>
      </label>
    </div>
    {#if rule.map.out === 'brightness'}
      <div class="row">
        <label class="field"><span>{t('motion.min')}</span><input type="number" min="0" max="100" bind:value={rule.map.min} /></label>
        <label class="field"><span>{t('motion.max')}</span><input type="number" min="0" max="100" bind:value={rule.map.max} /></label>
      </div>
      {#if picked.some((x) => x.bledim)}<div class="small muted">{t('motion.bledimHint')}</div>{/if}
    {:else}
      {@const colors = rule.map.colors ?? []}
      <div class="row wrap swatches"><span class="small">{t('motion.colors')}</span>
        {#each colors as _, i}<input type="color" bind:value={colors[i]} />{/each}
        {#if colors.length < 5}<button class="ghost small" onclick={() => { colors.push('#ffffff'); save() }}>+</button>{/if}
        {#if colors.length > 2}<button class="ghost small" onclick={() => { colors.pop(); save() }}>−</button>{/if}
      </div>
    {/if}
  {:else if rule.kind === 'trigger' && rule.trigger}
    <div class="row wrap">
      <label class="field"><span>{t('motion.op')}</span>
        <select class="sel" bind:value={rule.trigger.op}>
          <option value=">=">{t('motion.op.ge')}</option>
          <option value="<=">{t('motion.op.le')}</option>
          <option value="abs>=">{t('motion.op.abs')}</option>
        </select>
      </label>
      <label class="field"><span>{t('motion.threshold')}</span><input type="number" step="0.05" bind:value={rule.trigger.threshold} /></label>
      <label class="field"><span>{t('motion.hold')}</span><input type="number" min="0" step="50" bind:value={rule.trigger.holdMs} /></label>
      <label class="field"><span>{t('motion.cooldown')}</span><input type="number" min="0" step="500" bind:value={rule.trigger.cooldownMs} /></label>
    </div>
  {:else if rule.kind === 'place' && rule.place}
    <div class="row wrap">
      <label class="field grow"><span>{t('motion.place')}</span>
        <select class="sel" bind:value={rule.place.placeId}>
          {#each store.motion?.places ?? [] as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
        </select>
      </label>
      <label class="field"><span>{t('motion.on')}</span>
        <select class="sel" bind:value={rule.place.on}>
          <option value="enter">{t('motion.on.enter')}</option>
          <option value="leave">{t('motion.on.leave')}</option>
        </select>
      </label>
    </div>
  {/if}

  {#if action}
    <div class="row wrap">
      <label class="field"><span>{t('motion.action')}</span>
        <select class="sel" value={actionKind} onchange={(e) => pickAction(e.currentTarget.value)}>
          {#each ['flash', 'look', 'power', 'scene', 'slot'] as a}<option value={a}>{t(`motion.action.${a}`)}</option>{/each}
        </select>
      </label>
      {#if action.kind === 'flash'}
        <input type="color" bind:value={action.color} aria-label={t('motion.action.flash')} />
        <label class="field"><span>{t('motion.times')}</span><input type="number" min="1" max="10" bind:value={action.times} /></label>
      {:else if action.kind === 'look' && actionKind === 'look'}
        <input type="color" bind:value={action.colorHex} aria-label={t('motion.action.look')} />
      {:else if action.kind === 'scene'}
        <label class="field grow"><span>{t('motion.scene')}</span>
          <select class="sel" bind:value={action.sceneId}>
            {#each store.scenes as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
          </select>
        </label>
        {#if !store.scenes.some((s) => s.id === action.sceneId)}<div class="small" style="color:var(--warn)">{t('motion.sceneMissing')}</div>{/if}
      {:else if action.kind === 'slot'}
        <label class="field"><span>{t('motion.slot')}</span><input type="number" min="1" max="100" bind:value={action.slot} /></label>
        <label class="field"><span>{t('motion.seconds')}</span><input type="number" min="1" max="600" bind:value={action.seconds} /></label>
      {/if}
    </div>
  {/if}

  {#if !(action?.kind === 'scene')}
    <div class="col" style="gap:4px">
      <span class="small">{t('motion.targets')}</span>
      {#if targets.length === 0}<span class="small muted">{t('motion.noTargets')}</span>{/if}
      {#each targets as x (x.key)}
        <label class="row small" style="gap:6px">
          <input type="checkbox" checked={rule.targets.includes(x.key)}
                 onchange={(e) => toggleTarget(x.key, e.currentTarget.checked)} />
          {x.label}
        </label>
      {/each}
      {#if picked.some((x) => x.panel)}<div class="small muted">{t('motion.panelOnly')}</div>{/if}
    </div>
  {/if}
</div>

<style>
  .sel, input[type='number'] {
    min-height: var(--tap);
    border-radius: var(--radius);
    background: var(--surface-2);
    border: 1px solid var(--line);
    padding: 0 10px;
  }
  input[type='number'] { width: 90px; }
  .swatches input[type='color'], .row > input[type='color'] { width: 48px; height: 40px; flex: none; }
</style>
