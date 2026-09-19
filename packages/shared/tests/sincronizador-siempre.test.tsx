import React from 'react'
import { describe, expect, it, afterEach } from 'vitest'
import { render, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider } from '../src/store/queries'
import type { Repository } from '../src/data/repository'
import type { StorageAdapter } from '../src/data/storage'
import { conColaEscrituras } from '../src/sync/colaEscrituras'
import { SincronizadorCola } from '../src/ui/colaSync'
import { espejoBus } from '../src/sync/espejoBus'

afterEach(() => {
  espejoBus.onFlushCompletado = undefined
})

function kv(): StorageAdapter {
  const mapa = new Map<string, string>()
  return { get: async k => mapa.get(k) ?? null, set: async (k, v) => { mapa.set(k, v) }, remove: async k => { mapa.delete(k) } }
}

const repoOk = {
  saveCliente: async (c: unknown) => c,
  deleteGasto: async () => {}
} as unknown as Repository

describe('SincronizadorCola siempre activo (sin condición activo)', () => {
  it('flushea la cola al montar aunque activo() sea false', async () => {
    const s = kv()
    const llamadas: string[] = []
    const repoBase = Object.assign(repoOk, {
      saveCliente: async (c: unknown) => { llamadas.push('saveCliente'); return c }
    })
    // activo siempre false - pero SincronizadorCola debe flushear igual
    const envuelto = conColaEscrituras(repoBase, { storage: s, activo: () => false })
    await envuelto.saveCliente({ nombre: 'Ana' } as never)
    expect(llamadas).toEqual([]) // encolada, no enviada

    const forzados: string[][] = []
    espejoBus.onFlushCompletado = ts => forzados.push(ts)

    const qc = new QueryClient()
    render(
      <QueryClientProvider client={qc}>
        <AppProvider repo={envuelto}>
          <SincronizadorCola almacen={s} repo={repoBase as Repository} />
        </AppProvider>
      </QueryClientProvider>
    )

    // El montaje dispara el vaciado aunque activo() sea false
    await waitFor(() => expect(llamadas).toEqual(['saveCliente']))
    await waitFor(() => expect(forzados).toEqual([['Clientes']]))
    const { cargarCola } = await import('../src/sync/colaEscrituras')
    expect(await cargarCola(s)).toEqual([])
  })

  it('reintenta al volver online aunque activo() sea false', async () => {
    const s = kv()
    const llamadas: string[] = []
    const repoBase = Object.assign({
      saveCliente: async (c: unknown) => { llamadas.push('saveCliente'); return c },
      deleteGasto: async () => {}
    }) as unknown as Repository
    const envuelto = conColaEscrituras(repoBase, { storage: s, activo: () => false })
    await envuelto.saveCliente({ nombre: 'B' } as never)

    const originalOnLine = navigator.onLine
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    try {
      const qc = new QueryClient()
      render(
        <QueryClientProvider client={qc}>
          <AppProvider repo={envuelto}>
            <SincronizadorCola almacen={s} repo={repoBase} />
          </AppProvider>
        </QueryClientProvider>
      )
      await act(async () => { await new Promise(r => setTimeout(r, 50)) })
      expect(llamadas).toEqual([]) // no flushea sin red

      // Simula vuelta online
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
      window.dispatchEvent(new Event('online'))
      await waitFor(() => expect(llamadas).toEqual(['saveCliente']))
    } finally {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => originalOnLine })
    }
  })

  it('reaplica ecos locales sin red aunque activo() sea false', async () => {
    const s = kv()
    const ecos: string[] = []
    const repoBase = Object.assign({
      saveCliente: async (c: unknown) => { throw new Error('offline') },
      deleteGasto: async () => {}
    }) as unknown as Repository

    // Monkey-patch espejoBus para capturar ecos
    const originalOnEscritura = espejoBus.onEscrituraLocal
    espejoBus.onEscrituraLocal = (metodo, args) => { ecos.push(metodo) }

    const envuelto = conColaEscrituras(repoBase, { storage: s, activo: () => false })
    await envuelto.saveCliente({ nombre: 'C' } as never)

    const originalOnLine = navigator.onLine
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    try {
      const qc = new QueryClient()
      render(
        <QueryClientProvider client={qc}>
          <AppProvider repo={envuelto}>
            <SincronizadorCola almacen={s} repo={repoBase} />
          </AppProvider>
        </QueryClientProvider>
      )
      await act(async () => { await new Promise(r => setTimeout(r, 100)) })
      // Se aplica eco al encolar (1) + al montar SincronizadorCola llama repetirEcosLocales (2)
      expect(ecos).toEqual(['saveCliente', 'saveCliente'])
    } finally {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => originalOnLine })
      espejoBus.onEscrituraLocal = originalOnEscritura
    }
  })
})