import { SheetsApi } from '../sheets/api'
import { TABLES, sheetName, HEADER_ROWS } from '../sheets/tables'
import { serializeRow, deserializeRow, migrateFacturaLegacyRow } from '../sheets/rows'
import type { TableName } from '../sheets/tables'

export interface TableStore {
  getAll<T = Record<string, string | number>>(t: TableName): Promise<T[]>
  append<T extends object>(t: TableName, rows: T[]): Promise<void>
  replace<T extends object>(t: TableName, rows: T[]): Promise<void>
}

function rangeOf(t: TableName): string {
  const spec = TABLES[t]
  const last = String.fromCharCode(64 + spec.length)
  const rowStart = HEADER_ROWS(t) + 1
  return `'${sheetName(t)}'!A${rowStart}:${last}`
}

/** Implementación sobre Google Sheets. Reemplazable por un SqlTableStore sin tocar la lógica de negocio. */
export function createSheetsTableStore(api: SheetsApi, sid: () => Promise<string>): TableStore {
  return {
    async getAll<T = Record<string, string | number>>(t: TableName): Promise<T[]> {
      const id = await sid()
      const res = await api.batchGet(id, [rangeOf(t)])
      const rows = res[Object.keys(res)[0]] ?? []
      const spec = TABLES[t]
      const headerLen = HEADER_ROWS(t)
      const data = rows.slice(headerLen === 0 ? 0 : headerLen - 1)
      if (t === 'Facturas') return data.map(r => deserializeRow(spec, migrateFacturaLegacyRow(r))).filter(r => Object.values(r).some(v => v !== '')) as unknown as T[]
      return data.map(r => deserializeRow(spec, r)).filter(r => Object.values(r).some(v => v !== '')) as unknown as T[]
    },
    async append<T extends object>(t: TableName, rows: T[]): Promise<void> {
      const id = await sid()
      const spec = TABLES[t]
      const values = rows.map(r => serializeRow(spec, r as Record<string, unknown>))
      const last = String.fromCharCode(64 + spec.length)
      await api.appendValues(id, `'${sheetName(t)}'!A${HEADER_ROWS(t) + 1}:${last}`, values)
    },
    async replace<T extends object>(t: TableName, rows: T[]): Promise<void> {
      const id = await sid()
      const spec = TABLES[t]
      const values = rows.map(r => serializeRow(spec, r as Record<string, unknown>))
      const last = String.fromCharCode(64 + spec.length)
      const base = HEADER_ROWS(t) + 1
      const range = `'${sheetName(t)}'!A${base}:${last}`
      if (values.length === 0) {
        await api.clearRange(id, range)
        return
      }
      await api.batchUpdate(id, [{ range, values }])
      await api.clearRange(id, `'${sheetName(t)}'!A${base + values.length}:${last}`)
    }
  }
}
