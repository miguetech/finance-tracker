import { describe, expect, it } from 'vitest'
import { crearSqliteStore } from '../src/sync/stores/sqlite'
import { ddlDesdeTables } from '../src/sync/ddl'
import { crearEspejo } from '../src/sync/espejo'
import type { PersistorEspejo } from '../src/sync/cifrado'

function persistorCompartido(): PersistorEspejo & { json: string | null } {
  return { json: null, cargar: async function () { return this.json }, guardar: async function (j) { this.json = j }, borrar: async function () { this.json = null } }
}

describe('recarga offline con snapshot compartido', () => {
  it('sesión online llena; sesión offline (sin pull) lee lo mismo', async () => {
    const persistor = persistorCompartido()
    const ddl = ddlDesdeTables().flatMap(d => [d.create, ...d.indexes])

    // Sesión online: pull llena Clientes + Empleados
    const s1 = crearSqliteStore('/t.db3', { persistor })
    const espejo1 = crearEspejo({ store: s1, fetchTablas: async ts => ({
      ...Object.fromEntries(ts.map(t => [t, []])),
      Clientes: [{ customer_id: 'c1', nombre: 'Ana' }],
      Empleados: [{ employee_id: 'e1', nombre: 'Beto' }]
    }) })
    await espejo1.pull()
    expect((await s1.getAllRows('Clientes')).length).toBe(1)
    await s1.close() // persistir

    expect(persistor.json).toBeTruthy()

    // Sesión offline: nuevo store, mismo snapshot, NINGÚN pull
    const s2 = crearSqliteStore('/t.db3', { persistor })
    await s2.init(ddl)
    console.log('apertura:', JSON.stringify((s2 as any).infoApertura?.()))
    expect(await s2.getAllRows('Clientes')).toHaveLength(1)
    expect(await s2.getAllRows('Empleados')).toHaveLength(1)
    await s2.close()
  })

  it('volcado CIFRADO abierto sin clave => vacío (y avisado)', async () => {
    const persistor = persistorCompartido()
    const s1 = crearSqliteStore('/t.db3', { persistor, clave: async () => '9999' })
    const ddl = ddlDesdeTables().flatMap(d => [d.create, ...d.indexes])
    await s1.init(ddl)
    await s1.replaceTable('Clientes', [{ customer_id: 'c1', nombre: 'Ana' }])
    await s1.close()

    const s2 = crearSqliteStore('/t.db3', { persistor }) // sin clave
    await s2.init(ddl)
    console.log('apertura cifrada:', JSON.stringify((s2 as any).infoApertura?.()))
    expect(await s2.getAllRows('Clientes')).toEqual([]) // vacío pero AVISADO
    await s2.close()
  })
})
