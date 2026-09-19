import { describe, expect, it } from 'vitest'
import { crearEspejo, type EspejoStore } from '../src/sync/espejo'
import { listFacturasEspejo, listAsistenciasEspejo } from '../src/data/readCache'

function storeCon(tabla: string, filas: Record<string, string | number>[]) {
  const datos = new Map([[tabla, filas]])
  const store: EspejoStore = {
    init: async () => {}, close: async () => {},
    getAllRows: async t => (datos.get(t) ?? []) as never,
    getAllRowsWithRowid: async t => ((datos.get(t) ?? []) as never).map((r, i) => ({ ...r, rowid: i + 1 })),
    replaceTable: async () => {},
    clearTable: async () => {}
  }
  return crearEspejo({ store, fetchTable: async () => [] })
}

describe('lecturas desde el espejo', () => {
  it('facturas aplica filtro de mes igual que el repositorio', async () => {
    const espejo = storeCon('Facturas', [
      { invoice_id: 'a', issue_date: '2026-08-01' },
      { invoice_id: 'b', issue_date: '2026-07-01' }
    ])
    const todas = await listFacturasEspejo(espejo, {})
    expect(todas).toHaveLength(2)
    const agosto = await listFacturasEspejo(espejo, { mes: '2026-08' })
    expect(agosto.map(f => f.invoice_id)).toEqual(['a'])
  })

  it('asistencias filtra por empleado y rango, orden descendente', async () => {
    const espejo = storeCon('Asistencias', [
      { attendance_id: '1', employee_id: 'e1', fecha: '2026-08-01' },
      { attendance_id: '2', employee_id: 'e2', fecha: '2026-08-02' },
      { attendance_id: '3', employee_id: 'e1', fecha: '2026-08-03' }
    ])
    const r = await listAsistenciasEspejo(espejo, { employee_id: 'e1', desde: '2026-08-01', hasta: '2026-08-31' })
    expect(r.map(a => a.attendance_id)).toEqual(['3', '1'])
  })

  it('pagos filtra por origin_id', async () => {
    const espejo = storeCon('Pagos', [
      { payment_id: 'p1', origin_id: 'f1' },
      { payment_id: 'p2', origin_id: 'f2' }
    ])
    const { listPagosEspejo } = await import('../src/data/readCache')
    expect(await listPagosEspejo(espejo, 'f1')).toHaveLength(1)
    expect(await listPagosEspejo(espejo)).toHaveLength(2)
  })
})
