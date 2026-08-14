import { SheetsApi } from '../sheets/api'
import { TABLES, sheetName, HEADER_ROWS } from '../sheets/tables'
import { serializeRow, deserializeRow, migrateFacturaLegacyRow } from '../sheets/rows'
import { configFromRows, configToRows } from '../sheets/createSpreadsheet'
import { withMutex } from '../sheets/mutex'
import { KEYS, type StorageAdapter } from './storage'
import { uid } from '../lib/uid'
import { getCurrency } from '../currency'
import { buildFactura, estadoDesdeSaldo, round2 } from '../calc/invoice'
import { kpisForMonth, topClientes, gastosPorCategoria, type Kpis } from '../calc/kpis'
import { expandFolioTemplate } from '../calc/folio'
import type { Config, Cliente, Empleado, Factura, FacturaItem, Gasto, Proveedor, CuentaPagar, Pago, MetodoPago } from '../types/entities'
import { ClienteSchema, ConfigSchema, FacturaInputSchema, GastoSchema, ProveedorSchema, CxpInputSchema, PagoInputSchema, EmpleadoSchema, NominaInputSchema } from '../types/schemas'

export interface RepoContext {
  api: SheetsApi
  storage: StorageAdapter
  getSpreadsheetId(): Promise<string>
}

export function createRepository(ctx: RepoContext) {
  const { api, storage } = ctx
  const sid = ctx.getSpreadsheetId

  function rangeOf(t: keyof typeof TABLES): string {
    const spec = TABLES[t]
    const last = String.fromCharCode(64 + spec.length)
    const rowStart = HEADER_ROWS(t) + 1
    return `'${sheetName(t)}'!A${rowStart}:${last}`
  }

    async function readTable(t: keyof typeof TABLES): Promise<Record<string, string | number>[]> {
    const id = await sid()
    const res = await api.batchGet(id, [rangeOf(t)])
    const rows = res[Object.keys(res)[0]] ?? []
    const spec = TABLES[t]
    const headerLen = HEADER_ROWS(t)
    const data = rows.slice(headerLen === 0 ? 0 : headerLen - 1)
    if (t === 'Facturas') return data.map(r => deserializeRow(spec, migrateFacturaLegacyRow(r))).filter(r => Object.values(r).some(v => v !== ''))
    return data.map(r => deserializeRow(spec, r)).filter(r => Object.values(r).some(v => v !== ''))
  }

  async function appendRows(t: keyof typeof TABLES, rows: Record<string, string | number>[]): Promise<void> {
    const id = await sid()
    const spec = TABLES[t]
    const values = rows.map(r => serializeRow(spec, r))
    const last = String.fromCharCode(64 + spec.length)
    await api.appendValues(id, `'${sheetName(t)}'!A${HEADER_ROWS(t) + 1}:${last}`, values)
  }

  async function replaceTable(t: keyof typeof TABLES, rows: Record<string, string | number>[]): Promise<void> {
    const id = await sid()
    const spec = TABLES[t]
    const values = rows.map(r => serializeRow(spec, r))
    const last = String.fromCharCode(64 + spec.length)
    const base = HEADER_ROWS(t) + 1
    const range = `'${sheetName(t)}'!A${base}:${last}`
    if (values.length === 0) {
      await api.clearRange(id, range)
      return
    }
    await api.batchUpdate(id, [{ range, values }])
    await api.clearRange(id, `'${sheetName(t)}'!A${base + values.length}:${last}`)
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

  async function insertOrReplace(t: keyof typeof TABLES, idKey: string, obj: Record<string, string | number>): Promise<Record<string, string | number>> {
    const all = await readTable(t)
    const exists = all.some(r => r[idKey] === obj[idKey])
    if (!exists) {
      await appendRows(t, [obj])
      return obj
    }
    await replaceTable(t, all.map(r => (r[idKey] === obj[idKey] ? obj : r)))
    return obj
  }

  return {
    async getConfig(): Promise<Config> { return readConfig() },

    async saveConfig(config: Config): Promise<void> {
      const parsed = ConfigSchema.parse(config)
      await writeConfig(parsed)
    },

    async listClientes(): Promise<Cliente[]> { return readTable('Clientes') as unknown as Cliente[] },

    async saveCliente(cliente: Cliente): Promise<Cliente> {
      const parsed = ClienteSchema.parse(cliente)
      const saved = { ...parsed, id_cliente: parsed.id_cliente || uid('cli_'), fecha_registro: parsed.fecha_registro || new Date().toISOString().slice(0, 10) } as unknown as Cliente
      await insertOrReplace('Clientes', 'id_cliente', saved as unknown as Record<string, string | number>)
      return saved
    },

    async deleteCliente(id: string): Promise<void> {
      const facturas = await readTable('Facturas')
      if (facturas.some(f => f.id_cliente === id)) throw new Error('Cliente tiene facturas asociadas')
      const all = (await readTable('Clientes')).filter(r => r.id_cliente !== id)
      await replaceTable('Clientes', all)
    },

    async createFactura(input: { id_cliente: string; items: { descripcion: string; cantidad: number; precio_unitario: number }[]; fecha_emision: string; fecha_vencimiento: string; notas: string }): Promise<Factura> {
      const parsed = FacturaInputSchema.parse(input)
      const clientes = await readTable('Clientes')
      const cliente = clientes.find(c => c.id_cliente === parsed.id_cliente)
      if (!cliente) throw new Error('Cliente no existe')
      const cfg = await readConfig()
      const { items, totals } = buildFactura(parsed.items, cfg.iva_porcentaje, getCurrency(cfg.moneda).decimals)
      const id_factura = uid('fac_')
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
        notas: parsed.notas
      }
      await appendRows('Facturas', [factura as unknown as Record<string, string | number>])
      const itemRows = items.map(it => ({ id_factura, ...it }))
      await appendRows('Factura_Items', itemRows as unknown as Record<string, string | number>[])
      return factura
    },

    async listFacturas(filtro: { estado?: string; mes?: string } = {}): Promise<Factura[]> {
      let rows = (await readTable('Facturas')) as unknown as Factura[]
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
      const facturas = (await readTable('Facturas')) as unknown as Factura[]
      const factura = facturas.find(f => f.id_factura === id)
      if (!factura) throw new Error('Factura no existe')
      const items = (await readTable('Factura_Items')).filter(i => i.id_factura === id).map(i => ({
        descripcion: String(i.descripcion), cantidad: Number(i.cantidad), precio_unitario: Number(i.precio_unitario), importe: Number(i.importe)
      }))
      return { factura, items }
    },

    async deleteFactura(id: string): Promise<void> {
      const all = (await readTable('Facturas')).filter(r => r.id_factura !== id)
      await replaceTable('Facturas', all)
      await replaceTable('Factura_Items', (await readTable('Factura_Items')).filter(r => r.id_factura !== id))
      await replaceTable('Pagos', (await readTable('Pagos')).filter(r => r.id_origen !== id))
    },

    async listGastos(filtro: { mes?: string; categoria?: string } = {}): Promise<Gasto[]> {
      let rows = (await readTable('Gastos')) as unknown as Gasto[]
      if (filtro.mes) rows = rows.filter(g => g.fecha.slice(0, 7) === filtro.mes)
      if (filtro.categoria) rows = rows.filter(g => g.categoria === filtro.categoria)
      return rows
    },

    async saveGasto(gasto: Gasto): Promise<Gasto> {
      const parsed = GastoSchema.parse(gasto)
      const saved = { ...parsed, id_gasto: parsed.id_gasto || uid('gas_') } as unknown as Gasto
      await insertOrReplace('Gastos', 'id_gasto', saved as unknown as Record<string, string | number>)
      return saved
    },

    async deleteGasto(id: string): Promise<void> {
      await replaceTable('Gastos', (await readTable('Gastos')).filter(r => r.id_gasto !== id))
    },

    async listProveedores(): Promise<Proveedor[]> { return readTable('Proveedores') as unknown as Proveedor[] },

    async saveProveedor(p: Proveedor): Promise<Proveedor> {
      const parsed = ProveedorSchema.parse(p)
      const saved = { ...parsed, id_proveedor: parsed.id_proveedor || uid('prov_'), fecha_registro: parsed.fecha_registro || new Date().toISOString().slice(0, 10) } as unknown as Proveedor
      await insertOrReplace('Proveedores', 'id_proveedor', saved as unknown as Record<string, string | number>)
      return saved
    },

    async deleteProveedor(id: string): Promise<void> {
      const cxps = await readTable('Cuentas_Pagar')
      if (cxps.some(c => c.id_proveedor === id)) throw new Error('Proveedor tiene cuentas por pagar asociadas')
      await replaceTable('Proveedores', (await readTable('Proveedores')).filter(r => r.id_proveedor !== id))
    },

    async listEmpleados(): Promise<Empleado[]> { return readTable('Empleados') as unknown as Empleado[] },

    async saveEmpleado(emp: Empleado): Promise<Empleado> {
      const parsed = EmpleadoSchema.parse(emp)
      const saved = { ...parsed, id_empleado: parsed.id_empleado || uid('emp_'), fecha_ingreso: parsed.fecha_ingreso || new Date().toISOString().slice(0, 10) } as unknown as Empleado
      await insertOrReplace('Empleados', 'id_empleado', saved as unknown as Record<string, string | number>)
      return saved
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

    async registerNomina(input: { id_empleado: string; mes: string; monto: number; metodo_pago: MetodoPago; fecha: string; notas: string }): Promise<Gasto> {
      const parsed = NominaInputSchema.parse(input)
      const emp = (await readTable('Empleados')).find(r => r.id_empleado === parsed.id_empleado)
      if (!emp) throw new Error('Empleado no existe')
      const fecha = parsed.fecha || `${parsed.mes}-01`
      const gasto: Gasto = {
        id_gasto: uid('gas_'),
        fecha,
        categoria: 'Nómina',
        descripcion: `Nómina ${parsed.mes} — ${String(emp.nombre)}`,
        monto: round2(parsed.monto),
        metodo_pago: parsed.metodo_pago,
        proveedor: String(emp.nombre)
      }
      await appendRows('Gastos', [gasto as unknown as Record<string, string | number>])
      return gasto
    },

    async createCxp(input: { id_proveedor: string; folio_documento: string; categoria: string; descripcion: string; fecha_emision: string; fecha_vencimiento: string; monto_total: number; notas: string }): Promise<CuentaPagar> {
      const parsed = CxpInputSchema.parse(input)
      const provs = await readTable('Proveedores')
      const prov = provs.find(p => p.id_proveedor === parsed.id_proveedor)
      if (!prov) throw new Error('Proveedor no existe')
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
        notas: parsed.notas
      }
      await appendRows('Cuentas_Pagar', [cxp as unknown as Record<string, string | number>])
      return cxp
    },

    async listCxp(filtro: { estado?: string } = {}): Promise<CuentaPagar[]> {
      let rows = (await readTable('Cuentas_Pagar')) as unknown as CuentaPagar[]
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
        const [rows, pagos] = await Promise.all([readTable(table), readTable('Pagos')])
        const target = rows.find(r => r[idKey] === parsed.id_origen)
        if (!target) throw new Error('Origen del pago no existe')
        const saldoActual = Number(target.saldo)
        if (parsed.monto > saldoActual) throw new Error(`Pago excede saldo disponible (${saldoActual})`)
        const nuevoSaldo = round2(saldoActual - parsed.monto)
        const pagoRow: Pago = { id_pago: uid('pag_'), ...parsed }
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
        await api.batchUpdate(id, valueRanges)
        return pagoRow
      })
    },

    async listPagos(idOrigen?: string): Promise<Pago[]> {
      let rows = (await readTable('Pagos')) as unknown as Pago[]
      if (idOrigen) rows = rows.filter(p => p.id_origen === idOrigen)
      return rows
    },

    async getReportes(mes: string) {
      const [facturas, gastos, cxps, pagos] = await Promise.all([readTable('Facturas'), readTable('Gastos'), readTable('Cuentas_Pagar'), readTable('Pagos')])
      const kpis: Kpis = kpisForMonth(facturas as unknown as Factura[], gastos as unknown as Gasto[], cxps as unknown as CuentaPagar[], pagos as unknown as Pago[], mes)
      const categorias = gastosPorCategoria((gastos as unknown as Gasto[]).filter(g => g.fecha.slice(0, 7) === mes))
      const top = topClientes((facturas as unknown as Factura[]).filter(f => f.fecha_emision.slice(0, 7) === mes))
      return { kpis, categorias, top }
    },

    async getCategorias(kind: 'gastos' | 'cxp'): Promise<string[]> {
      const cfg = await readConfig()
      const raw = kind === 'gastos' ? cfg.categorias_gastos : cfg.categorias_cxp
      return raw.split(',').map(s => s.trim()).filter(Boolean)
    }
  }
}

export type Repository = ReturnType<typeof createRepository>
