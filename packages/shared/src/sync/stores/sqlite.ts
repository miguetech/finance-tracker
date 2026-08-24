import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import type { EspejoStore, Row } from '../espejo'
import { TABLES, type TableName } from '../../sheets/tables'
import { cifrarVolcado, descifrarVolcado, crearPersistorIdb } from '../cifrado'
import type { PersistorEspejo, VolcadoCifrado } from '../cifrado'
import { codificarPlano, decodificar, deB64 } from './volcado'
type SqliteDb = {
  exec(sql: string): void
  prepare(sql: string): {
    bind(vals: (string | number | null)[]): void
    step(): boolean
    get(n?: number): unknown
    getColumnNames(): string[]
    reset(): void
    finalize(): void
  }
  pointer: number
  close(): void
}

interface Sqlite3 {
  oo1: {
    DB: new (path: string | Uint8Array) => SqliteDb
    OpfsDb?: new (path: string) => SqliteDb
  }
  opfs?: { registersVfs?: boolean }
  capi: {
    sqlite3_js_db_export(db: number | SqliteDb): Uint8Array
    sqlite3_deserialize(db: number, esquema: string, data: number, sz: number, szBuffer: number, flags: number): number
    SQLITE_DESERIALIZE_FREEONCLOSE: number
  }
  wasm: { allocFromTypedArray(a: Uint8Array): number }
}

function volcarBytes(sqlite3: Sqlite3, db: SqliteDb): Uint8Array {
  return sqlite3.capi.sqlite3_js_db_export(db.pointer)
}

/** Carga una imagen de base sobre un DB recién abierto. */
function cargarImagen(sqlite3: Sqlite3, db: SqliteDb, bytes: Uint8Array): void {
  const ptr = sqlite3.wasm.allocFromTypedArray(bytes)
  sqlite3.capi.sqlite3_deserialize(
    db.pointer,
    'main',
    ptr,
    bytes.length,
    bytes.length,
    sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE
  )
}

export interface OpcionesSqliteStore {
  /** Con persistor + clave el volcado se guarda cifrado (AES-GCM) fuera de OPFS. */
  persistor?: PersistorEspejo
  clave?: () => Promise<string>
}

let moduloCache: Promise<Sqlite3> | null = null

function cargarModulo(): Promise<Sqlite3> {
  moduloCache ??= sqlite3InitModule() as unknown as Promise<Sqlite3>
  return moduloCache
}

/**
 * Store del espejo sobre SQLite WASM. Persistencia, en orden de preferencia:
 * OPFS nativo; volcado cifrado en IndexedDB (persistor + clave); volcado
 * plano en IndexedDB (persistor); memoria de sesión.
 */
export function crearSqliteStore(ruta = '/finance-tracker-espejo.db3', opciones: OpcionesSqliteStore = {}): EspejoStore & { vfs: () => string } {
  const { persistor, clave } = opciones
  let db: SqliteDb | null = null
  let sqlite3Ref: Sqlite3 | null = null
  let vfsUsado = 'memory'
  let sucio = false
  let persistirTimer: ReturnType<typeof setTimeout> | null = null

  async function abrir(): Promise<SqliteDb> {
    if (db) return db
    const sqlite3 = await cargarModulo()
    sqlite3Ref = sqlite3
    if (persistor) {
      vfsUsado = clave ? 'cifrado' : 'idb'
      console.debug(`[espejo] persistencia=${vfsUsado}`)
      db = new sqlite3.oo1.DB(':memory:')
      try {
        const json = await persistor.cargar()
        if (json) {
          const volcado = decodificar(json)
          if (volcado) {
            const bytes = volcado.cifrado && clave
              ? await descifrarVolcado(await clave(), JSON.parse(json) as VolcadoCifrado)
              : (volcado.cifrado ? null : deB64(volcado.datosB64))
            if (bytes) cargarImagen(sqlite3, db, bytes)
          }
        }
      } catch { /* blob corrupto o PIN distinto: espejo nuevo desechable */ }
      return db
    }
    console.debug(`[espejo] persistencia=opfs|${ruta}`)
    try {
      if (sqlite3.oo1.OpfsDb && sqlite3.opfs?.registersVfs) {
        db = new sqlite3.oo1.OpfsDb(ruta)
        vfsUsado = 'opfs'
      } else {
        db = new sqlite3.oo1.DB(':memory:')
        console.warn('[espejo] sin OPFS ni persistor: los datos no sobreviven la recarga')
      }
    } catch {
      db = new sqlite3.oo1.DB(':memory:')
    }
    return db
  }

  /** Vuelca la base al persistor tras escrituras (best-effort, con debounce:
   *  el pull inicial toca muchas tablas y serializar cada una bloquea). */
  async function persistir(): Promise<void> {
    if (!db || !persistor || !sucio || !sqlite3Ref) return
    try {
      const bytes = volcarBytes(sqlite3Ref, db)
      if (clave) await persistirJson(JSON.stringify(await cifrarVolcado(await clave(), bytes)))
      else await persistirJson(codificarPlano(bytes))
      sucio = false
    } catch { /* se reintenta en la siguiente escritura */ }

    async function persistirJson(json: string): Promise<void> {
      await persistor!.guardar(json)
    }
  }

  function programarPersistir(): void {
    sucio = true
    if (persistirTimer) return
    persistirTimer = setTimeout(() => {
      persistirTimer = null
      void persistir()
    }, 400)
  }

  // Cola pendiente al cerrar/recargar la pestaña: último snapshot antes de salir.
  if (persistor && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('pagehide', () => {
      if (persistirTimer) { clearTimeout(persistirTimer); persistirTimer = null }
      void persistir()
    })
  }

  return {
    vfs: () => vfsUsado,

    async init(ddl: string[]): Promise<void> {
      const dbActivo = await abrir()
      if (ddl.length) {
        dbActivo.exec('BEGIN')
        try {
          for (const sentencia of ddl) dbActivo.exec(sentencia)
          dbActivo.exec('COMMIT')
        } catch (e) {
          try { dbActivo.exec('ROLLBACK') } catch { /* sin transacción abierta */ }
          throw e
        }
        programarPersistir()
      }
    },

    async getAllRows(t: TableName): Promise<Row[]> {
      const dbActivo = await abrir()
      const stmt = dbActivo.prepare(`SELECT * FROM "${t}"`)
      try {
        const nombres = stmt.getColumnNames()
        const out: Row[] = []
        while (stmt.step()) {
          const fila: Row = {}
          for (let i = 0; i < nombres.length; i++) fila[nombres[i]] = stmt.get(i) as string | number
          out.push(fila)
        }
        return out
      } finally {
        stmt.finalize()
      }
    },

    async replaceTable(t: TableName, filas: Row[]): Promise<void> {
      const dbActivo = await abrir()
      const cols = TABLES[t]
      const placeholders = cols.map(() => '?').join(', ')
      const colSql = cols.map(c => `"${c.key}"`).join(', ')
      dbActivo.exec('BEGIN')
      let stmt = dbActivo.prepare(`DELETE FROM "${t}"`)
      try {
        stmt.step()
      } finally {
        stmt.finalize()
      }
      try {
        stmt = dbActivo.prepare(`INSERT INTO "${t}" (${colSql}) VALUES (${placeholders})`)
        for (const f of filas) {
          stmt.bind(cols.map(c => {
            const v = f[c.key]
            if (v === undefined || v === null || v === '') return c.type === 'number' ? 0 : ''
            return c.type === 'number' ? Number(v) : String(v)
          }))
          stmt.step()
          stmt.reset()
        }
        dbActivo.exec('COMMIT')
        programarPersistir()
      } catch (e) {
        try { dbActivo.exec('ROLLBACK') } catch { /* sin transacción abierta */ }
        throw e
      } finally {
        try { stmt.finalize() } catch { /* noop */ }
      }
    },

    async close(): Promise<void> {
      if (db) {
        if (persistirTimer) { clearTimeout(persistirTimer); persistirTimer = null }
        await persistir()
        db.close()
        db = null
      }
    }
  }
}

import { crearStoreMemoria } from './memoria'

/** Store persistente: OPFS si existe; si no, volcado en IndexedDB (cifrado
 *  con `clave`, plano sin ella); memoria de sesión como último recurso. */
export async function crearStoreEspejo(opciones: OpcionesSqliteStore & { ruta?: string } = {}): Promise<EspejoStore> {
  const ruta = opciones.ruta ?? '/finance-tracker-espejo.db3'
  try {
    const persistor = opciones.persistor ?? crearPersistorIdb() ?? undefined
    if (persistor || opciones.clave) {
      const s = crearSqliteStore(ruta, { persistor, clave: opciones.clave })
      await s.init([])
      return s
    }
  } catch { /* cae a OPFS/memoria abajo */ }
  try {
    const s = crearSqliteStore(ruta)
    await s.init([]) // fuerza carga del módulo WASM y apertura
    return s
  } catch {
    return crearStoreMemoria()
  }
}
