import { describe, expect, it, vi } from 'vitest'
import { TABLES } from '../src/sheets/tables'
import { EmpleadoSchema, NominaInputSchema } from '../src/types/schemas'
import { createRepository } from '../src/data/repository'
import { SheetsApi } from '../src/sheets/api'
import type { StorageAdapter } from '../src/data/storage'

describe('empleados schema', () => {
  it('TABLES incluye la hoja Empleados con 7 columnas', () => {
    const spec = TABLES.Empleados
    expect(spec.map(c => c.key)).toEqual(['id_empleado', 'nombre', 'rfc', 'puesto', 'salario', 'fecha_ingreso', 'activo'])
  })
  it('EmpleadoSchema requiere nombre y default salario 0', () => {
    const e = EmpleadoSchema.parse({ nombre: 'Ana' })
    expect(e.salario).toBe(0)
    expect(e.activo).toBe('true')
    expect(() => EmpleadoSchema.parse({ nombre: '' })).toThrow()
  })
  it('NominaInputSchema valida mes YYYY-MM', () => {
    expect(() => NominaInputSchema.parse({ id_empleado: 'emp_1', mes: '2026-08', monto: 100 })).not.toThrow()
    expect(() => NominaInputSchema.parse({ id_empleado: 'emp_1', mes: 'ago', monto: 100 })).toThrow()
  })
})

function memoryStorage(seed: Record<string, string> = {}): StorageAdapter {
  const m = new Map<string, string>(Object.entries(seed))
  return {
    get: async k => m.get(k) ?? null,
    set: async (k, v) => void m.set(k, v),
    remove: async k => void m.delete(k)
  }
}

function fakeApi(seed: Record<string, (string | number)[][]> = {}) {
  const grid = new Map<string, (string | number)[][]>(Object.entries(seed))

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
  return { grid, fetchMock }
}

describe('empleados repository', () => {
  it('saveEmpleado sin id asigna uid emp_ y hace append', async () => {
    const f = fakeApi()
    const api = new SheetsApi(async () => 'T')
    const storage = memoryStorage()
    const repo = createRepository({ api, storage, getSpreadsheetId: async () => 'S' })
    const saved = await repo.saveEmpleado({ nombre: 'Ana', rfc: '', puesto: '', salario: 5000, fecha_ingreso: '2026-01-01', activo: 'true' } as never)
    expect(saved.id_empleado).toMatch(/^emp_/)
    const rows = (f.grid.get('Empleados') ?? []).filter(r => r.some(v => v !== undefined && v !== ''))
    expect(rows).toHaveLength(1)
  })

  it('registerNomina crea un gasto categoría Nómina', async () => {
    const f = fakeApi({ Empleados: [['emp_1', 'Ana', '', '', 5000, '2026-01-01', 'true']] })
    const api = new SheetsApi(async () => 'T')
    const storage = memoryStorage()
    const repo = createRepository({ api, storage, getSpreadsheetId: async () => 'S' })
    const g = await repo.registerNomina({ id_empleado: 'emp_1', mes: '2026-08', monto: 5000, metodo_pago: 'Transferencia', fecha: '2026-08-05', notas: '' })
    expect(g.categoria).toBe('Nómina')
    expect(g.descripcion).toContain('Nómina 2026-08')
    expect(g.proveedor).toBe('Ana')
    expect(g.monto).toBe(5000)
    const rows = (f.grid.get('Gastos') ?? []).filter(r => r.some(v => v !== undefined && v !== ''))
    expect(rows).toHaveLength(1)
  })

  it('registerNomina lanza Empleado no existe si falta el empleado', async () => {
    const f = fakeApi()
    const api = new SheetsApi(async () => 'T')
    const storage = memoryStorage()
    const repo = createRepository({ api, storage, getSpreadsheetId: async () => 'S' })
    await expect(repo.registerNomina({ id_empleado: 'emp_9', mes: '2026-08', monto: 5000, metodo_pago: 'Transferencia', fecha: '2026-08-05', notas: '' })).rejects.toThrow('Empleado no existe')
  })

  it('deleteEmpleado bloquea si hay gasto Nómina del mismo proveedor', async () => {
    const f = fakeApi({ Empleados: [[], ['emp_1', 'Ana', '', '', 5000, '2026-01-01', 'true']], Gastos: [[], ['gas_1', '2026-08-05', 'Nómina', 'Nómina 2026-08 — Ana', 5000, 'Transferencia', 'Ana']] })
    const api = new SheetsApi(async () => 'T')
    const storage = memoryStorage()
    const repo = createRepository({ api, storage, getSpreadsheetId: async () => 'S' })
    await expect(repo.deleteEmpleado('emp_1')).rejects.toThrow(/n[oó]mina/i)
  })

  it('deleteEmpleado elimina si no hay gastos bloqueantes', async () => {
    const f = fakeApi({ Empleados: [[], ['emp_1', 'Ana', '', '', 5000, '2026-01-01', 'true']] })
    const api = new SheetsApi(async () => 'T')
    const storage = memoryStorage()
    const repo = createRepository({ api, storage, getSpreadsheetId: async () => 'S' })
    await repo.deleteEmpleado('emp_1')
    const rows = (f.grid.get('Empleados') ?? []).filter(r => r.some(v => v !== undefined && v !== ''))
    expect(rows).toHaveLength(0)
  })
})
