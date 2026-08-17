import { describe, expect, it, vi } from 'vitest'
import { TABLES } from '../src/sheets/tables'
import { createRepository } from '../src/data/repository'
import { SheetsApi } from '../src/sheets/api'
import type { StorageAdapter } from '../src/data/storage'
import { configFromRows } from '../src/sheets/createSpreadsheet'
import { parseRates, rateFor, convert, toBase, activeCurrencies, parseCustomCurrencies } from '../src/currency'
import { formatMoney } from '../src/currency'
import { CURRENCIES } from '../src/currency/catalog'
import type { Config } from '../src/types/entities'

function memoryStorage(): StorageAdapter {
  const m = new Map<string, string>()
  return { get: async k => m.get(k) ?? null, set: async (k, v) => void m.set(k, v), remove: async k => void m.delete(k) }
}

function fakeApi(seed: Record<string, (string | number)[][]> = {}) {
  const grid = new Map<string, (string | number)[][]>(Object.entries(seed))
  function cellRef(ref: string): { col: number; row: number } {
    const m = ref.match(/^([A-Z]+)(\d+)?$/)!
    let col = 0
    for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64)
    return { col, row: m[2] ? Number(m[2]) : NaN }
  }
  function sheetOf(range: string): string { return range.split('!')[0].replace(/'/g, '') }
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
    if (path.includes(':append')) {
      const range = path.split('/values/')[1].split(':append')[0]
      const a = cellRef(range.split('!')[1].split(':')[0])
      const rows = grid.get(sheetOf(range)) ?? []
      let r = a.row - 1
      while (r < rows.length && (rows[r] ?? []).some(v => v !== undefined && v !== '')) r++
      writeCells(sheetOf(range), body.values!, r + 1, a.col)
      return { ok: true, json: async () => ({}) }
    }
    if (path.includes(':clear')) {
      const range = path.split('/values/')[1].split(':clear')[0]
      const sheet = sheetOf(range)
      const a = cellRef(range.split('!')[1].split(':')[0])
      grid.set(sheet, (grid.get(sheet) ?? []).slice(0, a.row - 1))
      return { ok: true, json: async () => ({}) }
    }
    for (const d of body.data ?? []) {
      const [a, b] = d.range.split('!')[1].split(':')
      const start = cellRef(a)
      const end = cellRef(b ?? a)
      if (start.row === 1) grid.set(sheetOf(d.range), d.values.map(row => row.slice(0, end.col)))
      else writeCells(sheetOf(d.range), d.values, start.row, start.col)
    }
    return { ok: true, json: async () => ({ responses: [] }) }
  }
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    if (u.includes('values:batchUpdate') || u.includes(':append') || u.includes(':clear')) return write(u, init!)
    return read(u)
  })
  vi.stubGlobal('fetch', fetchMock)
  return { grid, fetchMock }
}

function makeRepo(_f: { grid: Map<string, (string | number)[][]> }) {
  const api = new SheetsApi(async () => 'T')
  return createRepository({ api, storage: memoryStorage(), getSpreadsheetId: async () => 'SID' })
}

function cfg(overrides: Partial<Config> = {}): Config {
  return {
    empresa_nombre: 'E', empresa_rfc: '', empresa_direccion: '', empresa_telefono: '', empresa_email: '', empresa_logo: '',
    empresa_cp: '', empresa_ciudad: '', empresa_pais: '', prefijo_folio: 'FAC-', contador_folio: 1, moneda: 'USD', iva_porcentaje: 16,
    categorias_gastos: '', categorias_cxp: '', categorias_inventario: '', monedas_activas: '', monedas_custom: '', tasas_cambio: '', metodos_pago: 'Efectivo,Transferencia,Tarjeta',
    tipo_doc: 'RFC', tipo_doc_etiqueta: '', share_backend_url: '', ...overrides
  }
}

describe('tasas de cambio', () => {
  it('parseRates lee JSON válido', () => {
    const r = parseRates('{"base":"USD","fecha":"2026-08-15","rates":{"VES":73.5,"MXN":18.2}}')
    expect(r?.base).toBe('USD')
    expect(r?.rates.VES).toBe(73.5)
  })
  it('parseRates devuelve null si no es JSON válido', () => {
    expect(parseRates('')).toBeNull()
    expect(parseRates('nope')).toBeNull()
  })
  it('rateFor: 1 USD = 73.5 VES y 1 VES = 1/73.5 USD', () => {
    const c = cfg({ tasas_cambio: '{"base":"USD","fecha":"2026-08-15","rates":{"VES":73.5}}' })
    expect(rateFor(c, 'USD', 'VES')).toBe(73.5)
    expect(rateFor(c, 'VES', 'USD')).toBeCloseTo(1 / 73.5)
    expect(rateFor(c, 'USD', 'USD')).toBe(1)
  })
  it('convert redondea a decimales de la moneda destino', () => {
    const c = cfg({ tasas_cambio: '{"base":"USD","fecha":"2026-08-15","rates":{"VES":73.5}}' })
    expect(convert(10, 'USD', 'VES', c)).toBe(735)
    expect(convert(735, 'VES', 'USD', c)).toBe(10)
  })
  it('toBase convierte usando tipo_cambio guardado', () => {
    expect(toBase(735, 73.5)).toBe(10)
    expect(toBase(100, 0)).toBe(100)
  })
  it('activeCurrencies filtra por monedas_activas', () => {
    const all = activeCurrencies(cfg({ monedas_activas: 'USD,VES' }))
    expect(all.map(c => c.code)).toEqual(['USD', 'VES'])
    const empty = activeCurrencies(cfg())
    expect(empty.length).toBeGreaterThanOrEqual(10)
  })
  it('parseCustomCurrencies + formatMoney fallback para código no-ISO', () => {
    const customs = parseCustomCurrencies('[{"code":"VED","symbol":"Bs.","decimals":2}]')
    expect(customs[0].code).toBe('VED')
    const s = formatMoney(1234.5, 'XYZ')
    expect(s).toContain('1,234')
  })
  it('catálogo incluye VES (bolívar)', () => {
    expect(CURRENCIES.map(c => c.code)).toContain('VES')
  })
})

describe('configFromRows multi-moneda e IVA 0', () => {
  it('lee IVA 0 y no lo reemplaza por default', () => {
    const c = configFromRows([['iva_porcentaje', '0'], ['contador_folio', '0']])
    expect(c.iva_porcentaje).toBe(0)
    expect(c.contador_folio).toBe(0)
  })
  it('lee tasas_cambio y categorias_inventario', () => {
    const c = configFromRows([['tasas_cambio', '{"base":"USD"}'], ['categorias_inventario', 'Frutas,Verduras']])
    expect(c.tasas_cambio).toContain('USD')
    expect(c.categorias_inventario).toBe('Frutas,Verduras')
  })
})

describe('inventario repository', () => {
  it('saveProducto asigna uid y guarda con nombre_proveedor', async () => {
    const f = fakeApi({ Proveedores: [[], ['prov_1', 'Don Ramón', '', '', '0412-555', '', '2026-08-01']] })
    const repo = makeRepo(f)
    const p = await repo.saveProducto({ nombre: 'Tomate', id_proveedor: 'prov_1' } as never)
    expect(p.id_producto).toMatch(/^prod_/)
    expect(p.nombre_proveedor).toBe('Don Ramón')
    const rows = f.grid.get('Productos') ?? []
    expect(rows.some(r => r[1] === 'Tomate')).toBe(true)
  })

  it('registrarMovimiento entrada sube stock y salida lo baja', async () => {
    const f = fakeApi({ Productos: [[], ['prod_1', 'Tomate', 'Frutas', 'kg', 10, 5, 2, 4, 'prov_1', 'Don Ramón', '', 'true', '2026-08-01']] })
    const repo = makeRepo(f)
    await repo.registrarMovimiento({ id_producto: 'prod_1', tipo: 'entrada', cantidad: 20, motivo: 'compra', id_proveedor: 'prov_1', fecha: '2026-08-15' })
    let stock = f.grid.get('Productos')![1][4]
    expect(stock).toBe(30)
    await repo.registrarMovimiento({ id_producto: 'prod_1', tipo: 'salida', cantidad: 5, motivo: 'venta', id_proveedor: '', fecha: '2026-08-15' })
    stock = f.grid.get('Productos')![1][4]
    expect(stock).toBe(25)
    const movs = f.grid.get('Movimientos_Stock') ?? []
    expect(movs.filter(r => r.some(v => v !== ''))).toHaveLength(2)
  })

  it('salida con stock insuficiente lanza error', async () => {
    const f = fakeApi({ Productos: [[], ['prod_1', 'Tomate', '', 'kg', 2, 5, 1, 3, '', '', '', 'true', '']] })
    const repo = makeRepo(f)
    await expect(repo.registrarMovimiento({ id_producto: 'prod_1', tipo: 'salida', cantidad: 9, motivo: '', id_proveedor: '', fecha: '2026-08-15' })).rejects.toThrow(/insuficiente/)
  })

  it('ajuste fija stock exacto', async () => {
    const f = fakeApi({ Productos: [[], ['prod_1', 'Tomate', '', 'kg', 2, 5, 1, 3, '', '', '', 'true', '']] })
    const repo = makeRepo(f)
    await repo.registrarMovimiento({ id_producto: 'prod_1', tipo: 'ajuste', cantidad: 8, motivo: 'conteo', id_proveedor: '', fecha: '2026-08-15' })
    expect(f.grid.get('Productos')![1][4]).toBe(8)
  })

  it('listProductos enriquece nombre_proveedor', async () => {
    const f = fakeApi({ Productos: [[], ['prod_1', 'Tomate', '', 'kg', 1, 5, 1, 3, 'prov_1', '', '', 'true', '']], Proveedores: [[], ['prov_1', 'Don Ramón', '', '', '', '', '']] })
    const repo = makeRepo(f)
    const list = await repo.listProductos()
    expect(list[0].nombre_proveedor).toBe('Don Ramón')
  })
})

describe('moneda en registros', () => {
  it('createFactura guarda moneda y tipo_cambio', async () => {
    const f = fakeApi({ Clientes: [[], ['c1', 'Ana', '', '', '', '', '']] })
    const repo = makeRepo(f)
    await repo.saveConfig(cfg({ tasas_cambio: '{"base":"USD","fecha":"2026-08-15","rates":{"VES":73.5}}' }))
    const fac = await repo.createFactura({ id_cliente: 'c1', items: [{ descripcion: 'x', cantidad: 1, precio_unitario: 100 }], fecha_emision: '2026-08-15', fecha_vencimiento: '', notas: '', moneda: 'VES' })
    expect(fac.moneda).toBe('VES')
    expect(fac.tipo_cambio).toBe(73.5)
  })

  it('registerPago guarda moneda del origen', async () => {
    const f = fakeApi({ Facturas: [[], ['f1', 'FAC-001', 'c1', 'Ana', '2026-08-15', '', 100, 0, 100, 100, '', '', 'VES', 73.5]] })
    const repo = makeRepo(f)
    await repo.registerPago({ tipo: 'cobro', id_origen: 'f1', fecha: '2026-08-15', monto: 40, metodo_pago: 'Efectivo', notas: '' })
    const pagos = f.grid.get('Pagos') ?? []
    const pago = pagos.find(r => r[0]?.toString().startsWith('pag_'))
    expect(pago).toBeTruthy()
    expect(pago![7]).toBe('VES')
    expect(pago![8]).toBe(73.5)
    expect(f.grid.get('Facturas')![1][9]).toBe(60)
  })

  it('kpis convierte montos de otra moneda a base', async () => {
    const { kpisForMonth } = await import('../src/calc/kpis')
    const { round2 } = await import('../src/calc/invoice')
    const k = kpisForMonth(
      [{ id_factura: 'f1', folio: 'F', id_cliente: 'c1', nombre_cliente: 'A', fecha_emision: '2026-08-01', fecha_vencimiento: '', subtotal: 0, iva: 0, total: 735, saldo: 735, fecha_pago: '', notas: '', moneda: 'VES', tipo_cambio: 73.5 } as never],
      [], [], [], '2026-08')
    expect(k.facturado).toBe(round2(735 / 73.5))
  })
})

describe('esquema tablas inventario', () => {
  it('TABLES incluye Productos y Movimientos_Stock', () => {
    expect(TABLES.Productos.map(c => c.key)).toEqual(['id_producto', 'nombre', 'categoria', 'unidad', 'stock', 'stock_minimo', 'precio_costo', 'precio_venta', 'id_proveedor', 'nombre_proveedor', 'notas', 'activo', 'fecha_registro'])
    expect(TABLES.Movimientos_Stock.map(c => c.key)).toEqual(['id_movimiento', 'id_producto', 'tipo', 'cantidad', 'motivo', 'id_proveedor', 'fecha'])
  })
})

describe('edición de factura', () => {
  const seed = {
    Clientes: [[], ['c1', 'Ana', '', '', '', '', '']],
    Facturas: [[], ['f1', 'FAC-001', 'c1', 'Ana', '2026-08-01', '', 100, 16, 116, 116, '', '', 'USD', 1, '', '']],
    Factura_Items: [[], ['f1', 'a', 1, 100, 100]]
  }
  it('updateFactura recalcula totales, ajusta saldo y marca editada', async () => {
    const f = fakeApi(seed)
    const repo = makeRepo(f)
    const updated = await repo.updateFactura('f1', {
      id_cliente: 'c1',
      items: [{ descripcion: 'a', cantidad: 2, precio_unitario: 100 }],
      fecha_emision: '2026-08-02', fecha_vencimiento: '', notas: 'editada', moneda: 'USD'
    })
    expect(updated.total).toBe(232)
    expect(updated.saldo).toBe(232)
    expect(updated.editada).toBe('true')
    expect(updated.fecha_edicion).toBeTruthy()
    const items = f.grid.get('Factura_Items') ?? []
    const fila = items.find(r => r[0] === 'f1')
    expect(fila?.[2]).toBe(2)
  })
  it('updateFactura sobre saldo parcial mantiene pagos y ajusta diferencia', async () => {
    const f = fakeApi({
      ...seed,
      Facturas: [[], ['f1', 'FAC-001', 'c1', 'Ana', '2026-08-01', '', 100, 16, 116, 60, '', '2026-08-03', 'USD', 1, '', '']]
    })
    const repo = makeRepo(f)
    const updated = await repo.updateFactura('f1', {
      id_cliente: 'c1',
      items: [{ descripcion: 'a', cantidad: 1, precio_unitario: 100 }],
      fecha_emision: '2026-08-01', fecha_vencimiento: '', notas: '', moneda: 'USD'
    })
    expect(updated.total).toBe(116)
    expect(updated.saldo).toBe(60)
    expect(updated.editada).toBe('true')
  })
})
