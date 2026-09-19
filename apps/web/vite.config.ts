import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    // sqlite-wasm carga su .wasm/worker con new URL(..., import.meta.url):
    // pre-bundlearlo rompe esas URLs y mete Vite en bucles de re-optimización.
    exclude: ['@sqlite.org/sqlite-wasm'],
    // Fijar las demás evita el ping-pong de "optimized dependencies changed.
    // reloading": cada generación distinta de ?v= en los módulos servidos
    // provoca 504 Outdated Optimize Dep y pide recargar en bucle.
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      '@tanstack/react-query',
      'zustand',
      'zod'
    ]
  },
  server: { port: 5173 }
})
