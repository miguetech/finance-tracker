import type { crearEspejo } from '../sync/espejo'
import type { TableName } from '../sheets/tables'
import type { Cliente, Empleado, Asistencia, Factura, FacturaItem, Gasto, Pago, Producto, Proveedor, CuentaPagar, MovimientoStock, Config } from '../types/entities'
import { kpisForMonth, gastosPorCategoria, topClientes, type Kpis } from '../calc/kpis'
import { estadoResultados, puntoDeEquilibrio, reconversionMonetaria, flujoCaja } from '../reports/financieros'
import { parseComisiones, parseComisionesMetodos } from '../reports/comisiones'
import type { ResultadoPL, PuntoEquilibrio, ResumenReconversion, ResultadoFlujoCaja, RangoFecha } from '../reports/types'

type Espejo = ReturnType<typeof crearEspejo>

async function leer<T>(espejo: Espejo, tabla: TableName): Promise<T[]> {
  return espejo.getAllRows(tabla) as Promise<T[]>
}

export async function listClientesEspejo(e: Espejo): Promise<Cliente[]> {
  return leer<Cliente>(e, 'Clientes')
}

/** Mismo contrato que repo.listFacturas: filtro por mes y estado. */
export async function listFacturasEspejo(e: Espejo, filtro: { estado?: string; mes?: string } = {}): Promise<Factura[]> {
  let rows = await leer<Factura>(e, 'Facturas')
  if (filtro.mes) rows = rows.filter(f => String(f.fecha_emision).slice(0, 7) === filtro.mes)
  if (filtro.estado) {
    rows = rows.filter(f => {
      const saldo = Number(f.saldo)
      const total = Number(f.total)
      const est = saldo <= 0 ? 'pagada' : saldo < total ? 'parcial' : 'pendiente'
      return filtro.estado === 'pendientes' ? est !== 'pagada' : est === filtro.estado
    })
  }
  return rows
}

export async function listPagosEspejo(e: Espejo, idOrigen?: string): Promise<Pago[]> {
  let rows = await leer<Pago>(e, 'Pagos')
  if (idOrigen) rows = rows.filter(p => p.id_origen === idOrigen)
  return rows
}

/** Mismo contrato que repo.getFactura: null si no existe. */
export async function getFacturaEspejo(e: Espejo, id: string): Promise<{ factura: Factura; items: FacturaItem[] } | null> {
  const facturas = await leer<Factura>(e, 'Facturas')
  const factura = facturas.find(f => f.id_factura === id)
  if (!factura) return null
  type ItemConOrigen = FacturaItem & { id_factura: string }
  const items = await leer<ItemConOrigen>(e, 'Factura_Items')
  return { factura, items: items.filter(i => i.id_factura === id).map(i => ({
    descripcion: String(i.descripcion), cantidad: Number(i.cantidad), precio_unitario: Number(i.precio_unitario), importe: Number(i.importe),
    ...(i.id_producto ? { id_producto: String(i.id_producto) } : {})
  })) }
}

export async function listGastosEspejo(e: Espejo, filtro: { mes?: string; categoria?: string } = {}): Promise<Gasto[]> {
  let rows = await leer<Gasto>(e, 'Gastos')
  if (filtro.mes) rows = rows.filter(g => String(g.fecha).slice(0, 7) === filtro.mes)
  if (filtro.categoria) rows = rows.filter(g => g.categoria === filtro.categoria)
  return rows
}

export async function listProductosEspejo(e: Espejo): Promise<Producto[]> {
  return leer<Producto>(e, 'Productos')
}

export async function listProveedoresEspejo(e: Espejo): Promise<Proveedor[]> {
  return leer<Proveedor>(e, 'Proveedores')
}

export async function listEmpleadosEspejo(e: Espejo): Promise<Empleado[]> {
  return leer<Empleado>(e, 'Empleados')
}

/** Mismo contrato que repo.listAsistencias. */
export async function listAsistenciasEspejo(e: Espejo, filtro: { id_empleado?: string; desde?: string; hasta?: string } = {}): Promise<Asistencia[]> {
  let rows = await leer<Asistencia>(e, 'Asistencias')
  if (filtro.id_empleado) rows = rows.filter(a => a.id_empleado === filtro.id_empleado)
  if (filtro.desde) rows = rows.filter(a => a.fecha >= filtro.desde!)
  if (filtro.hasta) rows = rows.filter(a => a.fecha <= filtro.hasta!)
  return rows.sort((a, b) => b.fecha.localeCompare(a.fecha))
}


export async function listCxpEspejo(e: Espejo, filtro: { estado?: string } = {}): Promise<CuentaPagar[]> {
  let rows = await leer<CuentaPagar>(e, 'Cuentas_Pagar')
  if (filtro.estado) rows = rows.filter(c => c.estado === filtro.estado)
  return rows
}

/** KPIs del dashboard desde el espejo (mismo contrato que repo.getReportes). */
export async function reportesKpisEspejo(e: Espejo, mes: string): Promise<{ kpis: Kpis; categorias: ReturnType<typeof gastosPorCategoria>; top: ReturnType<typeof topClientes> }> {
  const [facturas, gastos, cxps, pagos] = await Promise.all([
    leer<Factura>(e, 'Facturas'), leer<Gasto>(e, 'Gastos'),
    leer<CuentaPagar>(e, 'Cuentas_Pagar'), leer<Pago>(e, 'Pagos')
  ])
  return {
    kpis: kpisForMonth(facturas, gastos, cxps, pagos, mes),
    categorias: gastosPorCategoria(gastos.filter(g => g.fecha.slice(0, 7) === mes)),
    top: topClientes(facturas.filter(f => f.fecha_emision.slice(0, 7) === mes))
  }
}

export async function listMovimientosEspejo(e: Espejo, idProducto?: string): Promise<MovimientoStock[]> {
  let rows = await leer<MovimientoStock>(e, 'Movimientos_Stock')
  if (idProducto) rows = rows.filter(m => m.id_producto === idProducto)
  return rows
}

/** Reporte financiero completo desde el espejo; la config viene del cache de zustand. */
export async function reporteFinancieroEspejo(e: Espejo, rango: RangoFecha, cfg: Config | null) {
  if (!cfg) throw new Error('Config no disponible en offline')
  const [facturas, gastos, cxps, pagos, productos, items] = await Promise.all([
    leer<Factura>(e, 'Facturas'), leer<Gasto>(e, 'Gastos'), leer<CuentaPagar>(e, 'Cuentas_Pagar'),
    leer<Pago>(e, 'Pagos'), leer<Producto>(e, 'Productos'),
    leer<FacturaItem & { id_factura: string }>(e, 'Factura_Items')
  ])
  const costoPorProducto = productos.reduce<Record<string, number>>((m, p) => { m[p.id_producto] = Number(p.precio_costo) || 0; return m }, {})
  const monedaPorProducto = productos.reduce<Record<string, string>>((m, p) => { m[p.id_producto] = p.moneda || ''; return m }, {})
  const itemsPorFactura = items.reduce<Record<string, { cantidad: number; id_producto?: string; precio_unitario?: number }[]>>((m, it) => {
    ;(m[it.id_factura] ??= []).push({ cantidad: Number(it.cantidad), id_producto: it.id_producto || undefined, precio_unitario: Number(it.precio_unitario) })
    return m
  }, {})
  const pl: ResultadoPL = estadoResultados(facturas, gastos, cfg, costoPorProducto, monedaPorProducto, itemsPorFactura, rango)
  const legacyPct = Object.fromEntries(Object.entries(parseComisiones(cfg.comisiones_transaccion).metodos).map(([k, pct]) => [k, { pct }]))
  const comisionesMetodo = { ...legacyPct, ...parseComisionesMetodos(cfg.comisiones_metodos) }
  const flujo: ResultadoFlujoCaja = flujoCaja(pagos, gastos, comisionesMetodo, rango)
  return {
    pl,
    equilibrio: puntoDeEquilibrio(pl) as PuntoEquilibrio,
    reconversion: reconversionMonetaria(cfg, { facturas, gastos, cxps, pagos }, rango) as ResumenReconversion,
    flujo
  }
}
