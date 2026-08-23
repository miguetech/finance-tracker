import { SheetsApi } from '../sheets/api'
import { DriveApi, type UploadImagenInput } from '../drive/api'
import { TABLES, HEADER_ROWS } from '../sheets/tables'
import { serializeRow } from '../sheets/rows'
import { configFromRows, configToRows } from '../sheets/createSpreadsheet'
import { withMutex } from '../sheets/mutex'
import type { StorageAdapter } from './storage'
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

  function tipoCambioDe(cfg: Config, moneda: string): number {
    if (!moneda || moneda === cfg.moneda) return 1
    return rateFor(cfg, cfg.moneda, moneda)
  }

  function readTable<T = Record<string, string | number>>(t: keyof typeof TABLES): Promise<T[]> {
    return store.getAll<T>(t)
  }

  async function appendRows<T extends object>(t: keyof typeof TABLES, rows: T[]): Promise<void> {
    await store.append(t, rows)
  }

  async function replaceTable<T extends object>(t: keyof typeof TABLES, rows: T[]): Promise<void> {
    await store.replace(t, rows)
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
    for (const [k, v] of rows) if (String(k) === clave) return String(v ?? '')
    return null
  }

  async function mutexWriteRow(clave: string, valor: string): Promise<void> {
    const id = await sid()
    const res = await api.batchGet(id, [`'Config'!A1:B500`])
    const rows = res[Object.keys(res)[0]] ?? []
    let row = -1
    for (let i = 0; i < rows.length; i++) if (String(rows[i][0]) === clave) { row = i + 1; break }
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
      const id_factura = uid('fac_')
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
      const [facturas, gastos, cxps, pagos] = await Promise.all([readTable<Factura>('Facturas'), readTable<Gasto>('Gastos'), readTable<CuentaPagar>('Cuentas_Pagar'), readTable<Pago>('Pagos')])
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
      const [productos, movimientos, facturas, items] = await Promise.all([
        readTable<Producto>('Productos'), readTable<MovimientoStock>('Movimientos_Stock'),
        readTable<Factura>('Facturas'), readTable<FacturaItem & { id_factura: string }>('Factura_Items')
      ])
      const ids = idsProductos?.length ? idsProductos : productos.filter(p => p.activo !== 'false').map(p => p.id_producto)
      return {
        stockBajo: productosStockBajo(productos),
        movimientosMensuales: movimientosPorMes(movimientos, rango),
        statsProductos: statsMultiproducto({ productos, items, facturas, movimientos, ids, rango })
      }
    },

    /** Historial de ventas de un producto individual en un rango. */
    async getVentasProducto(idProducto: string, rango: RangoFecha): Promise<VentaProductoFila[]> {
      const [items, facturas] = await Promise.all([
        readTable<FacturaItem & { id_factura: string }>('Factura_Items'),
        readTable<Factura>('Facturas')
      ])
      return historialVentasProducto(items, facturas, idProducto, rango)
    },

    /** Metas vs logros por mes (facturación convertida a base). */
    async getMetasVsLogros(meses: string[]) {
      const cfg = await readConfig()
      const facturas = await readTable<Factura>('Facturas')
      return metasVsLogros(facturas, parseMetas(cfg.metas_mensuales), meses)
    }
  }
}

export type Repository = ReturnType<typeof createRepository>
