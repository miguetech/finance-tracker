import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // sqlite-wasm carga su .wasm/worker con new URL(..., import.meta.url):
  // pre-bundlearlo rompe esas URLs y mete Vite en bucles de re-optimización.
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  server: { port: 5173 }
})
