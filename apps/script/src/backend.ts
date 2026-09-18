import { TABLES, sheetName, HEADER_ROWS, type TableName } from '../../../packages/shared/src/sheets/tables'
import { serializeRow, deserializeRow, migrateFacturaLegacyRow } from '../../../packages/shared/src/sheets/rows'
import { configFromRows, configToRows } from '../../../packages/shared/src/sheets/createSpreadsheet'
import { permsFor, type Perms, type PermsInfo, type Usuario, MODULE_KEYS } from '../../../packages/shared/src/roles/roles'
import { kpisForMonth, gastosPorCategoria, topClientes } from '../../../packages/shared/src/calc/kpis'
import { estadoDesdeSaldo, buildFactura, round2 } from '../../../packages/shared/src/calc/invoice'
import { expandFolioTemplate } from '../../../packages/shared/src/calc/folio'
import { uid } from '../../../packages/shared/src/lib/uid'
import { todayLocal } from '../../../packages/shared/src/lib/date'
import { getCurrency } from '../../../packages/shared/src/currency'
import { parseRates } from '../../../packages/shared/src/currency/rates'
import type { Config, Factura, Gasto, Cliente, CuentaPagar, Pago, Empleado, Proveedor, FacturaItem, Producto, MovimientoStock, TipoMovimiento } from '../../../packages/shared/src/types/entities'
import { ConfigSchema, UsuarioSchema } from '../../../packages/shared/src/types/schemas'
import { assertClienteSinFacturas, assertProveedorSinCxp, enrichNombreProveedor, emailIgual } from '../../../packages/shared/src/data/guards'

declare const SpreadsheetApp: any
declare const Session: any
declare const ContentService: any
declare const UrlFetchApp: any
declare const LockService: any
declare const PropertiesService: any
declare const DriveApp: any
declare const Utilities: any

const g = globalThis as Record<string, unknown>
const tokenCache = new Map<string, { email: string; at: number }>()

function ss() { return SpreadsheetApp.getActiveSpreadsheet() }

function sheet(t: TableName) { return ss().getSheetByName(sheetName(t)) }

/** Pestaña Sistema (spec F1): metadatos del sistema fuera de Config. La crea
 *  bajo demanda y, si existía, hereda las claves de sistema que vivían en
 *  Config (estado legacy) para no romper el registro de años entre apps. */
function claveSistemaLocal(clave: string): boolean {
  return /^eventos_\d{4}$/.test(clave) || ['ft_vers', 'ft_instancia', 'ft_id', 'ft_estado', 'ft_historial', 'ft_dueño_email', 'ft_transferencia', 'ft_lock_largo', 'mutex', 'reset_historial', 'anio_activo'].includes(clave)
}

function sistemaSheet() {
  let s = ss().getSheetByName('Sistema')
  if (!s) {
    s = ss().insertSheet('Sistema')
    const cfg = ss().getSheetByName('Config')
    if (cfg) {
      const rows = cfg.getDataRange().getValues() as (string | number)[][]
      const sistema: (string | number)[][] = []
      for (const [k, v] of rows) {
        if (claveSistemaLocal(String(k))) sistema.push([k, v == null ? '' : v])
      }
      if (sistema.length) s.getRange(1, 1, sistema.length, 2).setValues(sistema)
    }
  }
  return s
}

function readRaw(t: TableName): (string | number)[][] {
  const s = sheet(t)
  if (!s) return []
  const values = s.getDataRange().getValues() as (string | number)[][]
  const skip = HEADER_ROWS(t)
  return skip ? values.slice(skip) : values
}

function readTable<T = Record<string, string | number>>(t: TableName): T[] {
  const spec = TABLES[t]
  const data = readRaw(t)
  if (t === 'Facturas') return data.map(r => deserializeRow(spec, migrateFacturaLegacyRow(r))).filter(r => Object.values(r).some(v => v !== '')) as unknown as T[]
  return data.map(r => deserializeRow(spec, r)).filter(r => Object.values(r).some(v => v !== '')) as unknown as T[]
}

function appendRow<T extends object>(t: TableName, obj: T): void {
  const s = sheet(t)
  if (!s) return
  s.appendRow(serializeRow(TABLES[t], obj as Record<string, unknown>))
}

function replaceTable<T extends object>(t: TableName, rows: T[]): void {
  const s = sheet(t)
  if (!s) return
  const spec = TABLES[t]
  const base = HEADER_ROWS(t) + 1
  if (rows.length === 0) {
    s.getRange(base, 1, Math.max(1, s.getMaxRows() - base + 1), spec.length).clearContent()
    return
  }
  s.getRange(base, 1, rows.length, spec.length).setValues(rows.map(r => serializeRow(spec, r as Record<string, unknown>)))
  const extra = s.getMaxRows() - (base + rows.length - 1)
  if (extra > 0) s.getRange(base + rows.length, 1, extra, spec.length).clearContent()
}

function insertOrReplace<T extends object>(t: TableName, idKey: string, obj: T): void {
  const all = readTable<Record<string, string | number>>(t)
  const o = obj as Record<string, string | number>
  const exists = all.some(r => r[idKey] === o[idKey])
  if (!exists) { appendRow(t, obj); return }
  replaceTable(t, all.map(r => (r[idKey] === o[idKey] ? o : r)))
}

function readConfig(): Config {
  const s = sheet('Config')
  if (!s) return { share_backend_url: '' } as unknown as Config
  const values = s.getDataRange().getValues() as (string | number)[][]
  return configFromRows(values)
}

function writeConfig(cfg: Config): void {
  const rows = configToRows(cfg)
  sheet('Config')!.getRange(1, 1, rows.length, 2).setValues(rows)
}

function mutexReadRow(clave: string): string | null {
  const s = sistemaSheet()
  if (!s) return null
  const data = s.getDataRange().getValues() as (string | number)[][]
  for (const [k, v] of data) if (String(k) === clave) return String(v ?? '')
  return null
}

function mutexWriteRow(clave: string, valor: string): void {
  const s = sistemaSheet()!
  const data = s.getDataRange().getValues() as (string | number)[][]
  let row = -1
  for (let i = 0; i < data.length; i++) if (String(data[i][0]) === clave) { row = i + 1; break }
  if (row === -1) row = Math.max(data.length + 1, 1)
  s.getRange(`A${row}:B${row}`).setValues([[clave, valor]])
}

function syncWithMutex<T>(fn: () => T): T {
  const MUTEX_KEY = 'mutex'
  const STALE_MS = 30000
  let attempts = 0
  while (true) {
    const current = mutexReadRow(MUTEX_KEY)
    const fresh = current !== null && (Date.now() - Number(current) < STALE_MS)
    if (current === null || !fresh) {
      const mine = String(Date.now())
      mutexWriteRow(MUTEX_KEY, mine)
      const verify = mutexReadRow(MUTEX_KEY)
      if (verify === mine) {
        try { return fn() } finally { mutexWriteRow(MUTEX_KEY, '') }
      }
    }
    attempts++
    if (attempts >= 10) throw new Error('Hoja ocupada, intenta de nuevo')
  }
}

function verifyIdToken(idToken: string): string {
  if (!idToken) throw new Error('Sesión requerida')
  const cached = tokenCache.get(idToken)
  if (cached && Date.now() - cached.at < 60 * 1000) return cached.email
  const res = UrlFetchApp.fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`)
  const body = JSON.parse(res.getContentText())
  if (!body.email || String(body.email_verified) !== 'true') throw new Error('Sesión inválida')
  const expectedAud = PropertiesService.getScriptProperties().getProperty('OAUTH_CLIENT_ID')
  if (!expectedAud) throw new Error('OAUTH_CLIENT_ID no configurado')
  if (String(body.aud ?? '') !== expectedAud) throw new Error('Sesión de otra aplicación')
  tokenCache.set(idToken, { email: String(body.email), at: Date.now() })
  return String(body.email)
}

function ownerEmail(): string {
  return String(Session.getEffectiveUser().getEmail() ?? '')
}

function usuarios(): Usuario[] {
  return readTable<Usuario>('Usuarios')
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
  let rows = readTable<Factura>('Facturas')
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

function todayISO(): string { return todayLocal() }

function tipoCambioDe(cfg: Config, moneda: string): number {
  if (!moneda || moneda === cfg.moneda) return 1
  const r = parseRates(cfg.tasas_cambio)
  const rate = r && r.base === cfg.moneda ? r.rates[moneda] : undefined
  return rate && rate > 0 ? rate : 1
}

function backendSaveProveedor(pr: Proveedor): Proveedor {
  if (!pr?.nombre || !String(pr.nombre).trim()) throw new Error('Nombre obligatorio')
  const parsed: Proveedor = {
    id_proveedor: pr.id_proveedor || uid('prov_'),
    nombre: String(pr.nombre),
    rfc: pr.rfc || '',
    email: pr.email || '',
    telefono: pr.telefono || '',
    direccion: pr.direccion || '',
    fecha_registro: pr.fecha_registro || todayISO()
  }
  insertOrReplace('Proveedores', 'id_proveedor', parsed)
  return parsed
}

function backendSaveEmpleado(emp: Empleado): Empleado {
  if (!emp?.nombre || !String(emp.nombre).trim()) throw new Error('Nombre obligatorio')
  const salario = Number(emp.salario) || 0
  const extra = emp as unknown as Record<string, string | number | undefined>
  const parsed: Empleado = {
    id_empleado: emp.id_empleado || uid('emp_'),
    nombre: String(emp.nombre),
    rfc: emp.rfc || '',
    puesto: emp.puesto || '',
    salario,
    salario_moneda: emp.salario_moneda || '',
    fecha_ingreso: emp.fecha_ingreso || todayISO(),
    activo: emp.activo === undefined ? 'true' : String(emp.activo),
    hora_entrada: String(extra.hora_entrada ?? ''),
    hora_salida: String(extra.hora_salida ?? ''),
    esquema_pago: (extra.esquema_pago as Empleado['esquema_pago']) || 'mensual',
    tarifa_hora_extra: Number(extra.tarifa_hora_extra) || 0,
    dias_laborales: String(extra.dias_laborales ?? '')
  }
  insertOrReplace('Empleados', 'id_empleado', parsed)
  return parsed
}

/** Registro de asistencia: un registro por empleado y día (se reemplaza si existe). */
function backendSaveAsistencia(input: Record<string, unknown>): Record<string, string | number> {
  const idEmpleado = String(input?.id_empleado ?? '')
  if (!idEmpleado) throw new Error('Empleado obligatorio')
  const fecha = String(input?.fecha ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('Fecha con formato YYYY-MM-DD')
  const emp = readTable<Empleado>('Empleados').find(e => e.id_empleado === idEmpleado)
  if (!emp) throw new Error('Empleado no existe')
  const saved: Record<string, string | number> = {
    id_asistencia: String(input.id_asistencia || uid('asi_')),
    id_empleado: idEmpleado,
    nombre_empleado: emp.nombre,
    fecha,
    hora_entrada: String(input.hora_entrada ?? ''),
    hora_salida: String(input.hora_salida ?? ''),
    notas: String(input.notas ?? '')
  }
  const all = readTable<Record<string, string | number>>('Asistencias')
  const existente = all.find(r => r.id_empleado === idEmpleado && String(r.fecha) === fecha && r.id_asistencia !== saved.id_asistencia)
  if (existente) {
    replaceTable('Asistencias', all.map(r => (r.id_asistencia === existente.id_asistencia ? saved : r)))
  } else {
    insertOrReplace('Asistencias', 'id_asistencia', saved)
  }
  return saved
}

function backendRegisterNomina(input: { id_empleado: string; mes: string; monto: number; metodo_pago: string; fecha: string; notas: string; moneda?: string }): Gasto {
  if (!input?.id_empleado) throw new Error('Empleado obligatorio')
  const mes = String(input.mes ?? '')
  if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error('Mes con formato YYYY-MM')
  const monto = Number(input.monto)
  if (!Number.isFinite(monto) || monto <= 0) throw new Error('Monto mayor a 0')
  const emp = readTable<Empleado>('Empleados').find(e => e.id_empleado === input.id_empleado)
  if (!emp) throw new Error('Empleado no existe')
  const cfg = readConfig()
  const moneda = input.moneda || cfg.moneda
  const fecha = input.fecha || `${mes}-01`
  const gasto: Gasto = {
    id_gasto: uid('gas_'),
    fecha,
    categoria: 'Nómina',
    descripcion: `Nómina ${mes} — ${emp.nombre}`,
    monto: round2(monto),
    metodo_pago: String(input.metodo_pago || 'Transferencia') as Gasto['metodo_pago'],
    proveedor: emp.nombre,
    moneda,
    tipo_cambio: tipoCambioDe(cfg, moneda)
  }
  appendRow('Gastos', gasto)
  return gasto
}

function backendCreateCxp(input: { id_proveedor: string; folio_documento: string; categoria: string; descripcion: string; fecha_emision: string; fecha_vencimiento: string; monto_total: number; notas: string; moneda?: string }): CuentaPagar {
  if (!input?.id_proveedor) throw new Error('Proveedor obligatorio')
  const monto = Number(input.monto_total)
  if (!Number.isFinite(monto) || monto <= 0) throw new Error('Monto mayor a 0')
  if (!input.descripcion || !String(input.descripcion).trim()) throw new Error('Descripción obligatoria')
  if (!input.fecha_vencimiento) throw new Error('Fecha de vencimiento obligatoria')
  const prov = readTable<Proveedor>('Proveedores').find(p => p.id_proveedor === input.id_proveedor)
  if (!prov) throw new Error('Proveedor no existe')
  const cfg = readConfig()
  const moneda = input.moneda || cfg.moneda
  const cxp: CuentaPagar = {
    id_cxp: uid('cxp_'),
    id_proveedor: input.id_proveedor,
    nombre_proveedor: prov.nombre,
    folio_documento: input.folio_documento || '',
    categoria: input.categoria || '',
    descripcion: String(input.descripcion),
    fecha_emision: input.fecha_emision || todayISO(),
    fecha_vencimiento: String(input.fecha_vencimiento),
    monto_total: round2(monto),
    saldo: round2(monto),
    estado: 'pendiente',
    notas: input.notas || '',
    moneda,
    tipo_cambio: tipoCambioDe(cfg, moneda)
  }
  appendRow('Cuentas_Pagar', cxp)
  return cxp
}

function backendRegisterPago(pago: { tipo: string; id_origen: string; fecha: string; monto: number; metodo_pago: string; notas: string }): Pago {
  if (!pago?.id_origen) throw new Error('Origen del pago requerido')
  const tipo = pago.tipo === 'cobro' ? 'cobro' : 'abono'
  const table = tipo === 'cobro' ? 'Facturas' as TableName : 'Cuentas_Pagar' as TableName
  const idKey = table === 'Facturas' ? 'id_factura' : 'id_cxp'
  const monto = Number(pago.monto)
  if (!Number.isFinite(monto) || monto <= 0) throw new Error('Monto mayor a 0')
  return syncWithMutex(() => {
    const rows = readTable(table)
    const target = rows.find(r => r[idKey] === pago.id_origen)
    if (!target) throw new Error('Origen del pago no existe')
    const saldoActual = Number(target.saldo)
    if (monto > saldoActual) throw new Error(`Pago excede saldo disponible (${saldoActual})`)
    const nuevoSaldo = round2(saldoActual - monto)
    const pagoRow: Pago = {
      id_pago: uid('pag_'),
      tipo,
      id_origen: String(pago.id_origen),
      fecha: pago.fecha || todayISO(),
      monto,
      metodo_pago: String(pago.metodo_pago || 'Efectivo') as Pago['metodo_pago'],
      notas: pago.notas || '',
      moneda: String(target.moneda ?? ''),
      tipo_cambio: Number(target.tipo_cambio) || 1
    }
    const updated = rows.map(r => {
      if (r[idKey] === pago.id_origen) {
        if (table === 'Facturas') return { ...r, saldo: nuevoSaldo, fecha_pago: nuevoSaldo <= 0 ? pago.fecha : String(r.fecha_pago ?? '') }
        return { ...r, saldo: nuevoSaldo, estado: nuevoSaldo <= 0 ? 'pagada' : 'parcial' }
      }
      return r
    })
    replaceTable(table, updated)
    appendRow('Pagos', pagoRow)
    return pagoRow
  })
}

function backendSaveProducto(pr: Producto): Producto {
  if (!pr?.nombre || !String(pr.nombre).trim()) throw new Error('Nombre obligatorio')
  const provs = readTable<Proveedor>('Proveedores').reduce<Record<string, string>>((m, p) => { m[p.id_proveedor] = p.nombre; return m }, {})
  const parsed: Producto = {
    id_producto: pr.id_producto || uid('prod_'),
    nombre: String(pr.nombre),
    categoria: pr.categoria || '',
    unidad: pr.unidad || 'pieza',
    stock: Number(pr.stock) || 0,
    stock_minimo: Number(pr.stock_minimo) || 0,
    precio_costo: Number(pr.precio_costo) || 0,
    precio_venta: Number(pr.precio_venta) || 0,
    id_proveedor: pr.id_proveedor || '',
    nombre_proveedor: pr.nombre_proveedor || provs[String(pr.id_proveedor || '')] || '',
    imagen: pr.imagen || '',
    notas: pr.notas || '',
    activo: pr.activo === undefined ? 'true' : String(pr.activo),
    fecha_registro: pr.fecha_registro || todayISO(),
    moneda: (pr as unknown as Record<string, string | undefined>).moneda || readConfig().moneda
  }
  insertOrReplace('Productos', 'id_producto', parsed)
  return parsed
}

function getOrCreateFolder(parent: any, nombre: string): any {
  const folders = parent.getFoldersByName(nombre)
  if (folders.hasNext()) return folders.next()
  return parent.createFolder(nombre)
}

function getAppFolder(modulo: string): any {
  const root = getOrCreateFolder(DriveApp.getRootFolder(), 'Finance Tracker')
  const subNombre = modulo === 'configuracion' ? 'Logos' : modulo.charAt(0).toUpperCase() + modulo.slice(1)
  return getOrCreateFolder(root, subNombre)
}

function backendUploadImagen(input: { nombre?: string; mimeType?: string; base64?: string; modulo?: string }): string {
  if (!input?.base64) throw new Error('Imagen requerida')
  const nombre = String(input.nombre || `imagen_${Date.now()}.png`)
  const mimeType = String(input.mimeType || 'image/png')
  const modulo = String(input.modulo || 'otros')
  const bytes = Utilities.base64Decode(String(input.base64))
  const blob = Utilities.newBlob(bytes, mimeType, nombre)
  const folder = getAppFolder(modulo)
  const file = folder.createFile(blob)
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW)
  return `https://lh3.googleusercontent.com/d/${file.getId()}`
}

function backendRegistrarMovimiento(input: { id_producto: string; tipo: TipoMovimiento; cantidad: number; motivo: string; id_proveedor: string; fecha: string }): MovimientoStock {
  if (!input?.id_producto) throw new Error('Producto obligatorio')
  const tipo = ['entrada', 'salida', 'ajuste'].includes(input.tipo) ? input.tipo : 'ajuste'
  const cantidad = Number(input.cantidad)
  if (!Number.isFinite(cantidad) || cantidad <= 0) throw new Error('Cantidad mayor a 0')
  return syncWithMutex(() => {
    const productos = readTable<Producto>('Productos')
    const prod = productos.find(p => p.id_producto === input.id_producto)
    if (!prod) throw new Error('Producto no existe')
    const stockActual = Number(prod.stock) || 0
    let nuevoStock = stockActual
    if (tipo === 'entrada') nuevoStock = stockActual + cantidad
    else if (tipo === 'salida') {
      if (cantidad > stockActual) throw new Error(`Stock insuficiente (disponible: ${stockActual})`)
      nuevoStock = stockActual - cantidad
    } else nuevoStock = cantidad
    const idProveedor = tipo === 'entrada' ? (input.id_proveedor || prod.id_proveedor || '') : ''
    const mov: MovimientoStock = {
      id_movimiento: uid('mov_'),
      id_producto: input.id_producto,
      tipo,
      cantidad,
      motivo: input.motivo || '',
      id_proveedor: idProveedor,
      fecha: input.fecha || todayISO()
    }
    replaceTable('Productos', productos.map(r => (r.id_producto === input.id_producto ? { ...r, stock: nuevoStock, id_proveedor: idProveedor || String(r.id_proveedor ?? '') } : r)))
    appendRow('Movimientos_Stock', mov)
    return mov
  })
}

function backendDeleteById(t: TableName, idKey: string, id: string): void {
  replaceTable(t, readTable(t).filter(r => r[idKey] !== id))
}

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
  insertOrReplace('Clientes', 'id_cliente', parsed)
  return parsed
}

function backendSaveGasto(ga: Gasto): Gasto {
  if (!ga?.descripcion || !String(ga.descripcion).trim()) throw new Error('Descripción obligatoria')
  const monto = Number(ga.monto)
  if (!Number.isFinite(monto) || monto < 0) throw new Error('Monto inválido')
  const cfg = readConfig()
  const moneda = ga.moneda || cfg.moneda
  const parsed: Gasto = {
    id_gasto: ga.id_gasto || uid('gas_'),
    fecha: ga.fecha || todayISO(),
    categoria: ga.categoria || '',
    descripcion: String(ga.descripcion),
    monto: round2(monto),
    metodo_pago: String(ga.metodo_pago || 'Efectivo'),
    proveedor: ga.proveedor || '',
    moneda,
    tipo_cambio: ga.tipo_cambio || tipoCambioDe(cfg, moneda)
  }
  insertOrReplace('Gastos', 'id_gasto', parsed)
  return parsed
}

function backendCreateFactura(input: { id_cliente: string; items: { descripcion: string; cantidad: number; precio_unitario: number }[]; fecha_emision: string; fecha_vencimiento: string; notas: string; moneda?: string }): Factura {
  if (!input?.id_cliente) throw new Error('Cliente obligatorio')
  const items = Array.isArray(input.items)
    ? input.items.filter(i => i && i.descripcion && Number(i.cantidad) > 0 && Number(i.precio_unitario) >= 0)
    : []
  if (items.length === 0) throw new Error('Mínimo 1 concepto')
  const clientes = readTable<Cliente>('Clientes')
  const cliente = clientes.find(c => c.id_cliente === input.id_cliente)
  if (!cliente) throw new Error('Cliente no existe')
  const cfg = readConfig()
  const moneda = input.moneda || cfg.moneda
  const parsed = { id_cliente: String(input.id_cliente), fecha_emision: input.fecha_emision || todayISO(), fecha_vencimiento: input.fecha_vencimiento || '', notas: input.notas || '', items }
  const { items: builtItems, totals } = buildFactura(parsed.items, cfg.iva_porcentaje, getCurrency(moneda).decimals)
  const id_factura = uid('fac_')
  const lock = LockService.getScriptLock()
  lock.waitLock(30000)
  let folio = ''
  try {
    folio = syncWithMutex(() => {
      const c = readConfig()
      const folioN = c.contador_folio
      writeConfig({ ...c, contador_folio: c.contador_folio + 1 })
      return `${expandFolioTemplate(c.prefijo_folio, parsed.fecha_emision)}${String(folioN).padStart(3, '0')}`
    })
  } finally {
    lock.releaseLock()
  }
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
    notas: parsed.notas,
    moneda,
    tipo_cambio: tipoCambioDe(cfg, moneda),
    editada: '',
    fecha_edicion: ''
  }
  appendRow('Facturas', factura)
  for (const it of builtItems) appendRow('Factura_Items', { id_factura, ...it })
  return factura
}

function backendUpdateFactura(id: string, input: { id_cliente: string; items: { descripcion: string; cantidad: number; precio_unitario: number }[]; fecha_emision: string; fecha_vencimiento: string; notas: string; moneda?: string }): Factura {
  if (!id) throw new Error('Factura requerida')
  if (!input?.id_cliente) throw new Error('Cliente obligatorio')
  const items = Array.isArray(input.items)
    ? input.items.filter(i => i && i.descripcion && Number(i.cantidad) > 0 && Number(i.precio_unitario) >= 0)
    : []
  if (items.length === 0) throw new Error('Mínimo 1 concepto')
  const facturas = readTable<Factura>('Facturas')
  const actual = facturas.find(f => f.id_factura === id)
  if (!actual) throw new Error('Factura no existe')
  const cliente = readTable<Cliente>('Clientes').find(c => c.id_cliente === input.id_cliente)
  if (!cliente) throw new Error('Cliente no existe')
  const cfg = readConfig()
  const moneda = input.moneda || actual.moneda || cfg.moneda
  const { items: builtItems, totals } = buildFactura(items, cfg.iva_porcentaje, getCurrency(moneda).decimals)
  const diff = round2(totals.total - Number(actual.total))
  const nuevoSaldo = round2(Math.max(0, Number(actual.saldo) + diff))
  const updated: Factura = {
    ...actual,
    id_cliente: input.id_cliente,
    nombre_cliente: String(cliente.nombre),
    fecha_emision: input.fecha_emision || actual.fecha_emision,
    fecha_vencimiento: input.fecha_vencimiento || actual.fecha_vencimiento,
    notas: input.notas || '',
    moneda,
    tipo_cambio: tipoCambioDe(cfg, moneda),
    subtotal: totals.subtotal,
    iva: totals.iva,
    total: totals.total,
    saldo: nuevoSaldo,
    editada: 'true',
    fecha_edicion: todayISO()
  }
  const oldItems = (readTable<FacturaItem & { id_factura: string }>('Factura_Items')).filter(i => i.id_factura !== id)
  replaceTable('Facturas', facturas.map(f => (f.id_factura === id ? updated : f)))
  replaceTable('Factura_Items', [...oldItems, ...builtItems.map(it => ({ id_factura: id, ...it }))])
  return updated
}

function route(action: string, payload: any, p: Perms): unknown {
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
    case 'listFacturasItems':
      if (!p.canView('facturas')) return denied()
      return readTable('Factura_Items')
    case 'getFactura': {
      if (!p.canView('facturas')) return denied()
      const facturas = readTable<Factura>('Facturas')
      const factura = facturas.find(f => f.id_factura === payload)
      if (!factura) throw new Error('Factura no existe')
      const items = readTable<FacturaItem & { id_factura: string }>('Factura_Items').filter(i => i.id_factura === payload)
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
    case 'listPagos': {
      if (!p.canView('cuentas') && !p.canView('facturas')) return denied()
      const all = readTable<Pago>('Pagos')
      if (payload) return all.filter(pago => pago.id_origen === payload)
      if (p.canView('cuentas')) return all
      return all.filter(pago => pago.tipo === 'cobro')
    }
    case 'getReportes': {
      if (!p.canView('reportes') && !p.canView('dashboard')) return denied()
      const mes = String(payload ?? '')
      const facturas = readTable<Factura>('Facturas')
      const gastos = readTable<Gasto>('Gastos')
      const cxps = readTable<CuentaPagar>('Cuentas_Pagar')
      const pagos = readTable<Pago>('Pagos')
      const kpis = kpisForMonth(facturas, gastos, cxps, pagos, mes)
      const categorias = gastosPorCategoria(gastos.filter(g => g.fecha.slice(0, 7) === mes))
      const top = topClientes(facturas.filter(f => f.fecha_emision.slice(0, 7) === mes))
      return { kpis, categorias, top }
    }
    case 'getCategorias': {
      const kind = payload === 'cxp' ? 'cuentas' : 'gastos'
      if (!p.canView(kind)) return denied()
      const cfg = readConfig()
      const raw = payload === 'cxp' ? cfg.categorias_cxp : cfg.categorias_gastos
      return raw.split(',').map(s => s.trim()).filter(Boolean)
    }
    case 'getVentasProducto': {
      if (!p.canView('reportes')) return denied()
      const { id, r } = (payload ?? {}) as { id?: string; r?: { desde?: string; hasta?: string } }
      const items = readTable<Record<string, string | number>>('Factura_Items')
      const facturas = readTable<Factura>('Facturas')
      return backendVentasProducto(items, facturas, String(id ?? ''), r ?? {})
    }
    case 'saveCliente':
      if (!p.canEdit('clientes')) return denied()
      return backendSaveCliente(payload)
    case 'deleteCliente':
      if (!p.canEdit('clientes')) return denied()
      assertClienteSinFacturas(readTable('Facturas'), String(payload))
      backendDeleteById('Clientes', 'id_cliente', String(payload))
      return { ok: true }
    case 'saveGasto':
      if (!p.canEdit('gastos')) return denied()
      return backendSaveGasto(payload)
    case 'deleteGasto':
      if (!p.canEdit('gastos')) return denied()
      backendDeleteById('Gastos', 'id_gasto', String(payload))
      return { ok: true }
    case 'createFactura':
      if (!p.canEdit('facturas')) return denied()
      return backendCreateFactura(payload)
    case 'updateFactura':
      if (!p.canEdit('facturas')) return denied()
      return backendUpdateFactura(String(payload?.id ?? ''), payload?.data ?? {})
    case 'deleteFactura':
      if (!p.canEdit('facturas')) return denied()
      backendDeleteById('Facturas', 'id_factura', String(payload))
      backendDeleteById('Factura_Items', 'id_factura', String(payload))
      backendDeleteById('Pagos', 'id_origen', String(payload))
      return { ok: true }
    case 'saveProveedor':
      if (!p.canEdit('proveedores') && !p.canEdit('cuentas') && !p.canEdit('inventario')) return denied()
      return backendSaveProveedor(payload)
    case 'deleteProveedor':
      if (!p.canEdit('proveedores')) return denied()
      assertProveedorSinCxp(readTable('Cuentas_Pagar'), String(payload))
      backendDeleteById('Proveedores', 'id_proveedor', String(payload))
      return { ok: true }
    case 'saveEmpleado':
      if (!p.canEdit('empleados')) return denied()
      return backendSaveEmpleado(payload)
    case 'deleteEmpleado':
      if (!p.canEdit('empleados')) return denied()
      backendDeleteById('Empleados', 'id_empleado', String(payload))
      return { ok: true }
    case 'registerNomina':
      if (!p.canEdit('empleados')) return denied()
      return backendRegisterNomina(payload)
    case 'listAsistencias': {
      if (!p.canView('empleados')) return denied()
      let rows = readTable<Record<string, string | number>>('Asistencias')
      const f = (payload ?? {}) as { id_empleado?: string; desde?: string; hasta?: string }
      if (f.id_empleado) rows = rows.filter(r => r.id_empleado === f.id_empleado)
      if (f.desde) rows = rows.filter(r => String(r.fecha) >= f.desde!)
      if (f.hasta) rows = rows.filter(r => String(r.fecha) <= f.hasta!)
      return rows.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
    }
    case 'saveAsistencia':
      if (!p.canEdit('empleados')) return denied()
      return backendSaveAsistencia(payload)
    case 'deleteAsistencia':
      if (!p.canEdit('empleados')) return denied()
      backendDeleteById('Asistencias', 'id_asistencia', String(payload))
      return { ok: true }
    case 'createCxp':
      if (!p.canEdit('cuentas')) return denied()
      return backendCreateCxp(payload)
    case 'deleteCxp':
      if (!p.canEdit('cuentas')) return denied()
      backendDeleteById('Cuentas_Pagar', 'id_cxp', String(payload))
      backendDeleteById('Pagos', 'id_origen', String(payload))
      return { ok: true }
    case 'registerPago':
      if (!p.canEdit('cuentas') && !p.canEdit('facturas')) return denied()
      return backendRegisterPago(payload)
    case 'listProductos':
      if (!p.canView('inventario')) return denied()
      return enrichNombreProveedor(readTable('Productos'), readTable<Proveedor>('Proveedores').reduce<Record<string, string>>((m, p) => { m[p.id_proveedor] = p.nombre; return m }, {}))
    case 'saveProducto':
      if (!p.canEdit('inventario')) return denied()
      return backendSaveProducto(payload)
    case 'uploadImagen': {
      const modulo = String(payload?.modulo ?? '')
      if (modulo === 'configuracion') {
        if (!p.isAdmin) return denied()
      } else if (modulo === 'inventario') {
        if (!p.canEdit('inventario')) return denied()
      } else {
        return denied()
      }
      return backendUploadImagen(payload)
    }
    case 'deleteProducto':
      if (!p.canEdit('inventario')) return denied()
      backendDeleteById('Productos', 'id_producto', String(payload))
      backendDeleteById('Movimientos_Stock', 'id_producto', String(payload))
      return { ok: true }
    case 'listMovimientos': {
      if (!p.canView('inventario')) return denied()
      const all = readTable<MovimientoStock>('Movimientos_Stock')
      if (payload) return all.filter(m => m.id_producto === payload)
      return all
    }
    case 'registrarMovimiento':
      if (!p.canEdit('inventario')) return denied()
      return backendRegistrarMovimiento(payload)
    case 'listUsuarios':
      if (!p.isAdmin) return denied()
      return readTable('Usuarios')
    case 'saveUsuario':
      if (!p.isAdmin) return denied()
      insertOrReplace('Usuarios', 'email', { ...UsuarioSchema.parse(payload), email: String(payload?.email ?? '').trim().toLowerCase() })
      return { ok: true }
    case 'deleteUsuario':
      if (!p.isAdmin) return denied()
      replaceTable('Usuarios', readTable('Usuarios').filter(r => !emailIgual(r.email, String(payload))))
      return { ok: true }
    case 'saveConfig':
      if (!p.isAdmin) return denied()
      writeConfig(ConfigSchema.parse(payload))
      return { ok: true }
    default:
      return denied()
  }
}

function routeAction(action: string, idToken: string, payload: unknown): { ok: boolean; data?: unknown; error?: string } {
  try {
    const email = verifyIdToken(idToken)
    const p = permsFor(email, ownerEmail(), usuarioFor(email))
    const data = route(action, payload, p)
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

function doGet(e: any) {
  const p = e?.parameter ?? {}
  if (!p.action) return respond({ ok: true, service: 'ft-backend' })
  let payload: unknown = {}
  if (p.payload) {
    try { payload = JSON.parse(p.payload) } catch { payload = String(p.payload) }
  }
  return respond(routeAction(p.action, String(p.id_token ?? ''), payload))
}

function doPost(e: any) {
  const body = JSON.parse(e.postData.contents)
  return respond(routeAction(body.action, body.id_token, body.payload))
}

g.doGet = doGet
g.doPost = doPost

/** Historial de ventas de un producto (importes convertidos a moneda base). */
function backendVentasProducto(
  items: Record<string, string | number>[],
  facturas: Factura[],
  idProducto: string,
  rango: { desde?: string; hasta?: string }
): Array<Record<string, string | number>> {
  const facPorId = new Map(facturas.map(f => [f.id_factura, f]))
  const filas: Array<Record<string, string | number>> = []
  for (const it of items) {
    if (String(it.id_producto ?? '') !== idProducto) continue
    const fac = facPorId.get(String(it.id_factura ?? ''))
    if (!fac) continue
    const fecha = fac.fecha_emision.slice(0, 10)
    if (rango.desde && fecha < rango.desde) continue
    if (rango.hasta && fecha > rango.hasta) continue
    const tc = Number(fac.tipo_cambio) || 1
    filas.push({
      fecha: fac.fecha_emision,
      folio: fac.folio,
      cliente: fac.nombre_cliente,
      cantidad: Number(it.cantidad),
      precio_unitario: Number(it.precio_unitario),
      importe_base: Math.round((tc > 0 ? Number(it.importe) / tc : Number(it.importe)) * 100) / 100
    })
  }
  return filas.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
}
