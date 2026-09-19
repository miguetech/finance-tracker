import type { Empleado, Gasto } from '../types/entities'
import { round2 } from '../calc/invoice'

export type EsquemaPago = 'semanal' | 'quincenal' | 'mensual'
export type PagoDividido = { payment_method: string; moneda: string; monto: number }

export interface NominaDetalle {
  id_detalle: string
  employee_id: string
  mes: string
  base_salary: number
  horas_extra: number
  overtime_rate: number
  overtime_amount: number
  bonos: number
  comisiones: number
  total: number
  moneda: string
  payment_method: string
  split_payments: string
  fecha: string
  expense_id: string
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
  base_salary: number
  horas_extra?: number
  overtime_rate?: number
  bonos?: number
  comisiones?: number
}): number {
  const he = (input.horas_extra ?? 0) * (input.overtime_rate ?? 0)
  return round2(input.base_salary + he + (input.bonos ?? 0) + (input.comisiones ?? 0))
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
    const det = detalles.find(d => d.employee_id === emp.employee_id && d.mes === mes) ?? null
    const gasto = det ? gastos.find(g => g.expense_id === det.expense_id) ?? null : null
    if (det) {
      totHe += Number(det.overtime_amount) || 0
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
  datos: { asistencias: { fecha: string; clock_in: string; clock_out: string }[] }
    & { detalles?: NominaDetalle[]; gastos?: Gasto[] },
  mes: string
): DesgloseEmpleado {
  let dias = 0
  let horas = 0
  for (const a of datos.asistencias.filter(a => a.fecha.slice(0, 7) === mes)) {
    dias++
    horas += horasEntre(a.clock_in, a.clock_out)
  }
  const det = datos.detalles?.find(d => d.employee_id === empleado.employee_id && d.mes === mes) ?? null
  const pagados = (datos.gastos ?? [])
    .filter(g => g.categoria === 'Nómina' && String(g.proveedor) === empleado.nombre && g.fecha.slice(0, 7) === mes)
    .reduce((s, g) => s + Number(g.monto), 0)
  return {
    empleado,
    diasTrabajados: dias,
    horasTrabajadas: round2(horas),
    horasExtraMes: det ? Number(det.horas_extra) || 0 : 0,
    montoHorasExtraMes: det ? Number(det.overtime_amount) || 0 : 0,
    sueldosDepositados: round2(pagados || (det ? Number(det.total) || 0 : 0))
  }
}
