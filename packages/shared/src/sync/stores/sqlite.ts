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
    SQLITE_DESERIALIZE_RESIZEABLE: number
  }
  wasm: { allocFromTypedArray(a: Uint8Array): number }
}

function volcarBytes(sqlite3: Sqlite3, db: SqliteDb): Uint8Array {
  return sqlite3.capi.sqlite3_js_db_export(db.pointer)
}

/** Carga una imagen de base sobre un DB recién abierto. */
function cargarImagen(sqlite3: Sqlite3, db: SqliteDb, bytes: Uint8Array): void {
  const ptr = sqlite3.wasm.allocFromTypedArray(bytes)
  // RESIZEABLE es obligatorio: sin él la base queda con el tamaño fijo de la
  // imagen importada y todo INSERT posterior falla con SQLITE_FULL.
  const flags = sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE
  sqlite3.capi.sqlite3_deserialize(db.pointer, 'main', ptr, bytes.length, bytes.length, flags)
}

/** Tablas cuyo esquema cambió y deben recrearse si el volcado viejo trae la
 *  definición anterior (el espejo es desechable: el pull lo repuebla). */
const TABLAS_A_MIGRAR: ReadonlyArray<{ tabla: string; marcaVieja: RegExp }> = [
  // PK errónea en id_factura: revientaba con facturas de 2+ conceptos.
  { tabla: 'Factura_Items', marcaVieja: /CREATE TABLE.*Factura_Items[\s\S]*PRIMARY KEY/i }
]

function migrarEsquemas(db: SqliteDb, ddl: string[]): void {
  for (const { tabla, marcaVieja } of TABLAS_A_MIGRAR) {
    if (!ddl.some(s => s.includes(`"${tabla}"`))) continue
    let sqlActual = ''
    const stmt = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${tabla}'`)
    try {
      if (stmt.step()) sqlActual = String(stmt.get(0) ?? '')
    } finally {
      stmt.finalize()
    }
    if (sqlActual && marcaVieja.test(sqlActual)) {
      db.exec(`DROP TABLE IF EXISTS "${tabla}"`)
      console.debug(`[espejo] migración: "${tabla}" recreada (esquema viejo)`)
    }
  }
}

export interface OpcionesSqliteStore {
  /** Con persistor + clave el volcado se guarda cifrado (AES-GCM) fuera de OPFS. */
  persistor?: PersistorEspejo
  clave?: () => Promise<string>
}

/** Diagnóstico de la última apertura (visible vía window.__ftEspejo). */
export interface InfoApertura { habiaVolcado: boolean; bytesVolcado: number | null; volcadoCifrado: boolean | null; bytesAplicados: number | null }

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
export function crearSqliteStore(ruta = '/finance-tracker-espejo.db3', opciones: OpcionesSqliteStore = {}): EspejoStore & { vfs: () => string; infoApertura?: () => InfoApertura } {
  const { persistor, clave } = opciones
  let db: SqliteDb | null = null
  let sqlite3Ref: Sqlite3 | null = null
  let vfsUsado = 'memory'
  let sucio = false
  let persistirTimer: ReturnType<typeof setTimeout> | null = null
  const apertura: InfoApertura = { habiaVolcado: false, bytesVolcado: null, volcadoCifrado: null, bytesAplicados: null }

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
          apertura.habiaVolcado = true
          apertura.bytesVolcado = json.length
          const volcado = decodificar(json)
          if (volcado) {
            apertura.volcadoCifrado = volcado.cifrado
            let bytes: Uint8Array | null = null
            if (volcado.cifrado && clave) {
              bytes = await descifrarVolcado(await clave(), JSON.parse(json) as VolcadoCifrado)
            } else if (volcado.cifrado) {
              // Volcado cifrado abierto sin clave: NO es error, pero explica un espejo vacío.
              console.warn('[espejo] el volcado en IndexedDB está CIFRADO y esta sesión lo abrió sin PIN: se arranca vacío')
            } else {
              bytes = deB64(volcado.datosB64)
            }
            if (bytes) {
              cargarImagen(sqlite3, db, bytes)
              apertura.bytesAplicados = bytes.length
            }
          }
        } else {
          console.debug('[espejo] sin volcado previo en IndexedDB: espejo nuevo')
        }
      } catch (e) {
        console.warn('[espejo] volcado ilegible, espejo nuevo:', e instanceof Error ? e.message : e)
      }
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
    // Protección anti-destrucción: si el blob existente está CIFRADO y esta
    // sesión abrió sin clave, NO lo pisa con un espejo vacío/plano.
    if (!clave && apertura.volcadoCifrado === true) {
      console.warn('[espejo] volcado cifrado en IndexedDB intacto: esta sesión sin PIN no escribe encima')
      return
    }
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
    infoApertura: () => apertura,

    async init(ddl: string[]): Promise<void> {
      const dbActivo = await abrir()
      if (ddl.length) {
        migrarEsquemas(dbActivo, ddl)
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
  let creado: EspejoStore | null = null
  try {
    const persistor = opciones.persistor ?? crearPersistorIdb() ?? undefined
    if (persistor || opciones.clave) {
      const s = crearSqliteStore(ruta, { persistor, clave: opciones.clave })
      await s.init([])
      creado = s
    }
  } catch (e) {
    // Con clave pedida este fallo es GRAVE (no hay fallback seguro que pueda
    // descifrar); dejarlo en silencio fingía un espejo vacío "normal".
    console.error('[espejo] apertura del volcado FALLÓ:', e)
  }
  if (!creado) {
    try {
      const s = crearSqliteStore(ruta)
      await s.init([]) // fuerza carga del módulo WASM y apertura
      creado = s
    } catch {
      creado = await crearStoreMemoria()
    }
  }
  const conVfs = creado as EspejoStore & { infoApertura?: () => InfoApertura }
  exponerDebug(creado, () => conVfs.infoApertura?.() ?? { habiaVolcado: false, bytesVolcado: null, volcadoCifrado: null, bytesAplicados: null })
  return creado
}

const TABLAS_DEBUG = Object.keys(TABLES) as TableName[]

/** Solo dev: window.__ftEspejo.conteo() lista filas por tabla del espejo. */
function exponerDebug(store: EspejoStore, aperturaInfo: () => InfoApertura): void {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
  if (!env?.DEV || env.DEV === 'false') return
  const w = globalThis as unknown as { __ftEspejo?: unknown }
  w.__ftEspejo = {
    vfs: () => ((store as EspejoStore & { vfs?: () => string }).vfs?.() ?? 'memoria'),
    apertura: () => aperturaInfo(),
    conteo: async (): Promise<Record<string, number>> => {
      const out: Record<string, number> = {}
      for (const t of TABLAS_DEBUG) {
        try { out[t] = (await store.getAllRows(t)).length } catch { out[t] = -1 }
      }
      return out
    },
    filas: (t: TableName) => store.getAllRows(t)
  }
}
