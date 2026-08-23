import { describe, expect, it } from 'vitest'
import { crearEspejo, type EspejoStore } from '../src/sync/espejo'
import { listFacturasEspejo, listAsistenciasEspejo } from '../src/data/readCache'

function storeCon(tabla: string, filas: Record<string, string | number>[]) {
  const datos = new Map([[tabla, filas]])
  const store: EspejoStore = {
    init: async () => {}, close: async () => {},
    getAllRows: async t => (datos.get(t) ?? []) as never,
    replaceTable: async () => {}
  }
  return crearEspejo({ store, fetchTable: async () => [] })
}

describe('lecturas desde el espejo', () => {
  it('facturas aplica filtro de mes igual que el repositorio', async () => {
    const espejo = storeCon('Facturas', [
      { id_factura: 'a', fecha_emision: '2026-08-01' },
      { id_factura: 'b', fecha_emision: '2026-07-01' }
    ])
    const todas = await listFacturasEspejo(espejo, {})
    expect(todas).toHaveLength(2)
    const agosto = await listFacturasEspejo(espejo, { mes: '2026-08' })
    expect(agosto.map(f => f.id_factura)).toEqual(['a'])
  })

  it('asistencias filtra por empleado y rango, orden descendente', async () => {
    const espejo = storeCon('Asistencias', [
      { id_asistencia: '1', id_empleado: 'e1', fecha: '2026-08-01' },
      { id_asistencia: '2', id_empleado: 'e2', fecha: '2026-08-02' },
      { id_asistencia: '3', id_empleado: 'e1', fecha: '2026-08-03' }
    ])
    const r = await listAsistenciasEspejo(espejo, { id_empleado: 'e1', desde: '2026-08-01', hasta: '2026-08-31' })
    expect(r.map(a => a.id_asistencia)).toEqual(['3', '1'])
  })

  it('pagos filtra por id_origen', async () => {
    const espejo = storeCon('Pagos', [
      { id_pago: 'p1', id_origen: 'f1' },
      { id_pago: 'p2', id_origen: 'f2' }
    ])
    const { listPagosEspejo } = await import('../src/data/readCache')
    expect(await listPagosEspejo(espejo, 'f1')).toHaveLength(1)
    expect(await listPagosEspejo(espejo)).toHaveLength(2)
  })
})
