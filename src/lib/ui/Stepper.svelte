<script lang="ts">
  // − value + with press-and-hold, so 0 → 120 km/h is one long press and not a keyboard.
  let {
    value, step, min = -Infinity, max = Infinity, unit = '', label, onchange,
  }: {
    value: number
    step: number
    min?: number
    max?: number
    unit?: string
    label: string
    onchange: (v: number) => void
  } = $props()

  const decimals = $derived((String(step).split('.')[1] ?? '').length)
  const shown = $derived(value.toFixed(decimals).replace('-', '−'))

  let current = 0
  function bump(dir: number) {
    // Rounded to the step, or −0.4 − 0.05 lands on −0.45000000000000007.
    const v = Math.min(max, Math.max(min, +(current + dir * step).toFixed(decimals)))
    if (v === current) return
    current = v
    onchange(v)
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  function press(dir: number, e: PointerEvent) {
    // Keeps the release on this button even if the finger slides off it.
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* pointer already gone */ }
    current = value
    bump(dir)
    let wait = 400
    const again = () => {
      bump(dir)
      // Speeds up the longer it is held.
      wait = Math.max(40, wait * 0.8)
      timer = setTimeout(again, wait)
    }
    timer = setTimeout(again, wait)
  }
  const release = () => clearTimeout(timer)
  $effect(() => release)

  // Keyboard and screen readers click without a pointer.
  function key(dir: number, e: MouseEvent) {
    if (e.detail !== 0) return
    current = value
    bump(dir)
  }
</script>

<div class="field">
  <span>{label}</span>
  <div class="stepper">
    <button type="button" aria-label="−" disabled={value <= min}
            onpointerdown={(e) => press(-1, e)} onpointerup={release} onpointercancel={release}
            onclick={(e) => key(-1, e)}>−</button>
    <output>{shown}{#if unit}<small>{unit}</small>{/if}</output>
    <button type="button" aria-label="+" disabled={value >= max}
            onpointerdown={(e) => press(1, e)} onpointerup={release} onpointercancel={release}
            onclick={(e) => key(1, e)}>+</button>
  </div>
</div>

<style>
  .stepper {
    display: flex;
    align-items: stretch;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface-2);
    overflow: hidden;
  }
  button {
    width: var(--tap);
    min-height: var(--tap);
    flex: none;
    border: 0;
    border-radius: 0;
    background: transparent;
    font-size: 22px;
    line-height: 1;
    touch-action: none;
    user-select: none;
  }
  output {
    flex: 1;
    min-width: 48px;
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 3px;
    padding-top: 9px;
    font-size: 20px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    border-inline: 1px solid var(--line);
  }
  small { font-size: 13px; font-weight: 400; color: var(--muted); }
</style>
