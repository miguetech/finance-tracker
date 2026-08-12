import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { Facturas } from '../src/features/facturas/Facturas'
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

describe('Facturas', () => {
  it('renderiza botón nueva factura', () => {
    render(<Facturas />, { wrapper })
    expect(screen.getByText(/nueva factura/i)).toBeTruthy()
  })
})
