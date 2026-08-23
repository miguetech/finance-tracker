import React from 'react'
import { describe, expect, it, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EspejoProvider, useEspejo, TABLAS_CALIENTES_TTL_MS } from '../src/store/espejoContext'
import { crearStoreMemoria } from '../src/sync/stores/memoria'

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
      <EspejoProvider flag="off" store={crearStoreMemoria()} fetchTable={async () => []}>
        <Probe />
      </EspejoProvider>
    )
    expect(screen.getByText('off')).toBeTruthy()
  })

  it('con flag on, sincronizarAhora actualiza ultimoPull', async () => {
    renderConCliente(
      <EspejoProvider flag="on" store={crearStoreMemoria()} fetchTable={async () => []}>
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
})
