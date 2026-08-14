import { TABLES, sheetName, HEADER_ROWS, type TableName } from '../../../packages/shared/src/sheets/tables'
import { serializeRow, deserializeRow, migrateFacturaLegacyRow } from '../../../packages/shared/src/sheets/rows'
import { configFromRows, configToRows } from '../../../packages/shared/src/sheets/createSpreadsheet'
import { permsFor, parseModules, type Perms, type PermsInfo, type Usuario, MODULE_KEYS } from '../../../packages/shared/src/roles/roles'
import { kpisForMonth, gastosPorCategoria, topClientes } from '../../../packages/shared/src/calc/kpis'
import { estadoDesdeSaldo, buildFactura, round2 } from '../../../packages/shared/src/calc/invoice'
import { expandFolioTemplate } from '../../../packages/shared/src/calc/folio'
import { uid } from '../../../packages/shared/src/lib/uid'
import { withMutex } from '../../../packages/shared/src/sheets/mutex'
import { getCurrency } from '../../../packages/shared/src/currency'
import type { Config, Factura, Gasto, Cliente, CuentaPagar, Pago, Empleado, Proveedor, FacturaItem } from '../../../packages/shared/src/types/entities'

declare const SpreadsheetApp: any
declare const Session: any
declare const ContentService: any
declare const UrlFetchApp: any
declare const CacheService: any

const g = globalThis as Record<string, unknown>
const tokenCache = new Map<string, { email: string; at: number }>()

function ss() { return SpreadsheetApp.getActiveSpreadsheet() }

function sheet(t: TableName) { return ss().getSheetByName(sheetName(t)) }

function readRaw(t: TableName): (string | number)[][] {
  const s = sheet(t)
  if (!s) return []
  const values = s.getDataRange().getValues() as (string | number)[][]
  const skip = HEADER_ROWS(t)
  return skip ? values.slice(skip) : values
}

function readTable(t: TableName): Record<string, string | number>[] {
  const spec = TABLES[t]
  const data = readRaw(t)
  if (t === 'Facturas') return data.map(r => deserializeRow(spec, migrateFacturaLegacyRow(r))).filter(r => Object.values(r).some(v => v !== ''))
  return data.map(r => deserializeRow(spec, r)).filter(r => Object.values(r).some(v => v !== ''))
}

function appendRow(t: TableName, obj: Record<string, string | number>): void {
  const s = sheet(t)
  if (!s) return
  s.appendRow(serializeRow(TABLES[t], obj))
}

function replaceTable(t: TableName, rows: Record<string, string | number>[]): void {
  const s = sheet(t)
  if (!s) return
  const spec = TABLES[t]
  const base = HEADER_ROWS(t) + 1
  if (rows.length === 0) {
    s.getRange(base, 1, Math.max(1, s.getMaxRows() - base + 1), spec.length).clearContent()
    return
  }
  s.getRange(base, 1, rows.length, spec.length).setValues(rows.map(r => serializeRow(spec, r)))
  const extra = s.getMaxRows() - (base + rows.length - 1)
  if (extra > 0) s.getRange(base + rows.length, 1, extra, spec.length).clearContent()
}

function insertOrReplace(t: TableName, idKey: string, obj: Record<string, string | number>): void {
  const all = readTable(t)
  const exists = all.some(r => r[idKey] === obj[idKey])
  if (!exists) { appendRow(t, obj); return }
  replaceTable(t, all.map(r => (r[idKey] === obj[idKey] ? obj : r)))
}

function readConfig(): Config {
  const s = sheet('Config')
  if (!s) return { share_backend_url: '' } as unknown as Config
  const values = (s.getDataRange().getValues() as (string | number)[][]).filter(r => String(r[0]) !== 'mutex')
  return configFromRows(values)
}

function writeConfig(cfg: Config): void {
  const rows = configToRows(cfg)
  sheet('Config')!.getRange(1, 1, rows.length, 2).setValues(rows)
}

function mutexReadRow(clave: string): Promise<string | null> {
  const s = sheet('Config')
  if (!s) return Promise.resolve(null)
  const data = s.getDataRange().getValues() as (string | number)[][]
  for (const [k, v] of data) if (String(k) === clave) return Promise.resolve(String(v ?? ''))
  return Promise.resolve(null)
}

function mutexWriteRow(clave: string, valor: string): Promise<void> {
  const s = sheet('Config')!
  const data = s.getDataRange().getValues() as (string | number)[][]
  let row = -1
  for (let i = 0; i < data.length; i++) if (String(data[i][0]) === clave) { row = i + 1; break }
  if (row === -1) row = Math.max(data.length + 1, 27)
  s.getRange(`A${row}:B${row}`).setValues([[clave, valor]])
  return Promise.resolve()
}

async function verifyIdToken(idToken: string): Promise<string> {
  if (!idToken) throw new Error('Sesión requerida')
  const cached = tokenCache.get(idToken)
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.email
  const res = UrlFetchApp.fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`)
  const body = JSON.parse(res.getContentText())
  if (!body.email || body.email_verified !== true) throw new Error('Sesión inválida')
  tokenCache.set(idToken, { email: String(body.email), at: Date.now() })
  return String(body.email)
}

function ownerEmail(): string {
  return String(Session.getEffectiveUser().getEmail() ?? '')
}

function usuarios(): Usuario[] {
  return readTable('Usuarios') as unknown as Usuario[]
}

function usuarioFor(email: string): Usuario | null {
  const e = email.toLowerCase()
  return usuarios().find(u => u.email.toLowerCase() === e) ?? null
}

function permsInfo(p: Perms): PermsInfo {
  return {
    isAdmin: p.isAdmin,
    rol: p.rol,
    view: MODULE_KEYS.filter(m => p.canView(m)),
    edit: MODULE_KEYS.filter(m => p.canEdit(m))
  }
}

function sanitizeConfig(cfg: Config): Record<string, unknown> {
  const { contador_folio: _c, prefijo_folio: _p, ...rest } = cfg
  return rest
}

function denied(): never { throw new Error('No tienes permiso') }

function listFacturasFiltro(filtro: { estado?: string; mes?: string }): Factura[] {
  let rows = readTable('Facturas') as unknown as Factura[]
  if (filtro.mes) rows = rows.filter(f => f.fecha_emision.slice(0, 7) === filtro.mes)
  if (filtro.estado) {
    const pagos = readTable('Pagos')
    rows = rows.filter(f => {
      const tienePagos = pagos.some(p => p.id_origen === f.id_factura)
      const est = estadoDesdeSaldo(Number(f.saldo), Number(f.total), tienePagos)
      if (filtro.estado === 'pendientes') return est === 'pendiente' || est === 'parcial'
      return est === filtro.estado
    })
  }
  return rows
}

function todayISO(): string { return new Date().toISOString().slice(0, 10) }

function backendSaveCliente(c: Cliente): Cliente {
  if (!c?.nombre || !String(c.nombre).trim()) throw new Error('Nombre obligatorio')
  const parsed: Cliente = {
    id_cliente: c.id_cliente || uid('cli_'),
    nombre: String(c.nombre),
    rfc: c.rfc || '',
    email: c.email || '',
    telefono: c.telefono || '',
    direccion: c.direccion || '',
    fecha_registro: c.fecha_registro || todayISO()
  }
  insertOrReplace('Clientes', 'id_cliente', parsed as unknown as Record<string, string | number>)
  return parsed
}

function backendSaveGasto(ga: Gasto): Gasto {
  if (!ga?.descripcion || !String(ga.descripcion).trim()) throw new Error('Descripción obligatoria')
  const monto = Number(ga.monto)
  if (!Number.isFinite(monto) || monto < 0) throw new Error('Monto inválido')
  const parsed: Gasto = {
    id_gasto: ga.id_gasto || uid('gas_'),
    fecha: ga.fecha || todayISO(),
    categoria: ga.categoria || '',
    descripcion: String(ga.descripcion),
    monto: round2(monto),
    metodo_pago: ['Efectivo', 'Transferencia', 'Tarjeta'].includes(ga.metodo_pago) ? ga.metodo_pago : 'Efectivo',
    proveedor: ga.proveedor || ''
  }
  insertOrReplace('Gastos', 'id_gasto', parsed as unknown as Record<string, string | number>)
  return parsed
}

async function backendCreateFactura(input: { id_cliente: string; items: { descripcion: string; cantidad: number; precio_unitario: number }[]; fecha_emision: string; fecha_vencimiento: string; notas: string }): Promise<Factura> {
  if (!input?.id_cliente) throw new Error('Cliente obligatorio')
  const items = Array.isArray(input.items)
    ? input.items.filter(i => i && i.descripcion && Number(i.cantidad) > 0 && Number(i.precio_unitario) >= 0)
    : []
  if (items.length === 0) throw new Error('Mínimo 1 concepto')
  const clientes = readTable('Clientes') as unknown as Cliente[]
  const cliente = clientes.find(c => c.id_cliente === input.id_cliente)
  if (!cliente) throw new Error('Cliente no existe')
  const cfg = readConfig()
  const parsed = { id_cliente: String(input.id_cliente), fecha_emision: input.fecha_emision || todayISO(), fecha_vencimiento: input.fecha_vencimiento || '', notas: input.notas || '', items }
  const { items: builtItems, totals } = buildFactura(parsed.items, cfg.iva_porcentaje, getCurrency(cfg.moneda).decimals)
  const id_factura = uid('fac_')
  const folio = await withMutex(mutexReadRow, mutexWriteRow, async () => {
    const c = readConfig()
    const folioN = c.contador_folio
    writeConfig({ ...c, contador_folio: c.contador_folio + 1 })
    return `${expandFolioTemplate(c.prefijo_folio, parsed.fecha_emision)}${String(folioN).padStart(3, '0')}`
  })
  const factura: Factura = {
    id_factura,
    folio,
    id_cliente: parsed.id_cliente,
    nombre_cliente: String(cliente.nombre),
    fecha_emision: parsed.fecha_emision,
    fecha_vencimiento: parsed.fecha_vencimiento,
    subtotal: totals.subtotal,
    iva: totals.iva,
    total: totals.total,
    saldo: totals.total,
    fecha_pago: '',
    notas: parsed.notas
  }
  appendRow('Facturas', factura as unknown as Record<string, string | number>)
  for (const it of builtItems) appendRow('Factura_Items', { id_factura, ...it } as unknown as Record<string, string | number>)
  return factura
}

async function route(action: string, payload: any, p: Perms): Promise<unknown> {
  switch (action) {
    case 'getPerms': return permsInfo(p)
    case 'getConfig': {
      const cfg = readConfig()
      return p.isAdmin ? cfg : sanitizeConfig(cfg)
    }
    case 'listClientes':
      if (!p.canView('clientes')) return denied()
      return readTable('Clientes')
    case 'listFacturas':
      if (!p.canView('facturas')) return denied()
      return listFacturasFiltro(payload ?? {})
    case 'getFactura': {
      if (!p.canView('facturas')) return denied()
      const facturas = readTable('Facturas') as unknown as Factura[]
      const factura = facturas.find(f => f.id_factura === payload)
      if (!factura) throw new Error('Factura no existe')
      const items = (readTable('Factura_Items') as unknown as (FacturaItem & { id_factura: string })[]).filter(i => i.id_factura === payload)
      return { factura, items }
    }
    case 'listGastos':
      if (!p.canView('gastos')) return denied()
      return readTable('Gastos')
    case 'listEmpleados':
      if (!p.canView('empleados')) return denied()
      return readTable('Empleados')
    case 'listProveedores':
      if (!p.canView('proveedores')) return denied()
      return readTable('Proveedores')
    case 'listCxp':
      if (!p.canView('cuentas')) return denied()
      return readTable('Cuentas_Pagar')
    case 'listPagos':
      if (!p.canView('cuentas') && !p.canView('facturas')) return denied()
      const pagos = readTable('Pagos') as unknown as Pago[]
      return payload ? pagos.filter(p => p.id_origen === payload) : pagos
    case 'getReportes': {
      if (!p.canView('reportes') && !p.canView('dashboard')) return denied()
      const mes = String(payload ?? '')
      const facturas = readTable('Facturas') as unknown as Factura[]
      const gastos = readTable('Gastos') as unknown as Gasto[]
      const cxps = readTable('Cuentas_Pagar') as unknown as CuentaPagar[]
      const pagos = readTable('Pagos') as unknown as Pago[]
      const kpis = kpisForMonth(facturas, gastos, cxps, pagos, mes)
      const categorias = gastosPorCategoria(gastos.filter(g => g.fecha.slice(0, 7) === mes))
      const top = topClientes(facturas.filter(f => f.fecha_emision.slice(0, 7) === mes))
      return { kpis, categorias, top }
    }
    case 'getCategorias': {
      if (!p.canView('gastos') && !p.canView('cuentas')) return denied()
      const cfg = readConfig()
      const raw = payload === 'cxp' ? cfg.categorias_cxp : cfg.categorias_gastos
      return raw.split(',').map(s => s.trim()).filter(Boolean)
    }
    case 'saveCliente':
      if (!p.canEdit('clientes')) return denied()
      return backendSaveCliente(payload)
    case 'saveGasto':
      if (!p.canEdit('gastos')) return denied()
      return backendSaveGasto(payload)
    case 'createFactura':
      if (!p.canEdit('facturas')) return denied()
      return backendCreateFactura(payload)
    default:
      return denied()
  }
}

async function handle(e: any): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const body = JSON.parse(e.postData.contents)
    const email = await verifyIdToken(body.id_token)
    const p = permsFor(email, ownerEmail(), usuarioFor(email))
    const data = await route(body.action, body.payload, p)
    return { ok: true, data }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Error interno' }
  }
}

function respond(obj: unknown) {
  const out = ContentService.createTextOutput(JSON.stringify(obj))
  out.setMimeType(ContentService.MimeType.JSON)
  return out
}

function doGet() {
  return respond({ ok: true, service: 'ft-backend' })
}

async function doPost(e: any) {
  return respond(await handle(e))
}

g.doGet = doGet
g.doPost = doPost
