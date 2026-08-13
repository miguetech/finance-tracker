import { SheetsApi } from './api'
import { TABLES, sheetName, HEADER_ROWS } from './tables'
import { serializeRow } from './rows'
import type { Config } from '../types/entities'
import { CURRENCIES, DEFAULT_CURRENCY } from '../currency'

const ALL_TABLES = Object.keys(TABLES) as (keyof typeof TABLES)[]

const DEFAULT_CONFIG: Config = {
  empresa_nombre: 'Mi Empresa S.A.',
  empresa_rfc: 'XAXX010101000',
  empresa_direccion: '',
  empresa_telefono: '',
  empresa_email: '',
  empresa_logo: '',
  prefijo_folio: 'FAC-',
  contador_folio: 1,
  moneda: DEFAULT_CURRENCY,
  iva_porcentaje: 16,
  categorias_gastos: 'Renta,Internet,Papelería,Servicios',
  categorias_cxp: 'Materiales,Servicios,Impuestos,Otros',
  tipo_doc: 'RFC' as const,
  tipo_doc_etiqueta: ''
}

export async function createInitialSpreadsheet(api: SheetsApi): Promise<{ spreadsheetId: string; url: string }> {
  const { spreadsheetId, url } = await api.createSpreadsheet('FinanceTracker')
  const extra = ALL_TABLES.filter(t => t !== 'Config')
  await api.addSheets(spreadsheetId, extra.map(sheetName))

  const valueRanges: { range: string; values: (string | number)[][] }[] = []
  for (const t of ALL_TABLES) {
    const spec = TABLES[t]
    const headers = spec.map(c => c.header)
    if (HEADER_ROWS(t) === 1) {
      const letters = headers.map((_, i) => String.fromCharCode(65 + i))
      valueRanges.push({ range: `'${sheetName(t)}'!A1:${letters[letters.length - 1]}1`, values: [headers] })
    }
  }
  const configRows = (Object.entries(DEFAULT_CONFIG) as [string, unknown][]).map(([clave, valor]) => serializeRow(TABLES.Config, { clave, valor: String(valor) }))
  valueRanges.push({ range: `'Config'!A1:B${configRows.length}`, values: configRows })

  await api.batchUpdate(spreadsheetId, valueRanges)
  return { spreadsheetId, url }
}

export function configFromRows(rows: (string | number)[][]): Config {
  const map = new Map<string, string>()
  for (const [clave, valor] of rows) if (clave) map.set(String(clave), String(valor ?? ''))
  const num = (k: string) => {
    const v = map.get(k) ?? ''
    return v === '' ? 0 : Number(v)
  }
  return {
    ...DEFAULT_CONFIG,
    empresa_nombre: map.get('empresa_nombre') ?? DEFAULT_CONFIG.empresa_nombre,
    empresa_rfc: map.get('empresa_rfc') ?? '',
    empresa_direccion: map.get('empresa_direccion') ?? '',
    empresa_telefono: map.get('empresa_telefono') ?? '',
    empresa_email: map.get('empresa_email') ?? '',
    empresa_logo: map.get('empresa_logo') ?? '',
    prefijo_folio: map.get('prefijo_folio') ?? DEFAULT_CONFIG.prefijo_folio,
    contador_folio: num('contador_folio') || DEFAULT_CONFIG.contador_folio,
    moneda: map.get('moneda') || DEFAULT_CURRENCY,
    iva_porcentaje: num('iva_porcentaje') || DEFAULT_CONFIG.iva_porcentaje,
    categorias_gastos: map.get('categorias_gastos') ?? DEFAULT_CONFIG.categorias_gastos,
    categorias_cxp: map.get('categorias_cxp') ?? DEFAULT_CONFIG.categorias_cxp,
    tipo_doc: (map.get('tipo_doc') as Config['tipo_doc']) || DEFAULT_CONFIG.tipo_doc,
    tipo_doc_etiqueta: map.get('tipo_doc_etiqueta') ?? DEFAULT_CONFIG.tipo_doc_etiqueta
  }
}

export function configToRows(config: Config): (string | number)[][] {
  return (Object.entries(config) as [string, unknown][]).map(([clave, valor]) => serializeRow(TABLES.Config, { clave, valor: String(valor) }))
}

export const _internals = { DEFAULT_CONFIG, CURRENCIES }
