import { describe, it, expect, vi, afterEach } from 'vitest'
import { createRepository } from '../src/data/repository'
import { SheetsApi } from '../src/sheets/api'
import { localStorageAdapter, KEYS } from '../src/data/storage'
import { DriveApi } from '../src/drive/api'

afterEach(() => vi.unstubAllGlobals())

function memoryStorage() {
  const m = new Map<string, string>()
  return { get: async (k: string) => m.get(k) ?? null, set: async (k: string, v: string) => void m.set(k, v), remove: async (k: string) => void m.delete(k) }
}

describe('Repository.conectarHojaPorId syncs to appData', () => {
  it('saves spreadsheetId to appDataFolder after successful link', async () => {
    let appDataSaved = false
    const calledUrls: string[] = []
    
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url)
      calledUrls.push(u)
      
      // getSpreadsheet call - GET to sheets.googleapis.com/v4/spreadsheets/{id}
      if (u === 'https://sheets.googleapis.com/v4/spreadsheets/NEW_SHEET_1234567890' || 
          u.startsWith('https://sheets.googleapis.com/v4/spreadsheets/NEW_SHEET_1234567890?')) {
        return { 
          ok: true, 
          status: 200, 
          json: async () => ({ 
            sheets: [
              { properties: { title: 'Config', sheetId: 0, gridProperties: { columnCount: 2 } } },
              { properties: { title: 'Facturas', sheetId: 1, gridProperties: { columnCount: 20 } } },
              { properties: { title: 'Clientes', sheetId: 2, gridProperties: { columnCount: 15 } } }
            ] 
          }) 
        }
      }
      // batchUpdate calls (addSheets, gridBatchUpdate)
      if (u.includes('sheets.googleapis.com/v4/spreadsheets/NEW_SHEET_1234567890:batchUpdate')) {
        return { ok: true, status: 200, json: async () => ({ replies: [] }) }
      }
      // values:batchGet calls
      if (u.includes('sheets.googleapis.com/v4/spreadsheets/NEW_SHEET_1234567890/values:batchGet')) {
        return { ok: true, status: 200, json: async () => ({ valueRanges: [] }) }
      }
      // Drive API for appData
      if (u.includes('upload/drive/v3/files')) {
        appDataSaved = true
        return { ok: true, status: 200, json: async () => ({ id: 'CONFIG_FILE_ID' }) }
      }
      return { ok: true, status: 200, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const api = new SheetsApi(async () => 'TOKEN')
    const repo = createRepository({
      api,
      storage: memoryStorage(),
      getSpreadsheetId: async () => 'OLD_SHEET'
    })

    await repo.conectarHojaPorId('NEW_SHEET_1234567890')

    console.log('Called URLs:', calledUrls)
    expect(appDataSaved).toBe(true)
  })

  it('does not throw if appData save fails (non-blocking)', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url)
      // getSpreadsheet call - GET to sheets.googleapis.com/v4/spreadsheets/{id}
      if (u === 'https://sheets.googleapis.com/v4/spreadsheets/NEW_SHEET_1234567890' || 
          u.startsWith('https://sheets.googleapis.com/v4/spreadsheets/NEW_SHEET_1234567890?')) {
        return { 
          ok: true, 
          status: 200, 
          json: async () => ({ 
            sheets: [
              { properties: { title: 'Config', sheetId: 0, gridProperties: { columnCount: 2 } } }
            ] 
          }) 
        }
      }
      // batchUpdate calls (addSheets, gridBatchUpdate)
      if (u.includes('sheets.googleapis.com/v4/spreadsheets/NEW_SHEET_1234567890:batchUpdate')) {
        return { ok: true, status: 200, json: async () => ({ replies: [] }) }
      }
      // values:batchGet calls
      if (u.includes('sheets.googleapis.com/v4/spreadsheets/NEW_SHEET_1234567890/values:batchGet')) {
        return { ok: true, status: 200, json: async () => ({ valueRanges: [] }) }
      }
      // Drive API for appData - fail
      if (u.includes('upload/drive/v3/files')) {
        return { ok: false, status: 500, text: async () => 'Internal Server Error' }
      }
      return { ok: true, status: 200, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const api = new SheetsApi(async () => 'TOKEN')
    const repo = createRepository({
      api,
      storage: memoryStorage(),
      getSpreadsheetId: async () => 'OLD_SHEET'
    })

    // Should not throw
    await expect(repo.conectarHojaPorId('NEW_SHEET_1234567890')).resolves.toBeUndefined()
  })
})