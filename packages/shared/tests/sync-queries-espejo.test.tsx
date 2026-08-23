import React from 'react'
import { describe, expect, it, afterEach } from 'vitest'
import { render, screen, act, cleanup, waitFor } from '@testing-library/react'
import { AppProvider, useClientes } from '../src/store/queries'
import type { Repository } from '../src/data/repository'
import { EspejoProvider, useEspejo } from '../src/store/espejoContext'
import { crearStoreMemoria } from '../src/sync/stores/memoria'
import type { TableName } from '../src/sheets/tables'

afterEach(() => cleanup())

const repoFalso = {
  listClientes: async () => [{ id_cliente: 'c1', nombre: 'DesdeRepo' }],
  saveCliente: async () => {},
  deleteCliente: async () => {}
} as unknown as Repository

function Probe() {
  const { clientes } = useClientes()
  const { sincronizarAhora } = useEspejo()
  return (
    <button onClick={() => void sincronizarAhora(['Clientes'])}>
      {clientes.map(c => c.nombre).join(',') || '(vacío)'}
    </button>
  )
}

describe('lecturas UI desde el espejo', () => {
  it('con flag on lee Clientes del espejo y se refresca al invalidar la tabla', async () => {
    const fuente: { filas: Record<string, string>[] } = { filas: [] }
    const fetchTable = async (t: TableName) => (t === 'Clientes' ? fuente.filas : [])
    render(
      <AppProvider repo={repoFalso}>
        <EspejoProvider flag="on" store={crearStoreMemoria()} fetchTable={fetchTable}>
          <Probe />
        </EspejoProvider>
      </AppProvider>
    )
    // Primer pull: espejo vacío → lista vacía leída del espejo (no del repo).
    await waitFor(() => expect(screen.getByRole('button').textContent).toBe('(vacío)'))
    // Cambio externo en Sheets + pull dirigido → onCambio invalida la query.
    await act(async () => { fuente.filas = [{ id_cliente: 'c1', nombre: 'Ana' }] })
    await act(async () => { await screen.getByRole('button').click() })
    await waitFor(() => expect(screen.getByRole('button').textContent).toBe('Ana'))
  })

  it('con flag off sigue leyendo del repositorio (Sheets)', async () => {
    render(
      <AppProvider repo={repoFalso}>
        <EspejoProvider flag="off" store={crearStoreMemoria()}>
          <Probe />
        </EspejoProvider>
      </AppProvider>
    )
    await waitFor(() => expect(screen.getByRole('button').textContent).toBe('DesdeRepo'))
  })
})
