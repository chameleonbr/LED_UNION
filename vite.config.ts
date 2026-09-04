import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'

// Served as a GitHub project page, so the site lives under /LED_UNION/ and every asset
// URL has to carry that prefix. Dev stays at the root: the adb-tunnel workflow points a
// phone at http://localhost:5173, and a prefix there would only get in the way.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/LED_UNION/' : '/',
  // Reachable over the tailnet for on-device testing; ts.net terminates TLS, which
  // is what makes Web Bluetooth available at all.
  server: {
    host: true,
    allowedHosts: ['.ts.net'],
  },
  preview: {
    host: true,
    allowedHosts: ['.ts.net'],
  },
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'LED Union',
        short_name: 'LED Union',
        description: 'One app for every Bluetooth LED controller you own',
        theme_color: '#0b0d12',
        background_color: '#0b0d12',
        display: 'standalone',
        orientation: 'portrait',
        // Relative, so it resolves against wherever the manifest is served from and
        // survives a change of base.
        start_url: './',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
}))
