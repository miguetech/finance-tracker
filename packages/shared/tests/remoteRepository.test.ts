import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRemoteRepository } from '../src/data/remoteRepository'

const fetchMock = vi.fn()

describe('createRemoteRepository', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  it('envía id_token y action por query (GET); parsea data', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: [{ id: 1 }] }) })
    const repo = createRemoteRepository({ apiUrl: 'https://script.example/exec', getIdToken: async () => 'TOK' })
    const res = await repo.listClientes()
    expect(res).toEqual([{ id: 1 }])
    const [url, init] = fetchMock.mock.calls[0]
    expect(init.method).toBe('GET')
    expect(url.startsWith('https://script.example/exec?')).toBe(true)
    const qs = new URLSearchParams(String(url.split('?')[1]))
    expect(qs.get('id_token')).toBe('TOK')
    expect(qs.get('action')).toBe('listClientes')
    expect(qs.get('payload')).toBe('{}')
  })
  it('lanza el error del backend', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: false, error: 'No tienes permiso' }) })
    const repo = createRemoteRepository({ apiUrl: 'https://script.example/exec', getIdToken: async () => 'TOK' })
    await expect(repo.deleteGasto('x')).rejects.toThrow('No tienes permiso')
  })
  it('con getSessionToken manda token y NO id_token', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: [] }) })
    const repo = createRemoteRepository({ apiUrl: 'https://script.example/exec', getIdToken: async () => 'TOK', getSessionToken: async () => 'SESS' })
    await repo.listClientes()
    const [url] = fetchMock.mock.calls[0]
    const qs = new URLSearchParams(String(url.split('?')[1]))
    expect(qs.get('token')).toBe('SESS')
    expect(qs.get('id_token')).toBeNull()
  })
  it('getSessionToken que devuelve null usa id_token', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: [] }) })
    const repo = createRemoteRepository({ apiUrl: 'https://script.example/exec', getIdToken: async () => 'TOK', getSessionToken: async () => null })
    await repo.listClientes()
    const [url] = fetchMock.mock.calls[0]
    const qs = new URLSearchParams(String(url.split('?')[1]))
    expect(qs.get('id_token')).toBe('TOK')
    expect(qs.get('token')).toBeNull()
  })
})
