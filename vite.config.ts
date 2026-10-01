/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

function gitSha() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'dev'
  }
}

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
const APP_VERSION = `${pkg.version}+${gitSha()}`
const BUILD_TIME = new Date().toISOString()

/** Writes dist/version.json so running copies can tell a newer release is live. */
function versionFile(): Plugin {
  return {
    name: 'version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: APP_VERSION, buildTime: BUILD_TIME }) })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
  build: {
    // The Firebase SDK is ~650 kB on its own (cached separately); app chunks stay far below this.
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        // Firebase and React change far less often than the app: separate files stay cached across deploys.
        codeSplitting: {
          groups: [
            { name: 'firebase', test: /node_modules[\\/](@firebase|firebase)[\\/]/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
  plugins: [
    react(),
    versionFile(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-64.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Family Organizer',
        short_name: 'Family',
        description: 'Chores, meals, calendar, and photos for the family.',
        theme_color: '#f6f4ee',
        background_color: '#f6f4ee',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          // Android crops to a circle; this version keeps the mark inside the safe zone.
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Firebase's auth handler and the static legal pages must not fall back to the app.
        navigateFallbackDenylist: [/^\/__\//, /^\/(privacy|terms)\.html$/],
        // Slideshow photos never change once uploaded; keep them on the device so
        // the wall display doesn't re-download the library every loop.
        runtimeCaching: [
          {
            urlPattern: ({ url, request }) => url.hostname === 'firebasestorage.googleapis.com' && request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'family-photos',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts'],
  },
})
