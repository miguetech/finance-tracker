import { describe, expect, it, vi, afterEach } from 'vitest'
import { DriveApi } from '../src/drive/api'
import { createRepository } from '../src/data/repository'
import { SheetsApi } from '../src/sheets/api'
import type { StorageAdapter } from '../src/data/storage'

function memoryStorage(): StorageAdapter {
  const m = new Map<string, string>()
  return { get: async k => m.get(k) ?? null, set: async (k, v) => void m.set(k, v), remove: async k => void m.delete(k) }
}

afterEach(() => vi.unstubAllGlobals())

describe('DriveApi', () => {
  it('uploadBase64 sube con multipart, hace público y devuelve URL', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} })
      if (String(url).includes('upload/drive/v3/files')) {
        return { ok: true, status: 200, json: async () => ({ id: 'FILE1' }) }
      }
      return { ok: true, status: 200, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const api = new DriveApi(async () => 'TOKEN')
    const res = await api.uploadBase64({ nombre: 'foto.png', mimeType: 'image/png', base64: 'aGVsbG8=' })

    expect(res).toEqual({ id: 'FILE1', url: 'https://lh3.googleusercontent.com/d/FILE1' })
    expect(calls).toHaveLength(2)

    const upload = calls[0]
    expect(upload.url).toContain('uploadType=multipart')
    expect(upload.init.method).toBe('POST')
    const body = String(upload.init.body)
    expect(body).toContain('"name":"foto.png"')
    expect(body).toContain('"mimeType":"image/png"')
    expect(body).toContain('aGVsbG8=')
    expect(String(upload.init.headers?.['Content-Type'] ?? '')).toMatch(/multipart\/related; boundary=/)
    expect(String(upload.init.headers?.['Authorization'] ?? '')).toBe('Bearer TOKEN')

    const perm = calls[1]
    expect(perm.url).toContain('drive/v3/files/FILE1/permissions')
    expect(JSON.parse(String(perm.init.body))).toEqual({ role: 'reader', type: 'anyone' })
  })

  it('quita el prefijo data: de un base64', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('upload/drive/v3/files')) {
        return { ok: true, status: 200, json: async () => ({ id: 'F' }) }
      }
      return { ok: true, status: 200, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)
    const api = new DriveApi(async () => 'T')
    await api.uploadBase64({ nombre: 'a', mimeType: 'image/webp', base64: 'data:image/webp;base64,YWJj' })
    const body = String((fetchMock.mock.calls[0][1] as RequestInit).body)
    expect(body).toContain('YWJj')
    expect(body).not.toContain('data:image/webp')
  })

  it('lanzar error si el archivo no devuelve id', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetchMock)
    const api = new DriveApi(async () => 'T')
    await expect(api.uploadBase64({ nombre: 'a', mimeType: 'image/png', base64: 'x' })).rejects.toThrow('no se obtuvo id')
  })

  it('saveAppConfig PATCHea el ft_config.json existente (no acumula copias)', async () => {
    const urls: string[] = []
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      const u = String(url)
      urls.push(u)
      if (u.includes('drive/v3/files?') && u.includes('appDataFolder')) {
        return { ok: true, status: 200, json: async () => ({ files: [{ id: 'CONFIG_EXISTENTE' }] }) }
      }
      return { ok: true, status: 200, json: async () => ({ id: 'X' }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    const api = new DriveApi(async () => 'T')
    await api.saveAppConfig({ spreadsheetId: 'S1' })
    expect(urls.some(u => u.includes('upload/drive/v3/files/CONFIG_EXISTENTE'))).toBe(true)
    expect(urls.some(u => u.includes('uploadType=multipart'))).toBe(true)
    const patch = fetchMock.mock.calls.find(c => String(c[0]).includes('CONFIG_EXISTENTE'))
    expect((patch?.[1] as RequestInit)?.method).toBe('PATCH')
  })

  it('saveAppConfig crea si no existe (POST)', async () => {
    const urls: string[] = []
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url)
      urls.push(u)
      if (u.includes('appDataFolder')) return { ok: true, status: 200, json: async () => ({ files: [] }) }
      return { ok: true, status: 200, json: async () => ({ id: 'NUEVO' }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    const api = new DriveApi(async () => 'T')
    await api.saveAppConfig({ spreadsheetId: 'S2' })
    const post = fetchMock.mock.calls.find(c => String(c[0]).includes('files?uploadType=multipart'))
    expect((post?.[1] as RequestInit)?.method).toBe('POST')
    expect(urls.some(u => u.includes('CONFIG'))).toBe(false)
  })

  it('findBases busca por huella ft_tipo=base (nunca por nombre)', async () => {
    let q = ''
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('drive/v3/files?')) {
        q = new URLSearchParams(u.split('?')[1]).get('q') ?? ''
      }
      return { ok: true, status: 200, json: async () => ({ files: [{ id: 'B1', name: 'Mis finanzas' }, { id: 'B2', name: 'Backup' }] }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    const api = new DriveApi(async () => 'T')
    const bases = await api.findBases()
    expect(bases.map(b => b.id)).toEqual(['B1', 'B2'])
    expect(q).toContain("appProperties has { key='ft_tipo' and value='base' }")
    expect(q).toContain("not (appProperties has { key='ft_estado' and value='reemplazado' })")
    expect(q).not.toContain("name=")
    expect(q).toContain('trashed=false')
  })

  it('findEventos busca por ft_tipo=eventos y ft_instancia', async () => {
    let q = ''
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('drive/v3/files?')) q = new URLSearchParams(u.split('?')[1]).get('q') ?? ''
      return { ok: true, status: 200, json: async () => ({ files: [{ id: 'E1', name: 'EVENTOS 2025' }] }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    const api = new DriveApi(async () => 'T')
    await api.findEventos('inst_abc')
    expect(q).toContain("appProperties has { key='ft_tipo' and value='eventos' }")
    expect(q).toContain("appProperties has { key='ft_instancia' and value='inst_abc' }")
  })

  it('setAppProperties hace PATCH de appProperties y getAppProperties los lee', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      const u = String(url)
      if (u.includes('files/B1?fields=appProperties')) {
        return { ok: true, status: 200, json: async () => ({ appProperties: { ft_tipo: 'base', ft_estado: 'activo' } }) }
      }
      return { ok: true, status: 200, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)
    const api = new DriveApi(async () => 'T')
    await api.setAppProperties('B1', { ft_tipo: 'base', ft_instancia: 'inst_1', ft_id: 'B1' })
    const patch = fetchMock.mock.calls[0]
    expect(String(patch[0])).toContain('drive/v3/files/B1')
    expect((patch[1] as RequestInit).method).toBe('PATCH')
    const props = await api.getAppProperties('B1')
    expect(props).toEqual({ ft_tipo: 'base', ft_estado: 'activo' })
  })
})

describe('Repository.uploadImagen', () => {
  it('delega en DriveApi usando el token del SheetsApi', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('upload/drive/v3/files')) {
        return { ok: true, status: 200, json: async () => ({ id: 'F1' }) }
      }
      if (u.includes('permissions')) {
        return { ok: true, status: 200, json: async () => ({}) }
      }
      return { ok: true, status: 200, json: async () => ({ valueRanges: [] }) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const api = new SheetsApi(async () => 'TOKEN_X')
    const repo = createRepository({ api, storage: memoryStorage(), getSpreadsheetId: async () => 'SID' })
    const url = await repo.uploadImagen({ nombre: 'logo.png', mimeType: 'image/png', base64: 'abc', modulo: 'configuracion' })
    expect(url).toBe('https://lh3.googleusercontent.com/d/F1')

    const upload = fetchMock.mock.calls[0]
    expect(String((upload[1] as RequestInit).headers?.['Authorization'] ?? '')).toBe('Bearer TOKEN_X')
  })
})