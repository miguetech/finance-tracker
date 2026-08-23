import type { EspejoStore, Row } from '../espejo'
import type { TableName } from '../../sheets/tables'

/** Store de referencia para tests y fallback de último recurso. */
export function crearStoreMemoria(): EspejoStore {
  const tablas = new Map<TableName, Row[]>()
  return {
    async init(_ddl: string[]) {},
    async getAllRows(t: TableName) { return tablas.get(t) ?? [] },
    async replaceTable(t: TableName, filas: Row[]) { tablas.set(t, filas.map(f => ({ ...f }))) },
    async close() {}
  }
}
