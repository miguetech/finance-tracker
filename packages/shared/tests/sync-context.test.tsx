import React from 'react'
import { describe, expect, it, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EspejoProvider, useEspejo, TABLAS_CALIENTES_TTL_MS } from '../src/store/espejoContext'
import { AppProvider, useRepo } from '../src/store/queries'
import type { Repository } from '../src/data/repository'
import type { StorageAdapter } from '../src/data/storage'
import { crearStoreMemoria } from '../src/sync/stores/memoria'

function memoriaKv(): StorageAdapter {
  const mapa = new Map<string, string>()
  return { get: async k => mapa.get(k) ?? null, set: async (k, v) => { mapa.set(k, v) }, remove: async k => { mapa.delete(k) } }
}

function BotonGuardar({ repo }: { repo: Repository }) {
  return <button onClick={() => void repo.saveCliente({ nombre: 'Ana Local' } as never)}>guardar</button>
}

function Probe() {
  const { activo, ultimoPull, sincronizarAhora } = useEspejo()
  return <button onClick={() => void sincronizarAhora()}>{activo ? `on:${ultimoPull > 0}` : 'off'}</button>
}

function renderConCliente(ui: React.ReactElement) {
  return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>)
}

afterEach(() => cleanup())

describe('EspejoProvider', () => {
  it('con flag off queda inactivo (ruta directa a Sheets)', () => {
    renderConCliente(
      <EspejoProvider flag="off" store={crearStoreMemoria()} fetchTablas={async () => ({})}>
        <Probe />
      </EspejoProvider>
    )
    expect(screen.getByText('off')).toBeTruthy()
  })

  it('con flag on, sincronizarAhora actualiza ultimoPull', async () => {
    renderConCliente(
      <EspejoProvider flag="on" store={crearStoreMemoria()} fetchTablas={async () => ({})}>
        <Probe />
      </EspejoProvider>
    )
    const btn = screen.getByRole('button')
    await act(async () => { btn.click() })
    expect(btn.textContent).toMatch(/^on:true$/)
  })

  it('TTL exportado = 60000 ms', () => {
    expect(TABLAS_CALIENTES_TTL_MS).toBe(60_000)
  })

  it('escritura encolada offline aplica el eco al espejo local', async () => {
    const { conColaEscrituras, TABLAS_POR_METODO } = await import('../src/sync/colaEscrituras')
    type Repo = Parameters<typeof conColaEscrituras>[0]
    const repoFalso = { saveCliente: async (c: unknown) => c } as unknown as Repo
    const almacenMemoria = crearStoreMemoria()
    const repo = conColaEscrituras(repoFalso, { storage: memoriaKv(), activo: () => true })
    renderConCliente(
      <AppProvider repo={repo}>
        <EspejoProvider flag="on" store={almacenMemoria} fetchTablas={async () => ({})}>
          <BotonGuardar repo={repo} />
        </EspejoProvider>
      </AppProvider>
    )
    const btn = screen.getByRole('button')
    await act(async () => { btn.click() })
    // Espera a que el eco se aplique al store del espejo.
    for (let i = 0; i < 50 && !(await almacenMemoria.getAllRows('Clientes')).length; i++) {
      await new Promise(r => setTimeout(r, 10))
    }
    const filas = await almacenMemoria.getAllRows('Clientes')
    expect(filas).toHaveLength(1)
    expect(filas[0].nombre).toBe('Ana Local')
    void TABLAS_POR_METODO
  })
})
