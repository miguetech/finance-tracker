import type { Factura, FacturaItem, Producto, MovimientoStock } from '../types/entities'
import { round2, roundTo } from '../calc/invoice'
import type { ProductoBajoStock, MovimientosMes, StatsProducto, RangoFecha } from './types'

/** Productos por debajo (o igual) del nivel mínimo configurado. */
export function productosStockBajo(productos: Producto[]): ProductoBajoStock[] {
  return productos
    .filter(p => p.activo !== 'false' && Number(p.minimum_stock) > 0 && Number(p.stock) <= Number(p.minimum_stock))
    .map(p => ({
      product_id: p.product_id,
      nombre: p.nombre,
      categoria: p.categoria,
      unidad: p.unidad,
      stock: Number(p.stock) || 0,
      minimum_stock: Number(p.minimum_stock),
      faltante: round2(Number(p.minimum_stock) - (Number(p.stock) || 0)),
      supplier_name: p.supplier_name || ''
    }))
    .sort((a, b) => a.stock - a.minimum_stock - (b.stock - b.minimum_stock))
}

function monthKey(fecha: string): string {
  return fecha.slice(0, 7)
}

/** Serie mensual de entradas vs salidas de inventario dentro de un rango. */
export function movimientosPorMes(movimientos: MovimientoStock[], rango: RangoFecha): MovimientosMes[] {
  const map = new Map<string, MovimientosMes>()
  for (const m of movimientos) {
    if (m.tipo === 'ajuste') continue
    const d = m.fecha.slice(0, 10)
    if ((rango.desde && d < rango.desde) || (rango.hasta && d > rango.hasta)) continue
    const mes = monthKey(m.fecha)
    const row = map.get(mes) ?? { mes, entradas: 0, salidas: 0 }
    if (m.tipo === 'entrada') row.entradas = round2(row.entradas + m.cantidad)
    else row.salidas = round2(row.salidas + m.cantidad)
    map.set(mes, row)
  }
  return [...map.values()].sort((a, b) => a.mes.localeCompare(b.mes))
}

export interface InputMultiproducto {
  productos: Producto[]
  items: FacturaItem[]
  facturas: Factura[]
  movimientos: MovimientoStock[]
  ids: string[]
  rango: RangoFecha
}

/**
 * Comparador multiproducto (2 a N productos): ventas, margen individual,
 * rotación y contribución % al total de la selección.
 */
export function statsMultiproducto(input: InputMultiproducto): StatsProducto[] {
  const { productos, items, facturas, movimientos, ids, rango } = input
  const idSet = new Set(ids)
  const porId = new Map(productos.map(p => [p.product_id, p]))

  // Facturas del rango con su moneda/tipo_cambio para convertir a base.
  const facs = facturas.filter(f => enRangoF(f.issue_date, rango))
  const facPorId = new Map(facs.map(f => [f.invoice_id, f]))

  const vendidas = new Map<string, number>()
  const ingresosBase = new Map<string, number>()
  for (const it of items) {
    const pid = (it as FacturaItem & { product_id?: string }).product_id
    if (!pid || !idSet.has(pid)) continue
    const fac = facPorId.get((it as FacturaItem & { invoice_id?: string }).invoice_id ?? '')
    if (!fac) continue
    vendidas.set(pid, round2((vendidas.get(pid) ?? 0) + it.cantidad))
    const tc = Number(fac.exchange_rate) || 1
    const ingresoBase = tc > 0 ? it.importe / tc : it.importe
    ingresosBase.set(pid, round2((ingresosBase.get(pid) ?? 0) + ingresoBase))
  }

  const dias = diasRango(rango)
  const salidaPeriodo = new Map<string, number>()
  for (const m of movimientos) {
    if (!idSet.has(m.product_id) || m.tipo !== 'salida') continue
    if ((rango.desde && m.fecha.slice(0, 10) < rango.desde) || (rango.hasta && m.fecha.slice(0, 10) > rango.hasta)) continue
    salidaPeriodo.set(m.product_id, round2((salidaPeriodo.get(m.product_id) ?? 0) + m.cantidad))
  }

  const rows: Omit<StatsProducto, 'contribucion_pct'>[] = []
  for (const pid of ids) {
    const p = porId.get(pid)
    if (!p) continue
    const unidades = round2(vendidas.get(pid) ?? 0)
    const margenUnitario = round2((Number(p.sale_price) || 0) - (Number(p.cost_price) || 0))
    const pv = Number(p.sale_price) || 0
    const salidas = salidaPeriodo.get(pid) ?? 0
    rows.push({
      product_id: pid,
      nombre: p.nombre,
      categoria: p.categoria,
      unidad: p.unidad,
      unidades_vendidas: unidades,
      ingresos: round2(ingresosBase.get(pid) ?? 0),
      margen_unitario: margenUnitario,
      margen_pct: pv > 0 ? roundTo((margenUnitario / pv) * 100, 1) : 0,
      rotacion: Number(p.stock) > 0 ? roundTo(salidas / Math.max(1, Number(p.stock)), 2) : 0,
      velocidad_salida: dias > 0 ? roundTo(salidas / dias, 2) : 0
    })
  }

  const totalIngresos = rows.reduce((s, r) => s + r.ingresos, 0)
  return rows
    .map(r => ({ ...r, contribucion_pct: totalIngresos > 0 ? roundTo((r.ingresos / totalIngresos) * 100, 1) : 0 }))
    .sort((a, b) => b.contribucion_pct - a.contribucion_pct)
}

/** Productos con mayor velocidad de salida (ventas rápidas) en el período. */
export function ventasRapidas(productos: Producto[], movimientos: MovimientoStock[], rango: RangoFecha, topN = 10): StatsProducto[] {
  return statsMultiproducto({
    productos,
    items: [],
    facturas: [],
    movimientos,
    ids: productos.map(p => p.product_id),
    rango
  })
    .filter(r => r.velocidad_salida > 0)
    .sort((a, b) => b.velocidad_salida - a.velocidad_salida)
    .slice(0, topN)
}

function enRangoF(fecha: string, r: RangoFecha): boolean {
  const d = fecha.slice(0, 10)
  return (!r.desde || d >= r.desde) && (!r.hasta || d <= r.hasta)
}

function diasRango(r: RangoFecha): number {
  const desde = r.desde ? new Date(`${r.desde}T00:00:00`) : null
  const hasta = r.hasta ? new Date(`${r.hasta}T00:00:00`) : null
  if (!desde || !hasta || Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) return 30
  const dias = Math.round((hasta.getTime() - desde.getTime()) / 86400000) + 1
  return Math.max(1, dias)
}

export interface VentaProductoFila {
  fecha: string
  folio: string
  cliente: string
  cantidad: number
  unit_price: number
  importe_base: number
}

/** Historial cronológico de ventas de un producto dentro del rango (importes en base). */
export function historialVentasProducto(
  items: (FacturaItem & { invoice_id?: string })[],
  facturas: Factura[],
  idProducto: string,
  rango: RangoFecha
): VentaProductoFila[] {
  const facPorId = new Map(facturas.map(f => [f.invoice_id, f]))
  const filas: VentaProductoFila[] = []
  for (const it of items) {
    const pid = (it as FacturaItem & { product_id?: string }).product_id
    if (!pid || pid !== idProducto) continue
    const fac = facPorId.get((it as FacturaItem & { invoice_id?: string }).invoice_id ?? '')
    if (!fac || !enRangoF(fac.issue_date, rango)) continue
    const tc = Number(fac.exchange_rate) || 1
    filas.push({
      fecha: fac.issue_date,
      folio: fac.folio,
      cliente: fac.customer_name,
      cantidad: Number(it.cantidad),
      unit_price: Number(it.unit_price),
      importe_base: round2(tc > 0 ? Number(it.importe) / tc : Number(it.importe))
    })
  }
  return filas.sort((a, b) => b.fecha.localeCompare(a.fecha))
}
