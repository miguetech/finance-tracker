import { describe, expect, it } from 'vitest'
import type { EspejoStore } from '../src/sync/espejo'
import { ddlDesdeTables } from '../src/sync/ddl'
import { crearStoreMemoria } from '../src/sync/stores/memoria'

/** Suite de contrato ejecutable contra cualquier implementación de EspejoStore. */
export function suiteContratoStore(nombre: string, factory: () => EspejoStore) {
  describe(`contrato EspejoStore: ${nombre}`, () => {
    it('init ejecuta el DDL sin lanzar', async () => {
      const s = factory()
      const ddl = ddlDesdeTables().flatMap(d => [d.create, ...d.indexes])
      await expect(s.init(ddl)).resolves.toBeUndefined()
      await s.close()
    })

    it('replaceTable + getAllRows roundtrip', async () => {
      const s = factory()
      await s.init([])
      await s.replaceTable('Clientes', [{ id_cliente: 'c1', nombre: 'Ana' }])
      expect(await s.getAllRows('Clientes')).toEqual([{ id_cliente: 'c1', nombre: 'Ana' }])
      await s.close()
    })

    it('reemplazo borra filas previas (full sync)', async () => {
      const s = factory()
      await s.init([])
      await s.replaceTable('Pagos', [{ id_pago: 'p1' }, { id_pago: 'p2' }])
      await s.replaceTable('Pagos', [{ id_pago: 'p3' }])
      expect(await s.getAllRows('Pagos')).toEqual([{ id_pago: 'p3' }])
      await s.close()
    })

    it('getAllRows de tabla sin cargar devuelve vacío', async () => {
      const s = factory()
      await s.init([])
      expect(await s.getAllRows('Empleados')).toEqual([])
      await s.close()
    })
  })
}

suiteContratoStore('memoria', crearStoreMemoria)
