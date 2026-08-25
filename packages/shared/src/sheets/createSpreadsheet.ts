import { SheetsApi } from './api'
import { DriveApi } from '../drive/api'
import { TABLES, sheetName, HEADER_ROWS } from './tables'
import { serializeRow } from './rows'
import type { Config } from '../types/entities'
import { DEFAULT_CURRENCY } from '../currency'

const ALL_TABLES = Object.keys(TABLES) as (keyof typeof TABLES)[]

const DEFAULT_CONFIG: Config = {
  empresa_nombre: 'Mi Empresa S.A.',
  empresa_rfc: 'XAXX010101000',
  empresa_direccion: '',
  empresa_telefono: '',
  empresa_email: '',
  empresa_logo: '',
  empresa_cp: '',
  empresa_ciudad: '',
  empresa_pais: '',
  prefijo_folio: 'FAC-',
  contador_folio: 1,
  moneda: DEFAULT_CURRENCY,
  iva_porcentaje: 16,
  categorias_gastos: 'Renta,Internet,Papelería,Servicios',
  categorias_cxp: 'Materiales,Servicios,Impuestos,Otros',
  categorias_inventario: 'Frutas,Verduras,Materiales,Limpieza',
  monedas_activas: '',
  monedas_custom: '',
  tasas_cambio: '',
  metodos_pago: 'Efectivo,Transferencia,Tarjeta',
  tipo_doc: 'RFC' as const,
  tipo_doc_etiqueta: '',
  share_backend_url: '',
  metas_mensuales: '',
  comisiones_transaccion: '',
  comisiones_metodos: '',
  tasa_dia_activa: 'true',
  google_permisos: '',
  notif_gastos_activa: '',
  notif_cxc_activa: '',
  unidades_medida: 'pieza,kg,gr,litro,ml,caja,saco,docena,metro'
}

export async function createInitialSpreadsheet(api: SheetsApi, titulo = 'FinanceTracker'): Promise<{ spreadsheetId: string; url: string }> {
  const { spreadsheetId, url } = await api.createSpreadsheet(titulo)
  const extra = ALL_TABLES.filter(t => t !== 'Config')
  await api.addSheets(spreadsheetId, extra.map(sheetName))

  await writeAllHeaders(api, spreadsheetId, ALL_TABLES)
  const configRows = (Object.entries(DEFAULT_CONFIG) as [string, unknown][]).map(([clave, valor]) => serializeRow(TABLES.Config, { clave, valor: String(valor) }))
  await api.batchUpdate(spreadsheetId, [{ range: `'Config'!A1:B${configRows.length}`, values: configRows }])
  return { spreadsheetId, url }
}

/** Tablas que viven en cada spreadsheet EVENTOS-{año} (spec §2). */
export const TABLAS_EVENTO_AÑO: (keyof typeof TABLES)[] = [
  'Facturas', 'Factura_Items', 'Pagos', 'Gastos', 'Cuentas_Pagar',
  // Crecedores puros con fecha propia (spec §2 revisado): se particionan por año.
  'Movimientos_Stock', 'Asistencias', 'Tasas_Historial', 'Nomina_Detalles'
]

/** Spreadsheet de año: SOLO pestañas de evento, sin Config ni catálogos.
 *  Los ajustes y catálogos viven en el BASE. */
export async function crearSpreadsheetEventos(api: SheetsApi, titulo: string): Promise<{ spreadsheetId: string; url: string }> {
  const pestañas = TABLAS_EVENTO_AÑO.map(t => ({
    properties: { title: sheetName(t), gridProperties: { rowCount: 1000, columnCount: TABLES[t].length + 2 } }
  }))
  const { spreadsheetId, url } = await api.createSpreadsheet(titulo, pestañas)
  await writeAllHeaders(api, spreadsheetId, TABLAS_EVENTO_AÑO)
  return { spreadsheetId, url }
}

/**
 * Conecta a la hoja principal existente o crea una nueva solo si no hay ninguna.
 * Evita duplicar hojas de cálculo al iniciar sesión con almacenamiento vacío.
 */
export async function connectOrCreateSpreadsheet(api: SheetsApi): Promise<{ spreadsheetId: string; url: string; creada: boolean }> {
  const drive = new DriveApi(() => api.getToken())
  const existente = await drive.findSpreadsheet('FinanceTracker')
  if (existente) {
    await ensureTables(api, existente.id)
    return { spreadsheetId: existente.id, url: existente.url ?? `https://docs.google.com/spreadsheets/d/${existente.id}`, creada: false }
  }
  const created = await createInitialSpreadsheet(api)
  return { ...created, creada: true }
}

function writeAllHeaders(api: SheetsApi, spreadsheetId: string, tables: (keyof typeof TABLES)[]): Promise<void> {
  const valueRanges: { range: string; values: (string | number)[][] }[] = []
  for (const t of tables) {
    const spec = TABLES[t]
    const headers = spec.map(c => c.header)
    if (HEADER_ROWS(t) === 1) {
      const letters = headers.map((_, i) => String.fromCharCode(65 + i))
      valueRanges.push({ range: `'${sheetName(t)}'!A1:${letters[letters.length - 1]}1`, values: [headers] })
    }
  }
  if (valueRanges.length === 0) return Promise.resolve()
  return api.batchUpdate(spreadsheetId, valueRanges).then(() => undefined)
}

export async function ensureTables(api: SheetsApi, spreadsheetId: string, tablas: (keyof typeof TABLES)[] = ALL_TABLES): Promise<void> {
  const res = await api.getSpreadsheet(spreadsheetId)
  const existing = new Map(res.sheets.map(s => [s.properties.title, { columnCount: s.properties.gridProperties?.columnCount ?? 0, sheetId: s.properties.sheetId }]))
  const missing = tablas.filter(t => !existing.has(sheetName(t)))
  if (missing.length > 0) {
    await api.addSheets(spreadsheetId, missing.map(sheetName))
    await writeAllHeaders(api, spreadsheetId, missing)
  }
  const skip = new Set(missing.map(sheetName))
  await ensureColumns(api, spreadsheetId, existing, skip, tablas)
}

/** Garantiza SOLO las pestañas de evento en un spreadsheet de año. */
export async function ensureTablasEvento(api: SheetsApi, spreadsheetId: string): Promise<void> {
  return ensureTables(api, spreadsheetId, TABLAS_EVENTO_AÑO)
}

/** Añade columnas que falten en hojas existentes (migración de hojas creadas antes de nuevas columnas). */
async function ensureColumns(api: SheetsApi, spreadsheetId: string, existing: Map<string, { columnCount: number; sheetId: number }>, skip: Set<string>, tablas: (keyof typeof TABLES)[] = ALL_TABLES): Promise<void> {
  const requests: unknown[] = []
  for (const t of tablas) {
    if (t === 'Config') continue
    const name = sheetName(t)
    if (skip.has(name)) continue
    const meta = existing.get(name)
    const needed = TABLES[t].length
    if (!meta || meta.columnCount < needed) {
      requests.push({ addDimension: { range: { sheetId: meta?.sheetId ?? 0, dimension: 'COLUMNS', startIndex: meta?.columnCount ?? 0, endIndex: needed } } })
    }
  }
  if (requests.length === 0) return
  await api.gridBatchUpdate(spreadsheetId, requests)
}

export function configFromRows(rows: (string | number)[][]): Config {
  const map = new Map<string, string>()
  for (const [clave, valor] of rows) if (clave) map.set(String(clave), String(valor ?? ''))
  const num = (k: string) => {
    if (!map.has(k)) return null
    const v = map.get(k) ?? ''
    return v === '' ? null : Number(v)
  }
  const numOr = (k: string, def: number) => {
    const n = num(k)
    return n === null || Number.isNaN(n) ? def : n
  }
  return {
    ...DEFAULT_CONFIG,
    empresa_nombre: map.get('empresa_nombre') ?? DEFAULT_CONFIG.empresa_nombre,
    empresa_rfc: map.get('empresa_rfc') ?? '',
    empresa_direccion: map.get('empresa_direccion') ?? '',
    empresa_telefono: map.get('empresa_telefono') ?? '',
    empresa_email: map.get('empresa_email') ?? '',
    empresa_logo: map.get('empresa_logo') ?? '',
    empresa_cp: map.get('empresa_cp') ?? '',
    empresa_ciudad: map.get('empresa_ciudad') ?? '',
    empresa_pais: map.get('empresa_pais') ?? '',
    prefijo_folio: map.get('prefijo_folio') ?? DEFAULT_CONFIG.prefijo_folio,
    contador_folio: numOr('contador_folio', DEFAULT_CONFIG.contador_folio),
    moneda: map.get('moneda') || DEFAULT_CURRENCY,
    iva_porcentaje: numOr('iva_porcentaje', DEFAULT_CONFIG.iva_porcentaje),
    categorias_gastos: map.get('categorias_gastos') ?? DEFAULT_CONFIG.categorias_gastos,
    categorias_cxp: map.get('categorias_cxp') ?? DEFAULT_CONFIG.categorias_cxp,
    categorias_inventario: map.get('categorias_inventario') ?? DEFAULT_CONFIG.categorias_inventario,
    monedas_activas: map.get('monedas_activas') ?? '',
    monedas_custom: map.get('monedas_custom') ?? '',
    tasas_cambio: map.get('tasas_cambio') ?? '',
    metodos_pago: map.get('metodos_pago') ?? DEFAULT_CONFIG.metodos_pago,
    tipo_doc: (map.get('tipo_doc') as Config['tipo_doc']) || DEFAULT_CONFIG.tipo_doc,
    tipo_doc_etiqueta: map.get('tipo_doc_etiqueta') ?? DEFAULT_CONFIG.tipo_doc_etiqueta,
    share_backend_url: map.get('share_backend_url') ?? '',
    metas_mensuales: map.get('metas_mensuales') ?? '',
    comisiones_transaccion: map.get('comisiones_transaccion') ?? '',
    comisiones_metodos: map.get('comisiones_metodos') ?? '',
    tasa_dia_activa: map.get('tasa_dia_activa') ?? DEFAULT_CONFIG.tasa_dia_activa,
    google_permisos: map.get('google_permisos') ?? '',
    notif_gastos_activa: map.get('notif_gastos_activa') ?? '',
    notif_cxc_activa: map.get('notif_cxc_activa') ?? '',
    unidades_medida: map.get('unidades_medida') ?? DEFAULT_CONFIG.unidades_medida
  }
}

export function configToRows(config: Config): (string | number)[][] {
  return (Object.entries(config) as [string, unknown][]).map(([clave, valor]) => serializeRow(TABLES.Config, { clave, valor: String(valor) }))
}
