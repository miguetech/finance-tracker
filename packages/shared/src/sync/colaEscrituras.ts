import type { Repository } from '../data/repository'
import type { StorageAdapter } from '../data/storage'
import { uid } from '../lib/uid'
import { buildFactura } from '../calc/invoice'
import { getCurrency } from '../currency'
import type { Config, Cliente, CodigoAcceso } from '../types/entities'
import type { TableName } from '../sheets/tables'
import { espejoBus } from './espejoBus'
import { marcarFalloRed, marcarRedOk } from './redStore'

/** Cola local de escrituras para modo offline (spec espejo §9.5).
 *  Las mutaciones se guardan en orden y se reproducen contra Sheets al
 *  volver la red. Los folios se arbitran en Sheets al momento del replay
 *  (R4); los ids locales se asignan antes de encolar para que las
 *  operaciones encadenadas (factura → pago) referencien el id final. */

export const KEY_COLA = 'ft_cola_escrituras'

export interface OperacionEnCola {
  id_op: string
  metodo: string
  args: unknown[]
  creado_en: number
  estado: 'pendiente' | 'error'
  error?: string
}

export async function cargarCola(almacen: StorageAdapter): Promise<OperacionEnCola[]> {
  const raw = await almacen.get(KEY_COLA)
  if (!raw) return []
  try {
    const ops = JSON.parse(raw) as OperacionEnCola[]
    return Array.isArray(ops) ? ops : []
  } catch { return [] }
}

async function guardarCola(almacen: StorageAdapter, ops: OperacionEnCola[]): Promise<void> {
  await almacen.set(KEY_COLA, JSON.stringify(ops))
}

async function encolarOp(almacen: StorageAdapter, metodo: string, args: unknown[]): Promise<OperacionEnCola> {
  const ops = await cargarCola(almacen)
  const op: OperacionEnCola = { id_op: uid('op_'), metodo, args, creado_en: Date.now(), estado: 'pendiente' }
  await guardarCola(almacen, [...ops, op])
  return op
}

async function quitarOp(almacen: StorageAdapter, idOp: string): Promise<void> {
  await guardarCola(almacen, (await cargarCola(almacen)).filter(o => o.id_op !== idOp))
}

async function marcarErrorOp(almacen: StorageAdapter, idOp: string, error: string): Promise<void> {
  const ops = await cargarCola(almacen)
  await guardarCola(almacen, ops.map(o => (o.id_op === idOp ? { ...o, estado: 'error' as const, error } : o)))
}

export async function reencolarErrores(almacen: StorageAdapter): Promise<void> {
  const ops = await cargarCola(almacen)
  await guardarCola(almacen, ops.map(o => (o.estado === 'error' ? { ...o, estado: 'pendiente' as const, error: undefined } : o)))
}

export async function descartarErrores(almacen: StorageAdapter): Promise<void> {
  await guardarCola(almacen, (await cargarCola(almacen)).filter(o => o.estado !== 'error'))
}

/** Descarte individual desde el panel de detalle (con confirmación en UI). */
export async function descartarOp(almacen: StorageAdapter, idOp: string): Promise<void> {
  await quitarOp(almacen, idOp)
  notificarCola(await resumirCola(almacen))
}

/** Errores de transporte (reintentables) vs errores de negocio (permanentes). */
export function esErrorRed(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const msg = e instanceof Error ? `${e.message}` : String(e)
  const nombre = e instanceof Error ? e.name : ''
  if (nombre === 'AbortError') return true
  return /fetch|network|Failed to fetch|NetworkError|ERR_INTERNET|abort|token|401|403|429|500|503/i.test(msg)
}

export interface ResultadoVaciado { ejecutadas: number; fallidas: number; restantes: number }

/**
 * Reproduce la cola en orden FIFO. Un error de red detiene el vaciado
 * conservando el resto; un error de negocio marca la operación como
 * fallida y continúa con las siguientes.
 */
export async function vaciarCola(
  almacen: StorageAdapter,
  repo: Repository,
  opts: { sigueEnLinea?: () => boolean; esErrorRed?: (e: unknown) => boolean } = {}
): Promise<ResultadoVaciado> {
  const enLinea = opts.sigueEnLinea ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false))
  const red = opts.esErrorRed ?? esErrorRed
  let ejecutadas = 0
  let fallidas = 0
  const pendientesAlEntrar = await cargarCola(almacen)
  for (const [i, op] of pendientesAlEntrar.entries()) {
    if (!enLinea()) break
    if (op.estado === 'error') continue // requiere reintento o descarte manual
    // Pacing: cada op lee+escribe su tabla; sin pausa la ráfaga del flush
    // vuelve a quemar la cuota justo al reconectar.
    if (i > 0) await new Promise(r => setTimeout(r, 500))
    try {
      const fn = (repo as unknown as Record<string, (...a: unknown[]) => unknown>)[op.metodo]
      if (typeof fn !== 'function') throw new Error(`Método desconocido: ${op.metodo}`)
      await fn.apply(repo, op.args)
      await quitarOp(almacen, op.id_op)
      ejecutadas++
    } catch (e) {
      if (red(e)) break
      await marcarErrorOp(almacen, op.id_op, e instanceof Error ? e.message : String(e))
      fallidas++
    }
  }
  const restantes = (await cargarCola(almacen)).filter(o => o.estado === 'pendiente').length
  notificarCola(await resumirCola(almacen))
  return { ejecutadas, fallidas, restantes }
}

// ── Estado observable para la UI ────────────────────────────────────────────

export interface EstadoCola { pendientes: number; errores: number }

let estadoActual: EstadoCola = { pendientes: 0, errores: 0 }
const suscriptores = new Set<(e: EstadoCola) => void>()

export function suscribirCola(fn: (e: EstadoCola) => void): () => void {
  suscriptores.add(fn)
  fn(estadoActual)
  return () => { suscriptores.delete(fn) }
}

export function estadoColaActual(): EstadoCola {
  return estadoActual
}

function notificarCola(e: EstadoCola): void {
  estadoActual = e
  for (const fn of suscriptores) fn(e)
}

export async function resumirCola(almacen: StorageAdapter): Promise<EstadoCola> {
  const ops = await cargarCola(almacen)
  return {
    pendientes: ops.filter(o => o.estado === 'pendiente').length,
    errores: ops.filter(o => o.estado === 'error').length
  }
}

export async function refrescarEstadoCola(almacen: StorageAdapter): Promise<void> {
  notificarCola(await resumirCola(almacen))
}

// ── Repositorio con cola ────────────────────────────────────────────────────

/** Tablas del espejo a refrescar tras reproducir cada método. */
export const TABLAS_POR_METODO: Record<string, TableName[]> = {
  saveConfig: [],
  saveCliente: ['Clientes'],
  deleteCliente: ['Clientes'],
  saveUsuario: ['Usuarios'],
  deleteUsuario: ['Usuarios'],
  saveCodigo: ['Codigos_Acceso'],
  renovarCodigo: ['Codigos_Acceso'],
  deleteCodigo: ['Codigos_Acceso'],
  registrarDispositivo: ['Dispositivos'],
  removerDispositivo: ['Dispositivos'],
  createFactura: ['Facturas', 'Factura_Items', 'Productos'],
  updateFactura: ['Facturas', 'Factura_Items'],
  deleteFactura: ['Facturas', 'Factura_Items'],
  saveGasto: ['Gastos'],
  deleteGasto: ['Gastos'],
  saveProveedor: ['Proveedores'],
  deleteProveedor: ['Proveedores'],
  saveEmpleado: ['Empleados'],
  deleteEmpleado: ['Empleados'],
  saveAsistencia: ['Asistencias'],
  deleteAsistencia: ['Asistencias'],
  registerNomina: ['Gastos'],
  registerNominaAvanzada: ['Gastos', 'Nomina_Detalles'],
  registrarTasa: ['Tasas_Historial'],
  createCxp: ['Cuentas_Pagar'],
  deleteCxp: ['Cuentas_Pagar'],
  registerPago: ['Pagos', 'Facturas', 'Cuentas_Pagar', 'Gastos'],
  saveProducto: ['Productos'],
  deleteProducto: ['Productos'],
  registrarMovimiento: ['Productos', 'Movimientos_Stock'],
  saveGastoFijo: ['Gastos_Fijos'],
  deleteGastoFijo: ['Gastos_Fijos']
}

type Args = unknown[]

interface OpcionesMetodo {
  /** Asigna ids locales antes de encolar para encadenar operaciones. */
  normalizar?: (args: Args) => Args
  /** Valor devuelto a la UI mientras la operación está en cola. */
  eco?: (args: Args, ctx: { configActual?: () => Config | null }) => unknown
}

function conId(args: Args, campo: string, prefijo: string): Args {
  const obj = { ...(args[0] as Record<string, unknown>) }
  if (!obj[campo]) obj[campo] = uid(prefijo)
  return [obj, ...args.slice(1)]
}

const METODOS_COLA: Record<string, OpcionesMetodo> = {
  saveCliente: {
    normalizar: a => conId(a, 'customer_id', 'cli_'),
    eco: a => args0<Cliente>(a)
  },
  saveUsuario: {},
  saveCodigo: { eco: a => ({ ...(args0<CodigoAcceso>(a)), codigo: '' }) },
  registrarDispositivo: {},
  createFactura: {
    // Id local asignado ANTES de encolar: el eco y la reproducción comparten
    // el mismo id_factura y el retry tras un timeout no duplica la fila.
    normalizar: a => conId(a, 'invoice_id', 'fac_'),
    eco: (a, ctx) => {
      const input = args0<{ items: { descripcion: string; cantidad: number; unit_price: number }[]; moneda?: string; customer_id: string; issue_date: string; due_date: string; notas: string; invoice_id?: string }>(a)
      const cfg = ctx.configActual?.()
      const moneda = input.moneda || cfg?.moneda || 'USD'
      const { totals } = buildFactura(input.items, cfg?.vat_percent ?? 16, getCurrency(moneda).decimals)
      return {
        invoice_id: input.invoice_id || uid('fac_'),
        folio: '(folio pendiente)',
        customer_id: input.customer_id,
        customer_name: '',
        issue_date: input.issue_date,
        due_date: input.due_date,
        subtotal: totals.subtotal,
        iva: totals.iva,
        total: totals.total,
        saldo: totals.total,
        paid_at: '',
        notas: input.notas,
        moneda,
        exchange_rate: 1,
        editada: '',
        edited_at: ''
      }
    }
  },
  saveGasto: { normalizar: a => conId(a, 'expense_id', 'gas_'), eco: a => args0(a) },
  saveProveedor: { normalizar: a => conId(a, 'supplier_id', 'prv_'), eco: a => args0(a) },
  saveEmpleado: { normalizar: a => conId(a, 'employee_id', 'emp_'), eco: a => args0(a) },
  saveAsistencia: { normalizar: a => conId(a, 'attendance_id', 'asi_'), eco: a => args0(a) },
  saveProducto: { normalizar: a => conId(a, 'product_id', 'prod_'), eco: a => args0(a) },
  saveGastoFijo: { normalizar: a => conId(a, 'expense_idfijo', 'gfj_'), eco: a => args0(a) },
  registrarMovimiento: { eco: () => undefined },
  // Eco local de CxP: sin él la cuenta registrada offline no aparecía en la
  // tabla hasta el pull online (aplicarEscrituraLocal salía temprano).
  createCxp: {
    normalizar: a => conId(a, 'ap_id', 'cxp_'),
    eco: (a, ctx) => {
      const i = args0<{ supplier_id: string; document_serial: string; categoria: string; descripcion: string; issue_date: string; due_date: string; total_amount: number; notas: string; moneda?: string }>(a)
      const cfg = ctx.configActual?.()
      return {
        ...i,
        supplier_name: '',
        saldo: Number(i.total_amount) || 0,
        estado: 'pendiente',
        notas: i.notas ?? '',
        moneda: i.moneda || cfg?.moneda || 'USD',
        exchange_rate: 1
      }
    }
  },
  registerPago: {
    eco: a => ({ payment_id: uid('pag_'), ...args0<object>(a) })
  }
}

function args0<T>(args: Args): T {
  return args[0] as T
}

/** Eco visible de una operación encolada (null si no lo modela). */
export function ecoDe(metodo: string, args: Args, ctx: { configActual?: () => Config | null } = {}): Record<string, unknown> | null {
  const conf = METODOS_COLA[metodo]
  if (!conf?.eco) return null
  const eco = conf.eco(args, { configActual: ctx.configActual })
  return eco && typeof eco === 'object' ? (eco as Record<string, unknown>) : null
}

/** Clave id de cada tabla espejo, para insertar/reemplazar la fila del eco. */
export const ID_POR_TABLA: Partial<Record<TableName, string>> = {
  Clientes: 'customer_id',
  Proveedores: 'supplier_id',
  Empleados: 'employee_id',
  Facturas: 'invoice_id',
  Pagos: 'payment_id',
  Gastos: 'expense_id',
  Productos: 'product_id',
  Cuentas_Pagar: 'ap_id',
  Gastos_Fijos: 'expense_idfijo',
  Asistencias: 'attendance_id'
}

/** Bajas: sin eco que insertar, hay que QUITAR la fila del espejo local
 *  al momento; si no, el registro borrado "se reintegra" desde SQLite. */
export const BAJAS_POR_METODO: Partial<Record<string, { tabla: TableName; idKey: string }>> = {
  deleteCliente: { tabla: 'Clientes', idKey: 'customer_id' },
  deleteProveedor: { tabla: 'Proveedores', idKey: 'supplier_id' },
  deleteEmpleado: { tabla: 'Empleados', idKey: 'employee_id' },
  deleteGasto: { tabla: 'Gastos', idKey: 'expense_id' },
  deleteGastoFijo: { tabla: 'Gastos_Fijos', idKey: 'expense_idfijo' },
  deleteProducto: { tabla: 'Productos', idKey: 'product_id' },
  deleteCxp: { tabla: 'Cuentas_Pagar', idKey: 'ap_id' },
  deleteAsistencia: { tabla: 'Asistencias', idKey: 'attendance_id' },
  deleteFactura: { tabla: 'Facturas', idKey: 'invoice_id' }
}

/** Techo para el intento directo: pasado este plazo se considera red caída
 *  y la escritura cae a la cola. Garantiza que el modal SIEMPRE resuelva. */
const TECHO_INTENTO_DIRECTO_MS = 3_000

function conTecho<T>(p: Promise<T>, ms = TECHO_INTENTO_DIRECTO_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Failed to fetch: timeout de red')), ms)
    p.then(v => { clearTimeout(t); resolve(v) }, e => { clearTimeout(t); reject(e) })
  })
}

export interface OpcionesColaRepo {
  /** @deprecated Ya no se usa: la cola siempre está activa (offline-first). */
  activo?: () => boolean
  /** Techo del intento directo en ms (tests usan valores cortos). */
  techoMs?: number
  /** Snapshot de config cacheado (zustand) para calcular totales locales. */
  configActual?: () => Config | null
  storage: StorageAdapter
}

/**
 * Envuelve el repositorio: las escrituras SIEMPRE se encolan (offline-first).
 * SincronizadorCola se encarga de flushear cuando hay red.
 */
export function conColaEscrituras(repo: Repository, opciones: OpcionesColaRepo): Repository {
  const envuelto: Repository = { ...repo }
  for (const [metodo, conf] of Object.entries(TABLAS_POR_METODO)) {
    const original = (repo as unknown as Record<string, (...a: never[]) => unknown>)[metodo]
    if (typeof original !== 'function') continue
    ;(envuelto as unknown as Record<string, (...a: never[]) => unknown>)[metodo] = async (...args: Args): Promise<unknown> => {
      const normales = conf && METODOS_COLA[metodo]?.normalizar ? METODOS_COLA[metodo].normalizar!(args) : args
      // Siempre encolar (offline-first). El flusheo lo hace SincronizadorCola.
      await encolarOp(opciones.storage, metodo, normales)
      refrescarEstadoCola(opciones.storage)
      // El provider aplica el eco al espejo local para que la fila se vea ya guardada.
      try { espejoBus.onEscrituraLocal?.(metodo, normales) } catch { /* sin provider montado */ }
      return METODOS_COLA[metodo]?.eco ? METODOS_COLA[metodo].eco!(normales, { configActual: opciones.configActual }) : undefined
    }
  }
  return envuelto
}
