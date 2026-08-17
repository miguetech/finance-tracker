import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { createRepository, type Repository } from '../src/data/repository'
import { AppProvider, useClientes, useConfig, useDispositivos } from '../src/store/queries'
import { SheetsApi } from '../src/sheets/api'
import type { StorageAdapter } from '../src/data/storage'
import React from 'react'

beforeAll(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ valueRanges: [] }) })))
})
afterAll(() => vi.unstubAllGlobals())

function makeRepo(): Repository {
  const storage: StorageAdapter = { get: async () => null, set: async () => {}, remove: async () => {} }
  const api = new SheetsApi(async () => 'T')
  return createRepository({ api, storage, getSpreadsheetId: async () => 'S' })
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AppProvider repo={makeRepo()}>{children}</AppProvider>
)

describe('queries', () => {
  it('useClientes devuelve lista vacía', async () => {
    const { result } = renderHook(() => useClientes(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.clientes).toEqual([])
  })
  it('useConfig devuelve config default', async () => {
    const { result } = renderHook(() => useConfig(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.config?.prefijo_folio).toBe('FAC-')
  })
  it('useDispositivos devuelve lista vacía', async () => {
    const { result } = renderHook(() => useDispositivos(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.dispositivos).toEqual([])
  })
})
