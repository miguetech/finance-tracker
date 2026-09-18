import { describe, expect, it, vi, afterEach, beforeAll } from 'vitest'
import { generateKeyPair, exportPKCS8 } from 'jose'
import { makeRepo } from '../src/index'
import type { Env } from '../src/env'

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets'

let privateKeyPem = 'fake-key'
beforeAll(async () => {
  const { privateKey } = await generateKeyPair('RS256', { extractable: true })
  privateKeyPem = await exportPKCS8(privateKey)
})

function envBase(overrides: Partial<Env> = {}): Env {
  return {
    OAUTH_CLIENT_ID: 'client-123',
    SERVICE_ACCOUNT_JSON: { client_email: 'sa@x.iam.gserviceaccount.com', private_key: privateKeyPem },
    SECRET_JWT: 'x',
    SPREADSHEET_ID: 'ENV_VEJO',
    OWNER_EMAIL: 'owner@ft.com',
    ...overrides
  } as Env
}

function stubFetch(rowsPorId: Record<string, (string | number)[][]>) {
  return vi.fn(async (url: string, _init?: RequestInit) => {
    const u = String(url)
    if (u.includes('oauth2.googleapis.com/token')) {
      return { ok: true, json: async () => ({ access_token: 't', expires_in: 3600 }) }
    }
    const m = u.match(new RegExp(`^${SHEETS}/([^/]+)/values:batchGet`))
    if (m) return { ok: true, json: async () => ({ valueRanges: [{ range: 'Sistema!A1:B500', values: rowsPorId[m[1]] ?? [] }] }) }
    if (u.includes(':batchUpdate')) return { ok: true, json: async () => ({}) }
    return { ok: false, status: 404, text: async () => 'x', json: async () => ({}) }
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('re-apuntado del backend (spec F6 §11.8)', () => {
  it('lee Sistema.ft_id en vez de confiar en SPREADSHEET_ID de env', async () => {
    const fetchMock = stubFetch({
      ENV_VEJO: [['ft_vers', '1'], ['ft_instancia', 'inst_X'], ['ft_id', 'BASE_NUEVO'], ['ft_estado', 'reemplazado']],
      BASE_NUEVO: [['ft_vers', '1'], ['ft_instancia', 'inst_X'], ['ft_id', 'BASE_NUEVO'], ['ft_estado', 'activo']]
    })
    vi.stubGlobal('fetch', fetchMock)
    const repo = makeRepo(envBase())
    const est = await repo.estadoAlmacenamiento()
    expect(est.baseId).toBe('BASE_NUEVO')
  })

  it('sin Sistema legible falla suave al id de env (fail-open)', async () => {
    const fetchMock = stubFetch({})
    vi.stubGlobal('fetch', fetchMock)
    const repo = makeRepo(envBase())
    const est = await repo.estadoAlmacenamiento()
    expect(est.baseId).toBe('ENV_VEJO')
  })
})