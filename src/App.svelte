<script lang="ts">
  import { onMount } from 'svelte'
  import { conns, restore, supported } from './lib/ble.svelte.ts'
  import { t, locale, locales, localeName, chooseLocale } from './lib/i18n.svelte.ts'
  import { store } from './lib/store.svelte.ts'
  import { enterStealth, exitStealth } from './lib/stealth.ts'
  import Devices from './lib/ui/Devices.svelte'
  import Effects from './lib/ui/Effects.svelte'
  import Scenes from './lib/ui/Scenes.svelte'
  import Debug from './lib/ui/Debug.svelte'
  import Panel from './lib/ui/Panel.svelte'
  import Motion from './lib/ui/Motion.svelte'

  type Tab = 'devices' | 'effects' | 'scenes' | 'panel' | 'motion' | 'debug'
  // Arriving from the Android share sheet lands on the panel editor.
  let tab = $state<Tab>(new URLSearchParams(location.search).has('share') ? 'panel' : 'devices')

  const tabs: Array<{ id: Tab; key: string }> = [
    { id: 'devices', key: 'nav.devices' },
    { id: 'effects', key: 'nav.effects' },
    { id: 'scenes', key: 'nav.scenes' },
    { id: 'panel', key: 'nav.panel' },
    { id: 'motion', key: 'nav.motion' },
    { id: 'debug', key: 'nav.debug' },
  ]

  const online = $derived(Object.values(conns).filter((c) => c.state === 'online').length)

  let stealthBusy = $state(false)
  let stealthMsg = $state('')

  async function toggleStealth() {
    if (stealthBusy) return
    stealthBusy = true
    stealthMsg = ''
    try {
      if (store.stealth) {
        const missed = await exitStealth()
        if (missed.length) stealthMsg = t('stealth.unreachable', { names: missed.join(', ') })
      } else {
        await enterStealth()
      }
    } finally {
      stealthBusy = false
    }
  }

  function select(id: Tab) {
    tab = id
  }

  onMount(() => { restore() })
  $effect(() => { document.documentElement.lang = locale() })
</script>

<header>
  <div class="row spread">
    <strong class="brand">LED Union</strong>
    <div class="row" style="gap:10px">
      <span class="row small muted online" style="gap:6px" title={t('app.online', { n: online })}>
        <span class="dot" class:online={online > 0}></span>{online}
      </span>
      <button
        class="stealth"
        class:on={!!store.stealth}
        aria-pressed={!!store.stealth}
        disabled={stealthBusy}
        onclick={toggleStealth}
      >
        {store.stealth ? t('stealth.on') : t('stealth.off')}
      </button>
      <select
        class="lang"
        aria-label={localeName[locale()] ?? locale()}
        value={locale()}
        onchange={(e) => chooseLocale((e.currentTarget as HTMLSelectElement).value)}
      >
        <!-- Codes keep the header on one line at 320 px; the open list still reads well. -->
        {#each locales as l}<option value={l} title={localeName[l] ?? l}>{l.slice(0, 2).toUpperCase()}</option>{/each}
      </select>
    </div>
  </div>
  {#if stealthMsg}<div class="small" style="color:var(--warn); margin-top:6px">{stealthMsg}</div>{/if}
</header>

<main>
  <!-- A warning, not a replacement. Hiding every tab behind it also hid the saved
       devices and the Debug tools, which are exactly what you want when Web Bluetooth
       is missing. Keeping it out of the tab chain also keeps `tab` the only thing that
       chain depends on. -->
  {#if !supported()}
    <div class="card" style="border-color: var(--warn); margin-bottom: 12px">
      <b>{t('common.unsupported')}</b>
      <p class="small muted" style="margin:6px 0 0">{t('common.unsupportedHint')}</p>
    </div>
  {/if}

  {#if tab === 'devices'}
    <Devices />
  {:else if tab === 'effects'}
    <Effects />
  {:else if tab === 'scenes'}
    <Scenes />
  {:else if tab === 'panel'}
    <Panel />
  {:else if tab === 'motion'}
    <Motion />
  {:else}
    <Debug />
  {/if}
</main>

<nav>
  {#each tabs as tb}
    <button class="ghost" class:active={tab === tb.id} onclick={() => select(tb.id)}>
      {t(tb.key)}
    </button>
  {/each}
</nav>

<style>
  header {
    position: sticky;
    top: 0;
    z-index: 2;
    padding: 10px 16px;
    padding-top: calc(10px + env(safe-area-inset-top));
    background: var(--bg);
    border-bottom: 1px solid var(--surface-2);
  }

  .brand { font-size: 22px; letter-spacing: .01em; white-space: nowrap; }
  .online { white-space: nowrap; }

  .stealth {
    min-height: var(--tap);
    min-width: 48px;
    padding: 0 12px;
    font-size: 15px;
  }

  .stealth.on {
    background: var(--err);
    border-color: var(--err);
    color: #fff;
    font-weight: 600;
  }

  .lang {
    min-height: 36px;
    font-size: 15px;
    padding: 0 6px;
  }

  main {
    padding: 16px;
    padding-bottom: calc(84px + env(safe-area-inset-bottom));
    max-width: 720px;
    margin: 0 auto;
  }

  nav {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 2;
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    padding: 0 4px env(safe-area-inset-bottom);
    background: var(--surface);
    border-top: 1px solid var(--surface-2);
  }

  /* One row of six: condensed labels fit 320 px, and the content keeps the height. */
  nav button {
    position: relative;
    min-height: 56px;
    padding: 0 2px;
    border: none;
    border-radius: 0;
    background: transparent;
    color: var(--muted);
    font-size: 14px;
    white-space: nowrap;
  }

  nav button:hover:not(:disabled) { background: transparent; }

  nav button.active {
    color: var(--accent);
    font-weight: 600;
  }

  /* The lit strip on the active tab echoes the rail on each light. */
  nav button.active::before {
    content: '';
    position: absolute;
    left: 20%;
    right: 20%;
    top: 0;
    height: 3px;
    border-radius: 0 0 3px 3px;
    background: var(--accent);
    box-shadow: 0 0 10px var(--accent);
  }
</style>
