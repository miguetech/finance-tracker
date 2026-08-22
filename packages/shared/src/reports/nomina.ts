import type { Empleado, Gasto } from '../types/entities'
import { round2 } from '../calc/invoice'

export type EsquemaPago = 'semanal' | 'quincenal' | 'mensual'
export type PagoDividido = { metodo_pago: string; moneda: string; monto: number }

export interface NominaDetalle {
  id_detalle: string
  id_empleado: string
  mes: string
  sueldo_base: number
  horas_extra: number
  tarifa_hora_extra: number
  monto_horas_extra: number
  bonos: number
  comisiones: number
  total: number
  moneda: string
  metodo_pago: string
  pagos_divididos: string
  fecha: string
  id_gasto: string
}

export interface LiquidacionEmpleado {
  empleado: Empleado
  detalle: NominaDetalle | null
  gasto: Gasto | null
}

/** Tarifa de hora extra estándar a partir del sueldo base y la jornada. */
export function tarifaHoraExtra(salarioBase: number, horasJornadaSemanal = 40): number {
  if (salarioBase <= 0 || horasJornadaSemanal <= 0) return 0
  return round2((salarioBase / (horasJornadaSemanal * 4)) * 1.5)
}

export function totalNomina(input: {
  sueldo_base: number
  horas_extra?: number
  tarifa_hora_extra?: number
  bonos?: number
  comisiones?: number
}): number {
  const he = (input.horas_extra ?? 0) * (input.tarifa_hora_extra ?? 0)
  return round2(input.sueldo_base + he + (input.bonos ?? 0) + (input.comisiones ?? 0))
}

/** Consolidado de nómina por mes con desglose individual de liquidación. */
export function consolidadoNomina(empleados: Empleado[], detalles: NominaDetalle[], gastos: Gasto[], mes: string): {
  lineas: LiquidacionEmpleado[]
  totalHorasExtra: number
  totalBonos: number
  totalComisiones: number
  totalNominaMes: number
} {
  const lineas: LiquidacionEmpleado[] = []
  let totHe = 0
  let totBonos = 0
  let totCom = 0
  let tot = 0
  for (const emp of empleados) {
    const det = detalles.find(d => d.id_empleado === emp.id_empleado && d.mes === mes) ?? null
    const gasto = det ? gastos.find(g => g.id_gasto === det.id_gasto) ?? null : null
    if (det) {
      totHe += Number(det.monto_horas_extra) || 0
      totBonos += Number(det.bonos) || 0
      totCom += Number(det.comisiones) || 0
      tot += Number(det.total) || 0
    }
    lineas.push({ empleado: emp, detalle: det, gasto })
  }
  return {
    lineas,
    totalHorasExtra: round2(totHe),
    totalBonos: round2(totBonos),
    totalComisiones: round2(totCom),
    totalNominaMes: round2(tot)
  }
}
