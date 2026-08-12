import { describe, expect, it, vi } from 'vitest'
import { SheetsApi } from '../src/sheets/api'
import { createRepository } from '../src/data/repository'
import type { StorageAdapter } from '../src/data/storage'

function memoryStorage(seed: Record<string, string> = {}): StorageAdapter {
  const m = new Map<string, string>(Object.entries(seed))
  return {
    get: async k => m.get(k) ?? null,
    set: async (k, v) => void m.set(k, v),
    remove: async k => void m.delete(k)
  }
}

function fakeApi() {
  const tables = new Map<string, (string | number)[][]>()
  const requests: { range: string; values: (string | number)[][] }[] = []
  const read = async (url: string) => {
    const u = new URL(String(url))
    const ranges = (u.searchParams.get('ranges') ?? '').split(',').filter(Boolean)
    const valueRanges = ranges.map(r => {
      const sheet = r.split('!')[0].replace(/'/g, '')
      return { range: r, values: tables.get(sheet) ?? [] }
    })
    return { ok: true, json: async () => ({ valueRanges }) }
  }
  const write = async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { data: { range: string; values: (string | number)[][] }[] }
    for (const d of body.data) {
      const sheet = d.range.split('!')[0].replace(/'/g, '')
      requests.push(d)
      tables.set(sheet, d.values)
    }
    return { ok: true, json: async () => ({ responses: [] }) }
  }
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    if (u.includes('values:batchUpdate')) return write(u, init!)
    if (u.includes('values:batchGet')) return read(u)
    return { ok: true, json: async () => ({}) }
  })
  vi.stubGlobal('fetch', fetchMock)
  return { tables, requests, fetchMock }
}

function setup() {
  const f = fakeApi()
  const storage = memoryStorage()
  const api = new SheetsApi(async () => 'T')
  const repo = createRepository({ api, storage, getSpreadsheetId: async () => 'S' })
  return { ...f, storage, repo }
}

describe('repository', () => {
  it('config round-trip', async () => {
    const { repo } = setup()
    const cfg = await repo.getConfig()
    expect(cfg.prefijo_folio).toBe('FAC-')
    const updated = { ...cfg, empresa_nombre: 'X S.A.' }
    await repo.saveConfig(updated)
    expect((await repo.getConfig()).empresa_nombre).toBe('X S.A.')
  })

  it('createFactura asigna folio atómico FAC-001', async () => {
    const { repo } = setup()
    const cli = await repo.saveCliente({ nombre: 'ACME' } as never)
    const f = await repo.createFactura({
      id_cliente: cli.id_cliente,
      items: [{ descripcion: 'web', cantidad: 1, precio_unitario: 1000 }],
      fecha_emision: '2026-08-11',
      fecha_vencimiento: '',
      notas: ''
    })
    expect(f.folio).toBe('FAC-001')
    expect(f.total).toBe(1160)
    expect(f.saldo).toBe(1160)
    expect((f as unknown as { estado?: string }).estado ?? undefined).toBeUndefined()
  })

  it('segunda factura usa FAC-002', async () => {
    const { repo } = setup()
    const cli = await repo.saveCliente({ nombre: 'ACME' } as never)
    await repo.createFactura({ id_cliente: cli.id_cliente, items: [{ descripcion: 'a', cantidad: 1, precio_unitario: 1 }], fecha_emision: '2026-08-11', fecha_vencimiento: '', notas: '' })
    const f2 = await repo.createFactura({ id_cliente: cli.id_cliente, items: [{ descripcion: 'b', cantidad: 1, precio_unitario: 1 }], fecha_emision: '2026-08-12', fecha_vencimiento: '', notas: '' })
    expect(f2.folio).toBe('FAC-002')
  })

  it('registerPago reduce saldo y deja pagada', async () => {
    const { repo } = setup()
    const cli = await repo.saveCliente({ nombre: 'A' } as never)
    const f = await repo.createFactura({ id_cliente: cli.id_cliente, items: [{ descripcion: 'a', cantidad: 1, precio_unitario: 100 }], fecha_emision: '2026-08-11', fecha_vencimiento: '', notas: '' })
    await repo.registerPago({ tipo: 'cobro', id_origen: f.id_factura, fecha: '2026-08-12', monto: 116, metodo_pago: 'Transferencia', notas: '' })
    const [fx] = await repo.listFacturas({})
    expect(fx.saldo).toBe(0)
    const det = await repo.getFactura(f.id_factura)
    expect(det.factura.fecha_pago).toBe('2026-08-12')
  })

  it('registerPago rechaza monto mayor al saldo', async () => {
    const { repo } = setup()
    const cli = await repo.saveCliente({ nombre: 'A' } as never)
    const f = await repo.createFactura({ id_cliente: cli.id_cliente, items: [{ descripcion: 'a', cantidad: 1, precio_unitario: 100 }], fecha_emision: '2026-08-11', fecha_vencimiento: '', notas: '' })
    await expect(repo.registerPago({ tipo: 'cobro', id_origen: f.id_factura, fecha: '2026-08-12', monto: 999, metodo_pago: 'Efectivo', notas: '' })).rejects.toThrow(/saldo/i)
  })
})
