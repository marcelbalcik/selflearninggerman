import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the app under /<repository>/ (set by the Pages workflow).
const base = process.env.WORTDUELL_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Wortduell',
        short_name: 'Wortduell',
        description: 'Deutsch üben, zu zweit.',
        lang: 'de',
        theme_color: '#1d3fa6',
        background_color: '#fdfdfb',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // The app works offline: shell, SQLite (wasm) and the base database are
        // cached; syncing waits until the phone is online again.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            // The base database's name changes with its content (build-base.ts).
            urlPattern: /\/data\/base-[0-9a-f]+\.sqlite$/u,
            handler: 'CacheFirst',
            options: { cacheName: 'base-db', expiration: { maxEntries: 2 } },
          },
          {
            urlPattern: /\/(data\/base\.json|wortduell\.config\.json)$/u,
            handler: 'NetworkFirst',
            options: { cacheName: 'config' },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
  },
});
