import { TABLES, type TableName } from '../sheets/tables'

/** Índices lógicos del espejo por tabla. */
const INDEXES: Partial<Record<TableName, string[]>> = {
  Factura_Items: ['invoice_id'],
  Pagos: ['origin_id', 'fecha'],
  Movimientos_Stock: ['product_id'],
  Asistencias: ['employee_id', 'fecha'],
  Nomina_Detalles: ['employee_id'],
  Cuentas_Pagar: ['due_date']
}

/** Tablas donde la primera columna NO es única (N filas por clave padre):
 *  ponerle PRIMARY KEY revienta el pull con SQLITE_CONSTRAINT_PRIMARYKEY. */
const SIN_PK: ReadonlySet<TableName> = new Set([])

function sqlType(type?: string): string {
  return type === 'number' ? 'REAL' : 'TEXT'
}

export interface DdlTabla { tabla: TableName; create: string; indexes: string[] }

/** Genera el DDL del espejo desde la especificación canónica TABLES. */
export function ddlDesdeTables(): DdlTabla[] {
  return (Object.keys(TABLES) as TableName[]).map(tabla => {
    const cols = TABLES[tabla]
    if (tabla === 'Factura_Items') {
      const colSql = cols.map(c => `"${c.key}" ${sqlType(c.type)}`).join(', ')
      const create = `CREATE TABLE IF NOT EXISTS "Factura_Items" (${colSql}, PRIMARY KEY ("invoice_id", "linea"))`
      const idxCols = INDEXES[tabla] ?? []
      return {
        tabla,
        create,
        indexes: idxCols.map(col => `CREATE INDEX IF NOT EXISTS "idx_${tabla}_${col}" ON "${tabla}"("${col}")`)
      }
    }
    const [pk, ...rest] = cols
    const colSql = [
      SIN_PK.has(tabla) ? `"${pk.key}" ${sqlType(pk.type)}` : `"${pk.key}" ${sqlType(pk.type)} PRIMARY KEY`,
      ...rest.map(c => `"${c.key}" ${sqlType(c.type)}`)
    ].join(', ')
    const idxCols = INDEXES[tabla] ?? []
    return {
      tabla,
      create: `CREATE TABLE IF NOT EXISTS "${tabla}" (${colSql})`,
      indexes: idxCols.map(col => `CREATE INDEX IF NOT EXISTS "idx_${tabla}_${col}" ON "${tabla}"("${col}")`)
    }
  })
}