import { describe, expect, it } from 'vitest'
import { cifrarVolcado, descifrarVolcado, crearPersistorStorage } from '../src/sync/cifrado'
import { crearSqliteStore } from '../src/sync/stores/sqlite'
import { ddlDesdeTables } from '../src/sync/ddl'
import type { PersistorEspejo, VolcadoCifrado } from '../src/sync/cifrado'
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

function persistorMemoria(): PersistorEspejo & { blob: VolcadoCifrado | null } {
  return {
    blob: null,
    cargar: async function () { return this.blob },
    guardar: async function (v) { this.blob = v },
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
    // El volcado cifrado no se abre con un PIN equivocado.
    await expect(descifrarVolcado('0000', persistor.blob!)).rejects.toThrow()

    const s2 = crearSqliteStore('/t.db3', { persistor, clave })
    await s2.init([]) // reabre desde el volcado descifrado
    const filas = await s2.getAllRows('Clientes')
    expect(filas).toHaveLength(1)
    expect(filas[0].id_cliente).toBe('c1')
    expect(filas[0].nombre).toBe('Ana')
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

  it('persistor sobre StorageAdapter guarda JSON del volcado', async () => {
    const s = kvFalso()
    const p = crearPersistorStorage(s)
    await p.guardar({ v: 1, salt: 'cw==', iv: 'AA==', datos: 'aG9sYQ==' })
    expect(await p.cargar()).toMatchObject({ v: 1, datos: 'aG9sYQ==' })
    expect(JSON.parse(s.mapa.get('ft_espejo_volcado')!)).toMatchObject({ v: 1 })
    await p.borrar()
    expect(await p.cargar()).toBeNull()
  })
})
