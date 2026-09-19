import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from 'vitest'
import { createRepository } from '../src/data/repository'
import { SheetsApi } from '../src/sheets/api'
import { localStorageAdapter, KEYS } from '../src/data/storage'
import { DriveApi } from '../src/drive/api'

const server = { listen: () => {}, resetHandlers: () => {}, close: () => {} }
const http = {
  post: (url: string, handler: any) => {},
  get: (url: string, handler: any) => {}
}
const HttpResponse = {
  json: (data: any) => data
}

afterEach(() => vi.unstubAllGlobals())

function memoryStorage() {
  const m = new Map<string, string>()
  return { get: async (k: string) => m.get(k) ?? null, set: async (k: string, v: string) => void m.set(k, v), remove: async (k: string) => void m.delete(k) }
}

describe('Cross-device spreadsheet sync via appData', () => {
  it('Device A links sheet → Device B boots and gets same sheet', async () => {
    let appDataConfig: { spreadsheetId: string } | null = null
    const calledUrls: string[] = []

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url)
      calledUrls.push(u)

      // Device A: saveAppConfig
      if (u.includes('upload/drive/v3/files')) {
        const text = String(init?.body ?? '')
        if (text.includes('ft_config.json')) {
          const match = text.match(/"spreadsheetId"\s*:\s*"([^"]+)"/)
          if (match) appDataConfig = { spreadsheetId: match[1] }
        }
        return { ok: true, status: 200, json: async () => ({ id: 'CONFIG_FILE_ID' }) }
      }

      // Device B: loadAppConfig - list files
      if (u.includes('drive/v3/files') && u.includes('spaces=appDataFolder') && !u.includes('CONFIG_FILE_ID')) {
        if (appDataConfig) {
          return { ok: true, status: 200, json: async () => ({ files: [{ id: 'CONFIG_FILE_ID' }] }) }
        }
        return { ok: true, status: 200, json: async () => ({ files: [] }) }
      }

      // Device B: loadAppConfig - get file content
      if (u.includes('drive/v3/files/CONFIG_FILE_ID')) {
        if (appDataConfig) {
          return { ok: true, status: 200, json: async () => (appDataConfig) }
        }
        return { ok: false, status: 404, text: async () => 'Not Found' }
      }

      // Sheets API for ensureTables - getSpreadsheet
      if (u === 'https://sheets.googleapis.com/v4/spreadsheets/SHARED_SPREADSHEET_123' || 
          u.startsWith('https://sheets.googleapis.com/v4/spreadsheets/SHARED_SPREADSHEET_123?')) {
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

      // Sheets API batchUpdate
      if (u.includes('sheets.googleapis.com/v4/spreadsheets/SHARED_SPREADSHEET_123:batchUpdate')) {
        return { ok: true, status: 200, json: async () => ({ replies: [] }) }
      }

      // Sheets API values:batchGet
      if (u.includes('sheets.googleapis.com/v4/spreadsheets/SHARED_SPREADSHEET_123/values:batchGet')) {
        return { ok: true, status: 200, json: async () => ({ valueRanges: [] }) }
      }

      return { ok: true, status: 200, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)

    // --- Device A: User links a new spreadsheet ---
    const apiA = new SheetsApi(async () => 'TOKEN_A')
    const repoA = createRepository({
      api: apiA,
      storage: memoryStorage(),
      getSpreadsheetId: async () => 'OLD_SHEET_A'
    })

    await repoA.conectarHojaPorId('SHARED_SPREADSHEET_123')
    expect(appDataConfig).toEqual({ spreadsheetId: 'SHARED_SPREADSHEET_123' })

    // --- Device B: Fresh browser, no localStorage ---
    const storageB = memoryStorage()

    const apiB = new SheetsApi(async () => 'TOKEN_B')
    const driveB = new DriveApi(async () => 'TOKEN_B')
    
    // Simulate App.tsx bootstrap logic
    let id = await storageB.get(KEYS.spreadsheetId)
    expect(id).toBeNull()

    const config = await driveB.loadAppConfig()
    expect(config).toEqual({ spreadsheetId: 'SHARED_SPREADSHEET_123' })

    id = config!.spreadsheetId
    await storageB.set(KEYS.spreadsheetId, id)

    // Device B now has the same spreadsheetId
    const repoB = createRepository({
      api: apiB,
      storage: storageB,
      getSpreadsheetId: async () => id
    })

    // Both devices now point to same spreadsheet
    const cfg = await repoB.getConfig()
    expect(cfg).toBeDefined()
  })
})