import { describe, expect, it, vi } from 'vitest'
import { createRepository } from '../src/data/repository'
import { SheetsApi } from '../src/sheets/api'
import type { StorageAdapter } from '../src/data/storage'
import { desgloseEmpleado, horasEntre } from '../src/reports/nomina'
import type { Empleado } from '../src/types/entities'

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
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    if (u.includes('values:batchUpdate') || u.includes(':append') || u.includes(':clear')) return write(u, init!)
    return read(u)
  })
  vi.stubGlobal('fetch', fetchMock)
  return { grid, fetchMock }
}

const makeRepo = (_f: unknown) => {
  const api = new SheetsApi(async () => 'T')
  return createRepository({ api, storage: memoryStorage(), getSpreadsheetId: async () => 'SID' })
}

describe('asistencia de empleados', () => {
  it('saveAsistencia crea y reemplaza por empleado+fecha', async () => {
    const f = fakeApi({ Empleados: [[], ['emp_1', 'Luis', '', 'Mozo', 200, 'USD', '2026-01-01', 'true', '08:00', '17:00', 'mensual', 0]] })
    const repo = makeRepo(f)
    await repo.saveAsistencia({ id_empleado: 'emp_1', fecha: '2026-08-10', hora_entrada: '08:00', hora_salida: '17:00', notas: '' })
    expect((f.grid.get('Asistencias') ?? []).filter(r => r.some(v => v !== ''))).toHaveLength(1)
    // Mismo día: se reemplaza, no duplica
    await repo.saveAsistencia({ id_empleado: 'emp_1', fecha: '2026-08-10', hora_entrada: '08:30', hora_salida: '16:00', notas: '' })
    const rows = (f.grid.get('Asistencias') ?? []).filter(r => r.some(v => v !== ''))
    expect(rows).toHaveLength(1)
    expect(String(rows[0][4])).toContain('08:30')
  })

  it('listAsistencias filtra por empleado y rango', async () => {
    const f = fakeApi({
      Asistencias: [
        [],
        ['asi_1', 'emp_1', 'Luis', '2026-08-10', '08:00', '17:00', ''],
        ['asi_2', 'emp_2', 'Ana', '2026-08-11', '09:00', '18:00', ''],
        ['asi_3', 'emp_1', 'Luis', '2026-07-31', '08:00', '12:00', '']
      ]
    })
    const repo = makeRepo(f)
    const deLuisAgosto = await repo.listAsistencias({ id_empleado: 'emp_1', desde: '2026-08-01', hasta: '2026-08-31' })
    expect(deLuisAgosto).toHaveLength(1)
    expect(deLuisAgosto[0].fecha).toBe('2026-08-10')
  })

  it('deleteAsistencia elimina la fila', async () => {
    const f = fakeApi({ Asistencias: [[], ['asi_1', 'emp_1', 'Luis', '2026-08-10', '08:00', '17:00', '']] })
    const repo = makeRepo(f)
    await repo.deleteAsistencia('asi_1')
    expect((f.grid.get('Asistencias') ?? []).filter(r => r.some(v => v !== ''))).toHaveLength(0)
  })
})

describe('desglose de empleado (expeditillo)', () => {
  const emp: Empleado = {
    id_empleado: 'emp_1', nombre: 'Luis', rfc: '', puesto: 'Mozo', salario: 300,
    salario_moneda: 'USD', fecha_ingreso: '2026-01-01', activo: 'true',
    hora_entrada: '08:00', hora_salida: '17:00', esquema_pago: 'mensual', tarifa_hora_extra: 5,
    dias_laborales: '1,2,3,4,5'
  }

  it('horasEntre calcula horas entre marcas HH:MM', () => {
    expect(horasEntre('08:00', '17:00')).toBe(9)
    expect(horasEntre('', '17:00')).toBe(0)
    expect(horasEntre('17:00', '08:00')).toBe(0)
  })

  it('desgloseEmpleado consolida días, horas y pagos del mes', () => {
    const d = desgloseEmpleado(emp, {
      asistencias: [
        { fecha: '2026-08-03', hora_entrada: '08:00', hora_salida: '17:00' },
        { fecha: '2026-08-04', hora_entrada: '08:00', hora_salida: '17:00' },
        { fecha: '2026-07-20', hora_entrada: '08:00', hora_salida: '17:00' }
      ],
      detalles: [{ id_detalle: 'd1', id_empleado: 'emp_1', mes: '2026-08', sueldo_base: 300, horas_extra: 4, tarifa_hora_extra: 5, monto_horas_extra: 20, bonos: 0, comisiones: 0, total: 320, moneda: 'USD', metodo_pago: 'Efectivo', pagos_divididos: '', fecha: '2026-08-30', id_gasto: '' }],
      gastos: [{ id_gasto: 'g1', fecha: '2026-08-30', categoria: 'Nómina', descripcion: '', monto: 160, metodo_pago: 'Efectivo', proveedor: 'Luis', moneda: 'USD', tipo_cambio: 1 }]
    }, '2026-08')
    expect(d.diasTrabajados).toBe(2)
    expect(d.horasTrabajadas).toBe(18)
    expect(d.horasExtraMes).toBe(4)
    expect(d.montoHorasExtraMes).toBe(20)
    expect(d.sueldosDepositados).toBe(160)
  })
})
