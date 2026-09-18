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
      await s.init(ddlDesdeTables().flatMap(d => [d.create, ...d.indexes]))
      await s.replaceTable('Clientes', [{ customer_id: 'c1', nombre: 'Ana' }])
      const filas = await s.getAllRows('Clientes')
      expect(filas).toHaveLength(1)
      expect(filas[0]).toMatchObject({ customer_id: 'c1', nombre: 'Ana' })
      await s.close()
    })

    it('reemplazo borra filas previas (full sync)', async () => {
      const s = factory()
      await s.init(ddlDesdeTables().flatMap(d => [d.create, ...d.indexes]))
      await s.replaceTable('Pagos', [{ payment_id: 'p1' }, { payment_id: 'p2' }])
      await s.replaceTable('Pagos', [{ payment_id: 'p3' }])
      const restantes = await s.getAllRows('Pagos')
      expect(restantes).toHaveLength(1)
      expect(restantes[0].payment_id).toBe('p3')
      await s.close()
    })

    it('getAllRows de tabla sin cargar devuelve vacío', async () => {
      const s = factory()
      await s.init(ddlDesdeTables().flatMap(d => [d.create, ...d.indexes]))
      expect(await s.getAllRows('Empleados')).toEqual([])
      await s.close()
    })
  })
}

suiteContratoStore('memoria', crearStoreMemoria)
