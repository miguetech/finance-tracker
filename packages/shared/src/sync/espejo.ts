import { ddlDesdeTables } from './ddl'
import { hashTabla } from './hash'
import { TABLES, type TableName } from '../sheets/tables'
import { migrarFacturaItemsLinea } from './migrate-factura-items-linea'

export type Row = Record<string, string | number>

export interface EspejoStore {
  init(ddl: string[]): Promise<void>
  getAllRows(t: TableName): Promise<Row[]>
  getAllRowsWithRowid(t: TableName): Promise<(Row & { rowid: number })[]>
  replaceTable(t: TableName, filas: Row[]): Promise<void>
  clearTable(t: TableName): Promise<void>
  close(): Promise<void>
  /** Escotilla del store sqlite (tests): NULL en el store de memoria. */
  getDb?(): unknown
}

/** Tablas de lectura frecuente: se refrescan en TTL/foco. */
export const TABLAS_CALIENTES: TableName[] = ['Facturas', 'Factura_Items', 'Pagos', 'Gastos', 'Cuentas_Pagar', 'Productos']

export interface EspejoDeps {
  store: EspejoStore
  /** Descarga varias tablas (una petición para todas); null = tabla sin origen.
   *  Con opts.soloVivo puede devolver {filas, alcance}: el alcance declara qué
   *  años cubre cada tabla y el espejo hace MERGE (no borra fragmentos
   *  históricos ya cacheados de otros años). */
  fetchTablas(ts: TableName[], opts: { soloVivo: boolean }): Promise<Partial<Record<TableName, Row[] | null>> | { filas: Partial<Record<TableName, Row[] | null>>; alcance?: Partial<Record<TableName, string[]>> }>
  ahora?: () => number
  onCambio?: (tablas: TableName[]) => void
  /** Tras CADA descarga exitosa (aunque el contenido no cambiara): las UIs
   *  deben releer el espejo, si no quedan pintando el estado previo. */
  onDescarga?: (tablas: TableName[]) => void
}

function añoDeFilaEspejo(fila: Row): string {
  const f = String(fila.issue_date ?? fila.fecha ?? '')
  return /^\d{4}/.test(f) ? f.slice(0, 4) : ''
}

export function crearEspejo(deps: EspejoDeps) {
  const { store, fetchTablas, ahora = Date.now, onCambio, onDescarga } = deps
  const hashes = new Map<TableName, string>()
  const fechas = new Map<string, number>()
  let ultimoPull = 0
  let initPromise: Promise<void> | null = null
  let cola: Promise<unknown> = Promise.resolve()

  function init(): Promise<void> {
    initPromise ??= (async () => {
      const ddl = ddlDesdeTables().flatMap(d => [d.create, ...d.indexes])
      await store.init(ddl)
      await migrarFacturaItemsLinea(store)
    })()
    return initPromise
  }

  /** Serializa pulls: nunca dos descargas simultáneas. */
  function encolar<T>(fn: () => Promise<T>): Promise<T> {
    const resultado = cola.then(fn, fn)
    cola = resultado.catch(() => undefined)
    return resultado
  }

  async function aplicar(t: TableName, filas: Row[] | null, cambiadas: TableName[], añosAlcance?: string[]): Promise<void> {
    if (!filas) return // tabla sin origen: no se envenena su hash
    let nuevas = filas
    if (añosAlcance?.length) {
      // Alcance declarado: conserva del cache los años NO cubiertos por esta
      // descarga (histórico ya cargado sobrevive a pulls del año vivo).
      const previas = (await store.getAllRows(t)) as Row[]
      const conservadas = previas.filter(r => !añosAlcance.includes(añoDeFilaEspejo(r)))
      nuevas = [...conservadas, ...filas]
    }
    const h = hashTabla(nuevas)
    if (hashes.get(t) !== h) {
      hashes.set(t, h)
      await store.replaceTable(t, nuevas)
      cambiadas.push(t)
    }
  }

  /**
   * Descarga tablas y actualiza el espejo solo donde cambió el hash. Sin
   * `tablas`: primer pull descarga todo; siguientes, solo calientes. Los
   * pulls periódicos usan alcance vivo (soloVivo) con merge por año.
   */
  function pull(tablas?: TableName[], opts: { soloVivo?: boolean } = {}): Promise<TableName[]> {
    const soloVivo = opts.soloVivo !== false
    return encolar(async () => {
      await init()
      let objetivo = tablas
      if (!objetivo) objetivo = hashes.size ? TABLAS_CALIENTES : (Object.keys(TABLES) as TableName[])
      const desc = await fetchTablas(objetivo, { soloVivo })
      // Compatibilidad: los fakes/devoluciones antiguas traen el objeto plano;
      // el alcance vivo llega envuelto en { filas, alcance }.
      const posible = desc as { filas?: Partial<Record<TableName, Row[] | null>>; alcance?: Partial<Record<TableName, string[]>> }
      const esEnvuelto = !!posible && typeof posible === 'object' && 'filas' in posible
      const filas = esEnvuelto ? posible.filas! : (desc as Partial<Record<TableName, Row[] | null>>)
      const alcance = esEnvuelto ? posible.alcance : undefined
      const cambiadas: TableName[] = []
      for (const t of objetivo) await aplicar(t, filas[t] ?? null, cambiadas, alcance?.[t])
      const ts = ahora()
      for (const t of objetivo) {
        fechas.set(t, ts) // clave base: TTL/sección siguen funcionando sin cambios
        for (const y of alcance?.[t] ?? []) fechas.set(`${t}|${y}`, ts) // granular futuro
      }
      ultimoPull = ts
      if (onDescarga) onDescarga(objetivo)
      if (cambiadas.length && onCambio) onCambio(cambiadas)
      return cambiadas
    })
  }

  return {
    init,
    pull,
    getAllRows: (t: TableName) => init().then(() => store.getAllRows(t)),
    estado: () => ({ ultimoPull, hashes: Object.fromEntries(hashes) as Record<string, string> }),
    /** Última vez que cada fuente se descargó (`Facturas` o `Facturas|2026`). */
    fechasPorTabla: (): Record<string, number> => Object.fromEntries(fechas),
    close: () => store.close()
  }
}

export type Espejo = ReturnType<typeof crearEspejo>
