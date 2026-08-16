import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    env: {
      // UI tests exercise the deterministic in-memory adapter. Live API/Supabase
      // behavior is covered by adapter tests and must never depend on developer .env.
      VITE_DATA_SOURCE: 'mock',
      VITE_MAPBOX_ACCESS_TOKEN: '',
    },
    setupFiles: ['./src/test/setup.ts'],
  },
})
