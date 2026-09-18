import { SheetsApi } from '../sheets/api'
import { DriveApi, type UploadImagenInput } from '../drive/api'
import { TABLES, HEADER_ROWS, sheetName, type TableName } from '../sheets/tables'
import { serializeRow } from '../sheets/rows'
import { configFromRows, configToRows, createInitialSpreadsheet, ensureTables, crearSpreadsheetEventos, ensureTablasEvento, estamparHuella, TABLAS_EVENTO_AÑO, TABLAS_BASE } from '../sheets/createSpreadsheet'
import { withMutex } from '../sheets/mutex'
import { SISTEMA_RANGO, esClaveSistema } from '../sheets/sistema'
import { KEYS, type StorageAdapter } from './storage'
import { createSheetsTableStore, type TableStore } from './tableStore'
import { uid } from '../lib/uid'
import { todayLocal } from '../lib/date'
import { getCurrency } from '../currency'
import { parseRates, rateFor, convert } from '../currency/rates'
import { buildFactura, estadoDesdeSaldo, round2 } from '../calc/invoice'
import { kpisForMonth, topClientes, gastosPorCategoria, type Kpis } from '../calc/kpis'
import { expandFolioTemplate } from '../calc/folio'
import { estadoResultados, puntoDeEquilibrio, reconversionMonetaria, flujoCaja } from '../reports/financieros'
import { productosStockBajo, movimientosPorMes, statsMultiproducto, historialVentasProducto, type VentaProductoFila } from '../reports/inventario'
import { metasVsLogros, parseMetas } from '../reports/metas'
import { parseComisiones, parseComisionesMetodos } from '../reports/comisiones'
import type { ResultadoPL, PuntoEquilibrio, ResumenReconversion, ResultadoFlujoCaja, RangoFecha, StatsProducto } from '../reports/types'
import type { NominaDetalle } from '../reports/nomina'

export interface NominaAvanzadaInput {
  id_empleado: string
  mes: string
  monto: number
  metodo_pago: MetodoPago
  fecha: string
  notas: string
  moneda?: string
  sueldo_base?: number
  horas_extra?: number
  tarifa_hora_extra?: number
  bonos?: number
  comisiones?: number
  pagos_divididos?: { metodo_pago: string; moneda: string; monto: number }[]
}
import type { Config, Cliente, Empleado, Asistencia, Factura, FacturaItem, Gasto, Proveedor, CuentaPagar, Pago, MetodoPago, Producto, MovimientoStock, TipoMovimiento, CodigoAcceso, Dispositivo, GastoFijo, TasaHistorial } from '../types/entities'
import { ClienteSchema, ConfigSchema, FacturaInputSchema, GastoSchema, GastoFijoSchema, TasaHistorialSchema, ProveedorSchema, CxpInputSchema, PagoInputSchema, EmpleadoSchema, AsistenciaSchema, NominaInputSchema, NominaDetalleInputSchema, UsuarioSchema, ProductoSchema, MovimientoStockSchema } from '../types/schemas'
import type { Usuario, UserRole } from '../roles/roles'
import { assertClienteSinFacturas, assertProveedorSinCxp, enrichNombreProveedor, emailIgual } from './guards'
import { generarCodigo, prefijoDesdeNombre, CODIGO_ROLES_SIN_ADMIN } from '../lib/codigos'

export interface RepoContext {
  api: SheetsApi
  storage: StorageAdapter
  getSpreadsheetId(): Promise<string>
  /** Gate de ownership (spec F3 §7). 'owner' (default) exige ser dueño;
   *  'backend' (Hono/service account) se salta el gate y NUNCA auto-crea hojas. */
  modo?: 'owner' | 'backend'
}

/** Identidad de una hoja para inventario/picker (spec F4 §5-§6). */
export type HojaTipo = 'base' | 'eventos' | 'desconocido'
export type HojaEstado = 'activo' | 'reemplazado' | 'borrado' | 'legacy'
export type RolOwnership = 'es_dueño' | 'no_es_dueño' | 'no_verificable'

export interface HojaInfo {
  id: string
  titulo: string
  url: string
  tipo: HojaTipo
  /** `ft_instancia` de la huella (solo hojas estampadas). */
  instancia?: string
  estado: HojaEstado
  /** Email del dueño cuando el namespace drive.file lo alcanza. */
  dueño?: string
  rol: RolOwnership
  editable?: boolean
}

export interface InventarioHojas {
  base: HojaInfo
  años: { año: string; hoja: HojaInfo }[]
  /** Otras bases con huella activa en la cuenta (pickers §5: "varios → elegir"). */
  candidatas: HojaInfo[]
}

// ── Transferencia de propiedad (spec F7 §10) ────────────────────────────────
export type EstadoTransferencia = 'hecho' | 'fallo'
export interface RegistroTransferencia {
  id: string
  tipo: 'base' | 'eventos'
  año?: string
  estado: EstadoTransferencia
}

export interface HojaTransferencia {
  id: string
  tipo: 'base' | 'eventos'
  año?: string
  rol: RolOwnership
  motivo?: string
}

export interface PreflightTransferencia {
  email: string
  hojas: HojaTransferencia[]
  /** Ids con `fallo` pendiente de retomar (marcador `ft_transferencia`). */
  retomables: string[]
  /** ¿Todas las hojas son tuyas y transferibles? Si no, el flujo ofrece plan B. */
  posible: boolean
}

export interface ResultadoTransferencia {
  id: string
  tipo: 'base' | 'eventos'
  año?: string
  estado: 'transferido' | 'ya_transferido' | 'rechazado'
  motivo?: string
}

export interface TransferenciaResultado {
  email: string
  resultados: ResultadoTransferencia[]
  transferidos: number
  rechazados: number
}

const sepTrans = ';'
const sepCampo = '|'

/** `año|tipo|id|estado;…` — memo de transferencia (idempotente desde ambos lados). */
function serializarTransferencia(regs: RegistroTransferencia[]): string {
  return regs
    .map(r => `${r.año ?? ''}${sepCampo}${r.tipo}${sepCampo}${r.id}${sepCampo}${r.estado}`)
    .join(sepTrans)
}

function parsearTransferencia(valor?: string): RegistroTransferencia[] {
  if (!valor) return []
  const regs: RegistroTransferencia[] = []
  for (const seg of valor.split(sepTrans)) {
    const [año, tipo, id, estado] = seg.split(sepCampo)
    if (!id || (tipo !== 'base' && tipo !== 'eventos')) continue
    regs.push({ id, tipo, año: año || undefined, estado: estado === 'hecho' ? 'hecho' : 'fallo' })
  }
  return regs
}

export function createRepository(ctx: RepoContext) {
  const { api } = ctx
  const sid = ctx.getSpreadsheetId
  const store: TableStore = new Proxy(createSheetsTableStore(api, sid), {
    get(t, k, r) {
      const v = Reflect.get(t, k, r)
      // Cualquier escritura al BASE invalida el caché de pestañas (p. ej. una
      // migración legacy que inyecta tabs) → el próximo probe la ve fresca.
      if (typeof v === 'function' && (k === 'replace' || k === 'append' || k === 'setCell')) {
        return (...a: unknown[]) => {
          baseTablasCache = null
          return (v as unknown as (...x: unknown[]) => Promise<unknown>).apply(t, a)
        }
      }
      return typeof v === 'function' ? v.bind(t) : v
    },
  })
  const drive = new DriveApi(() => api.getToken())

  // ── Hoja-por-año (spec 2026-08-25 §2-§7) ──────────────────────────────────
  // Catálogos/config viven en el BASE (sid principal); los documentos se
  // escriben en el spreadsheet del AÑO DE SU FECHA. El espejo/UI siguen viendo
  // tablas lógicas únicas: las lecturas unen los fragmentos por año.

  // Fuente única: lo que vive en archivos de año (createSpreadsheet).
  const TABLAS_EVENTO: ReadonlySet<string> = new Set(TABLAS_EVENTO_AÑO as string[])

  const storesEvento = new Map<string, TableStore>()

  function añoDeFila(fila: Record<string, unknown>): string {
    const f = String(fila.fecha_emision ?? fila.fecha ?? '')
    return /^\d{4}/.test(f) ? f.slice(0, 4) : ''
  }

  /** Mapa id_factura → año de emisión (spec F5 §8): `Factura_Items` no tiene
   *  fecha; su año se resuelve SIEMPRE por el padre, nunca por el año en curso. */
  const mapaAnioFacturas = async (): Promise<Map<string, string>> => {
    const facturas = await readTable<Factura>('Facturas')
    const m = new Map<string, string>()
    for (const f of facturas) {
      const anio = añoDeFila(f as unknown as Record<string, unknown>)
      if (anio && f.id_factura) m.set(f.id_factura, anio)
    }
    return m
  }

  /** Año de una fila de `Factura_Items` según su factura padre. '' si huérfana. */
  async function anioDeItem(fila: Record<string, unknown>): Promise<string> {
    const idPadre = String(fila.id_factura ?? '')
    if (!idPadre) return ''
    const map = await mapaAnioFacturas()
    return map.get(idPadre) ?? ''
  }

/** Registro de años vive como filas CRUDAS en la pestaña Sistema (claves
 *  eventos_{año}, anio_activo, mutex) — spec F1. NO pasa por configFromRows:
 *  el parser de Config solo conoce claves de negocio fijas. */
/** Valor centinela: año borrado explícitamente → no se vuelve a crear. */
const BORRADO = 'borrado'

/** Cache de Sistema para evitar leer Sheets en cada mutex/operación (TTL 30s,
 *  keyed por sid: un cambio de BASE invalida de inmediato). */
  let sistemaCache: { id: string; data: Record<string, string>; ts: number } | null = null
  const SISTEMA_CACHE_TTL_MS = 30_000

  async function leerSistema(): Promise<Record<string, string>> {
    const id = await sid()
    const now = Date.now()
    if (sistemaCache && sistemaCache.id === id && now - sistemaCache.ts < SISTEMA_CACHE_TTL_MS) {
      return sistemaCache.data
    }
    const res = await api.batchGet(id, [SISTEMA_RANGO])
    const filas = res[Object.keys(res)[0]] ?? []
    const out: Record<string, string> = {}
    for (const r of filas) {
      if (!Array.isArray(r)) continue
      const clave = String(r[0] ?? '')
      if (!clave) continue
      out[clave] = String(r[1] ?? '')
    }
    sistemaCache = { id, data: out, ts: now }
    return out
  }

/** Invalida cache de Sistema (p.ej. tras mutexWriteRow). */
function invalidarSistemaCache(): void {
    sistemaCache = null
  }

  /** Pestañas reales del BASE, cacheadas (TTL 30s). El BASE creado tras el
   *  refactor hoja-por-año SOLO tiene catálogos/config: NO trae pestañas de
   *  evento. Pedirlas a ciegas hace que Google devuelva 400 INVALID_ARGUMENT
   *  ("Unable to parse range") y tumba el batchGet completo, dejando el espejo
   *  sin datos. El fragmento legacy del BASE solo se consulta si la pestaña
   *  existe aquí. Si la estructura NO se puede conocer (metadatos ilegibles o
   *  fakes de test sin `sheets`), se vuelve al comportamiento original: leer
   *  el BASE como legado monolítico (fail-open, nunca ocultar datos). */
  interface BaseTablasInfo {
    conocidas: boolean
    set: Set<string>
  }
  let baseTablasCache: { id: string; info: BaseTablasInfo; ts: number } | null = null
  const BASE_TABLAS_TTL_MS = 30_000

  async function tablasDelBase(): Promise<BaseTablasInfo> {
    const id = await sid()
    const now = Date.now()
    if (baseTablasCache && baseTablasCache.id === id && now - baseTablasCache.ts < BASE_TABLAS_TTL_MS) {
      return baseTablasCache.info
    }
    let info: BaseTablasInfo = { conocidas: false, set: new Set() }
    try {
      const meta = await api.getSpreadsheet(id)
      if (meta && Array.isArray(meta.sheets)) {
        info = { conocidas: true, set: new Set(meta.sheets.map(s => s.properties.title)) }
      }
      // meta sin `sheets` (fake plano/`{}`): conocidas=false → legado monolítico.
    } catch {
      info = { conocidas: false, set: new Set() }
    }
    baseTablasCache = { id, info, ts: now }
    return info
  }

  /** ¿El BASE tiene la pestaña? Desconocido ⇒ asumir que sí (legado BASE). */
  async function baseTieneTabla(t: TableName): Promise<boolean> {
    const { conocidas, set } = await tablasDelBase()
    return conocidas ? set.has(sheetName(t)) : true
  }

  async function leerRango(archivoId: string, rango: string): Promise<(string | number)[][]> {
    const res = await api.batchGet(archivoId, [rango])
    return res[Object.keys(res)[0]] ?? []
  }

  /** Re-sync de UNA tabla de catálogo entre dos bases (F6 §11.5): clear +
   *  reescritura desde la fila 2 (la fila 1 es cabecera). Devuelve las filas
   *  copiadas. */
  async function copiarTablaEntreBases(tabla: keyof typeof TABLES, fromId: string, toId: string): Promise<number> {
    const rango = `'${sheetName(tabla)}'!A:ZZZ`
    const rows = await leerRango(fromId, rango)
    const datos = rows.slice(1).filter(r => Array.isArray(r) && r.some(c => c !== '' && c !== undefined))
    if (datos.length === 0) return 0
    await api.clearRange(toId, `'${sheetName(tabla)}'!A2:Z99999`)
    await api.batchUpdate(toId, [{ range: `'${sheetName(tabla)}'!A2`, values: datos }])
    return datos.length
  }

  /** Re-sync de Config (F6 §11.3): clear + reescritura de las parejas de
   *  negocio (sin la fila de cabecera). */
  async function copiarConfigEntreBases(fromId: string, toId: string): Promise<number> {
    const rows = await leerRango(fromId, `'Config'!A:B`)
    const datos = rows.slice(1).filter(r => Array.isArray(r) && String(r[0] ?? '').trim() !== '')
    if (datos.length === 0) return 0
    await api.clearRange(toId, `'Config'!A2:Z99999`)
    await api.batchUpdate(toId, [{ range: `'Config'!A2`, values: datos }])
    return datos.length
  }

  async function idsDeAñosRegistrados(quien = '?'): Promise<{ año: string; id: string }[]> {
    const raw = await leerSistema()
    return Object.keys(raw)
      .filter(k => /^eventos_\d{4}$/.test(k) && raw[k].trim().length >= 15)
      .map(k => ({ año: k.slice('eventos_'.length), id: raw[k] }))
      .sort((a, b) => a.año.localeCompare(b.año))
  }

  /** Años con spreadsheet registrado en la Config del BASE (solo lectura). */
  async function añosRegistrados(): Promise<string[]> {
    return (await idsDeAñosRegistrados()).map(x => x.año)
  }

  async function readConfigSafe(): Promise<Config | null> {
    try { return await readConfig() } catch { return null }
  }

  /** Rango plausible de años (§8): [anio_activo − 20, anio_activo + 1].
   *  Fuera de rango NUNCA se auto-crea (evita hojas basura por typos). */
  async function añoPlausible(anio: string): Promise<boolean> {
    const sistema = await leerSistema()
    const activo = /^\d{4}$/.test(sistema.anio_activo ?? '') ? sistema.anio_activo : String(new Date().getFullYear())
    const n = Number(anio)
    return Number.isFinite(n) && n >= Number(activo) - 20 && n <= Number(activo) + 1
  }

  function storeDeAñoSoloLectura(id: string): TableStore {
    let s = storesEvento.get(id)
    if (!s) { s = createSheetsTableStore(api, async () => id); storesEvento.set(id, s) }
    return s
  }

  /** Creación ESTRICTA del spreadsheet EVENTOS-{año}: lanza en fallo.
   *  `storeDeEventos` la usa con fallback; la UI la usa para reportar. */
  async function crearHojaEventos(anio: string): Promise<string> {
    const clave = `eventos_${anio}`
    // Año borrado explícitamente: NO se recrea (el dueño lo decidió).
    const previo = await mutexReadRow(clave).catch(() => null)
    if (previo === BORRADO) throw new Error(`EVENTOS-${anio} fue borrado; vincula una hoja existente o escribe en el BASE`)
    // Re-chequeo (spec §9): si OTRA tarea/dispositivo ya registró una hoja real
    // para este año, la adoptamos en vez de crear un duplicado.
    if (previo && previo.trim().length >= 15 && previo !== (await sid())) {
      try {
        await ensureTablasEvento(api, previo)
        añosValidados.add(anio)
        if (!storesEvento.has(previo)) storesEvento.set(previo, createSheetsTableStore(api, async () => previo))
        return previo
      } catch { /* hoja inválida → crear limpia */ }
    }
    // Sonda de capacidad: la API REAL responde 404/throw para un id que no
    // existe (=> soportada); los fakes de test responden 200 sin `sheets`
    // (=> abortamos ANTES de escribir un solo header ajeno).
    let soportada = true
    try {
      const sonda = await api.getSpreadsheet(`probe_${anio}`)
      soportada = Array.isArray(sonda?.sheets)
    } catch { soportada = true } // 404 real: la API sí existe
    if (!soportada) throw new Error('estructura de hojas no disponible')
    const cfg = await readConfig().catch(() => null)
    const sistema: Record<string, string> = await leerSistema().catch(() => ({}))
    const instancia = sistema.ft_instancia || 'ftinst_?'
    // Nombre ESTABLE: no depende de empresa_nombre (que cambia en Config).
    // La personalización se hace vía Config.nombreBaseHoja (opcional, solo UI).
    const base = (cfg?.nombreBaseHoja ?? 'FinanceTracker').trim()
    const nombre = `${base} ${anio}`
    // Anti-duplicación: si ya existe un archivo con ESE nombre exacto, se
    // ADOPTA (p. ej. tras perder el BASE y su registro). NUNCA se adopta el
    // propio BASE: ensureTablasEvento(api, BASE) inyectaría TODAS las tablas
    // de evento (Facturas, Pagos…) en el spreadsheet de catálogos/Config.
    const driveBusqueda = new DriveApi(() => api.getToken())
    const baseId = await sid()
    const huellaAdoptables = await driveBusqueda.findEventos(instancia).catch(() => [])
    const candidatos = []
    for (const h of huellaAdoptables) {
      if (h.id === baseId) continue
      const p = await probeOwnership(h.id)
      if (p.estado === 'no_es_dueño') continue // hoja ajena compartida: jamás adoptar
      if (p.estado === 'no_verificable') await escribirHistorial(`adopción huérfano sin owner verificable (${h.id})`)
      candidatos.push(h)
    }
    let id: string
    if (candidatos.length === 1) {
      id = candidatos[0].id
      await ensureTablasEvento(api, id)
      console.info(`[hoja-año] EVENTOS-${anio} adoptado por huella (${id})`)
    } else if (candidatos.length > 1) {
      // Huérfanos de la instancia sin registro: nunca decidir por nombre
      // (spec §12). Si hay varios, se adopta el más reciente y se deja el resto
      // para su manejo explícito en el inventario.
      const masReciente = [...candidatos].sort((a, b) => String(b.modifiedTime ?? '').localeCompare(String(a.modifiedTime ?? '')))[0]
      id = masReciente.id
      await ensureTablasEvento(api, id)
      console.warn(`[hoja-año] múltiples huérfanos; adoptado el más reciente (${id})`)
    } else {
      console.info(`[hoja-año] creando EVENTOS-${anio}…`)
      const creada = await crearSpreadsheetEventos(api, nombre, { drive: driveBusqueda, instancia })
      id = creada.spreadsheetId
      await ensureTablasEvento(api, id)
    }
    await mutexWriteRow(clave, id)
    añosValidados.add(anio)
    console.info(`[hoja-año] EVENTOS-${anio} creado (${id})`)
    return id
  }

  /** Garantiza el spreadsheet EVENTOS-{año}: crea, registra en Config y
   *  devuelve el store apuntándole. Si la creación falla (permisos Drive,
   *  entorno de prueba), degrada al BASE en modo monolítico en vez de romper
   *  la escritura. */
  const añosValidados = new Set<string>()

  async function storeDeEventos(anio: string): Promise<{ id: string; st: TableStore }> {
    const clave = `eventos_${anio}`
    const anioActual = String(new Date().getFullYear())
    const baseId = await sid()
    let id = ''
    if (añosValidados.has(anio)) {
      // Ya validado esta sesión: solo recuperar el id registrado (barato).
      // NADA de re-crear: un re-create por escritura fabrica basura en Drive.
      id = (await mutexReadRow(clave).catch(() => null)) ?? ''
    }
    if (id && !añosValidados.has(anio)) {
      // Seguridad: el id registrado NUNCA puede ser el propio BASE (un
      // registro así inyectaría las pestañas de evento con addSheet). Si es el
      // año EN CURSO, se repara el registro creando la hoja real del año; si es
      // pasado, se degrada al fragmento legacy del BASE sin tocar su estructura.
      if (id === baseId) {
        if (anio === anioActual) {
          await mutexWriteRow(clave, '').catch(() => {})
          id = ''
        } else {
          añosValidados.add(anio)
          return { id: baseId, st: store }
        }
      } else {
        try { await ensureTablasEvento(api, id); añosValidados.add(anio) }
        catch {
          // Archivo registrado pero ya no existe (papelera/borrado en Drive).
          // Año pasado → marcar borrado y quedarse en BASE (NO recrear).
          // Año actual → recrear limpio (rollover esperado).
          añosValidados.delete(anio)
          if (anio !== anioActual) {
            await mutexWriteRow(clave, BORRADO).catch(() => {})
            return { id: baseId, st: store }
          }
          id = ''
        }
      }
    }
    if (!id) {
      // Año marcado borrado → nunca recrear (el dueño lo decidió): fragmento legacy.
      const marcadoBorrado = await mutexReadRow(clave).catch(() => null)
      if (marcadoBorrado === BORRADO) return { id: baseId, st: store }
      // Año pasado sin hoja registrada → auto-crear SOLO si es plausible y en
      // modo owner (§8). Fuera de rango → UI lo rechaza; acá cae al BASE.
      if (anio !== anioActual && !(await añoPlausible(anio))) return { id: baseId, st: store }
      if (anio !== anioActual && ctx.modo === 'backend') return { id: baseId, st: store }
      try {
        id = await crearHojaEventos(anio)
        añosValidados.add(anio)
      } catch (e) {
        console.warn(`[hoja-año] EVENTOS-${anio} no disponible; escribiendo en el BASE:`, e instanceof Error ? e.message : e)
        await escribirHistorial(`auto-creación ${anio} falló; fragmento legacy`).catch(() => {})
        return { id: baseId, st: store }
      }
    }
    if (!storesEvento.has(id)) storesEvento.set(id, createSheetsTableStore(api, async () => id))
    return { id, st: storesEvento.get(id)! }
  }

  /** Store destino de una escritura: evento → su año; catálogo → BASE.
   *  Devuelve también el id del spreadsheet para escrituras directas.
   *  `Factura_Items` NO usa el año en curso: va por el año del padre (§8). */
  async function storeDestino(t: keyof typeof TABLES, muestra: Record<string, unknown>): Promise<{ id: string; st: TableStore }> {
    if (!TABLAS_EVENTO.has(t)) return { id: await sid(), st: store }
    if (t === 'Factura_Items') {
      const anioItem = await anioDeItem(muestra)
      if (anioItem) return storeDeEventos(anioItem)
      // Huérfano sin padre localizable: fragmento legacy del BASE si existe,
      // en otro caso degrada al año en curso (no romper la escritura).
      if (await baseTieneTabla('Factura_Items')) return { id: await sid(), st: store }
      return storeDeEventos(String(new Date().getFullYear()))
    }
    const anio = añoDeFila(muestra) || String(new Date().getFullYear())
    return storeDeEventos(anio)
  }

  /** Reemplazo fragmentado por año. Filas de años SIN spreadsheet registrado
   *  son legado del BASE: se reescriben ahí completas (nunca se duplican en
   *  un año nuevo). Requiere que `filas` sea el conjunto íntegro de la tabla
   *  (contrato actual de los flujos delete/update). */
  /** Candado dedicado para operaciones largas (spec F5 §9): `ft_lock_largo` con
   *  heartbeat (~15 s) y dueño (operación+ts). El segundo dispositivo espera y
   *  reintenta; NUNCA escribe en paralelo. Se libera como `done` en finally. */
  async function withLockLargo<T>(operacion: string, fn: () => Promise<T>): Promise<T> {
    const CLAVE = 'ft_lock_largo'
    const intentoAdquirir = async (now: number): Promise<boolean> => {
      const actual = ((await leerSistema())[CLAVE] ?? '').split('|')
      const ts = Number(actual[0])
      const candadoViejo = !Number.isFinite(ts) || Date.now() - ts > 45_000 || actual[1] === 'done'
      if (!candadoViejo) return false
      await mutexWriteRow(CLAVE, `${now}|${operacion}|adquiriendo`)
      return true
    }
    for (let i = 0; i < 12; i++) {
      const now = Date.now()
      if (await intentoAdquirir(now)) {
        const confirm = ((await leerSistema())[CLAVE] ?? '').startsWith(`${now}|`)
        if (confirm) {
          const hb = setInterval(() => void mutexWriteRow(CLAVE, `${Date.now()}|${operacion}|heartbeat`).catch(() => {}), 15_000)
          try {
            return await fn()
          } finally {
            clearInterval(hb)
            await mutexWriteRow(CLAVE, `${Date.now()}|done`).catch(() => {})
          }
        }
      }
      await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000))
    }
    throw new Error(`Operación larga '${operacion}' está en curso (otro dispositivo la ejecuta); reintenta en unos segundos`)
  }

  /** Re-homing de `Factura_Items` (spec F5 §8/#3): recalcula la partición
   *  COMPLETA por año del padre y reescribe base + cada hoja de año. Idempotente
   *  (mismo resultado cada vez), una sola pasada marcada en Sistema. Los items
   *  huérfanos o de año sin hoja registrada quedan en el fragmento legacy. */
  async function reorganizarFacturaItems(): Promise<{ movidos: number }> {
    if ((await leerSistema()).ft_rehome_done === '1') return { movidos: 0 }
    return withLockLargo('rehome', hacerRehome)
  }

  /** Núcleo del re-homing (idempotente). Se ejecuta bajo `ft_lock_largo`. */
  async function hacerRehome(): Promise<{ movidos: number }> {
    if ((await leerSistema()).ft_rehome_done === '1') return { movidos: 0 }
    const idsAño = await idsDeAñosRegistrados()
    if (idsAño.length === 0) {
      await mutexWriteRow('ft_rehome_done', '1').catch(() => {})
      return { movidos: 0 }
    }
    const facturas = await readTable<Factura>('Facturas')
    const padre = new Map<string, string>()
    for (const f of facturas) {
      const a = añoDeFila(f as unknown as Record<string, unknown>)
      if (a && f.id_factura) padre.set(f.id_factura, a)
    }
    const porAñoRegistrado = new Map(idsAño.map(x => [x.año, x.id]))
    const destino = new Map<string, Record<string, string | number>[]>()
    const destinoLegacy: Record<string, string | number>[] = []
    let movidos = 0
    const baseTiene = await baseTieneTabla('Factura_Items')
    const fuentes: { anio: string; rows: Record<string, string | number>[] }[] = []
    if (baseTiene) fuentes.push({ anio: '', rows: await store.getAll('Factura_Items') })
    for (const x of idsAño) fuentes.push({ anio: x.año, rows: await storeDeAñoSoloLectura(x.id).getAll('Factura_Items') })
    for (const src of fuentes) {
      for (const r of src.rows) {
        const idPadre = String(r.id_factura ?? '')
        const anio = padre.get(idPadre) ?? ''
        const idRegistrado = anio ? porAñoRegistrado.get(anio) : undefined
        if (!idRegistrado) {
          destinoLegacy.push(r)
        } else {
          const lista = destino.get(anio)
          if (lista) lista.push(r)
          else destino.set(anio, [r])
        }
        if (anio !== src.anio) movidos++
      }
    }
    if (baseTiene) {
      await store.replace('Factura_Items', destinoLegacy)
    }
    for (const [anio, id] of porAñoRegistrado) {
      await storeDeAñoSoloLectura(id).replace('Factura_Items', destino.get(anio) ?? [])
    }
    await mutexWriteRow('ft_rehome_done', '1')
    return { movidos }
  }
  async function reemplazarEventoFragmentado<T extends object>(t: keyof typeof TABLES, filas: T[]): Promise<void> {
    const idDeAño = new Map((await idsDeAñosRegistrados()).map(x => [x.año, x.id]))
    // Items: el año lo dicta el PADRE, no la fila ni el año en curso (§8).
    const mapItems = t === 'Factura_Items' ? await mapaAnioFacturas() : null
    const enBase: T[] = []
    const porAño = new Map<string, T[]>()
    for (const f of filas) {
      const r = f as Record<string, unknown>
      const anio = mapItems
        ? (mapItems.get(String(r.id_factura ?? '')) ?? '')
        : (añoDeFila(r) || String(new Date().getFullYear()))
      const id = anio ? idDeAño.get(anio) : undefined
      if (!id) enBase.push(f) // sin año o sin spreadsheet registrado → legacy BASE
      else (porAño.get(anio) ?? porAño.set(anio, []).get(anio)!).push(f)
    }
    if (idDeAño.size === 0) {
      // Monolítico puro: sin años registrados el BASE ES la tabla completa
      // (incluye el borrado total: reemplazo con lista vacía limpia la hoja).
      // Solo si el BASE tiene la pestaña: un BASE post-refactor no la tiene
      // y un replace ciego reventaría con 400.
      if (await baseTieneTabla(t)) {
        await store.replace(t, filas as Record<string, string | number>[])
      }
      return
    }
    // Con años registrados TODAS las fuentes se reescriben con su fragmento
    // (aunque algún fragmento quede vacío: así un delete del último registro
    // sí elimina la fila en lugar de dejarla huérfana).
    if (await baseTieneTabla(t)) {
      await store.replace(t, enBase as Record<string, string | number>[])
    }
    for (const [anio, grupo] of porAño) {
      const st = storeDeAñoSoloLectura(idDeAño.get(anio)!)
      await st.replace(t, grupo as Record<string, string | number>[])
    }
    for (const [anio] of idDeAño) {
      if (!porAño.has(anio)) {
        const st = storeDeAñoSoloLectura(idDeAño.get(anio)!)
        await st.replace(t, [])
      }
    }
  }

  /** Lectura multi-tabla con unión de años (espejo/reportes/historial).
   *  Filtra años ANTES de pedir a Sheets para ahorrar cuota y latencia.
   *  Serializa peticiones a distintos spreadsheets (evita 429 por ráfaga). */
  async function getVariasUnificado<T = Record<string, string | number>>(ts: TableName[], añosPermitidos?: (anio: string, t: TableName) => boolean): Promise<Partial<Record<TableName, T[]>>> {
    const evento = ts.filter(t => TABLAS_EVENTO.has(t as TableName))
    const base = ts.filter(t => !TABLAS_EVENTO.has(t as TableName))
    const out: Partial<Record<TableName, T[]>> = {}
    if (base.length) Object.assign(out, await store.getVarias<T>(base as TableName[]))
    if (evento.length) {
      const idsAño = await idsDeAñosRegistrados()
      // Filtrar años ANTES de crear fuentes: solo BASE + años permitidos
      const añosRelevantes = !añosPermitidos
        ? idsAño
        : idsAño.filter(x => añosPermitidos(x.año, evento[0] as TableName))
      // Fragmento legacy del BASE SOLO para las pestañas de evento que éste
      // tenga de verdad. Un BASE post-refactor no tiene ninguna: consultárselas
      // hace 400 INVALID_ARGUMENT y tumba el batchGet entero (espejo sin datos).
      const baseTabs = await tablasDelBase()
      const eventoBase = baseTabs.conocidas ? evento.filter(t => baseTabs.set.has(sheetName(t))) : evento
      const fuentes = [
        ...(eventoBase.length ? [{ id: '__base__', st: store, tabs: eventoBase }] : []),
        ...añosRelevantes.map(x => ({ id: x.id, st: storeDeAñoSoloLectura(x.id), tabs: evento }))
      ]
      // Serializar peticiones a spreadsheets distintos (evita 429 por ráfaga)
      const partes = []
      for (let i = 0; i < fuentes.length; i++) {
        const { id, st, tabs } = fuentes[i]
        const p = await st.getVarias<T>(tabs as TableName[])
        partes.push({ id, p })
        if (i < fuentes.length - 1) await new Promise(r => setTimeout(r, 200))
      }
      for (const t of evento as TableName[]) {
        out[t] = partes.flatMap(({ p }) => p[t] ?? []) as T[]
      }
    }
    return out
  }

  /** Alcance VIVO para pulls (spec §6): año activo completo + año anterior
   *  SOLO para las tablas con saldo abierto (Facturas/Cuentas_Pagar). */
  function añosVivosPara(t: TableName, activo: string): (anio: string) => boolean {
    void t
    const anterior = String(Number(activo) - 1)
    // Arrastre UNIVERSAL: toda tabla evento puede recibir registros tardíos
    // del año previo (asistencia de fin de diciembre, factura retroactiva…).
    return anio => anio === activo || anio === anterior
  }

  /** F3: descarga de alcance REDUCIDO para pulls periódicos. Devuelve además
   *  los años cubiertos por tabla para que el espejo haga merge sin borrar
   *  fragmentos históricos ya cacheados. */
  async function leerVariasTablasVivas(ts: TableName[]): Promise<{
    filas: Partial<Record<TableName, Record<string, string | number>[] | null>>
    alcance: Partial<Record<TableName, string[]>>
  }> {
    const raw = await leerSistema()
    const activo = /^\d{4}$/.test(raw.anio_activo ?? '') ? raw.anio_activo : String(new Date().getFullYear())
    // Asegurar que el año activo exista (crea/registra si es el año en curso)
    await storeDeEventos(activo)
    // Forzar refresh de Sistema para que getVariasUnificado vea el año recién registrado
    invalidarSistemaCache()
    const filas = await getVariasUnificado<Record<string, string | number>>(ts, (anio, t) => añosVivosPara(t, activo)(anio))
    const alcance: Partial<Record<TableName, string[]>> = {}
    for (const t of ts) {
      if (!TABLAS_EVENTO.has(t)) continue
      alcance[t] = [activo, String(Number(activo) - 1)]
    }
    return { filas, alcance }
  }

  function tipoCambioDe(cfg: Config, moneda: string): number {
    if (!moneda || moneda === cfg.moneda) return 1
    return rateFor(cfg, cfg.moneda, moneda)
  }

  function readTable<T = Record<string, string | number>>(t: keyof typeof TABLES): Promise<T[]> {
    if (TABLAS_EVENTO.has(t)) {
      // Unión: fragmento LEGACY del BASE SOLO si la pestaña existe ahí (un
      // BASE post-refactor no la tiene; pedirla = 400 y readTable muere) +
      // todos los años registrados en Config (los ausentes se omiten).
      return (async () => {
        const idsAño = (await idsDeAñosRegistrados()).map(x => x.id)
        const base = (await baseTieneTabla(t)) ? await store.getAll<T>(t) : []
        const partes = await Promise.all(idsAño.map(id => storeDeAñoSoloLectura(id).getAll<T>(t)))
        return [...base, ...partes.flat()]
      })()
    }
    return store.getAll<T>(t)
  }

  async function appendRows<T extends object>(t: keyof typeof TABLES, rows: T[]): Promise<void> {
    if (!rows.length) return
    const { st } = await storeDestino(t, rows[0] as Record<string, unknown>)
    await st.append(t, rows as Record<string, string | number>[])
  }

  async function replaceTable<T extends object>(t: keyof typeof TABLES, rows: T[]): Promise<void> {
    if (TABLAS_EVENTO.has(t)) return reemplazarEventoFragmentado(t, rows)
    await store.replace(t, rows as Record<string, string | number>[])
  }

  async function readConfig(): Promise<Config> {
    const id = await sid()
    const res = await api.batchGet(id, [`'Config'!A1:B500`])
    const rows = res[Object.keys(res)[0]] ?? []
    return configFromRows(rows)
  }

  async function writeConfig(config: Config): Promise<void> {
    const id = await sid()
    await api.batchUpdate(id, [{ range: `'Config'!A1:B${configToRows(config).length}`, values: configToRows(config) }])
  }

  async function mutexReadRow(clave: string): Promise<string | null> {
    const id = await sid()
    const res = await api.batchGet(id, [SISTEMA_RANGO])
    const rows = res[Object.keys(res)[0]] ?? []
    for (const r of rows) {
      if (!Array.isArray(r)) continue
      if (String(r[0]) === clave) return String(r[1] ?? '')
    }
    return null
  }

  async function mutexWriteRow(clave: string, valor: string): Promise<void> {
    const id = await sid()
    const res = await api.batchGet(id, [SISTEMA_RANGO])
    const rows = res[Object.keys(res)[0]] ?? []
    let row = -1
    for (let i = 0; i < rows.length; i++) {
      if (!Array.isArray(rows[i])) continue
      if (String(rows[i][0]) === clave) { row = i + 1; break }
    }
    if (row === -1) row = Math.max(rows.length + 1, 1)
    await api.batchUpdate(id, [{ range: `'Sistema'!A${row}:B${row}`, values: [[clave, valor]] }])
    invalidarSistemaCache()
  }

  // ── Gate de ownership (spec F3 §7) ────────────────────────────────────────
  /** Lee una clave del Sistema de UN ESPREADSHEET concreto (no del sid actual). */
  async function leerClaveSpreadsheet(archivoId: string, clave: string): Promise<string> {
    const res = await api.batchGet(archivoId, [SISTEMA_RANGO])
    const rows = res[Object.keys(res)[0]] ?? []
    for (const r of rows) {
      if (Array.isArray(r) && String(r[0]) === clave) return String(r[1] ?? '')
    }
    return ''
  }

  /** Escribe una clave del Sistema de UN ESPREADSHEET concreto (no del sid actual). */
  async function escribirClaveSpreadsheet(archivoId: string, clave: string, valor: string): Promise<void> {
    const res = await api.batchGet(archivoId, [SISTEMA_RANGO])
    const rows = res[Object.keys(res)[0]] ?? []
    let row = -1
    for (let i = 0; i < rows.length; i++) {
      if (!Array.isArray(rows[i])) continue
      if (String(rows[i][0]) === clave) { row = i + 1; break }
    }
    if (row === -1) row = Math.max(rows.length + 1, 1)
    await api.batchUpdate(archivoId, [{ range: `'Sistema'!A${row}:B${row}`, values: [[clave, valor]] }])
  }

  /** Añade una línea al historial del sistema (ft_historial, max ~8 líneas).
   *  Mejor esfuerzo: nunca debe tumbar la operación que lo invoca. */
  async function escribirHistorial(msg: string): Promise<void> {
    try {
      const previo = ((await leerSistema()).ft_historial || '').split('\n').filter(Boolean)
      const linea = `${todayLocal()} ${new Date().toLocaleTimeString()} - ${msg}`
      const valor = [...previo, linea].slice(-8).join('\n')
      if (!valor) return
      await mutexWriteRow('ft_historial', valor)
    } catch {
      // Historial solo diagnosticado; una caída aquí no bloquea la operación.
    }
  }

  /** Probe de ownership en tres estados (spec §7): es_dueño / no_es_dueño /
   *  no_verificable. En modo backend el gate se salta (service account
   *  comparte-escritura, nunca dueño). Fail-open offline: sin metadata
   *  alcanzable no se rechaza a un dueño ya operando. */
  async function probeOwnership(id: string): Promise<{ estado: 'es_dueño' | 'no_es_dueño' | 'no_verificable'; motivo?: string }> {
    if (ctx.modo === 'backend') return { estado: 'es_dueño', motivo: 'backend' }
    let info: Awaited<ReturnType<typeof drive.getFileInfo>>
    try {
      info = await drive.getFileInfo(id)
    } catch {
      return { estado: 'no_verificable', motivo: 'no_verificable' } // offline/fuera de namespace → fail-open
    }
    if (!info) return { estado: 'no_verificable', motivo: 'no_verificable' }
    if (info.capabilities && info.capabilities.canEdit === false) return { estado: 'no_es_dueño', motivo: 'solo_lectura' }
    const owners = info.owners ?? []
    if (owners.length > 0 && !owners.some(o => o.me === true)) return { estado: 'no_es_dueño', motivo: 'compartido' }
    if (owners.some(o => o.me === true)) return { estado: 'es_dueño' }
    return { estado: 'no_verificable', motivo: 'no_verificable' }
  }

  /** Gate aplicado tras un write-probe real (ensureTables/ensureTablasEvento):
   *  dueño → ok; compartido/lectura → lanza; no_verificable → ok dejando traza
   *  (prueba de edición ya dada por el write-probe). */
  async function gateTrasWriteProbe(id: string, orquestando: string): Promise<void> {
    const p = await probeOwnership(id)
    if (p.estado === 'no_es_dueño') {
      throw new Error('Esta hoja no es tuya o tiene permisos de solo lectura: el dueño debe vincularla')
    }
    if (p.estado === 'no_verificable') {
      await escribirHistorial(`${orquestando}: owner no verificable, aceptado por write-probe (${id})`)
    }
  }

  /** Sonda de identidad para UI/inventario (F4). Solo lectura del estado. */
  async function verificarOwnership(id: string): Promise<{ estado: 'es_dueño' | 'no_es_dueño' | 'no_verificable'; motivo?: string }> {
    return probeOwnership(id)
  }

  /** ¿Es este spreadsheet un BASE legacy (sin huella pero reconocible)?
   *  `Config` o `Sistema` + al menos una pestaña catálogo FT (spec §14). */
  async function esLegacyBase(id: string): Promise<boolean> {
    const props = await drive.getAppProperties(id).catch(() => null)
    if (props?.ft_tipo) return false
    let meta
    try { meta = await api.getSpreadsheet(id) } catch { return false }
    const pestañas = (meta.sheets ?? []).map(s => (s.properties?.title ?? '').replace(/['"]/g, ''))
    const reconocible = pestañas.includes('Config') || pestañas.includes('Sistema')
    if (!reconocible) return false
    return pestañas.some(t => (TABLAS_BASE as string[]).includes(t))
  }

  /** Sonda de identidad para inventario/picker (spec F4 §5-§6). */
  async function infoHoja(id: string): Promise<HojaInfo> {
    const [props, info, titulo] = await Promise.all([
      drive.getAppProperties(id).catch(() => null),
      drive.getFileInfo(id).catch(() => null),
      api.getSpreadsheet(id).then(m => m.properties?.title || 'Sin título').catch(() => 'Sin título')
    ])
    const tipo: HojaTipo = props?.ft_tipo === 'base' ? 'base' : props?.ft_tipo === 'eventos' ? 'eventos' : 'desconocido'
    const estado: HojaEstado =
      props?.ft_estado === 'reemplazado' ? 'reemplazado' :
      props?.ft_estado === 'borrado' ? 'borrado' :
      props?.ft_tipo ? 'activo' :
      'legacy'
    const owners = info?.owners ?? []
    let rol: RolOwnership
    if (ctx.modo === 'backend') rol = 'es_dueño'
    else if (info === null) rol = 'no_verificable'
    else if (info.capabilities?.canEdit === false) rol = 'no_es_dueño'
    else if (owners.length > 0 && !owners.some(o => o.me === true)) rol = 'no_es_dueño'
    else if (owners.some(o => o.me === true)) rol = 'es_dueño'
    else rol = 'no_verificable'
    return {
      id,
      titulo,
      url: `https://docs.google.com/spreadsheets/d/${id}/edit`,
      tipo,
      instancia: props?.ft_instancia,
      estado,
      dueño: owners.find(o => o.emailAddress)?.emailAddress,
      rol,
      editable: info?.capabilities?.canEdit ?? undefined
    }
  }

  async function insertOrReplace<T extends object>(t: keyof typeof TABLES, idKey: string, obj: T): Promise<T> {
    const all = await readTable<Record<string, string | number>>(t)
    const o = obj as Record<string, string | number>
    const exists = all.some(r => r[idKey] === o[idKey])
    if (!exists) {
      await appendRows(t, [obj])
      return obj
    }
    await replaceTable(t, all.map(r => (r[idKey] === o[idKey] ? o : r)))
    return obj
  }

  /** Salida de inventario por venta: actualiza stock y registra movimiento. */
  async function descontarStock(idProducto: string, cantidad: number, motivo: string): Promise<void> {
    const productos = await readTable<Producto>('Productos')
    const prod = productos.find(p => p.id_producto === idProducto)
    if (!prod) return
    const nuevoStock = Math.max(0, (Number(prod.stock) || 0) - cantidad)
    await replaceTable('Productos', productos.map(r => (r.id_producto === idProducto ? { ...r, stock: nuevoStock } : r)))
    await appendRows('Movimientos_Stock', [{ id_movimiento: uid('mov_'), id_producto: idProducto, tipo: 'salida', cantidad, motivo, id_proveedor: '', fecha: todayLocal() }])
  }

  return {
    async getConfig(): Promise<Config> { return readConfig() },

    async uploadImagen(input: UploadImagenInput): Promise<string> {
      const modulo = input.modulo === 'configuracion' ? 'configuracion' : input.modulo === 'inventario' ? 'inventario' : 'otros'
      const folderId = await drive.getAppFolder(modulo)
      const res = await drive.uploadBase64({ nombre: input.nombre, mimeType: input.mimeType, base64: input.base64, parentFolderId: folderId })
      return res.url
    },

    /** F4 (spec hoja-por-año §8): garantiza el spreadsheet EVENTOS-{año actual}.
     *  Desde el arranque NO recrea un año marcado como borrado (el dueño lo
     *  decidió); desde el botón del panel (forzar=true) sí puede recrearlo.
     *  NO traga errores: devuelve diagnóstico para la UI. */
    async prepararAnioActual(forzar = false): Promise<{ ok: boolean; modo: 'año' | 'monolítico'; error?: string }> {
      if (!(await sid()).trim()) return { ok: false, modo: 'monolítico', error: 'sin spreadsheet base vinculado todavía' }
      const anio = String(new Date().getFullYear())
      try {
        if (forzar) {
          const clave = `eventos_${anio}`
          const previo = await mutexReadRow(clave).catch(() => null)
          if (previo === BORRADO) await mutexWriteRow(clave, '')
        }
        await crearHojaEventos(anio)
        // Re-homing: reescribe `Factura_Items` por año del padre (una sola pasada).
        await reorganizarFacturaItems().catch(() => {})
        return { ok: true, modo: 'año' }
      } catch (e) {
        return { ok: false, modo: 'monolítico', error: e instanceof Error ? e.message : String(e) }
      }
    },

/** Elimina el archivo de un año (a papelera) y lo marca como borrado para
   *  que NO se vuelva a crear automáticamente. El BASE nunca se elimina aquí. */
  async eliminarAño(año: string): Promise<void> {
    if (!/^\d{4}$/.test(año)) throw new Error('Año inválido')
    const raw = await leerSistema()
    const clave = `eventos_${año}`
    const id = raw[clave] ?? ''
    if (id.trim().length >= 15) {
      await new DriveApi(() => api.getToken()).enviarAPapelera(id)
      añosValidados.delete(año)
      storesEvento.delete(id)
    }
    await mutexWriteRow(clave, BORRADO)
  },

  /** F5: Reset completo — borra datos del BASE, envía EVENTOS a papelera,
   *  limpia registro de años en Config y deja el sistema como recién instalado. */
  async resetCompleto(): Promise<void> {
    const baseId = await sid()
    const drive = new DriveApi(() => api.getToken())

    // 1. Borrar filas de TODAS las tablas del BASE (mantener headers)
    for (const t of TABLAS_BASE) {
      if (t === 'Config') continue
      await store.replace(t, [])
    }

    // 2. Enviar todos los spreadsheets EVENTOS a papelera
    const eventos = await idsDeAñosRegistrados()
    for (const { año, id } of eventos) {
      if (id.trim().length >= 15) {
        await drive.enviarAPapelera(id)
        añosValidados.delete(año)
        storesEvento.delete(id)
      }
    }

    // 3. Sistema: limpiar registro de años (eventos_*), anio_activo y mutex.
    //    La identidad (ft_instancia/ft_id/ft_estado) se conserva.
    const sistema = await leerSistema()
    const aLimpiar = Object.keys(sistema).filter(k => /^eventos_\d{4}$/.test(k) || k === 'anio_activo' || k === 'mutex')
    for (const k of aLimpiar) {
      await mutexWriteRow(k, '')
    }

    // 4. Config: expulsar cualquier clave de sistema residual (estado
    //    medio-migrado) dejando solo claves de negocio.
    const cfg = await readConfig()
    await api.clearRange(baseId, `'Config'!A1:B500`)
    const negocio = configToRows(cfg).filter(r => !esClaveSistema(String(r[0])))
    if (negocio.length > 0) {
      await api.batchUpdate(baseId, [{ range: `'Config'!A1:B${negocio.length}`, values: negocio }])
    }

    // 5. Registrar historial de reset en Sistema
    await mutexWriteRow('reset_historial', `${todayLocal()} ${new Date().toLocaleTimeString()} - resetCompleto`)

    // Invalidar caches
    invalidarSistemaCache()
    añosValidados.clear()
    storesEvento.clear()
  },

  /** F6: Reset nuclear — crea BASE nuevo, envía viejo a papelera, actualiza ID. */
  async resetNuclear(): Promise<{ newSpreadsheetId: string }> {
    const oldBaseId = await sid()
    const drive = new DriveApi(() => api.getToken())

    // 1. Crear BASE nuevo con nombre distintivo
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')
    const nombre = `FinanceTracker ${timestamp}`
    const { spreadsheetId: newBaseId } = await createInitialSpreadsheet(api, nombre, { drive })

    // 2. Enviar BASE viejo a papelera
    if (oldBaseId.trim().length >= 15) {
      await drive.enviarAPapelera(oldBaseId)
    }

    // 3. Actualizar ID en storage y limpiar estado interno
    await ctx.storage.set(KEYS.spreadsheetId, newBaseId)
    invalidarSistemaCache()
    añosValidados.clear()
    storesEvento.clear()

    return { newSpreadsheetId: newBaseId }
  },

  /** Panel Almacenamiento: dónde vive cada cosa (ids de Drive). */
    async estadoAlmacenamiento(): Promise<{
      anioActivo: string
      eventos: { año: string; id: string }[]
      baseId: string
      creadoAñoActual: boolean
    }> {
      const baseId = await sid()
      const eventos = await idsDeAñosRegistrados()
      const raw = await leerSistema()
      const anioActivo = /^\d{4}$/.test(raw.anio_activo ?? '') ? raw.anio_activo : String(new Date().getFullYear())
      return { anioActivo, eventos, baseId, creadoAñoActual: eventos.some(e => e.año === anioActivo) }
    },

    /** F1 (spec hoja-por-año §11): migra imágenes base64 embebidas a Drive.
     *  Cubre Productos.imagen y Config.empresa_logo. Idempotente: salta lo
     *  que ya es URL. Pacing de 300 ms por subida (cuota). */
    async migrarImagenesADrive(): Promise<{ migradas: number; fallidas: number }> {
      let migradas = 0
      let fallidas = 0
      const subir = async (dataUrl: string, nombre: string): Promise<string> => {
        const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl)
        if (!m) throw new Error('formato data-url no reconocido')
        const res = await drive.uploadBase64({ nombre, mimeType: m[1], base64: m[2] })
        return res.url
      }
      const productos = await readTable<Producto>('Productos')
      for (const p of productos) {
        const img = String(p.imagen ?? '')
        if (!img.startsWith('data:image')) continue
        try {
          const url = await subir(img, `producto_${p.id_producto}_mig.png`)
          await this.saveProducto({ ...p, imagen: url } as Producto)
          migradas++
        } catch { fallidas++ }
        await new Promise(r => setTimeout(r, 300))
      }
      try {
        const cfg = await readConfig()
        const logo = String(cfg.empresa_logo ?? '')
        if (logo.startsWith('data:image')) {
          const url = await subir(logo, `logo_migrado_${Date.now()}.png`)
          await writeConfig({ ...cfg, empresa_logo: url })
          migradas++
        }
      } catch { fallidas++ }
      return { migradas, fallidas }
    },

    async saveConfig(config: Config): Promise<void> {
      const parsed = ConfigSchema.parse(config)
      await writeConfig(parsed)
      // Registro automático de la tasa del día en el historial.
      if (parsed.tasa_dia_activa === 'true' && parsed.tasas_cambio) {
        try {
          const r = parseRates(parsed.tasas_cambio)
          if (r && r.fecha && r.base === parsed.moneda) {
            for (const [mon, tasa] of Object.entries(r.rates)) {
              if (typeof tasa === 'number' && tasa > 0) {
                await this.registrarTasa({ fecha: r.fecha, base: r.base, moneda: mon, tasa, fuente: 'auto' })
              }
            }
          }
        } catch { /* el historial nunca bloquea el guardado */ }
      }
    },

    async listClientes(): Promise<Cliente[]> { return readTable<Cliente>('Clientes') },

    async saveCliente(cliente: Cliente): Promise<Cliente> {
      const parsed = ClienteSchema.parse(cliente)
      const saved = { ...parsed, id_cliente: parsed.id_cliente || uid('cli_'), fecha_registro: parsed.fecha_registro || todayLocal() } as unknown as Cliente
      await insertOrReplace('Clientes', 'id_cliente', saved)
      return saved
    },

    async deleteCliente(id: string): Promise<void> {
      const facturas = await readTable('Facturas')
      assertClienteSinFacturas(facturas, id)
      const all = (await readTable('Clientes')).filter(r => r.id_cliente !== id)
      await replaceTable('Clientes', all)
    },

    async listUsuarios(): Promise<Usuario[]> { return readTable<Usuario>('Usuarios') },

    async saveUsuario(usuario: Usuario): Promise<Usuario> {
      const parsed = UsuarioSchema.parse(usuario)
      const saved = { ...parsed, email: parsed.email.trim().toLowerCase() } as Usuario
      await insertOrReplace('Usuarios', 'email', saved)
      return saved
    },

    async deleteUsuario(email: string): Promise<void> {
      const all = (await readTable('Usuarios')).filter(r => !emailIgual(r.email, email))
      await replaceTable('Usuarios', all)
    },

    async listCodigos(): Promise<CodigoAcceso[]> {
      return readTable<CodigoAcceso>('Codigos_Acceso')
    },

    async saveCodigo(input: Partial<CodigoAcceso>): Promise<CodigoAcceso> {
      const existentes = await readTable<CodigoAcceso>('Codigos_Acceso')
      const codigo = input.codigo || generarCodigo(prefijoDesdeNombre((await readConfig()).empresa_nombre), new Date().getFullYear(), existentes.map(c => String(c.codigo)))
      const rol = (input.rol ?? 'solo_lectura') as UserRole
      if (rol === 'admin' || !(CODIGO_ROLES_SIN_ADMIN as readonly string[]).includes(rol)) throw new Error('Rol inválido')
      const expiraEn = input.expira_en ?? ''
      if (expiraEn && !/^\d{4}-\d{2}-\d{2}$/.test(expiraEn)) throw new Error('Fecha de expiración inválida')
      const usosMax = input.usos_max ?? ''
      if (usosMax !== '' && !/^\d+$/.test(usosMax)) throw new Error('Usos máximos inválido')
      const parsed: CodigoAcceso = {
        codigo,
        rol,
        modulos_ver: input.modulos_ver ?? '',
        modulos_editar: input.modulos_editar ?? '',
        expira_en: expiraEn,
        usos_max: usosMax,
        usos: input.usos ?? usosMax,
        responsable: input.responsable ?? '',
        email: input.email ?? '',
        creado: input.creado ?? todayLocal(),
        activo: input.activo ?? 'true'
      }
      await insertOrReplace('Codigos_Acceso', 'codigo', parsed)
      return parsed
    },

    async renovarCodigo(codigo: string, nuevaExpira: string): Promise<CodigoAcceso> {
      const all = await readTable<CodigoAcceso>('Codigos_Acceso')
      const actual = all.find(c => c.codigo === codigo)
      if (!actual) throw new Error('Código no existe')
      const updated: CodigoAcceso = { ...actual, expira_en: nuevaExpira, activo: 'true', usos: actual.usos_max }
      await insertOrReplace('Codigos_Acceso', 'codigo', updated)
      return updated
    },

    async deleteCodigo(codigo: string): Promise<void> {
      await replaceTable('Codigos_Acceso', (await readTable('Codigos_Acceso')).filter(r => r.codigo !== codigo))
    },

    async listDispositivos(): Promise<Dispositivo[]> {
      return readTable<Dispositivo>('Dispositivos')
    },

    async registrarDispositivo(d: Dispositivo): Promise<Dispositivo> {
      const existentes = await readTable<Dispositivo>('Dispositivos')
      if (existentes.some(x => x.dispositivo === d.dispositivo)) return d
      await appendRows('Dispositivos', [d])
      return d
    },

    async removerDispositivo(dispositivo: string): Promise<void> {
      await replaceTable('Dispositivos', (await readTable('Dispositivos')).filter(r => r.dispositivo !== dispositivo))
    },

    async createFactura(input: { id_cliente: string; items: { descripcion: string; cantidad: number; precio_unitario: number; id_producto?: string }[]; fecha_emision: string; fecha_vencimiento: string; notas: string; moneda?: string }): Promise<Factura> {
      const parsed = FacturaInputSchema.parse(input)
      const clientes = await readTable('Clientes')
      const cliente = clientes.find(c => c.id_cliente === parsed.id_cliente)
      if (!cliente) throw new Error('Cliente no existe')
      const cfg = await readConfig()
      const moneda = parsed.moneda || cfg.moneda
      const { items, totals } = buildFactura(parsed.items, cfg.iva_porcentaje, getCurrency(moneda).decimals)
      // Idempotencia del flush offline: la cola asigna id local; si un intento
      // anterior SÍ llegó a Sheets (timeout engañoso), no se repite la fila.
      const id_factura = (input as { id_factura?: string }).id_factura || uid('fac_')
      const previa = (await readTable<Factura>('Facturas')).find(f => f.id_factura === id_factura)
      if (previa) return previa
      // Validar stock disponible antes de escribir nada (items con producto vinculado).
      const itemsConProducto = items.filter(it => it.id_producto)
      if (itemsConProducto.length > 0) {
        const productos = await readTable<Producto>('Productos')
        for (const it of itemsConProducto) {
          const prod = productos.find(p => p.id_producto === it.id_producto)
          if (!prod) throw new Error(`Producto no existe: ${it.descripcion}`)
          if (it.cantidad > Number(prod.stock)) throw new Error(`Stock insuficiente de "${prod.nombre}" (disponible: ${prod.stock})`)
        }
      }
      const folio = await withMutex<string>(
        mutexReadRow,
        mutexWriteRow,
        async () => {
          const c = await readConfig()
          const folioN = c.contador_folio
          await writeConfig({ ...c, contador_folio: c.contador_folio + 1 })
          return `${expandFolioTemplate(c.prefijo_folio, parsed.fecha_emision)}${String(folioN).padStart(3, '0')}`
        }
      )
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
      await appendRows('Facturas', [factura])
      const itemRows = items.map(it => ({ id_factura, ...it }))
      await appendRows('Factura_Items', itemRows)
      // Descuento automático de inventario por ventas.
      for (const it of itemsConProducto) {
        await descontarStock(String(it.id_producto), it.cantidad, `Venta ${folio}`)
      }
      return factura
    },

    async listFacturas(filtro: { estado?: string; mes?: string } = {}): Promise<Factura[]> {
      let rows = await readTable<Factura>('Facturas')
      if (filtro.mes) rows = rows.filter(f => f.fecha_emision.slice(0, 7) === filtro.mes)
      if (filtro.estado) {
        const pagos = await readTable('Pagos')
        rows = rows.filter(f => {
          const tienePagos = pagos.some(p => p.id_origen === f.id_factura)
          const est = estadoDesdeSaldo(f.saldo, f.total, tienePagos)
          if (filtro.estado === 'pendientes') return est === 'pendiente' || est === 'parcial'
          return est === filtro.estado
        })
      }
      return rows
    },

    async getFactura(id: string): Promise<{ factura: Factura; items: FacturaItem[] }> {
      const facturas = await readTable<Factura>('Facturas')
      const factura = facturas.find(f => f.id_factura === id)
      if (!factura) throw new Error('Factura no existe')
      const items = (await readTable<FacturaItem & { id_factura: string }>('Factura_Items')).filter(i => i.id_factura === id).map(i => ({
        descripcion: String(i.descripcion), cantidad: Number(i.cantidad), precio_unitario: Number(i.precio_unitario), importe: Number(i.importe),
        ...(i.id_producto ? { id_producto: String(i.id_producto) } : {})
      }))
      return { factura, items }
    },

    async updateFactura(id: string, input: { id_cliente: string; items: { descripcion: string; cantidad: number; precio_unitario: number; id_producto?: string }[]; fecha_emision: string; fecha_vencimiento: string; notas: string; moneda?: string }): Promise<Factura> {
      const parsed = FacturaInputSchema.parse(input)
      const facturas = await readTable<Factura>('Facturas')
      const actual = facturas.find(f => f.id_factura === id)
      if (!actual) throw new Error('Factura no existe')
      const clientes = await readTable('Clientes')
      const cliente = clientes.find(c => c.id_cliente === parsed.id_cliente)
      if (!cliente) throw new Error('Cliente no existe')
      const cfg = await readConfig()
      const moneda = parsed.moneda || actual.moneda || cfg.moneda
      const { items, totals } = buildFactura(parsed.items, cfg.iva_porcentaje, getCurrency(moneda).decimals)
      const diff = round2(totals.total - Number(actual.total))
      const nuevoSaldo = round2(Math.max(0, Number(actual.saldo) + diff))
      const hoy = todayLocal()
      const updated: Factura = {
        ...actual,
        id_cliente: parsed.id_cliente,
        nombre_cliente: String(cliente.nombre),
        fecha_emision: parsed.fecha_emision,
        fecha_vencimiento: parsed.fecha_vencimiento,
        notas: parsed.notas,
        moneda,
        tipo_cambio: tipoCambioDe(cfg, moneda),
        subtotal: totals.subtotal,
        iva: totals.iva,
        total: totals.total,
        saldo: nuevoSaldo,
        editada: 'true',
        fecha_edicion: hoy
      }
      const oldItems = (await readTable('Factura_Items')).filter(i => i.id_factura !== id)
      await replaceTable('Facturas', facturas.map(f => (f.id_factura === id ? updated : f)))
      await replaceTable('Factura_Items', [...oldItems, ...items.map(it => ({ id_factura: id, ...it }))])
      return updated
    },

    async deleteFactura(id: string): Promise<void> {
      const all = (await readTable('Facturas')).filter(r => r.id_factura !== id)
      await replaceTable('Facturas', all)
      await replaceTable('Factura_Items', (await readTable('Factura_Items')).filter(r => r.id_factura !== id))
      await replaceTable('Pagos', (await readTable('Pagos')).filter(r => r.id_origen !== id))
    },

    async listGastos(filtro: { mes?: string; categoria?: string } = {}): Promise<Gasto[]> {
      let rows = await readTable<Gasto>('Gastos')
      if (filtro.mes) rows = rows.filter(g => g.fecha.slice(0, 7) === filtro.mes)
      if (filtro.categoria) rows = rows.filter(g => g.categoria === filtro.categoria)
      return rows
    },

    async saveGasto(gasto: Gasto): Promise<Gasto> {
      const parsed = GastoSchema.parse(gasto)
      const cfg = await readConfig()
      const moneda = parsed.moneda || cfg.moneda
      const saved = { ...parsed, id_gasto: parsed.id_gasto || uid('gas_'), moneda, tipo_cambio: parsed.tipo_cambio || tipoCambioDe(cfg, moneda) } as unknown as Gasto
      await insertOrReplace('Gastos', 'id_gasto', saved)
      return saved
    },

    async deleteGasto(id: string): Promise<void> {
      await replaceTable('Gastos', (await readTable('Gastos')).filter(r => r.id_gasto !== id))
    },

    async listProveedores(): Promise<Proveedor[]> { return readTable<Proveedor>('Proveedores') },

    async saveProveedor(p: Proveedor): Promise<Proveedor> {
      const parsed = ProveedorSchema.parse(p)
      const saved = { ...parsed, id_proveedor: parsed.id_proveedor || uid('prov_'), fecha_registro: parsed.fecha_registro || todayLocal() } as unknown as Proveedor
      await insertOrReplace('Proveedores', 'id_proveedor', saved)
      return saved
    },

    async deleteProveedor(id: string): Promise<void> {
      const cxps = await readTable('Cuentas_Pagar')
      assertProveedorSinCxp(cxps, id)
      await replaceTable('Proveedores', (await readTable('Proveedores')).filter(r => r.id_proveedor !== id))
    },

    async listEmpleados(): Promise<Empleado[]> { return readTable<Empleado>('Empleados') },

    async saveEmpleado(emp: Empleado): Promise<Empleado> {
      const parsed = EmpleadoSchema.parse(emp)
      const saved = { ...parsed, id_empleado: parsed.id_empleado || uid('emp_'), fecha_ingreso: parsed.fecha_ingreso || todayLocal() } as unknown as Empleado
      await insertOrReplace('Empleados', 'id_empleado', saved)
      return saved
    },

    async listAsistencias(filtro: { id_empleado?: string; desde?: string; hasta?: string } = {}): Promise<Asistencia[]> {
      let rows = await readTable<Asistencia>('Asistencias')
      if (filtro.id_empleado) rows = rows.filter(a => a.id_empleado === filtro.id_empleado)
      if (filtro.desde) rows = rows.filter(a => a.fecha >= filtro.desde!)
      if (filtro.hasta) rows = rows.filter(a => a.fecha <= filtro.hasta!)
      return rows.sort((a, b) => b.fecha.localeCompare(a.fecha))
    },

    async saveAsistencia(input: Omit<Asistencia, 'id_asistencia' | 'nombre_empleado'> & { id_asistencia?: string; nombre_empleado?: string }): Promise<Asistencia> {
      const parsed = AsistenciaSchema.parse(input)
      const empleados = await readTable<Empleado>('Empleados')
      const emp = empleados.find(e => e.id_empleado === parsed.id_empleado)
      const saved: Asistencia = {
        ...parsed,
        id_asistencia: parsed.id_asistencia || uid('asi_'),
        nombre_empleado: emp?.nombre ?? parsed.nombre_empleado ?? ''
      }
      // Un registro por empleado y día: se reemplaza si ya existe.
      const all = await readTable<Record<string, string | number>>('Asistencias')
      const existente = all.find(r => r.id_empleado === saved.id_empleado && String(r.fecha) === saved.fecha && r.id_asistencia !== saved.id_asistencia)
      if (existente) {
        await replaceTable('Asistencias', all.map(r => (r.id_asistencia === existente.id_asistencia ? (saved as unknown as Record<string, string | number>) : r)))
      } else {
        await insertOrReplace('Asistencias', 'id_asistencia', saved)
      }
      return saved
    },

    async deleteAsistencia(id: string): Promise<void> {
      const all = (await readTable('Asistencias')).filter(r => r.id_asistencia !== id)
      await replaceTable('Asistencias', all)
    },

    async deleteEmpleado(id: string): Promise<void> {
      const gastos = await readTable('Gastos')
      const emp = (await readTable('Empleados')).find(r => r.id_empleado === id)
      const nombre = String(emp?.nombre ?? '')
      if (gastos.some(g => g.categoria === 'Nómina' && String(g.proveedor) === nombre)) {
        throw new Error('Empleado tiene nómina registrada')
      }
      await replaceTable('Empleados', (await readTable('Empleados')).filter(r => r.id_empleado !== id))
    },

    async registerNomina(input: { id_empleado: string; mes: string; monto: number; metodo_pago: MetodoPago; fecha: string; notas: string; moneda?: string }): Promise<Gasto> {
      const parsed = NominaInputSchema.parse(input)
      const emp = (await readTable('Empleados')).find(r => r.id_empleado === parsed.id_empleado)
      if (!emp) throw new Error('Empleado no existe')
      const cfg = await readConfig()
      const moneda = parsed.moneda || cfg.moneda
      const fecha = parsed.fecha || `${parsed.mes}-01`
      const gasto: Gasto = {
        id_gasto: uid('gas_'),
        fecha,
        categoria: 'Nómina',
        descripcion: `Nómina ${parsed.mes} — ${String(emp.nombre)}`,
        monto: round2(parsed.monto),
        metodo_pago: parsed.metodo_pago,
        proveedor: String(emp.nombre),
        moneda,
        tipo_cambio: tipoCambioDe(cfg, moneda)
      }
      await appendRows('Gastos', [gasto])
      return gasto
    },

    async createCxp(input: { id_proveedor: string; folio_documento: string; categoria: string; descripcion: string; fecha_emision: string; fecha_vencimiento: string; monto_total: number; notas: string; moneda?: string }): Promise<CuentaPagar> {
      const parsed = CxpInputSchema.parse(input)
      const provs = await readTable('Proveedores')
      const prov = provs.find(p => p.id_proveedor === parsed.id_proveedor)
      if (!prov) throw new Error('Proveedor no existe')
      const cfg = await readConfig()
      const moneda = parsed.moneda || cfg.moneda
      const cxp: CuentaPagar = {
        id_cxp: uid('cxp_'),
        id_proveedor: parsed.id_proveedor,
        nombre_proveedor: String(prov.nombre),
        folio_documento: parsed.folio_documento,
        categoria: parsed.categoria,
        descripcion: parsed.descripcion,
        fecha_emision: parsed.fecha_emision,
        fecha_vencimiento: parsed.fecha_vencimiento,
        monto_total: round2(parsed.monto_total),
        saldo: round2(parsed.monto_total),
        estado: 'pendiente',
        notas: parsed.notas,
        moneda,
        tipo_cambio: tipoCambioDe(cfg, moneda)
      }
      await appendRows('Cuentas_Pagar', [cxp])
      return cxp
    },

    async listCxp(filtro: { estado?: string } = {}): Promise<CuentaPagar[]> {
      let rows = await readTable<CuentaPagar>('Cuentas_Pagar')
      if (filtro.estado) rows = rows.filter(c => c.estado === filtro.estado)
      return rows
    },

    async deleteCxp(id: string): Promise<void> {
      await replaceTable('Cuentas_Pagar', (await readTable('Cuentas_Pagar')).filter(r => r.id_cxp !== id))
      await replaceTable('Pagos', (await readTable('Pagos')).filter(r => r.id_origen !== id))
    },

    async registerPago(pago: { tipo: 'cobro' | 'abono'; id_origen: string; fecha: string; monto: number; metodo_pago: MetodoPago; notas: string }): Promise<Pago> {
      const parsed = PagoInputSchema.parse(pago)
      const table = parsed.tipo === 'cobro' ? 'Facturas' : 'Cuentas_Pagar'
      const spec = TABLES[table]
      const idKey = table === 'Facturas' ? 'id_factura' : 'id_cxp'
      const last = String.fromCharCode(64 + spec.length)
      const base = HEADER_ROWS(table) + 1
      const pagosBase = HEADER_ROWS('Pagos') + 1
      const pagosLast = String.fromCharCode(64 + TABLES.Pagos.length)
      return withMutex<Pago>(mutexReadRow, mutexWriteRow, async () => {
        const [rows, cfg] = await Promise.all([readTable(table), readConfig()])
        const target = rows.find(r => r[idKey] === parsed.id_origen)
        if (!target) throw new Error('Origen del pago no existe')
        const saldoActual = Number(target.saldo)
        // El pago puede efectuarse en una moneda distinta a la del documento: se
        // convierte a la moneda del documento con la tasa vigente para el saldo.
        const monedaOrigen = String(target.moneda ?? '') || cfg.moneda
        const monedaPago = parsed.moneda || monedaOrigen
        const montoEnMonedaOrigen = monedaPago === monedaOrigen ? parsed.monto : convert(parsed.monto, monedaPago, monedaOrigen, cfg)
        if (montoEnMonedaOrigen > saldoActual + 0.009) throw new Error(`Pago excede saldo disponible (${saldoActual})`)
        const nuevoSaldo = round2(saldoActual - montoEnMonedaOrigen)
        const tipoCambioOrigen = Number(target.tipo_cambio) || 1
        // Mismo moneda ⇒ conserva la tasa histórica del documento; moneda distinta ⇒ tasa vigente.
        const tipoCambioPago = monedaPago === monedaOrigen ? tipoCambioOrigen : tipoCambioDe(cfg, monedaPago)
        const pagoRow: Pago = { id_pago: uid('pag_'), ...parsed, moneda: monedaPago, tipo_cambio: tipoCambioPago }
        // Al liquidar una cuenta por pagar se traslada contablemente a Gastos Totales.
        let gastoGenerado: Gasto | null = null
        if (table === 'Cuentas_Pagar' && nuevoSaldo <= 0) {
          gastoGenerado = {
            id_gasto: uid('gas_'),
            fecha: parsed.fecha,
            categoria: String(target.categoria || 'Servicios'),
            descripcion: `CXP pagada ${String(target.folio_documento || '')} — ${String(target.nombre_proveedor || '')}`.trim(),
            monto: Number(target.monto_total) || 0,
            metodo_pago: parsed.metodo_pago,
            proveedor: String(target.nombre_proveedor || ''),
            moneda: monedaOrigen,
            tipo_cambio: tipoCambioOrigen
          }
        }
        // El documento vive en el spreadsheet del AÑO DE SU FECHA (hoja-por-año).
        // El saldo y el pago se escriben en EL MISMO spreadsheet del documento,
        // NUNCA en el BASE (post-refactor no tiene pestañas de evento → 400).
        // Un documento legacy del BASE se actualiza en su fragmento del BASE.
        const { id: idDestino, st: destino } = await storeDestino(table, target as Record<string, unknown>)
        const [locales, pagosLocales] = await Promise.all([
          destino.getAll(table) as Promise<Record<string, string | number>[]>,
          destino.getAll('Pagos')
        ])
        const actualizar = (r: Record<string, string | number>) => {
          if (r[idKey] === parsed.id_origen) {
            if (table === 'Facturas') return { ...r, saldo: nuevoSaldo, fecha_pago: nuevoSaldo <= 0 ? parsed.fecha : String(r.fecha_pago ?? '') }
            return { ...r, saldo: nuevoSaldo, estado: nuevoSaldo <= 0 ? 'pagada' : 'parcial' }
          }
          return r
        }
        const valueRanges: { range: string; values: (string | number)[][] }[] = [
          { range: `'${table}'!A${base}:${last}`, values: locales.map(actualizar).map(r => serializeRow(spec, r)) },
          { range: `'Pagos'!A${pagosBase + pagosLocales.length}:${pagosLast}`, values: [serializeRow(TABLES.Pagos, pagoRow as unknown as Record<string, unknown>)] }
        ]
        if (gastoGenerado) {
          const gastosBase = HEADER_ROWS('Gastos') + 1
          const gastosLocales = await destino.getAll('Gastos')
          valueRanges.push({ range: `'Gastos'!A${gastosBase + gastosLocales.length}:I`, values: [serializeRow(TABLES.Gastos, gastoGenerado as unknown as Record<string, unknown>)] })
        }
        await api.batchUpdate(idDestino, valueRanges)
        return pagoRow
      })
    },

    async listPagos(idOrigen?: string): Promise<Pago[]> {
      let rows = await readTable<Pago>('Pagos')
      if (idOrigen) rows = rows.filter(p => p.id_origen === idOrigen)
      return rows
    },

    async getReportes(mes: string) {
      // Una sola petición para las 4 tablas (cuota de lectura de Sheets: 60/min/usuario).
      const tablas = await getVariasUnificado<Record<string, string | number>>(['Facturas', 'Gastos', 'Cuentas_Pagar', 'Pagos'])
      const facturas = (tablas.Facturas ?? []) as unknown as Factura[]
      const gastos = (tablas.Gastos ?? []) as unknown as Gasto[]
      const cxps = (tablas.Cuentas_Pagar ?? []) as unknown as CuentaPagar[]
      const pagos = (tablas.Pagos ?? []) as unknown as Pago[]
      const kpis: Kpis = kpisForMonth(facturas, gastos, cxps, pagos, mes)
      const categorias = gastosPorCategoria(gastos.filter(g => g.fecha.slice(0, 7) === mes))
      const top = topClientes(facturas.filter(f => f.fecha_emision.slice(0, 7) === mes))
      return { kpis, categorias, top }
    },

    async getCategorias(kind: 'gastos' | 'cxp'): Promise<string[]> {
      const cfg = await readConfig()
      const raw = kind === 'gastos' ? cfg.categorias_gastos : cfg.categorias_cxp
      return raw.split(',').map(s => s.trim()).filter(Boolean)
    },

    async listProductos(): Promise<Producto[]> {
      const rows = await readTable<Producto>('Productos')
      const provs = (await readTable('Proveedores')).reduce<Record<string, string>>((m, p) => { m[String(p.id_proveedor)] = String(p.nombre ?? ''); return m }, {})
      return enrichNombreProveedor(rows, provs)
    },

    async saveProducto(p: Producto): Promise<Producto> {
      const parsed = ProductoSchema.parse(p)
      const provs = (await readTable('Proveedores')).reduce<Record<string, string>>((m, pr) => { m[String(pr.id_proveedor)] = String(pr.nombre ?? ''); return m }, {})
      const cfg = await readConfig()
      const saved = {
        ...parsed,
        id_producto: parsed.id_producto || uid('prod_'),
        fecha_registro: parsed.fecha_registro || todayLocal(),
        moneda: parsed.moneda || cfg.moneda,
        nombre_proveedor: parsed.nombre_proveedor || provs[String(parsed.id_proveedor)] || ''
      } as unknown as Producto
      await insertOrReplace('Productos', 'id_producto', saved)
      return saved
    },

    async deleteProducto(id: string): Promise<void> {
      const all = (await readTable('Productos')).filter(r => r.id_producto !== id)
      await replaceTable('Productos', all)
    },

    async registrarMovimiento(input: { id_producto: string; tipo: TipoMovimiento; cantidad: number; motivo: string; id_proveedor: string; fecha: string }): Promise<MovimientoStock> {
      const parsed = MovimientoStockSchema.parse(input)
      return withMutex<MovimientoStock>(mutexReadRow, mutexWriteRow, async () => {
        const productos = await readTable<Producto>('Productos')
        const prod = productos.find(p => p.id_producto === parsed.id_producto)
        if (!prod) throw new Error('Producto no existe')
        const stockActual = Number(prod.stock) || 0
        let nuevoStock = stockActual
        if (parsed.tipo === 'entrada') nuevoStock = stockActual + parsed.cantidad
        else if (parsed.tipo === 'salida') {
          if (parsed.cantidad > stockActual) throw new Error(`Stock insuficiente (disponible: ${stockActual})`)
          nuevoStock = stockActual - parsed.cantidad
        } else {
          nuevoStock = parsed.cantidad
        }
        const idProveedor = parsed.tipo === 'entrada' ? (parsed.id_proveedor || String(prod.id_proveedor || '')) : ''
        const mov: MovimientoStock = {
          id_movimiento: uid('mov_'),
          id_producto: parsed.id_producto,
          tipo: parsed.tipo,
          cantidad: parsed.cantidad,
          motivo: parsed.motivo,
          id_proveedor: idProveedor,
          fecha: parsed.fecha
        }
        await replaceTable('Productos', (productos).map(r => (r.id_producto === parsed.id_producto ? { ...r, stock: nuevoStock, id_proveedor: idProveedor || String(r.id_proveedor ?? '') } : r)))
        await appendRows('Movimientos_Stock', [mov])
        return mov
      })
    },

    async listMovimientos(idProducto?: string): Promise<MovimientoStock[]> {
      let rows = await readTable<MovimientoStock>('Movimientos_Stock')
      if (idProducto) rows = rows.filter(m => m.id_producto === idProducto)
      return rows.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
    },

    async listGastosFijos(): Promise<GastoFijo[]> {
      const rows = await readTable<GastoFijo>('Gastos_Fijos')
      const provs = (await readTable('Proveedores')).reduce<Record<string, string>>((m, p) => { m[String(p.id_proveedor)] = String(p.nombre ?? ''); return m }, {})
      return rows.map(r => ({ ...r, nombre_proveedor: r.nombre_proveedor || provs[String(r.id_proveedor)] || '' }))
    },

    async saveGastoFijo(gf: GastoFijo): Promise<GastoFijo> {
      const parsed = GastoFijoSchema.parse(gf)
      const saved = { ...parsed, id_gasto_fijo: parsed.id_gasto_fijo || uid('gfx_') } as unknown as GastoFijo
      await insertOrReplace('Gastos_Fijos', 'id_gasto_fijo', saved)
      return saved
    },

    async deleteGastoFijo(id: string): Promise<void> {
      await replaceTable('Gastos_Fijos', (await readTable('Gastos_Fijos')).filter(r => r.id_gasto_fijo !== id))
    },

    async listTasasHistorial(): Promise<TasaHistorial[]> {
      return readTable<TasaHistorial>('Tasas_Historial')
    },

    /** Registra la tasa del día si aún no existe entrada para esa fecha+moneda. */
    async registrarTasa(input: Omit<TasaHistorial, 'id_tasa'>): Promise<TasaHistorial> {
      const parsed = TasaHistorialSchema.parse(input)
      const all = await readTable<TasaHistorial>('Tasas_Historial')
      const dup = all.find(t => t.fecha === parsed.fecha && t.base === parsed.base && t.moneda === parsed.moneda)
      if (dup && Math.abs(Number(dup.tasa) - parsed.tasa) < 0.000001) return dup as TasaHistorial
      const saved: TasaHistorial = { ...parsed, id_tasa: uid('tasa_') }
      await appendRows('Tasas_Historial', [saved])
      return saved
    },

    async listNominaDetalles(): Promise<NominaDetalle[]> {
      return readTable<NominaDetalle>('Nomina_Detalles')
    },

    /**
     * Nómina avanzada: crea el gasto de nómina + detalle con horas extra,
     * bonos y comisiones; admite pagos divididos en varios métodos/monedas.
     */
    async registerNominaAvanzada(input: NominaAvanzadaInput): Promise<{ gasto: Gasto; detalle: NominaDetalle }> {
      const parsed = NominaDetalleInputSchema.parse(input)
      const emp = (await readTable('Empleados')).find(r => r.id_empleado === parsed.id_empleado)
      if (!emp) throw new Error('Empleado no existe')
      const cfg = await readConfig()
      const moneda = parsed.moneda || cfg.moneda
      const fecha = parsed.fecha || `${parsed.mes}-01`
      // Pagos divididos deben sumar el total.
      if (parsed.pagos_divididos.length > 0) {
        const suma = round2(parsed.pagos_divididos.reduce((s, p) => s + p.monto, 0))
        if (Math.abs(suma - round2(parsed.monto)) > 0.01) throw new Error(`La suma de los pagos (${suma}) debe ser igual al total (${round2(parsed.monto)})`)
      }
      const gasto = await this.registerNomina({
        id_empleado: parsed.id_empleado,
        mes: parsed.mes,
        monto: parsed.monto,
        metodo_pago: parsed.pagos_divididos.length > 0 ? parsed.pagos_divididos.map(p => `${p.metodo_pago}: ${p.monto}`).join(', ') : parsed.metodo_pago,
        fecha,
        notas: parsed.notas,
        moneda
      })
      const detalle: NominaDetalle = {
        id_detalle: uid('ndet_'),
        id_empleado: parsed.id_empleado,
        mes: parsed.mes,
        sueldo_base: round2(parsed.sueldo_base),
        horas_extra: round2(parsed.horas_extra),
        tarifa_hora_extra: round2(parsed.tarifa_hora_extra),
        monto_horas_extra: round2(parsed.horas_extra * parsed.tarifa_hora_extra),
        bonos: round2(parsed.bonos),
        comisiones: round2(parsed.comisiones),
        total: round2(parsed.monto),
        moneda,
        metodo_pago: parsed.metodo_pago,
        pagos_divididos: parsed.pagos_divididos.length > 0 ? JSON.stringify(parsed.pagos_divididos) : '',
        fecha,
        id_gasto: gasto.id_gasto
      }
      await appendRows('Nomina_Detalles', [detalle])
      return { gasto, detalle }
    },

    /** Reporte financiero completo para un rango de fechas (P&L, equilibrio, reconversión, flujo). */
    async getReporteFinanciero(rango: RangoFecha): Promise<{
      pl: ResultadoPL
      equilibrio: PuntoEquilibrio
      reconversion: ResumenReconversion
      flujo: ResultadoFlujoCaja
    }> {
      const cfg = await readConfig()
      const [facturas, gastos, cxps, pagos, productos, items] = await Promise.all([
        readTable<Factura>('Facturas'), readTable<Gasto>('Gastos'), readTable<CuentaPagar>('Cuentas_Pagar'),
        readTable<Pago>('Pagos'), readTable<Producto>('Productos'),
        readTable<FacturaItem & { id_factura: string }>('Factura_Items')
      ])
      const costoPorProducto = productos.reduce<Record<string, number>>((m, p) => { m[p.id_producto] = Number(p.precio_costo) || 0; return m }, {})
      const monedaPorProducto = productos.reduce<Record<string, string>>((m, p) => { m[p.id_producto] = p.moneda || ''; return m }, {})
      const itemsPorFactura = items.reduce<Record<string, { cantidad: number; id_producto?: string; precio_unitario?: number }[]>>((m, it) => {
        ;(m[it.id_factura] ??= []).push({ cantidad: Number(it.cantidad), id_producto: it.id_producto || undefined, precio_unitario: Number(it.precio_unitario) })
        return m
      }, {})
      const pl = estadoResultados(facturas, gastos, cfg, costoPorProducto, monedaPorProducto, itemsPorFactura, rango)
      // Comisiones por método de pago: configuración avanzada por método (pct y/o fijo mínimo).
      const legacyPct = Object.fromEntries(Object.entries(parseComisiones(cfg.comisiones_transaccion).metodos).map(([k, pct]) => [k, { pct }]))
      const comisionesMetodo = { ...legacyPct, ...parseComisionesMetodos(cfg.comisiones_metodos) }
      const flujo = flujoCaja(pagos, gastos, comisionesMetodo, rango)
      return {
        pl,
        equilibrio: puntoDeEquilibrio(pl),
        reconversion: reconversionMonetaria(cfg, { facturas, gastos, cxps, pagos }, rango),
        flujo
      }
    },

    /** Datos agregados de inventario/ventas para reportes y dashboard. */
    async getReportesInventario(rango: RangoFecha, idsProductos?: string[]): Promise<{
      stockBajo: ReturnType<typeof productosStockBajo>
      movimientosMensuales: ReturnType<typeof movimientosPorMes>
      statsProductos: StatsProducto[]
    }> {
      const tablasInv = await getVariasUnificado<Record<string, string | number>>(['Productos', 'Movimientos_Stock', 'Facturas', 'Factura_Items'])
      const productos = (tablasInv.Productos ?? []) as unknown as Producto[]
      const movimientos = (tablasInv.Movimientos_Stock ?? []) as unknown as MovimientoStock[]
      const facturas = (tablasInv.Facturas ?? []) as unknown as Factura[]
      const items = (tablasInv.Factura_Items ?? []) as unknown as (FacturaItem & { id_factura: string })[]
      const ids = idsProductos?.length ? idsProductos : productos.filter(p => p.activo !== 'false').map(p => p.id_producto)
      return {
        stockBajo: productosStockBajo(productos),
        movimientosMensuales: movimientosPorMes(movimientos, rango),
        statsProductos: statsMultiproducto({ productos, items, facturas, movimientos, ids, rango })
      }
    },

    async listFacturasItems(): Promise<(FacturaItem & { id_factura: string })[]> {
      return readTable<FacturaItem & { id_factura: string }>('Factura_Items')
    },

    /** Datos de la hoja vinculada actualmente (título exacto, id y URL). */
    async hojaActual(): Promise<{ id: string; titulo: string; url: string }> {
      const id = await sid()
      const meta = await api.getSpreadsheet(id)
      const titulo = meta.properties?.title || 'Sin título'
      return { id, titulo, url: `https://docs.google.com/spreadsheets/d/${id}/edit` }
    },

    /** Identidad de una hoja (spec F4 §6): tipo/instancia/estado/dueño/rol. */
    async infoHoja(id: string): Promise<HojaInfo> {
      return infoHoja(id)
    },

    /** Inventario completo (spec F4 §5-§6): BASE actual + años con su identidad
     *  + otras bases con huella activa (candidatas del picker de arranque). */
    async inventarioHojas(): Promise<InventarioHojas> {
      const baseId = await sid()
      const [base, eventos, encontradas] = await Promise.all([
        infoHoja(baseId),
        idsDeAñosRegistrados(),
        drive.findBases().catch(() => [])
      ])
      const años = await Promise.all(eventos.map(async e => ({ año: e.año, hoja: await infoHoja(e.id) })))
      const candidatas: HojaInfo[] = []
      for (const c of encontradas) {
        if (c.id === baseId) continue
        candidatas.push(await infoHoja(c.id))
      }
      return { base, años, candidatas }
    },

    /** Sonda de ownership (spec F3 §7): es_dueño / no_es_dueño / no_verificable. */
    async verificarOwnership(id: string): Promise<{ estado: 'es_dueño' | 'no_es_dueño' | 'no_verificable'; motivo?: string }> {
      return probeOwnership(id)
    },

    /** ¿Es un BASE legacy sin huella pero reconocible (Config/Sistema + catálogo)? */
    async esLegacyBase(id: string): Promise<boolean> {
      return esLegacyBase(id)
    },

    /** Orden de transferencia (spec F7 §10.4): PRIMERO todos los EVENTOS, el
     *  BASE al ÚLTIMO. Comparte el driver con `transferirSistema`. */
    async preflightTransferencia(email: string): Promise<PreflightTransferencia> {
      const baseId = (await sid()).trim()
      if (!baseId) throw new Error('No hay BASE vinculado todavía')
      const eventos = await idsDeAñosRegistrados()
      const sistema = await leerSistema()
      const previo = parsearTransferencia(sistema.ft_transferencia)
      const estados = new Map(previo.map(r => [r.id, r.estado]))
      const hojas: HojaTransferencia[] = []
      for (const e of eventos) {
        const p = await probeOwnership(e.id)
        hojas.push({ id: e.id, tipo: 'eventos', año: e.año, rol: p.estado, motivo: p.estado === 'es_dueño' ? undefined : p.motivo })
      }
      const baseSep = await probeOwnership(baseId)
      hojas.push({ id: baseId, tipo: 'base', rol: baseSep.estado, motivo: baseSep.estado === 'es_dueño' ? undefined : baseSep.motivo })
      const retomables = hojas.filter(h => estados.get(h.id) === 'fallo').map(h => h.id)
      const posible = hojas.every(h => h.rol === 'es_dueño')
      return { email, hojas, retomables, posible }
    },

    /** Ejecuta la transferencia de propiedad al email destino (spec F7 §10):
     *  secuencial EVENTOS → BASE, marcador `ft_transferencia` por hoja para
     *  retomar desde cualquiera de los dos lados sin re-transferir lo migrado.
     *  Si Google rechaza una hoja, se registra y el flujo continúa (plan B). */
    async transferirSistema(email: string, onProgreso?: (avance: string) => void): Promise<TransferenciaResultado> {
      if (ctx.modo === 'backend') throw new Error('La transferencia de propiedad solo aplica en modo owner')
      const destino = email.trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destino)) throw new Error('Email destino inválido')
      const baseId = await sid()
      if (!baseId.trim()) throw new Error('No hay BASE vinculado todavía')
      const eventos = await idsDeAñosRegistrados()
      const orden: { id: string; tipo: 'base' | 'eventos'; año?: string }[] = [
        ...eventos.map(e => ({ id: e.id, tipo: 'eventos' as const, año: e.año })),
        { id: baseId, tipo: 'base' as const }
      ]
      const sistema = await leerSistema()
      const lista: RegistroTransferencia[] = parsearTransferencia(sistema.ft_transferencia)
      const estados = new Map(lista.map(r => [r.id, r.estado]))
      const resultados: ResultadoTransferencia[] = []

      for (const h of orden) {
        if (estados.get(h.id) === 'hecho') {
          resultados.push({ id: h.id, tipo: h.tipo, año: h.año, estado: 'ya_transferido' })
          continue
        }
        const etiqueta = h.tipo === 'base' ? 'BASE' : `EVENTOS-${h.año}`
        try {
          const p = await probeOwnership(h.id)
          if (p.estado === 'no_es_dueño') {
            resultados.push({ id: h.id, tipo: h.tipo, año: h.año, estado: 'rechazado', motivo: `No eres dueño de ${etiqueta}` })
            continue
          }
          onProgreso?.(`Transfiriendo ${etiqueta} a ${destino}…`)
          // mejor esfuerzo: anotar dueño antes de mover; si falla, se continúa
          await drive.setAppProperties(h.id, { ft_dueño_email: destino }).catch(() => {})
          await drive.transferirOwnership(h.id, destino)
          estados.set(h.id, 'hecho')
          resultados.push({ id: h.id, tipo: h.tipo, año: h.año, estado: 'transferido' })
        } catch (e) {
          estados.set(h.id, 'fallo')
          const msg = e instanceof Error ? e.message : String(e)
          const codigo = (msg.match(/Drive API (\d+)/) ?? [])[1]
          if (codigo === '403' || codigo === '400') {
            resultados.push({ id: h.id, tipo: h.tipo, año: h.año, estado: 'rechazado', motivo: `Google rechazó la transferencia de ${etiqueta} (${codigo}); usa el plan B (compartir como editor)` })
          } else {
            resultados.push({ id: h.id, tipo: h.tipo, año: h.año, estado: 'rechazado', motivo: msg })
          }
        }
        // marcador SIEMPRE actualizado tras cada hoja → retomable desde ambos lados
        const regs: RegistroTransferencia[] = []
        for (const r of orden) {
          const estado = estados.get(r.id)
          if (estado) regs.push({ id: r.id, tipo: r.tipo, año: r.año, estado })
        }
        await mutexWriteRow('ft_transferencia', serializarTransferencia(regs)).catch(() => {})
      }

      const transferidos = resultados.filter(r => r.estado !== 'rechazado').length
      return { email: destino, resultados, transferidos, rechazados: resultados.length - transferidos }
    },

    /** Adopta un BASE legacy (spec §14): solo con confirmación explícita y si
     *  el gate de ownership lo permite. Estampa la huella y lo vincula. */
    async adoptarLegacyBase(spreadsheetId: string, confirmado: boolean): Promise<{ spreadsheetId: string }> {
      const id = spreadsheetId.trim()
      if (!/^[A-Za-z0-9_-]{15,}$/.test(id)) throw new Error('ID de hoja inválido')
      if (!confirmado) throw new Error('Debes confirmar la adopción de esta hoja legacy')
      if (!(await esLegacyBase(id))) throw new Error('Esta hoja no parece un BASE legacy reconocible (falta Config/Sistema o pestañas de catálogo)')
      // Write-probe real: ensureTables añade Sistema/estructura si faltara.
      await ensureTables(api, id)
      await gateTrasWriteProbe(id, 'adopción legacy BASE')
      const props = await drive.getAppProperties(id).catch(() => null)
      const instancia = props?.ft_instancia || (await leerClaveSpreadsheet(id, 'ft_instancia')) || uid('ftinst_')
      await estamparHuella(drive, id, 'base', instancia)
      if (!(await leerClaveSpreadsheet(id, 'ft_instancia'))) await escribirClaveSpreadsheet(id, 'ft_instancia', instancia)
      await ctx.storage.set(KEYS.spreadsheetId, id)
      invalidarSistemaCache()
      añosValidados.clear()
      storesEvento.clear()
      await escribirHistorial(`adopción legacy BASE (${id})`)
      return { spreadsheetId: id }
    },

    /** Adopta un spreadsheet de año legacy (sin huella): confirmación explícita +
     *  gate de ownership + estampa `ft_tipo=eventos` y registra `eventos_{año}`.
     *  Usar tras adoptar el BASE legacy (la instancia se hereda de su Sistema). */
    async adoptarAñoLegacy(año: string, spreadsheetId: string, confirmado: boolean): Promise<void> {
      if (!/^\d{4}$/.test(año)) throw new Error('Año inválido')
      const id = spreadsheetId.trim()
      if (!/^[A-Za-z0-9_-]{15,}$/.test(id)) throw new Error('ID de hoja inválido')
      if (!confirmado) throw new Error('Debes confirmar la adopción de esta hoja legacy')
      if (id === (await sid())) throw new Error('Ese ID es el spreadsheet principal; elige un archivo de año (EVENTOS-{año})')
      await ensureTablasEvento(api, id)
      await gateTrasWriteProbe(id, `adopción legacy EVENTOS-${año}`)
      const props = await drive.getAppProperties(id).catch(() => null)
      if (!props?.ft_tipo) {
        const instancia = (await leerClaveSpreadsheet(id, 'ft_instancia')) || (await leerSistema()).ft_instancia || uid('ftinst_')
        await estamparHuella(drive, id, 'eventos', instancia)
        if (!(await leerClaveSpreadsheet(id, 'ft_instancia'))) await escribirClaveSpreadsheet(id, 'ft_instancia', instancia)
      }
      await mutexWriteRow(`eventos_${año}`, id)
      añosValidados.add(año)
      if (!storesEvento.has(id)) storesEvento.set(id, createSheetsTableStore(api, async () => id))
      await escribirHistorial(`adopción legacy EVENTOS-${año} (${id})`)
    },

    /**
     * Conecta por nombre: si existe una hoja de la cuenta con ese nombre se
     * vincula (verificando permisos reales); si no, se crea con ese nombre.
     * El nombre debe ser distintivo para que la vinculación sea evidente y
     * no choque con hojas de terceros a las que la cuenta solo puede leer.
     */
    async conectarHojaPorNombre(nombre: string): Promise<{ spreadsheetId: string; url: string; creada: boolean }> {
      const limpio = nombre.trim()
      if (!limpio) throw new Error('Escribe el nombre de la hoja a conectar')
      if (limpio.length > 120) throw new Error('El nombre es demasiado largo (máx. 120)')
      const drive = new DriveApi(() => api.getToken())
      const existente = await drive.findSpreadsheet(limpio)
      if (existente) {
        try {
          await ensureTables(api, existente.id)
        } catch {
          throw new Error(`La hoja "${limpio}" existe pero esta cuenta no tiene permisos de edición sobre ella`)
        }
        await gateTrasWriteProbe(existente.id, `conectar por nombre ${limpio}`)
        await ctx.storage.set(KEYS.spreadsheetId, existente.id)
        return { spreadsheetId: existente.id, url: existente.url ?? `https://docs.google.com/spreadsheets/d/${existente.id}`, creada: false }
      }
      const creada = await createInitialSpreadsheet(api, limpio, { drive })
      await ctx.storage.set(KEYS.spreadsheetId, creada.spreadsheetId)
      return { spreadsheetId: creada.spreadsheetId, url: creada.url, creada: true }
    },

    /** Buscador del panel Almacenamiento: spreadsheets de la cuenta. */
    async listarHojasDisponibles(filtro: string): Promise<{ id: string; name: string }[]> {
      return new DriveApi(() => api.getToken()).listarHojas(filtro)
    },

    /** Renombra cualquier hoja del sistema (BASE o archivo de año). */
    async renombrarHoja(id: string, nombre: string): Promise<void> {
      const limpio = nombre.trim()
      if (!limpio) throw new Error('El nombre no puede quedar vacío')
      if (limpio.length > 120) throw new Error('El nombre es demasiado largo (máx. 120)')
      await new DriveApi(() => api.getToken()).renombrar(id.trim(), limpio)
    },

    /** F6 §11: "cambiar BASE" (nunca arrancar vacío). Crea un BASE nuevo
     *  estampado con la MISMA `ft_instancia`, re-sincroniza Config + Sistema +
     *  catálogos, invalida el BASE viejo (`ft_estado=reemplazado`) y propaga el
     *  nuevo id vía appData. Solo modo owner, bajo `ft_lock_largo`. */
    async crearBaseVacia(nombre: string): Promise<{ spreadsheetId: string }> {
      const limpio = nombre.trim()
      if (!limpio) throw new Error('Escribe el nombre del archivo principal')
      if (limpio.length > 120) throw new Error('El nombre es demasiado largo (máx. 120)')
      if (ctx.modo === 'backend') throw new Error('Cambiar el BASE no está disponible en modo backend')
      return withLockLargo('rebase', async () => {
        // 1. Preflight: write-probe real (ensureTables) + gate de ownership.
        const baseId = await sid()
        await ensureTables(api, baseId)
        await gateTrasWriteProbe(baseId, 're-sync BASE origen')

        // 2. BASE nuevo estampado con la misma instancia (los años siguen válidos).
        const sis = await leerSistema()
        const instancia = sis.ft_instancia ?? uid('ftinst_')
        const { spreadsheetId: nuevoId } = await createInitialSpreadsheet(api, limpio, { drive, instancia })

        // 3. Config (clear + reescritura).
        await copiarConfigEntreBases(baseId, nuevoId)

        // 4. Sistema: conserva eventos_{año}/anio_activo/historiales; ajusta ft_id.
        const rowsSis = await leerRango(baseId, SISTEMA_RANGO)
        const nuevas = rowsSis.map(r => {
          const c = String(r[0] ?? '')
          if (c === 'ft_id') return ['ft_id', nuevoId]
          if (c === 'ft_estado') return ['ft_estado', 'activo']
          return r
        })
        if (nuevas.length > 0) await api.batchUpdate(nuevoId, [{ range: SISTEMA_RANGO, values: nuevas }])

        // 5. Catálogos pestaña a pestaña con validación de conteos al final.
        for (const t of TABLAS_BASE) {
          if (t === 'Config') continue
          const filas = await copiarTablaEntreBases(t, baseId, nuevoId)
          if (filas > 0) {
            const verificadas = (await leerRango(nuevoId, `'${sheetName(t)}'!A:ZZZ`)).slice(1).filter(r => Array.isArray(r) && r.some(c => c !== '' && c !== undefined)).length
            if (verificadas !== filas) throw new Error(`Re-sync de ${sheetName(t)} incompleto: ${verificadas}/${filas}`)
          }
        }

        // 6. Invalidar el BASE viejo (evita dos sistemas vivos con esta instancia).
        await drive.setAppProperties(baseId, { ft_estado: 'reemplazado' })
        const rowsViejo = (await leerRango(baseId, SISTEMA_RANGO)).map(r => {
          const c = String(r[0] ?? '')
          if (c === 'ft_estado') return ['ft_estado', 'reemplazado']
          return r
        })
        if (rowsViejo.length > 0) await api.batchUpdate(baseId, [{ range: SISTEMA_RANGO, values: rowsViejo }])

        // 7. Propagar el nuevo id (PATCH al appDataFolder; otros dispositivos
        //    toman el nuevo BASE al arrancar).
        try {
          await drive.saveAppConfig({ spreadsheetId: nuevoId })
        } catch { /* fail-open: el boot re-resuelve por huella */ }

        await ctx.storage.set(KEYS.spreadsheetId, nuevoId)
        invalidarSistemaCache()
        baseTablasCache = null
        añosValidados.clear()
        storesEvento.clear()
        return { spreadsheetId: nuevoId }
      })
    },

    /** Vincula el BASE por ID directo (desde el buscador). Valida edición. */
    async conectarHojaPorId(spreadsheetId: string): Promise<void> {
      const id = spreadsheetId.trim()
      if (!/^[A-Za-z0-9_-]{15,}$/.test(id)) throw new Error('ID de hoja inválido')
      try {
        await ensureTables(api, id)
      } catch {
        throw new Error('Esta cuenta no tiene permisos de edición sobre esa hoja')
      }
      await gateTrasWriteProbe(id, 'conectarHojaPorId')
      await ctx.storage.set(KEYS.spreadsheetId, id)
      
      // NEW: sync to appDataFolder (non-blocking)
      try {
        await new DriveApi(() => api.getToken()).saveAppConfig({ spreadsheetId: id })
      } catch (e) {
        console.warn('[conectarHojaPorId] appData sync failed:', e instanceof Error ? e.message : e)
      }
    },

    /** Vincula un spreadsheet de año existente (desde el buscador). Valida que
     *  tenga las pestañas de evento y lo registra en Sistema como eventos_{año}. */
    async conectarAñoPorId(año: string, spreadsheetId: string): Promise<void> {
      if (!/^\d{4}$/.test(año)) throw new Error('Año inválido')
      const id = spreadsheetId.trim()
      if (!/^[A-Za-z0-9_-]{15,}$/.test(id)) throw new Error('ID de hoja inválido')
      // El spreadsheet principal NO puede usarse como archivo de año: su rol es
      // Config + catálogos. Conectarlo dispararía ensureTablasEvento (addSheet
      // de Facturas, Pagos…) sobre el BASE.
      if (id === (await sid())) throw new Error('Ese ID es el spreadsheet principal; elige un archivo de año (EVENTOS-{año})')
      try {
        await ensureTablasEvento(api, id)
      } catch {
        throw new Error('Esta cuenta no tiene permisos de edición o la hoja no tiene las pestañas de evento')
      }
      await gateTrasWriteProbe(id, `conectarAñoPorId ${año}`)
      await mutexWriteRow(`eventos_${año}`, id)
      añosValidados.add(año)
      if (!storesEvento.has(id)) storesEvento.set(id, createSheetsTableStore(api, async () => id))
      void mutexWriteRow('anio_activo', año).catch(() => {})
    },

    /** Varias tablas en una sola petición batchGet (para pulls del espejo). */
    async leerVariasTablas(ts: TableName[]): Promise<Partial<Record<TableName, Record<string, string | number>[]>>> {
      return getVariasUnificado<Record<string, string | number>>(ts)
    },

    async leerVariasTablasVivas(ts: TableName[]) {
      return leerVariasTablasVivas(ts)
    },

    /** Historial de ventas de un producto individual en un rango. */
    async getVentasProducto(idProducto: string, rango: RangoFecha): Promise<VentaProductoFila[]> {
      const t = await getVariasUnificado<Record<string, string | number>>(['Factura_Items', 'Facturas'])
      return historialVentasProducto(
        (t.Factura_Items ?? []) as unknown as (FacturaItem & { id_factura: string })[],
        (t.Facturas ?? []) as unknown as Factura[],
        idProducto,
        rango
      )
    },

    /** Metas vs logros por mes (facturación convertida a base). */
    async getMetasVsLogros(meses: string[]) {
      const [cfg, tablasMeta] = await Promise.all([
        readConfig(),
        getVariasUnificado<Record<string, string | number>>(['Facturas'])
      ])
      return metasVsLogros((tablasMeta.Facturas ?? []) as unknown as Factura[], parseMetas(cfg.metas_mensuales), meses)
    }
  }
}

export type Repository = ReturnType<typeof createRepository>
