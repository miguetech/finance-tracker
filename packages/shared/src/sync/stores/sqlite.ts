import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import type { EspejoStore, Row } from '../espejo'
import { TABLES, type TableName } from '../../sheets/tables'

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
  close(): void
}

interface Sqlite3 {
  oo1: {
    DB: new (path: string) => SqliteDb
    OpfsDb?: new (path: string) => SqliteDb
  }
  opfs?: { registersVfs?: boolean }
}

let moduloCache: Promise<Sqlite3> | null = null

function cargarModulo(): Promise<Sqlite3> {
  moduloCache ??= sqlite3InitModule() as unknown as Promise<Sqlite3>
  return moduloCache
}

/**
 * Store del espejo sobre SQLite WASM con persistencia en OPFS cuando el
 * entorno la ofrece; si no, base en memoria de sesión.
 */
export function crearSqliteStore(ruta = '/finance-tracker-espejo.db3'): EspejoStore & { vfs: () => string } {
  let db: SqliteDb | null = null
  let vfsUsado = 'memory'

  async function abrir(): Promise<SqliteDb> {
    if (db) return db
    const sqlite3 = await cargarModulo()
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

  return {
    vfs: () => vfsUsado,

    async init(ddl: string[]): Promise<void> {
      const dbActivo = await abrir()
      dbActivo.exec('BEGIN')
      try {
        for (const sentencia of ddl) dbActivo.exec(sentencia)
        dbActivo.exec('COMMIT')
      } catch (e) {
        try { dbActivo.exec('ROLLBACK') } catch { /* sin transacción abierta */ }
        throw e
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
      } catch (e) {
        try { dbActivo.exec('ROLLBACK') } catch { /* sin transacción abierta */ }
        throw e
      } finally {
        try { stmt.finalize() } catch { /* noop */ }
      }
    },

    async close(): Promise<void> {
      if (db) { db.close(); db = null }
    }
  }
}

import { crearStoreMemoria } from './memoria'

/** Store persistente si el entorno soporta SQLite/OPFS; si no, memoria de sesión. */
export async function crearStoreEspejo(): Promise<EspejoStore> {
  try {
    const s = crearSqliteStore()
    await s.init([]) // fuerza carga del módulo WASM y apertura
    return s
  } catch {
    return crearStoreMemoria()
  }
}
