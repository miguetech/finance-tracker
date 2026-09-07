import type { EspejoStore, Row } from '../espejo'
import type { TableName } from '../../sheets/tables'

/** Store de referencia para tests y fallback de último recurso. */
export function crearStoreMemoria(): EspejoStore {
  const tablas = new Map<TableName, Row[]>()
  let rowidCounter = 0
  return {
    async init(_ddl: string[]) {},
    async getAllRows(t: TableName) { return tablas.get(t) ?? [] },
    async getAllRowsWithRowid(t: TableName) {
      const rows = tablas.get(t) ?? []
      return rows.map((r, i) => ({ ...r, rowid: i + 1 }))
    },
    async replaceTable(t: TableName, filas: Row[]) { tablas.set(t, filas.map(f => ({ ...f }))) },
    async clearTable(t: TableName) { tablas.set(t, []) },
    async close() {}
  }
}
