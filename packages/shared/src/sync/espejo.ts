import { ddlDesdeTables } from './ddl'
import { hashTabla } from './hash'
import { TABLES, type TableName } from '../sheets/tables'

export type Row = Record<string, string | number>

export interface EspejoStore {
  init(ddl: string[]): Promise<void>
  getAllRows(t: TableName): Promise<Row[]>
  replaceTable(t: TableName, filas: Row[]): Promise<void>
  close(): Promise<void>
}

/** Tablas de lectura frecuente: se refrescan en TTL/foco. */
export const TABLAS_CALIENTES: TableName[] = ['Facturas', 'Factura_Items', 'Pagos', 'Gastos', 'Cuentas_Pagar', 'Productos']

export interface EspejoDeps {
  store: EspejoStore
  /** Devuelve las filas de la tabla, o `null` si la tabla no está soportada por este origen. */
  fetchTable(t: TableName): Promise<Row[] | null>
  ahora?: () => number
  onCambio?: (tablas: TableName[]) => void
}

export function crearEspejo(deps: EspejoDeps) {
  const { store, fetchTable, ahora = Date.now, onCambio } = deps
  const hashes = new Map<TableName, string>()
  let ultimoPull = 0
  let initPromise: Promise<void> | null = null
  let cola: Promise<unknown> = Promise.resolve()

  function init(): Promise<void> {
    initPromise ??= (async () => {
      const ddl = ddlDesdeTables().flatMap(d => [d.create, ...d.indexes])
      await store.init(ddl)
    })()
    return initPromise
  }

  /** Serializa pulls: nunca dos descargas simultáneas. */
  function encolar<T>(fn: () => Promise<T>): Promise<T> {
    const resultado = cola.then(fn, fn)
    cola = resultado.catch(() => undefined)
    return resultado
  }

  async function pullUna(t: TableName, cambiadas: TableName[]): Promise<void> {
    const filas = await fetchTable(t)
    if (filas === null) return // tabla sin origen: no se envenena su hash
    const h = hashTabla(filas)
    if (hashes.get(t) !== h) {
      hashes.set(t, h)
      await store.replaceTable(t, filas)
      cambiadas.push(t)
    }
  }

  /**
   * Descarga tablas y actualiza el espejo solo donde cambió el hash.
   * Sin `tablas`: primer pull descarga todo; siguientes, solo calientes.
   */
  function pull(tablas?: TableName[]): Promise<TableName[]> {
    return encolar(async () => {
      await init()
      let objetivo = tablas
      if (!objetivo) objetivo = hashes.size ? TABLAS_CALIENTES : (Object.keys(TABLES) as TableName[])
      const cambiadas: TableName[] = []
      for (const t of objetivo) await pullUna(t, cambiadas)
      ultimoPull = ahora()
      if (cambiadas.length && onCambio) onCambio(cambiadas)
      return cambiadas
    })
  }

  return {
    init,
    pull,
    getAllRows: (t: TableName) => init().then(() => store.getAllRows(t)),
    estado: () => ({ ultimoPull, hashes: Object.fromEntries(hashes) as Record<string, string> }),
    close: () => store.close()
  }
}

export type Espejo = ReturnType<typeof crearEspejo>
