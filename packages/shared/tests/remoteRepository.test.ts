import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRemoteRepository } from '../src/data/remoteRepository'

const fetchMock = vi.fn()

describe('createRemoteRepository', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  it('envía id_token y action; parsea data', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: [{ id: 1 }] }) })
    const repo = createRemoteRepository({ apiUrl: 'https://script.example/exec', getIdToken: async () => 'TOK' })
    const res = await repo.listClientes()
    expect(res).toEqual([{ id: 1 }])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://script.example/exec')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('text/plain')
    expect(init.body).toBe(JSON.stringify({ id_token: 'TOK', action: 'listClientes', payload: {} }))
  })
  it('lanza el error del backend', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: false, error: 'No tienes permiso' }) })
    const repo = createRemoteRepository({ apiUrl: 'https://script.example/exec', getIdToken: async () => 'TOK' })
    await expect(repo.deleteGasto('x')).rejects.toThrow('No tienes permiso')
  })
})
