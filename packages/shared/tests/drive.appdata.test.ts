import { describe, it, expect, vi, afterEach } from 'vitest'
import { DriveApi } from '../src/drive/api'

afterEach(() => vi.unstubAllGlobals())

describe('DriveApi.saveAppConfig', () => {
  it('uploads ft_config.json to appDataFolder with multipart body', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} })
      if (String(url).includes('upload/drive/v3/files')) {
        return { ok: true, status: 200, json: async () => ({ id: 'FILE_ID' }) }
      }
      return { ok: true, status: 200, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const drive = new DriveApi(async () => 'TOKEN')
    await drive.saveAppConfig({ spreadsheetId: 'SPREADSHEET_123' })

    const upload = calls.find(c => c.url.includes('uploadType=multipart'))!
    expect(upload.url).toContain('uploadType=multipart')
    expect(upload.init.method).toBe('POST')
    const body = String(upload.init.body)
    expect(body).toContain('appDataFolder')
    expect(body).toContain('ft_config.json')
    expect(body).toContain('SPREADSHEET_123')
    expect(String(upload.init.headers?.['Content-Type'] ?? '')).toMatch(/multipart\/related; boundary=/)
    expect(String(upload.init.headers?.['Authorization'] ?? '')).toBe('Bearer TOKEN')
  })

  it('throws on non-2xx response', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 403, text: async () => 'Forbidden' }))
    vi.stubGlobal('fetch', fetchMock)

    const drive = new DriveApi(async () => 'TOKEN')
    await expect(drive.saveAppConfig({ spreadsheetId: 'X' })).rejects.toThrow('Drive API 403')
  })

  it('PATCH actualiza el archivo existente SIN parents (Drive 403 si va en update)', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} })
      const u = String(url)
      if (u.includes('/drive/v3/files?') && u.includes('spaces=appDataFolder')) {
        return { ok: true, status: 200, json: async () => ({ files: [{ id: 'CONFIG_FILE_ID' }] }) }
      }
      return { ok: true, status: 200, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const drive = new DriveApi(async () => 'TOKEN')
    await drive.saveAppConfig({ spreadsheetId: 'SPREADSHEET_NUEVA' })

    const patch = calls.find(c => c.init?.method === 'PATCH')!
    expect(patch.url).toContain('upload/drive/v3/files/CONFIG_FILE_ID')
    expect(patch.url).toContain('uploadType=multipart')
    const body = String(patch.init.body)
    expect(body).toContain('SPREADSHEET_NUEVA')
    expect(body).not.toContain('parents')
    expect(body).not.toContain('appDataFolder')
  })
})

describe('DriveApi.loadAppConfig', () => {
  it('returns config when ft_config.json exists in appDataFolder', async () => {
    let callCount = 0
    const fetchMock = vi.fn(async (url: string) => {
      callCount++
      const u = String(url)
      if (u.includes('/drive/v3/files?') && u.includes('spaces=appDataFolder')) {
        return { ok: true, status: 200, json: async () => ({ files: [{ id: 'CONFIG_FILE_ID' }] }) }
      }
      if (u.includes('/drive/v3/files/CONFIG_FILE_ID')) {
        return { ok: true, status: 200, json: async () => ({ spreadsheetId: 'SPREADSHEET_123' }) }
      }
      return { ok: true, status: 200, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const drive = new DriveApi(async () => 'TOKEN')
    const config = await drive.loadAppConfig()

    expect(config).toEqual({ spreadsheetId: 'SPREADSHEET_123' })
    expect(callCount).toBe(2)
  })

  it('returns null when ft_config.json not found', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('/drive/v3/files?') && u.includes('spaces=appDataFolder')) {
        return { ok: true, status: 200, json: async () => ({ files: [] }) }
      }
      return { ok: true, status: 200, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const drive = new DriveApi(async () => 'TOKEN')
    const config = await drive.loadAppConfig()
    expect(config).toBeNull()
  })

  it('returns null on 404 fetching file content', async () => {
    let callCount = 0
    const fetchMock = vi.fn(async (url: string) => {
      callCount++
      const u = String(url)
      if (u.includes('/drive/v3/files?') && u.includes('spaces=appDataFolder')) {
        return { ok: true, status: 200, json: async () => ({ files: [{ id: 'CONFIG_FILE_ID' }] }) }
      }
      if (u.includes('/drive/v3/files/CONFIG_FILE_ID')) {
        return { ok: false, status: 404, text: async () => 'Not Found' }
      }
      return { ok: true, status: 200, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const drive = new DriveApi(async () => 'TOKEN')
    const config = await drive.loadAppConfig()
    expect(config).toBeNull()
    expect(callCount).toBe(2)
  })
})

describe('DriveApi.borrarAppConfig', () => {
  it('borra ft_config.json de appDataFolder (escape del boot)', async () => {
    let borrado: string | null = null
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url)
      if (u.includes('/drive/v3/files?') && u.includes('spaces=appDataFolder')) {
        return { ok: true, status: 200, json: async () => ({ files: [{ id: 'CONFIG_FILE_ID' }] }) }
      }
      if (u.includes('/drive/v3/files/CONFIG_FILE_ID') && (init?.method ?? 'GET') === 'DELETE') {
        borrado = u
        return { ok: true, status: 204, json: async () => ({}) }
      }
      return { ok: true, status: 200, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const drive = new DriveApi(async () => 'TOKEN')
    await drive.borrarAppConfig()
    expect(borrado).toContain('drive/v3/files/CONFIG_FILE_ID')
  })

  it('no hace nada cuando no existe ft_config.json', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('/drive/v3/files?') && u.includes('spaces=appDataFolder')) {
        return { ok: true, status: 200, json: async () => ({ files: [] }) }
      }
      return { ok: true, status: 200, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const drive = new DriveApi(async () => 'TOKEN')
    await expect(drive.borrarAppConfig()).resolves.toBeUndefined()
  })
})