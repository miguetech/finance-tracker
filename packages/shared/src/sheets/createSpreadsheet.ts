import { SheetsApi } from './api'
import { DriveApi } from '../drive/api'
import { TABLES, sheetName, HEADER_ROWS } from './tables'
import { serializeRow } from './rows'
import type { Config } from '../types/entities'
import { DEFAULT_CURRENCY } from '../currency'
import { uid } from '../lib/uid'
import { SISTEMA_SHEET, SISTEMA_RANGO, esClaveSistema } from './sistema'

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
  unidades_medida: 'pieza,kg,gr,litro,ml,caja,saco,docena,metro',
  nombreBaseHoja: 'FinanceTracker'
}

/** Tablas que viven en cada spreadsheet EVENTOS-{año} (spec §2). */
export const TABLAS_EVENTO_AÑO: (keyof typeof TABLES)[] = [
  'Facturas', 'Factura_Items', 'Pagos', 'Gastos', 'Cuentas_Pagar',
  // Crecedores puros con fecha propia (spec §2 revisado): se particionan por año.
  'Movimientos_Stock', 'Asistencias', 'Tasas_Historial', 'Nomina_Detalles'
]

/** Tablas del BASE: catálogos + configuración + accesos. NUNCA las de evento. */
export const TABLAS_BASE: (keyof typeof TABLES)[] = ALL_TABLES.filter(t => !TABLAS_EVENTO_AÑO.includes(t))

/** Estampa la huella de identidad (spec F2 §3) en appProperties del archivo.
 *  Solo si hay DriveApi (el propio namespace drive.file). */
export async function estamparHuella(drive: DriveApi | undefined, id: string, tipo: 'base' | 'eventos', instancia: string): Promise<void> {
  if (!drive) return
  await drive.setAppProperties(id, {
    ft_vers: '1',
    ft_tipo: tipo,
    ft_instancia: instancia,
    ft_id: id,
    ft_estado: 'activo'
  })
}

export async function createInitialSpreadsheet(
  api: SheetsApi,
  titulo = 'FinanceTracker',
  opts: { drive?: DriveApi; instancia?: string } = {}
): Promise<{ spreadsheetId: string; url: string }> {
  const { spreadsheetId, url } = await api.createSpreadsheet(titulo)
  const extra = [...TABLAS_BASE.filter(t => t !== 'Config').map(sheetName), SISTEMA_SHEET]
  await api.addSheets(spreadsheetId, extra)

  await writeAllHeaders(api, spreadsheetId, TABLAS_BASE)
  const configRows = (Object.entries(DEFAULT_CONFIG) as [string, unknown][]).map(([clave, valor]) => serializeRow(TABLES.Config, { clave, valor: String(valor) }))
  await api.batchUpdate(spreadsheetId, [{ range: `'Config'!A1:B${configRows.length}`, values: configRows }])
  // Semilla del sistema: identidad compartida BASE/años (spec F1). En re-sync
  // (F6) se conserva la instancia del BASE anterior.
  const instancia = opts.instancia ?? uid('ftinst_')
  const sistemaRows = [
    ['ft_vers', '1'],
    ['ft_instancia', instancia],
    ['ft_id', spreadsheetId],
    ['ft_estado', 'activo']
  ]
  await api.batchUpdate(spreadsheetId, [{ range: `'${SISTEMA_SHEET}'!A1:B${sistemaRows.length}`, values: sistemaRows }])
  await estamparHuella(opts.drive, spreadsheetId, 'base', instancia)
  return { spreadsheetId, url }
}

/** Spreadsheet de año: SOLO pestañas de evento, sin Config ni catálogos.
 *  Los ajustes y catálogos viven en el BASE. */
export async function crearSpreadsheetEventos(
  api: SheetsApi,
  titulo: string,
  opts: { drive?: DriveApi; instancia?: string } = {}
): Promise<{ spreadsheetId: string; url: string }> {
  const pestañas = TABLAS_EVENTO_AÑO.map(t => ({
    properties: { title: sheetName(t), gridProperties: { rowCount: 1000, columnCount: TABLES[t].length + 2 } }
  }))
  const { spreadsheetId, url } = await api.createSpreadsheet(titulo, pestañas)
  await writeAllHeaders(api, spreadsheetId, TABLAS_EVENTO_AÑO)
  if (opts.instancia) await estamparHuella(opts.drive, spreadsheetId, 'eventos', opts.instancia)
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
  const created = await createInitialSpreadsheet(api, undefined, { drive })
  return { ...created, creada: true }
}

/** Lista las bases con huella activa para que el picker del arranque (spec F4
 *  §5: "varios → elegir") decida — nunca por nombre. Cada candidata trae su
 *  estado de ownership; solo `es_dueño`/`no_verificable` son vinculables. */
export interface CandidataBase {
  id: string
  titulo: string
  url: string
  dueño?: string
  rol: 'es_dueño' | 'no_es_dueño' | 'no_verificable'
  editable?: boolean
}

export async function listarCandidatasBase(api: SheetsApi): Promise<CandidataBase[]> {
  const drive = new DriveApi(() => api.getToken())
  const bases = await drive.findBases().catch(() => [])
  const out: CandidataBase[] = []
  for (const b of bases) {
    const info = await drive.getFileInfo(b.id).catch(() => null)
    const owners = info?.owners ?? []
    const rol: CandidataBase['rol'] =
      info?.capabilities?.canEdit === false ? 'no_es_dueño' :
      owners.length > 0 && !owners.some(o => o.me === true) ? 'no_es_dueño' :
      owners.some(o => o.me === true) ? 'es_dueño' :
      'no_verificable'
    out.push({
      id: b.id,
      titulo: b.name ?? b.id,
      url: b.webViewLink ?? `https://docs.google.com/spreadsheets/d/${b.id}`,
      dueño: owners.find(o => o.emailAddress)?.emailAddress,
      rol,
      editable: info?.capabilities?.canEdit ?? undefined
    })
  }
  return out
}

/** Boot por huella (spec F2 §5): NUNCA decidir identidad por nombre.
 *  - 1 BASE con `ft_tipo=base` → probe → adoptar.
 *  - varios → la WEB muestra el picker (`listarCandidatasBase`) antes de llamar;
 *    la extensión adopta el más reciente que pase el probe.
 *  - cero → crear BASE nuevo estampado (appProperties + Sistema). */
export async function vincularOCrearBase(api: SheetsApi): Promise<{ spreadsheetId: string; url: string; creada: boolean; huella: boolean }> {
  const drive = new DriveApi(() => api.getToken())
  const bases = await drive.findBases().catch(() => [])
  if (bases.length > 0) {
    const orden = [...bases].sort((a, b) => String(b.modifiedTime ?? '').localeCompare(String(a.modifiedTime ?? '')))
    for (const cand of orden) {
      // Gate de ownership (§7): hoja ajena compartida jamás; sin metadata
      // alcanzable (offline/fuera de namespace) → prueba de edición real.
      try {
        const info = await drive.getFileInfo(cand.id)
        if (info?.owners && info.owners.length > 0 && !info.owners.some(o => o.me === true)) continue
      } catch {
        // offline: no bloquee el boot de un dueño ya operando (fail-open)
      }
      try {
        await ensureTables(api, cand.id)
        return { spreadsheetId: cand.id, url: cand.webViewLink ?? `https://docs.google.com/spreadsheets/d/${cand.id}`, creada: false, huella: true }
      } catch {
        // Sin permisos de edición o BASE inválido: seguir con el siguiente.
      }
    }
  }
  const creada = await createInitialSpreadsheet(api, undefined, { drive })
  return { ...creada, creada: true, huella: false }
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

function detectarTipoSpreadsheet(existing: Map<string, { columnCount: number; sheetId: number }>): 'base' | 'evento' {
  const tieneConfig = existing.has(sheetName('Config'))
  const tieneEvento = TABLAS_EVENTO_AÑO.some(t => existing.has(sheetName(t)))
  if (tieneConfig && !tieneEvento) return 'base'
  if (tieneEvento && !tieneConfig) return 'evento'
  return 'base' // por defecto
}

export async function ensureTables(api: SheetsApi, spreadsheetId: string, tablas?: (keyof typeof TABLES)[]): Promise<void> {
  const res = await api.getSpreadsheet(spreadsheetId)
  const existing = new Map(res.sheets.map(s => [s.properties.title, { columnCount: s.properties.gridProperties?.columnCount ?? 0, sheetId: s.properties.sheetId }]))
  const esBase = existing.has(sheetName('Config'))

  const tablasObjetivo = tablas ?? (detectarTipoSpreadsheet(existing) === 'evento' ? TABLAS_EVENTO_AÑO : TABLAS_BASE)

  const missing = tablasObjetivo.filter(t => !existing.has(sheetName(t)))
  // El BASE siempre lleva pestaña Sistema (F1); un BASE legacy la recibe aquí.
  if (esBase && !existing.has(SISTEMA_SHEET)) missing.push(SISTEMA_SHEET as keyof typeof TABLES)
  if (missing.length > 0) {
    await api.addSheets(spreadsheetId, missing.map(sheetName))
    await writeAllHeaders(api, spreadsheetId, missing.filter(t => t !== (SISTEMA_SHEET as keyof typeof TABLES)))
  }
  const skip = new Set(missing.map(sheetName))
  await ensureColumns(api, spreadsheetId, existing, skip, tablasObjetivo)
  if (esBase) await migrarSistema(api, spreadsheetId)
}

/** F1: migración única sobre el BASE — crea/rellena Sistema y saca las claves
 *  de sistema que sobrevivieron en Config (eventos_{año}, anio_activo, mutex).
 *  Idempotente: si Sistema ya tiene identidad (ft_*) y Config no lleva claves
 *  de sistema, no toca nada. Estado medio-migrado NUNCA se acepta: se completa. */
async function migrarSistema(api: SheetsApi, spreadsheetId: string): Promise<void> {
  const lectura = await api.batchGet(spreadsheetId, [`'Config'!A1:B500`, SISTEMA_RANGO])
  const config = filasClaveValor(lectura[`'Config'!A1:B500`])
  const sistema = filasClaveValor(lectura[SISTEMA_RANGO])

  const systemConfig = config.filter(r => esClaveSistema(r[0]))
  const negocio = config.filter(r => !esClaveSistema(r[0]))
  const marcas = new Set(sistema.map(r => r[0]))
  const identidad = ['ft_vers', 'ft_instancia', 'ft_id', 'ft_estado']
  const yaMigrado = systemConfig.length === 0 && identidad.every(k => marcas.has(k))
  if (yaMigrado) return

  const merged = new Map<string, string>()
  for (const [k, v] of sistema) merged.set(k, v)
  for (const [k, v] of systemConfig) if (!merged.has(k)) merged.set(k, v)
  if (!merged.has('ft_vers')) merged.set('ft_vers', '1')
  if (!merged.has('ft_instancia')) merged.set('ft_instancia', uid('ftinst_'))
  if (!merged.has('ft_id')) merged.set('ft_id', spreadsheetId)
  if (!merged.has('ft_estado')) merged.set('ft_estado', 'activo')
  if (merged.size > 0) {
    const rows = [...merged.entries()].map(([k, v]) => [k, v])
    await api.batchUpdate(spreadsheetId, [{ range: SISTEMA_RANGO.replace('B500', `B${rows.length}`), values: rows }])
  }
  // Config queda SOLO con claves de negocio: limpiar rango y reescribir.
  await api.clearRange(spreadsheetId, `'Config'!A1:B500`)
  if (negocio.length > 0) {
    await api.batchUpdate(spreadsheetId, [{ range: `'Config'!A1:B${negocio.length}`, values: negocio }])
  }
}

/** Normaliza filas clave/valor (ignora celdas no-array de fakes/meta malformada). */
function filasClaveValor(raw: (string | number)[][] | undefined): [string, string][] {
  const out: [string, string][] = []
  for (const r of raw ?? []) {
    if (!Array.isArray(r)) continue
    const clave = String(r[0] ?? '')
    if (!clave) continue
    out.push([clave, String(r[1] ?? '')])
  }
  return out
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
    unidades_medida: map.get('unidades_medida') ?? DEFAULT_CONFIG.unidades_medida,
    nombreBaseHoja: map.get('nombreBaseHoja') ?? DEFAULT_CONFIG.nombreBaseHoja
  }
}

export function configToRows(config: Config): (string | number)[][] {
  return (Object.entries(config) as [string, unknown][]).map(([clave, valor]) => serializeRow(TABLES.Config, { clave, valor: String(valor) }))
}
