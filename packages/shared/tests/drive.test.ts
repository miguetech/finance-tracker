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
        return { ok: true, status: 200, json: async () => ({ id: 'FILE1', webContentLink: 'https://drive.example/img' }) }
      }
      return { ok: true, status: 200, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const api = new DriveApi(async () => 'TOKEN')
    const res = await api.uploadBase64({ nombre: 'foto.png', mimeType: 'image/png', base64: 'aGVsbG8=' })

    expect(res).toEqual({ id: 'FILE1', url: 'https://drive.example/img' })
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
        return { ok: true, status: 200, json: async () => ({ id: 'F', webContentLink: 'https://drive.example/x' }) }
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
})

describe('Repository.uploadImagen', () => {
  it('delega en DriveApi usando el token del SheetsApi', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('upload/drive/v3/files')) {
        return { ok: true, status: 200, json: async () => ({ id: 'F1', webContentLink: 'https://drive.example/logo' }) }
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
    expect(url).toBe('https://drive.example/logo')

    const upload = fetchMock.mock.calls[0]
    expect(String((upload[1] as RequestInit).headers?.['Authorization'] ?? '')).toBe('Bearer TOKEN_X')
  })
})