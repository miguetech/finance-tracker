import { SheetsApi } from '../sheets/api'
import { DriveApi, type UploadImagenInput } from '../drive/api'
import { TABLES, HEADER_ROWS, type TableName } from '../sheets/tables'
import { serializeRow } from '../sheets/rows'
import { configFromRows, configToRows, createInitialSpreadsheet, ensureTables, crearSpreadsheetEventos, ensureTablasEvento, TABLAS_EVENTO_AÑO } from '../sheets/createSpreadsheet'
import { withMutex } from '../sheets/mutex'
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
}

export function createRepository(ctx: RepoContext) {
  const { api } = ctx
  const sid = ctx.getSpreadsheetId
  const store: TableStore = createSheetsTableStore(api, sid)
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

  /** Registro de años vive como filas CRUDAS en Config (claves eventos_{año}
   *  y anio_activo). NO pasa por configFromRows: el parser de Config descarta
   *  claves desconocidas y las haría invisibles tras cada lectura. */
  async function leerFilasConfigRaw(): Promise<Record<string, string>> {
    const id = await sid()
    const res = await api.batchGet(id, [`'Config'!A1:B500`])
    const filas = res[Object.keys(res)[0]] ?? []
    const out: Record<string, string> = {}
    for (const r of filas) {
      if (!Array.isArray(r)) continue
      const clave = String(r[0] ?? '')
      if (!clave || clave === 'mutex') continue
      out[clave] = String(r[1] ?? '')
    }
    return out
  }

  async function idsDeAñosRegistrados(quien = '?'): Promise<{ año: string; id: string }[]> {
    const raw = await leerFilasConfigRaw()
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

  function storeDeAñoSoloLectura(id: string): TableStore {
    let s = storesEvento.get(id)
    if (!s) { s = createSheetsTableStore(api, async () => id); storesEvento.set(id, s) }
    return s
  }

  /** Creación ESTRICTA del spreadsheet EVENTOS-{año}: lanza en fallo.
   *  `storeDeEventos` la usa con fallback; la UI la usa para reportar. */
  async function crearHojaEventos(anio: string): Promise<string> {
    const clave = `eventos_${anio}`
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
    const nombre = `FinanceTracker${cfg?.empresa_nombre ? ` ${cfg.empresa_nombre}` : ''} ${anio}`.trim()
    // Anti-duplicación: si ya existe un archivo con ESE nombre exacto, se
    // ADOPTA (p. ej. tras perder el BASE y su registro).
    const driveBusqueda = new DriveApi(() => api.getToken())
    const adoptable = await driveBusqueda.findSpreadsheet(nombre).catch(() => null)
    let id: string
    if (adoptable) {
      id = adoptable.id
      await ensureTablasEvento(api, id)
      console.info(`[hoja-año] EVENTOS-${anio} adoptado (${id})`)
    } else {
      console.info(`[hoja-año] creando EVENTOS-${anio}…`)
      const creada = await crearSpreadsheetEventos(api, nombre)
      id = creada.spreadsheetId
      await ensureTablasEvento(api, id)
    }
    await mutexWriteRow(clave, id)
    añosValidados.add(anio)
    await mutexWriteRow(clave, id)
    console.info(`[hoja-año] EVENTOS-${anio} creado (${id})`)
    return id
  }

  /** Garantiza el spreadsheet EVENTOS-{año}: crea, registra en Config y
   *  devuelve el store apuntándole. Si la creación falla (permisos Drive,
   *  entorno de prueba), degrada al BASE en modo monolítico en vez de romper
   *  la escritura. */
  const añosValidados = new Set<string>()

  async function storeDeEventos(anio: string): Promise<TableStore> {
    const clave = `eventos_${anio}`
    let id = ''
    if (!añosValidados.has(anio)) {
      const existente = await mutexReadRow(clave)
      id = existente && existente.trim().length >= 15 ? existente : ''
    }
    if (id && !añosValidados.has(anio)) {
      // Auto-sanado: archivo borrado/vacío en Drive → se recrea limpio.
      try { await ensureTablasEvento(api, id); añosValidados.add(anio) }
      catch { añosValidados.delete(anio); id = '' }
    }
    if (!id) {
      try {
        id = await crearHojaEventos(anio)
        añosValidados.add(anio)
      } catch (e) {
        console.warn(`[hoja-año] EVENTOS-${anio} no disponible; escribiendo en el BASE:`, e instanceof Error ? e.message : e)
        return store
      }
    }
    if (!storesEvento.has(id)) storesEvento.set(id, createSheetsTableStore(api, async () => id))
    void mutexWriteRow('anio_activo', anio).catch(() => {})
    return storesEvento.get(id)!
  }

  /** Store destino de una escritura: evento → su año; catálogo → BASE. */
  async function storeDestino(t: keyof typeof TABLES, muestra: Record<string, unknown>): Promise<TableStore> {
    if (!TABLAS_EVENTO.has(t)) return store
    const anio = añoDeFila(muestra) || String(new Date().getFullYear())
    return storeDeEventos(anio)
  }

  /** Reemplazo fragmentado por año. Filas de años SIN spreadsheet registrado
   *  son legado del BASE: se reescriben ahí completas (nunca se duplican en
   *  un año nuevo). Requiere que `filas` sea el conjunto íntegro de la tabla
   *  (contrato actual de los flujos delete/update). */
  async function reemplazarEventoFragmentado<T extends object>(t: keyof typeof TABLES, filas: T[]): Promise<void> {
    const idDeAño = new Map((await idsDeAñosRegistrados()).map(x => [x.año, x.id]))
    const enBase: T[] = []
    const porAño = new Map<string, T[]>()
    for (const f of filas) {
      const r = f as Record<string, unknown>
      const anio = añoDeFila(r) || String(new Date().getFullYear())
      const id = idDeAño.get(anio)
      if (!id) enBase.push(f)
      else (porAño.get(anio) ?? porAño.set(anio, []).get(anio)!).push(f)
    }
    if (idDeAño.size === 0) {
      // Monolítico puro: sin años registrados el BASE ES la tabla completa
      // (incluye el borrado total: reemplazo con lista vacía limpia la hoja).
      await store.replace(t, filas as Record<string, string | number>[])
      return
    }
    // Con años registrados TODAS las fuentes se reescriben con su fragmento
    // (aunque algún fragmento quede vacío: así un delete del último registro
    // sí elimina la fila en lugar de dejarla huérfana).
    await store.replace(t, enBase as Record<string, string | number>[])
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

  /** Lectura multi-tabla con unión de años (espejo/reportes/historial). */
  async function getVariasUnificado<T = Record<string, string | number>>(ts: TableName[], añosPermitidos?: (anio: string, t: TableName) => boolean): Promise<Partial<Record<TableName, T[]>>> {
    const evento = ts.filter(t => TABLAS_EVENTO.has(t as TableName))
    const base = ts.filter(t => !TABLAS_EVENTO.has(t as TableName))
    const out: Partial<Record<TableName, T[]>> = {}
    if (base.length) Object.assign(out, await store.getVarias<T>(base as TableName[]))
    if (evento.length) {
      const idsAño = await idsDeAñosRegistrados()
      const fuentes = [
        { id: '__base__', st: store },
        ...idsAño.map(x => ({ id: x.id, st: storeDeAñoSoloLectura(x.id) }))
      ]
      const partes = await Promise.all(fuentes.map(({ id, st }) =>
        st.getVarias<T>(evento as TableName[]).then(p => ({ id, p }))
      ))
      for (const t of evento as TableName[]) {
        out[t] = partes
          .filter(({ id }) => !añosPermitidos || id === '__base__' || añosPermitidos(id.slice(0, 4), t as TableName))
          .flatMap(({ p }) => p[t] ?? []) as T[]
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
    const raw = await leerFilasConfigRaw()
    const activo = /^\d{4}$/.test(raw.anio_activo ?? '') ? raw.anio_activo : String(new Date().getFullYear())
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
      // Unión: fragmento LEGACY del BASE (usuarios previos a hoja-por-año) +
      // todos los años registrados en Config (los ausentes se omiten).
      return (async () => {
        const idsAño = (await idsDeAñosRegistrados()).map(x => x.id)
        const base = await store.getAll<T>(t)
        const partes = await Promise.all(idsAño.map(id => storeDeAñoSoloLectura(id).getAll<T>(t)))
        return [...base, ...partes.flat()]
      })()
    }
    return store.getAll<T>(t)
  }

  async function appendRows<T extends object>(t: keyof typeof TABLES, rows: T[]): Promise<void> {
    if (!rows.length) return
    const st = await storeDestino(t, rows[0] as Record<string, unknown>)
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
    return configFromRows(rows.filter(r => String(r[0]) !== 'mutex'))
  }

  async function writeConfig(config: Config): Promise<void> {
    const id = await sid()
    await api.batchUpdate(id, [{ range: `'Config'!A1:B${configToRows(config).length}`, values: configToRows(config) }])
  }

  async function mutexReadRow(clave: string): Promise<string | null> {
    const id = await sid()
    const res = await api.batchGet(id, [`'Config'!A1:B500`])
    const rows = res[Object.keys(res)[0]] ?? []
    for (const r of rows) {
      if (!Array.isArray(r)) continue
      if (String(r[0]) === clave) return String(r[1] ?? '')
    }
    return null
  }

  async function mutexWriteRow(clave: string, valor: string): Promise<void> {
    const id = await sid()
    const res = await api.batchGet(id, [`'Config'!A1:B500`])
    const rows = res[Object.keys(res)[0]] ?? []
    let row = -1
    for (let i = 0; i < rows.length; i++) {
      if (!Array.isArray(rows[i])) continue
      if (String(rows[i][0]) === clave) { row = i + 1; break }
    }
    if (row === -1) row = Math.max(rows.length + 1, 27)
    await api.batchUpdate(id, [{ range: `'Config'!A${row}:B${row}`, values: [[clave, valor]] }])
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
      const res = await drive.uploadBase64({ nombre: input.nombre, mimeType: input.mimeType, base64: input.base64 })
      return res.url
    },

    /** F4 (spec hoja-por-año §8): garantiza el spreadsheet EVENTOS-{año actual}
     *  desde el arranque. NO traga errores: devuelve diagnóstico para la UI. */
    async prepararAnioActual(): Promise<{ ok: boolean; modo: 'año' | 'monolítico'; error?: string }> {
      if (!(await sid()).trim()) return { ok: false, modo: 'monolítico', error: 'sin spreadsheet base vinculado todavía' }
      const anio = String(new Date().getFullYear())
      try {
        await crearHojaEventos(anio)
        return { ok: true, modo: 'año' }
      } catch (e) {
        return { ok: false, modo: 'monolítico', error: e instanceof Error ? e.message : String(e) }
      }
    },

    /** Elimina el archivo de un año (a papelera) y borra su registro.
     *  El BASE nunca se elimina aquí. */
    async eliminarAño(año: string): Promise<void> {
      if (!/^\d{4}$/.test(año)) throw new Error('Año inválido')
      const raw = await leerFilasConfigRaw()
      const clave = `eventos_${año}`
      const id = raw[clave] ?? ''
      if (id.trim().length >= 15) {
        await new DriveApi(() => api.getToken()).enviarAPapelera(id)
        añosValidados.delete(año)
        storesEvento.delete(id)
      }
      await mutexWriteRow(clave, '')
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
      const raw = await leerFilasConfigRaw()
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
        const id = await sid()
        const [rows, pagos, cfg] = await Promise.all([readTable(table), readTable('Pagos'), readConfig()])
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
        const updated = rows.map(r => {
          if (r[idKey] === parsed.id_origen) {
            if (table === 'Facturas') return { ...r, saldo: nuevoSaldo, fecha_pago: nuevoSaldo <= 0 ? parsed.fecha : String(r.fecha_pago ?? '') }
            return { ...r, saldo: nuevoSaldo, estado: nuevoSaldo <= 0 ? 'pagada' : 'parcial' }
          }
          return r
        })
        const valueRanges: { range: string; values: (string | number)[][] }[] = [
          { range: `'${table}'!A${base}:${last}`, values: updated.map(r => serializeRow(spec, r)) },
          { range: `'Pagos'!A${pagosBase + pagos.length}:${pagosLast}`, values: [serializeRow(TABLES.Pagos, pagoRow as unknown as Record<string, unknown>)] }
        ]
        if (gastoGenerado) {
          const gastosBase = HEADER_ROWS('Gastos') + 1
          const gastos = await readTable('Gastos')
          valueRanges.push({ range: `'Gastos'!A${gastosBase + gastos.length}:I`, values: [serializeRow(TABLES.Gastos, gastoGenerado as unknown as Record<string, unknown>)] })
        }
        await api.batchUpdate(id, valueRanges)
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
        await ctx.storage.set(KEYS.spreadsheetId, existente.id)
        return { spreadsheetId: existente.id, url: existente.url ?? `https://docs.google.com/spreadsheets/d/${existente.id}`, creada: false }
      }
      const creada = await createInitialSpreadsheet(api, limpio)
      await ctx.storage.set(KEYS.spreadsheetId, creada.spreadsheetId)
      return { spreadsheetId: creada.spreadsheetId, url: creada.url, creada: true }
    },

    /** Buscador del panel Almacenamiento: spreadsheets de la cuenta. */
    async listarHojasDisponibles(filtro: string): Promise<{ id: string; name: string }[]> {
      return new DriveApi(() => api.getToken()).listarHojas(filtro)
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
      await ctx.storage.set(KEYS.spreadsheetId, id)
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
