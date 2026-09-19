import React from 'react'
import { describe, expect, it, afterEach } from 'vitest'
import { render, act, cleanup, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider } from '../src/store/queries'
import type { Repository } from '../src/data/repository'
import type { StorageAdapter } from '../src/data/storage'
import { conColaEscrituras } from '../src/sync/colaEscrituras'
import { SincronizadorCola } from '../src/ui/colaSync'
import { espejoBus } from '../src/sync/espejoBus'

afterEach(() => cleanup())

function kv(): StorageAdapter {
  const mapa = new Map<string, string>()
  return { get: async k => mapa.get(k) ?? null, set: async (k, v) => { mapa.set(k, v) }, remove: async k => { mapa.delete(k) } }
}

const repoOk = {
  saveCliente: async (c: unknown) => c,
  deleteGasto: async () => {}
} as unknown as Repository

describe('flush de la cola al reconectar', () => {
  it('ejecuta las ops contra Sheets y dispara pull forzado del espejo', async () => {
    const s = kv()
    const llamadas: string[] = []
    const repoBase = Object.assign(repoOk, {
      saveCliente: async (c: unknown) => { llamadas.push('saveCliente'); return c }
    })
    const envuelto = conColaEscrituras(repoBase, { storage: s, activo: () => true })
    await envuelto.saveCliente({ nombre: 'Ana' } as never)
    expect(llamadas).toEqual([]) // encolada, no enviada

    const forzados: TableName[][] = []
    espejoBus.onFlushCompletado = ts => forzados.push(ts)

    const qc = new QueryClient()
    render(
      <QueryClientProvider client={qc}>
        <AppProvider repo={envuelto}>
          <SincronizadorCola almacen={s} repo={repoBase as Repository} />
        </AppProvider>
      </QueryClientProvider>
    )
    // El montaje dispara el primer vaciado (navigator.onLine === true en jsdom).
    await waitFor(() => expect(llamadas).toEqual(['saveCliente']))
    await waitFor(() => expect(forzados).toEqual([['Clientes']]))
    // Cola vacía tras el flush.
    const { cargarCola } = await import('../src/sync/colaEscrituras')
    expect(await cargarCola(s)).toEqual([])
    espejoBus.onFlushCompletado = undefined
  })

  it('sin red no flushea y conserva la cola', async () => {
    const s = kv()
    const llamadas: string[] = []
    const repoBase = Object.assign({
      saveCliente: async (c: unknown) => { llamadas.push('saveCliente'); return c },
      deleteGasto: async () => {}
    }) as unknown as Repository
    const envuelto = conColaEscrituras(repoBase, { storage: s, activo: () => true })
    await envuelto.saveCliente({ nombre: 'B' } as never)

    const originalOnLine = navigator.onLine
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    try {
      render(
        <QueryClientProvider client={new QueryClient()}>
          <AppProvider repo={envuelto}>
            <SincronizadorCola almacen={s} repo={repoBase} />
          </AppProvider>
        </QueryClientProvider>
      )
      await act(async () => { await new Promise(r => setTimeout(r, 50)) })
      expect(llamadas).toEqual([])
      const { cargarCola } = await import('../src/sync/colaEscrituras')
      expect((await cargarCola(s)).length).toBe(1)
    } finally {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => originalOnLine })
    }
  })
})

type TableName = import('../src/sheets/tables').TableName
