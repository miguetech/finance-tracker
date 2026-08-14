import { describe, expect, it, vi } from 'vitest'
import { TABLES, sheetName } from '../src/sheets/tables'
import { serializeRow, deserializeRow } from '../src/sheets/rows'
import { SheetsApi } from '../src/sheets/api'
import { createInitialSpreadsheet, ensureTables } from '../src/sheets/createSpreadsheet'

describe('tables', () => {
  it('define esquema de 11 tablas', () => {
    const names = Object.keys(TABLES)
    expect(names).toHaveLength(11)
    expect(sheetName('Facturas')).toBe('Facturas')
  })
  it('Factura incluye saldo', () => {
    const keys = TABLES.Facturas.map(c => c.key)
    expect(keys).toContain('saldo')
  })
})

describe('rows', () => {
  it('serializa y deserializa redondo', () => {
    const obj = { id_factura: 'fac_1', total: 100.5, fecha_emision: '2026-08-11', nombre: 'ACME' }
    const row = serializeRow(TABLES.Facturas, obj)
    const back = deserializeRow(TABLES.Facturas, row)
    expect(back.id_factura).toBe('fac_1')
    expect(back.total).toBe(100.5)
    expect(back.fecha_emision).toBe('2026-08-11')
  })
  it('deserialize convierte numeros', () => {
    const back = deserializeRow(TABLES.Facturas, ['fac_1', 'FAC-1', 'c1', 'A', '2026-08-11', '', 100, 16, 116, 50, '', ''])
    expect(back.total).toBe(116)
    expect(back.saldo).toBe(50)
  })
  it('deserialize convierte numeros inválidos a 0', () => {
    const back = deserializeRow(TABLES.Facturas, ['fac_1', 'FAC-1', 'c1', 'A', '2026-08-11', '', 100, 16, 116, 'abc', '', ''])
    expect(back.saldo).toBe(0)
  })
})

describe('api', () => {
  it('batchGet parsea filas por rango', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const u = new URL(String(url))
      const ranges = (u.searchParams.get('ranges') ?? '').split(',').filter(Boolean)
      const data: Record<string, { values?: (string | number)[][] }> = {}
      for (const r of ranges) data[r] = { values: [['a'], ['b']] }
      return { ok: true, json: async () => ({ valueRanges: Object.entries(data).map(([range, x]) => ({ range, values: x.values })) }) } as Response
    })
    vi.stubGlobal('fetch', fetchMock)
    const api = new SheetsApi(async () => 'TOKEN')
    const res = await api.batchGet('SHEET1', ['A1:A2', 'B1:B2'])
    expect(res['A1:A2']).toEqual([['a'], ['b']])
    expect(res['B1:B2']).toEqual([['a'], ['b']])
    vi.unstubAllGlobals()
  })
  it('createSpreadsheet crea con titulo', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ({ ok: true, json: async () => ({ spreadsheetId: 'NEWID', spreadsheetUrl: 'http://x' }) }) as Response)
    vi.stubGlobal('fetch', fetchMock)
    const api = new SheetsApi(async () => 'T')
    const r = await api.createSpreadsheet('FinanceTracker')
    expect(r.spreadsheetId).toBe('NEWID')
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain('FinanceTracker')
    vi.unstubAllGlobals()
  })
})

describe('createInitialSpreadsheet', () => {
  it('crea hoja y escribe config default', async () => {
    const requests: { url: string; init: RequestInit }[] = []
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      requests.push({ url: String(url), init: init ?? ({} as RequestInit) })
      if (String(url).includes('values:batchUpdate')) {
        return { ok: true, json: async () => ({ responses: [] }) } as Response
      }
      if (String(url).includes(':batchUpdate')) {
        return { ok: true, json: async () => ({ replies: body.requests.map((_: unknown, i: number) => ({ addSheet: { properties: { sheetId: i } } })) }) } as Response
      }
      return { ok: true, json: async () => ({ spreadsheetId: 'NEWID', spreadsheetUrl: 'http://x' }) } as Response
    })
    vi.stubGlobal('fetch', fetchMock)
    const api = new SheetsApi(async () => 'T')
    const r = await createInitialSpreadsheet(api)
    expect(r.spreadsheetId).toBe('NEWID')
    expect(requests.some(rq => rq.url.includes(':batchUpdate') && rq.init.body)).toBe(true)
    vi.unstubAllGlobals()
  })
})

describe('ensureTables', () => {
  it('crea la hoja Empleados faltante con headers', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? ({} as RequestInit) })
      const u = String(url)
      if (u.includes('values:batchUpdate')) return { ok: true, json: async () => ({ responses: [] }) } as Response
      if (u.includes(':batchUpdate')) return { ok: true, json: async () => ({ replies: [] }) } as Response
      const existing = ['Config', 'Clientes', 'Facturas', 'Factura_Items', 'Gastos', 'Proveedores', 'Cuentas_Pagar', 'Pagos', 'Metas', 'Usuarios']
      return { ok: true, json: async () => ({ sheets: existing.map(title => ({ properties: { title } })) }) } as Response
    })
    vi.stubGlobal('fetch', fetchMock)
    const api = new SheetsApi(async () => 'T')
    await ensureTables(api, 'SID')
    const addSheets = calls.filter(c => c.url.includes(':batchUpdate') && !c.url.includes('values:batchUpdate'))
    expect(addSheets.length).toBe(1)
    const body = JSON.parse(String(addSheets[0].init?.body)) as { requests: { addSheet: { properties: { title: string } } }[] }
    expect(body.requests.map(r => r.addSheet.properties.title)).toEqual(['Empleados'])
    const headerWrites = calls.filter(c => c.url.includes('values:batchUpdate'))
    expect(headerWrites.length).toBe(1)
    expect(String(headerWrites[0].init?.body)).toContain('id_empleado')
    vi.unstubAllGlobals()
  })

  it('no hace nada si todas las hojas existen', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('values:batchUpdate')) return { ok: true, json: async () => ({ responses: [] }) } as Response
      if (u.includes(':batchUpdate')) return { ok: true, json: async () => ({ replies: [] }) } as Response
      return { ok: true, json: async () => ({ sheets: Object.keys(TABLES).map(title => ({ properties: { title } })) }) } as Response
    })
    vi.stubGlobal('fetch', fetchMock)
    const api = new SheetsApi(async () => 'T')
    await ensureTables(api, 'SID')
    expect(fetchMock.mock.calls.some(c => String(c[0]).includes('values:batchUpdate'))).toBe(false)
    vi.unstubAllGlobals()
  })
})

describe('Usuarios', () => {
  it('serializa y deserializa una fila de Usuarios', () => {
    const spec = TABLES.Usuarios
    const row = serializeRow(spec, { email: 'a@b.c', rol: 'asistente', modulos_ver: 'facturas', modulos_editar: 'gastos' })
    expect(row).toEqual(['a@b.c', 'asistente', 'facturas', 'gastos'])
    const obj = deserializeRow(spec, row)
    expect(obj).toMatchObject({ email: 'a@b.c', rol: 'asistente', modulos_ver: 'facturas', modulos_editar: 'gastos' })
  })
})
