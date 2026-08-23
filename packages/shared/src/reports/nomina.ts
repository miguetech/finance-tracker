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

/** Horas trabajadas entre dos marcas de tiempo "HH:MM" (vacío ⇒ 0). */
export function horasEntre(entrada: string, salida: string): number {
  if (!entrada || !salida) return 0
  const [he, me] = entrada.split(':').map(Number)
  const [hs, ms] = salida.split(':').map(Number)
  if ([he, me, hs, ms].some(n => Number.isNaN(n))) return 0
  const min = (hs * 60 + ms) - (he * 60 + me)
  return min > 0 ? round2(min / 60) : 0
}

export interface DesgloseEmpleado {
  empleado: Empleado
  diasTrabajados: number
  horasTrabajadas: number
  horasExtraMes: number
  montoHorasExtraMes: number
  sueldosDepositados: number
}

/**
 * Desglose consolidado ("expeditillo") de un empleado en un rango/mes:
 * días y horas desde asistencia, horas extra y pagos desde nómina/gastos.
 */
export function desgloseEmpleado(
  empleado: Empleado,
  datos: { asistencias: { fecha: string; hora_entrada: string; hora_salida: string }[] }
    & { detalles?: NominaDetalle[]; gastos?: Gasto[] },
  mes: string
): DesgloseEmpleado {
  let dias = 0
  let horas = 0
  for (const a of datos.asistencias.filter(a => a.fecha.slice(0, 7) === mes)) {
    dias++
    horas += horasEntre(a.hora_entrada, a.hora_salida)
  }
  const det = datos.detalles?.find(d => d.id_empleado === empleado.id_empleado && d.mes === mes) ?? null
  const pagados = (datos.gastos ?? [])
    .filter(g => g.categoria === 'Nómina' && String(g.proveedor) === empleado.nombre && g.fecha.slice(0, 7) === mes)
    .reduce((s, g) => s + Number(g.monto), 0)
  return {
    empleado,
    diasTrabajados: dias,
    horasTrabajadas: round2(horas),
    horasExtraMes: det ? Number(det.horas_extra) || 0 : 0,
    montoHorasExtraMes: det ? Number(det.monto_horas_extra) || 0 : 0,
    sueldosDepositados: round2(pagados || (det ? Number(det.total) || 0 : 0))
  }
}
