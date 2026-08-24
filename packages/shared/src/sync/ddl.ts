import { TABLES, type TableName } from '../sheets/tables'

/** Índices lógicos del espejo por tabla. */
const INDEXES: Partial<Record<TableName, string[]>> = {
  Factura_Items: ['id_factura'],
  Pagos: ['id_origen', 'fecha'],
  Movimientos_Stock: ['id_producto'],
  Asistencias: ['id_empleado', 'fecha'],
  Nomina_Detalles: ['id_empleado'],
  Cuentas_Pagar: ['fecha_vencimiento']
}

/** Tablas donde la primera columna NO es única (N filas por clave padre):
 *  ponerle PRIMARY KEY revienta el pull con SQLITE_CONSTRAINT_PRIMARYKEY. */
const SIN_PK: ReadonlySet<TableName> = new Set(['Factura_Items'])

function sqlType(type?: string): string {
  return type === 'number' ? 'REAL' : 'TEXT'
}

export interface DdlTabla { tabla: TableName; create: string; indexes: string[] }

/** Genera el DDL del espejo desde la especificación canónica TABLES. */
export function ddlDesdeTables(): DdlTabla[] {
  return (Object.keys(TABLES) as TableName[]).map(tabla => {
    const [pk, ...rest] = TABLES[tabla]
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
