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
})
