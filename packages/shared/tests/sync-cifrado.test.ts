import { describe, expect, it } from 'vitest'
import { cifrarVolcado, descifrarVolcado, crearPersistorStorage } from '../src/sync/cifrado'
import { crearSqliteStore } from '../src/sync/stores/sqlite'
import { ddlDesdeTables } from '../src/sync/ddl'
import type { PersistorEspejo } from '../src/sync/cifrado'
import type { StorageAdapter } from '../src/data/storage'

const DDL = ddlDesdeTables().flatMap(d => [d.create, ...d.indexes])

function kvFalso(): StorageAdapter & { mapa: Map<string, string> } {
  const mapa = new Map<string, string>()
  return {
    mapa,
    get: async k => mapa.get(k) ?? null,
    set: async (k, v) => { mapa.set(k, v) },
    remove: async k => { mapa.delete(k) }
  }
}

function persistorMemoria(): PersistorEspejo & { blob: string | null } {
  return {
    blob: null,
    cargar: async function () { return this.blob },
    guardar: async function (json) { this.blob = json },
    borrar: async function () { this.blob = null }
  }
}

describe('cifrado del volcado (AES-GCM + PBKDF2)', () => {
  it('roundtrip: descifrar(pinCorrecto) devuelve los bytes originales', async () => {
    const original = new TextEncoder().encode('contenido sqlite binario \x00\x01')
    const volcado = await cifrarVolcado('4321', original)
    expect(volcado.datos).not.toContain('sqlite')
    const plano = await descifrarVolcado('4321', volcado)
    expect(Array.from(plano)).toEqual(Array.from(original))
  })

  it('pin distinto no descifra', async () => {
    const volcado = await cifrarVolcado('1111', new TextEncoder().encode('secreto'))
    await expect(descifrarVolcado('2222', volcado)).rejects.toThrow()
  })
})

describe('store sqlite con volcado cifrado', () => {
  it('persiste cifrado entre sesiones y repuebla con el pin correcto', async () => {
    const persistor = persistorMemoria()
    const clave = async () => '9876'
    const s1 = crearSqliteStore('/t.db3', { persistor, clave })
    await s1.init(DDL)
    await s1.replaceTable('Clientes', [{ id_cliente: 'c1', nombre: 'Ana' }])
    await s1.close()
    expect(persistor.blob).toBeTruthy()
    const sobre = JSON.parse(persistor.blob!) as { salt?: string }
    expect(sobre.salt).toBeTruthy() // sobre cifrado, no plano
    // El volcado cifrado no se abre con un PIN equivocado.
    await expect(descifrarVolcado('0000', JSON.parse(persistor.blob!))).rejects.toThrow()

    const s2 = crearSqliteStore('/t.db3', { persistor, clave })
    await s2.init([]) // reabre desde el volcado descifrado
    const filas = await s2.getAllRows('Clientes')
    expect(filas).toHaveLength(1)
    expect(filas[0].id_cliente).toBe('c1')
    expect(filas[0].nombre).toBe('Ana')
    await s2.close()
  })

  it('sin clave persiste plano y sobrevive a la recarga (vfs idb)', async () => {
    const persistor = persistorMemoria()
    const s1 = crearSqliteStore('/t.db3', { persistor })
    await s1.init(DDL)
    expect(s1.vfs()).toBe('idb')
    await s1.replaceTable('Clientes', [{ id_cliente: 'c2', nombre: 'Beto' }])
    await s1.close()

    const s2 = crearSqliteStore('/t.db3', { persistor })
    await s2.init([])
    const filas = await s2.getAllRows('Clientes')
    expect(filas.some(f => f.id_cliente === 'c2' && f.nombre === 'Beto')).toBe(true)
    await s2.close()
  })

  it('pin distinto abre un espejo nuevo y desechable (no rompe)', async () => {
    const persistor = persistorMemoria()
    const s1 = crearSqliteStore('/t.db3', { persistor, clave: async () => '1111' })
    await s1.init(DDL)
    await s1.replaceTable('Clientes', [{ id_cliente: 'c1', nombre: 'Ana' }])
    await s1.close()

    const s2 = crearSqliteStore('/t.db3', { persistor, clave: async () => '9999' })
    await s2.init(DDL)
    expect(await s2.getAllRows('Clientes')).toEqual([])
    await s2.close()
  })

  it('persistor sobre StorageAdapter guarda el string del volcado', async () => {
    const s = kvFalso()
    const p = crearPersistorStorage(s)
    await p.guardar('{"v":1,"plano":true,"datos":"aG9sYQ=="}')
    expect(await p.cargar()).toBe('{"v":1,"plano":true,"datos":"aG9sYQ=="}')
    await p.borrar()
    expect(await p.cargar()).toBeNull()
  })
})

describe('regresión: facturas con varios conceptos', () => {
  it('Factura_Items acepta N filas con el mismo id_factura', async () => {
    const persistor = persistorMemoria()
    const s = crearSqliteStore('/t.db3', { persistor })
    await s.init(DDL)
    await s.replaceTable('Factura_Items', [
      { id_factura: 'f1', descripcion: 'Concepto A', cantidad: 1, precio_unitario: 10, importe: 10 },
      { id_factura: 'f1', descripcion: 'Concepto B', cantidad: 2, precio_unitario: 5, importe: 10 }
    ])
    expect(await s.getAllRows('Factura_Items')).toHaveLength(2)
    await s.close()
    // Reabrir el snapshot y volver a reemplazar (pull tras recarga).
    const s2 = crearSqliteStore('/t.db3', { persistor })
    await s2.init(DDL)
    await s2.replaceTable('Factura_Items', [
      { id_factura: 'f1', descripcion: 'A', cantidad: 1, precio_unitario: 10, importe: 10 },
      { id_factura: 'f1', descripcion: 'B', cantidad: 1, precio_unitario: 5, importe: 5 },
      { id_factura: 'f1', descripcion: 'C', cantidad: 1, precio_unitario: 5, importe: 5 }
    ])
    expect(await s2.getAllRows('Factura_Items')).toHaveLength(3)
    await s2.close()
  })

  it('migración: snapshot viejo con PK errónea se recrea al iniciar', async () => {
    const persistor = persistorMemoria()
    // Simula volcado viejo: crea la tabla con la definición incorrecta.
    const viejo = ddlDesdeTables().find(t => t.tabla === 'Factura_Items')!
    const createViejo = viejo.create.replace('"id_factura" TEXT,', '"id_factura" TEXT PRIMARY KEY,')
    const s1 = crearSqliteStore('/t.db3', { persistor })
    await s1.init([createViejo])
    await s1.replaceTable('Factura_Items', [{ id_factura: 'f1', descripcion: 'x', cantidad: 1, precio_unitario: 1, importe: 1 }])
    await s1.close()
    // Nueva sesión con el DDL correcto: detecta esquema viejo y lo tira.
    const s2 = crearSqliteStore('/t.db3', { persistor })
    await s2.init(DDL)
    await s2.replaceTable('Factura_Items', [
      { id_factura: 'f1', descripcion: 'a', cantidad: 1, precio_unitario: 1, importe: 1 },
      { id_factura: 'f1', descripcion: 'b', cantidad: 1, precio_unitario: 1, importe: 1 }
    ])
    expect(await s2.getAllRows('Factura_Items')).toHaveLength(2)
    await s2.close()
  })
})
