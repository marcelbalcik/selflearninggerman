import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

const server = process.env.WORTDUELL_SERVER ?? 'http://127.0.0.1:3000';

export default defineConfig({
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
        start_url: '/',
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
        // Online-only in v1 (spec §10): the app shell is cached, the API never is.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallbackDenylist: [/^\/api\//u],
      },
    }),
  ],
  server: {
    proxy: { '/api': server },
  },
  test: {
    environment: 'jsdom',
  },
});
