<script lang="ts">
  import { onMount } from 'svelte'
  import { conns, restore, supported } from './lib/ble.svelte.ts'
  import { t, locale, locales, localeName, chooseLocale } from './lib/i18n.svelte.ts'
  import Devices from './lib/ui/Devices.svelte'
  import Effects from './lib/ui/Effects.svelte'
  import Scenes from './lib/ui/Scenes.svelte'
  import Debug from './lib/ui/Debug.svelte'

  type Tab = 'devices' | 'effects' | 'scenes' | 'debug'
  let tab = $state<Tab>('devices')

  const tabs: Array<{ id: Tab; key: string }> = [
    { id: 'devices', key: 'nav.devices' },
    { id: 'effects', key: 'nav.effects' },
    { id: 'scenes', key: 'nav.scenes' },
    { id: 'debug', key: 'nav.debug' },
  ]

  const online = $derived(Object.values(conns).filter((c) => c.state === 'online').length)

  onMount(() => { restore() })
</script>

<header>
  <div class="row spread">
    <strong>LED Union</strong>
    <div class="row" style="gap:10px">
      <span class="small muted">{t('app.online', { n: online })}</span>
      <select
        class="lang"
        value={locale()}
        onchange={(e) => chooseLocale((e.currentTarget as HTMLSelectElement).value)}
      >
        {#each locales as l}<option value={l}>{localeName[l] ?? l}</option>{/each}
      </select>
    </div>
  </div>
</header>

<main>
  {#if !supported()}
    <div class="card" style="border-color: var(--warn)">
      <b>{t('common.unsupported')}</b>
      <p class="small muted" style="margin:6px 0 0">{t('common.unsupportedHint')}</p>
    </div>
  {:else if tab === 'devices'}
    <Devices />
  {:else if tab === 'effects'}
    <Effects />
  {:else if tab === 'scenes'}
    <Scenes />
  {:else}
    <Debug />
  {/if}
</main>

<nav>
  {#each tabs as tb}
    <button class="ghost" class:active={tab === tb.id} onclick={() => (tab = tb.id)}>
      {t(tb.key)}
    </button>
  {/each}
</nav>

<style>
  header {
    position: sticky;
    top: 0;
    z-index: 2;
    padding: 12px 16px;
    background: var(--bg);
    border-bottom: 1px solid var(--line);
  }

  .lang {
    min-height: 32px;
    font-size: 13px;
    border-radius: 8px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    padding: 0 6px;
  }

  main {
    padding: 16px;
    padding-bottom: calc(80px + env(safe-area-inset-bottom));
    max-width: 720px;
    margin: 0 auto;
  }

  nav {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    padding: 6px 6px calc(6px + env(safe-area-inset-bottom));
    background: var(--surface);
    border-top: 1px solid var(--line);
  }

  nav button {
    border: none;
    border-radius: 10px;
    font-size: 13px;
  }

  nav button.active {
    background: var(--surface-2);
    color: var(--accent);
    font-weight: 600;
  }
</style>
