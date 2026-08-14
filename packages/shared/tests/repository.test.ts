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
  const grid = new Map<string, (string | number)[][]>()
  const requests: { range: string; values: (string | number)[][] }[] = []

  function cellRef(ref: string): { col: number; row: number } {
    const m = ref.match(/^([A-Z]+)(\d+)?$/)!
    let col = 0
    for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64)
    return { col, row: m[2] ? Number(m[2]) : NaN }
  }
  function sheetOf(range: string): string {
    return range.split('!')[0].replace(/'/g, '')
  }
  function writeCells(sheet: string, values: (string | number)[][], startRow: number, startCol: number) {
    const rows = grid.get(sheet) ?? []
    values.forEach((rowVals, di) => {
      const r = startRow - 1 + di
      while (rows.length <= r) rows.push([])
      rowVals.forEach((v, ci) => { rows[r][startCol - 1 + ci] = v })
    })
    grid.set(sheet, rows)
  }

  const read = async (url: string) => {
    const u = new URL(String(url))
    const ranges = (u.searchParams.get('ranges') ?? '').split(',').filter(Boolean)
    const valueRanges = ranges.map(r => ({ range: r, values: grid.get(sheetOf(r)) ?? [] }))
    return { ok: true, json: async () => ({ valueRanges }) }
  }

  const write = async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { data?: { range: string; values: (string | number)[][] }[]; values?: (string | number)[][] }
    const u = new URL(String(url))
    const path = decodeURIComponent(u.pathname)
    if (u.pathname.includes(':append')) {
      const range = path.split('/values/')[1].split(':append')[0]
      const a = cellRef(range.split('!')[1].split(':')[0])
      const rows = grid.get(sheetOf(range)) ?? []
      let r = a.row - 1
      while (r < rows.length && (rows[r] ?? []).some(v => v !== undefined && v !== '')) r++
      writeCells(sheetOf(range), body.values!, r + 1, a.col)
      return { ok: true, json: async () => ({}) }
    }
    if (u.pathname.includes(':clear')) {
      const range = path.split('/values/')[1].split(':clear')[0]
      const sheet = sheetOf(range)
      const a = cellRef(range.split('!')[1].split(':')[0])
      const rows = grid.get(sheet) ?? []
      grid.set(sheet, rows.slice(0, a.row - 1))
      return { ok: true, json: async () => ({}) }
    }
    for (const d of body.data ?? []) {
      const [a, b] = d.range.split('!')[1].split(':')
      const start = cellRef(a)
      const end = cellRef(b ?? a)
      requests.push(d)
      if (start.row === 1) {
        grid.set(sheetOf(d.range), d.values.map(row => row.slice(0, end.col)))
      } else {
        writeCells(sheetOf(d.range), d.values, start.row, start.col)
      }
    }
    return { ok: true, json: async () => ({ responses: [] }) }
  }

  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    if (u.includes('values:batchUpdate') || u.includes(':append') || u.includes(':clear')) return write(u, init!)
    if (u.includes('values:batchGet')) return read(u)
    return { ok: true, json: async () => ({}) }
  })
  vi.stubGlobal('fetch', fetchMock)
  return { grid, requests, fetchMock }
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

  it('createFactura expande plantilla en folio', async () => {
    const { repo } = setup()
    const cfg = await repo.getConfig()
    await repo.saveConfig({ ...cfg, prefijo_folio: 'FAC-{YYYY}-' })
    const cli = await repo.saveCliente({ nombre: 'ACME' } as never)
    const f = await repo.createFactura({
      id_cliente: cli.id_cliente,
      items: [{ descripcion: 'web', cantidad: 1, precio_unitario: 1000 }],
      fecha_emision: '2026-08-11',
      fecha_vencimiento: '',
      notas: ''
    })
    expect(f.folio).toBe('FAC-2026-001')
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
