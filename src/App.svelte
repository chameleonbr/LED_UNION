<script lang="ts">
  import { onMount } from 'svelte'
  import { conns, restore, selection, supported } from './lib/ble.svelte.ts'
  import Devices from './lib/ui/Devices.svelte'
  import Color from './lib/ui/Color.svelte'
  import Effects from './lib/ui/Effects.svelte'
  import Scenes from './lib/ui/Scenes.svelte'
  import Debug from './lib/ui/Debug.svelte'

  type Tab = 'devices' | 'color' | 'effects' | 'scenes' | 'debug'
  let tab = $state<Tab>('devices')

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'devices', label: 'Aparelhos' },
    { id: 'color', label: 'Cor' },
    { id: 'effects', label: 'Efeitos' },
    { id: 'scenes', label: 'Cenas' },
    { id: 'debug', label: 'Debug' },
  ]

  const online = $derived(Object.values(conns).filter((c) => c.state === 'online').length)

  onMount(() => { restore() })
</script>

<header>
  <div class="row spread">
    <strong>LED Union</strong>
    <span class="small muted">
      {selection.ids.length} selecionado(s) · {online} online
    </span>
  </div>
</header>

<main>
  {#if !supported()}
    <div class="card" style="border-color: var(--warn)">
      <b>Web Bluetooth não disponível.</b>
      <p class="small muted" style="margin:6px 0 0">
        Use Chrome ou Edge. No Android, o site precisa estar em HTTPS ou em
        <code>localhost</code>. iOS não suporta Web Bluetooth.
      </p>
    </div>
  {:else if tab === 'devices'}
    <Devices />
  {:else if tab === 'color'}
    <Color />
  {:else if tab === 'effects'}
    <Effects />
  {:else if tab === 'scenes'}
    <Scenes />
  {:else}
    <Debug />
  {/if}
</main>

<nav>
  {#each tabs as t}
    <button class="ghost" class:active={tab === t.id} onclick={() => (tab = t.id)}>
      {t.label}
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
    grid-template-columns: repeat(5, 1fr);
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
