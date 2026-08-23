import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import type { EspejoStore, Row } from '../espejo'
import { TABLES, type TableName } from '../../sheets/tables'
import { cifrarVolcado, descifrarVolcado, crearPersistorIdb } from '../cifrado'
import type { PersistorEspejo } from '../cifrado'

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
 * Store del espejo sobre SQLite WASM con persistencia en OPFS cuando el
 * entorno la ofrece; con `persistor` + `clave`, en volcado cifrado; si no,
 * base en memoria de sesión.
 */
export function crearSqliteStore(ruta = '/finance-tracker-espejo.db3', opciones: OpcionesSqliteStore = {}): EspejoStore & { vfs: () => string } {
  const { persistor, clave } = opciones
  let db: SqliteDb | null = null
  let sqlite3Ref: Sqlite3 | null = null
  let vfsUsado = 'memory'
  let sucio = false

  async function abrir(): Promise<SqliteDb> {
    if (db) return db
    const sqlite3 = await cargarModulo()
    sqlite3Ref = sqlite3
    if (persistor && clave) {
      vfsUsado = 'cifrado'
      db = new sqlite3.oo1.DB(':memory:')
      try {
        const volcado = await persistor.cargar()
        if (volcado) {
          const bytes = await descifrarVolcado(await clave(), volcado)
          cargarImagen(sqlite3, db, bytes)
        }
      } catch { /* PIN distinto o blob corrupto: espejo nuevo desechable */ }
      return db
    }
    try {
      if (sqlite3.oo1.OpfsDb && sqlite3.opfs?.registersVfs) {
        db = new sqlite3.oo1.OpfsDb(ruta)
        vfsUsado = 'opfs'
      } else {
        db = new sqlite3.oo1.DB(':memory:')
      }
    } catch {
      db = new sqlite3.oo1.DB(':memory:')
    }
    return db
  }

  /** Vuelca la base cifrada al persistor tras escrituras (best-effort). */
  async function persistir(): Promise<void> {
    if (!db || !persistor || !clave || !sucio || !sqlite3Ref) return
    try {
      const bytes = volcarBytes(sqlite3Ref, db)
      await persistor.guardar(await cifrarVolcado(await clave(), bytes))
      sucio = false
    } catch { /* se reintenta en la siguiente escritura */ }
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
        sucio = true
        await persistir()
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
        sucio = true
        await persistir()
      } catch (e) {
        try { dbActivo.exec('ROLLBACK') } catch { /* sin transacción abierta */ }
        throw e
      } finally {
        try { stmt.finalize() } catch { /* noop */ }
      }
    },

    async close(): Promise<void> {
      if (db) { await persistir(); db.close(); db = null }
    }
  }
}

import { crearStoreMemoria } from './memoria'

/** Store persistente si el entorno soporta SQLite/OPFS; con `clave`, volcado
 *  cifrado en IndexedDB; si no, memoria de sesión. */
export async function crearStoreEspejo(opciones: OpcionesSqliteStore & { ruta?: string } = {}): Promise<EspejoStore> {
  const ruta = opciones.ruta ?? '/finance-tracker-espejo.db3'
  if (opciones.clave) {
    const persistor = crearPersistorIdb()
    if (persistor) {
      try {
        const s = crearSqliteStore(ruta, { persistor, clave: opciones.clave })
        await s.init([]) // fuerza carga del módulo WASM y apertura
        return s
      } catch { /* cae a memoria abajo */ }
    }
  }
  try {
    const s = crearSqliteStore(ruta)
    await s.init([]) // fuerza carga del módulo WASM y apertura
    return s
  } catch {
    return crearStoreMemoria()
  }
}
