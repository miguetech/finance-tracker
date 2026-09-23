import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { Configuracion } from '../src/features/settings/Configuracion'
import { AppProvider } from '../src/store/queries'
import { createRepository } from '../src/data/repository'
import { SheetsApi } from '../src/sheets/api'

beforeAll(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ valueRanges: [] }) })))
})
afterAll(() => vi.unstubAllGlobals())

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const repo = createRepository({ api: new SheetsApi(async () => 'T'), storage: { get: async () => null, set: async () => {}, remove: async () => {} }, getSpreadsheetId: async () => 'S' })
  return <AppProvider repo={repo}>{children}</AppProvider>
}

describe('Configuracion', () => {
  it('renderiza sección de empresa', async () => {
    render(<Configuracion />, { wrapper })
    expect(await screen.findByText(/datos de la empresa/i)).toBeTruthy()
  })
  it('muestra el select de tipo de documento', async () => {
    render(<Configuracion />, { wrapper })
    expect(await screen.findByText(/tipo de documento/i)).toBeTruthy()
    expect(screen.getAllByText('RFC').length).toBeGreaterThan(0)
  })
})
