import type { Factura, Gasto, CuentaPagar, Pago } from '../types/entities'
import type { Config } from '../types/entities'
import { round2, roundTo } from '../calc/invoice'
import { toBase, rateFor, parseRates } from '../currency/rates'
import type { ResultadoPL, PuntoEquilibrio, ResumenReconversion, VariacionCambiaria, ResultadoFlujoCaja, FlujoMoneda, FlujoMetodo, RangoFecha, LineaPL } from './types'

const CATEGORIAS_FIJAS = ['Renta', 'Alquiler', 'Internet', 'Servicios', 'Nómina', 'Nomina', 'Seguros', 'Telefonía', 'Telefonia']

function enRango(fecha: string, r: RangoFecha): boolean {
  const d = fecha.slice(0, 10)
  return (!r.desde || d >= r.desde) && (!r.hasta || d <= r.hasta)
}

function baseMonto(monto: number, tipoCambio: number): number {
  return round2(toBase(monto, Number(tipoCambio) || 1))
}

/** Estado de Ganancias y Pérdidas (P&L) en un rango de fechas, montos convertidos a moneda base. */
export function estadoResultados(
  facturas: Factura[],
  gastos: Gasto[],
  productosCosto: Record<string, number>,
  itemsPorFactura: Record<string, { cantidad: number; id_producto?: string; precio_unitario?: number }[]>,
  rango: RangoFecha
): ResultadoPL {
  const facs = facturas.filter(f => enRango(f.fecha_emision, rango))
  const gas = gastos.filter(g => enRango(g.fecha, rango))

  let ingresos = 0
  const lineasIngresos = new Map<string, number>()
  for (const f of facs) {
    const total = baseMonto(f.total, f.tipo_cambio)
    ingresos += total
    lineasIngresos.set(f.moneda || 'base', round2((lineasIngresos.get(f.moneda || 'base') ?? 0) + total))
  }

  // Costo directo de mercancía vendida (COGS) a partir de items con producto vinculado.
  let cogs = 0
  for (const f of facs) {
    for (const it of itemsPorFactura[f.id_factura] ?? []) {
      if (it.id_producto && productosCosto[it.id_producto] !== undefined) cogs += productosCosto[it.id_producto] * it.cantidad
    }
  }
  cogs = round2(cogs)

  let fijos = 0
  let variables = 0
  const lineasCostos = new Map<string, number>()
  for (const g of gas) {
    const monto = baseMonto(g.monto, g.tipo_cambio)
    const esFijo = CATEGORIAS_FIJAS.some(c => g.categoria.toLowerCase() === c.toLowerCase())
    if (esFijo) fijos += monto
    else variables += monto
    lineasCostos.set(g.categoria, round2((lineasCostos.get(g.categoria) ?? 0) + monto))
  }
  fijos = round2(fijos)
  variables = round2(variables)

  const utilidad = round2(ingresos - cogs - fijos - variables)
  return {
    ingresos_totales: round2(ingresos),
    costo_mercancia: cogs,
    gastos_fijos: fijos,
    gastos_variables: variables,
    utilidad_neta: utilidad,
    margen_neto_pct: ingresos > 0 ? roundTo((utilidad / ingresos) * 100, 1) : 0,
    lineas_ingresos: [...lineasIngresos.entries()].map(([concepto, monto]) => ({ concepto, monto })).sort((a, b) => b.monto - a.monto),
    lineas_costos: [...lineasCostos.entries()].map(([concepto, monto]) => ({ concepto, monto })).sort((a, b) => b.monto - a.monto)
  } satisfies ResultadoPL & { lineas_ingresos: LineaPL[] }
}

/**
 * Punto de equilibrio: costos fijos cubiertos por margen de contribución.
 * PE = CF / (1 − CV/Ing). Rentable si ingresos ≥ PE.
 */
export function puntoDeEquilibrio(pl: ResultadoPL): PuntoEquilibrio {
  const cf = pl.gastos_fijos
  const cv = pl.gastos_variables + pl.costo_mercancia
  const ing = pl.ingresos_totales
  const margenPct = ing > 0 ? Math.max(0, 1 - cv / ing) : 0
  const pe = margenPct > 0 ? round2(cf / margenPct) : cf > 0 ? Infinity : 0
  return {
    costos_fijos: cf,
    costos_variables: round2(cv),
    ingresos: ing,
    margen_contribucion_pct: roundTo(margenPct * 100, 1),
    punto_equilibrio: Number.isFinite(pe) ? pe : -1,
    cobertura_pct: Number.isFinite(pe) && pe > 0 ? roundTo((ing / pe) * 100, 1) : ing > 0 ? 100 : 0,
    rentable: pl.utilidad_neta >= 0 && ing >= pe
  }
}

/**
 * Impacto por reconversión monetaria: compara el tipo de cambio guardado al crear cada
 * registro contra la tasa actual configurada. Diferencia > 0 ⇒ pérdida cambiaria.
 */
export function reconversionMonetaria(cfg: Config, datos: {
  facturas?: Factura[]
  gastos?: Gasto[]
  cxps?: CuentaPagar[]
  pagos?: Pago[]
}, rango: RangoFecha): ResumenReconversion {
  const variaciones: VariacionCambiaria[] = []
  const push = (
    tipo: VariacionCambiaria['tipo'], fecha: string, descripcion: string, moneda: string,
    montoMoneda: number, tcRegistro: number, tcActual: number
  ) => {
    const mon = moneda || cfg.moneda
    if (!mon || mon === cfg.moneda) return
    const registro = baseMonto(montoMoneda, tcRegistro)
    const actual = baseMonto(montoMoneda, tcActual)
    variaciones.push({
      fecha, descripcion, tipo, moneda: mon, monto_moneda: round2(montoMoneda),
      tipo_cambio_registro: tcRegistro, tipo_cambio_actual: tcActual,
      valor_base_registro: registro, valor_base_actual: actual,
      diferencia: round2(actual - registro)
    })
  }

  for (const f of datos.facturas ?? []) {
    if (!enRango(f.fecha_emision, rango)) continue
    push('factura', f.fecha_emision, `Factura ${f.folio} — ${f.nombre_cliente}`, f.moneda, f.total, f.tipo_cambio, tasaActual(cfg, f.moneda))
  }
  for (const g of datos.gastos ?? []) {
    if (!enRango(g.fecha, rango)) continue
    push('gasto', g.fecha, `Gasto ${g.categoria} — ${g.descripcion}`, g.moneda, g.monto, g.tipo_cambio, tasaActual(cfg, g.moneda))
  }
  for (const c of datos.cxps ?? []) {
    if (!enRango(c.fecha_emision, rango)) continue
    push('cxp', c.fecha_emision, `CXP ${c.folio_documento} — ${c.nombre_proveedor}`, c.moneda, c.saldo, c.tipo_cambio, tasaActual(cfg, c.moneda))
  }
  for (const p of datos.pagos ?? []) {
    if (!enRango(p.fecha, rango)) continue
    push('pago', p.fecha, `Pago ${p.tipo === 'cobro' ? 'cobro' : 'abono'}`, p.moneda, p.monto, p.tipo_cambio, tasaActual(cfg, p.moneda))
  }

  const perdida = variaciones.filter(v => v.diferencia < 0).reduce((s, v) => s + v.diferencia, 0)
  const ganancia = variaciones.filter(v => v.diferencia > 0).reduce((s, v) => s + v.diferencia, 0)
  return { variaciones, perdida_total: round2(perdida), ganancia_total: round2(ganancia), neto: round2(perdida + ganancia) }
}

function tasaActual(cfg: Config, moneda: string | undefined): number {
  if (!moneda || moneda === cfg.moneda) return 1
  const r = parseRates(cfg.tasas_cambio)
  const rate = r && r.base === cfg.moneda ? r.rates[moneda] : undefined
  return rate && rate > 0 ? rate : rateFor(cfg, cfg.moneda, moneda)
}

/** Flujo de caja por moneda y por método de pago, con comisiones por transacción. */
export function flujoCaja(
  pagos: Pago[],
  gastos: Gasto[],
  comisionesMetodo: Record<string, number>,
  rango: RangoFecha
): ResultadoFlujoCaja {
  const monedas = new Map<string, FlujoMoneda>()
  const metodos = new Map<string, FlujoMetodo>()

  const addEntrada = (moneda: string, metodo: string, montoMoneda: number) => {
    const m = monedas.get(moneda) ?? { moneda, entradas: 0, salidas: 0, balance: 0 }
    m.entradas = round2(m.entradas + montoMoneda)
    m.balance = round2(m.entradas - m.salidas)
    monedas.set(moneda, m)
    const key = `${metodo}|${moneda}`
    const fm = metodos.get(key) ?? { metodo_pago: metodo, moneda, entradas: 0, salidas: 0, comisiones: 0 }
    fm.entradas = round2(fm.entradas + montoMoneda)
    metodos.set(key, fm)
  }
  const addSalida = (moneda: string, metodo: string, montoMoneda: number) => {
    const m = monedas.get(moneda) ?? { moneda, entradas: 0, salidas: 0, balance: 0 }
    m.salidas = round2(m.salidas + montoMoneda)
    m.balance = round2(m.entradas - m.salidas)
    monedas.set(moneda, m)
    const key = `${metodo}|${moneda}`
    const fm = metodos.get(key) ?? { metodo_pago: metodo, moneda, entradas: 0, salidas: 0, comisiones: 0 }
    fm.salidas = round2(fm.salidas + montoMoneda)
    metodos.set(key, fm)
  }

  for (const p of pagos) {
    if (!enRango(p.fecha, rango)) continue
    if (p.tipo === 'cobro') addEntrada(p.moneda, p.metodo_pago, p.monto)
  }  for (const g of gastos) {
    if (!enRango(g.fecha, rango)) continue
    addSalida(g.moneda, g.metodo_pago, g.monto)
  }

  for (const fm of metodos.values()) {
    const pct = comisionesMetodo[fm.metodo_pago] ?? 0
    fm.comisiones = round2(((fm.entradas + fm.salidas) * pct) / 100)
  }

  let totEnt = 0
  let totSal = 0
  for (const m of monedas.values()) {
    totEnt += m.entradas
    totSal += m.salidas
  }
  return {
    porMoneda: [...monedas.values()].sort((a, b) => b.entradas + b.salidas - (a.entradas + a.salidas)),
    porMetodo: [...metodos.values()].sort((a, b) => b.entradas + b.salidas - (a.entradas + a.salidas)),
    totalEntradasBase: round2(totEnt),
    totalSalidasBase: round2(totSal)
  }
}
