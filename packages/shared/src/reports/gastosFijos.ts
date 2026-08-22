import type { GastoFijo } from '../types/entities'
import { round2 } from '../calc/invoice'
import { todayLocal } from '../lib/date'

export interface VencimientoGastoFijo {
  gasto_fijo: GastoFijo
  fecha_vencimiento: string
  dias_restantes: number
  estado: 'pagado' | 'por_vencer' | 'vencido'
}

function diasEnMes(anioMes: string): number {
  const [y, m] = anioMes.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

/** Fecha de vencimiento de un gasto fijo dentro del mes dado (YYYY-MM). */
export function fechaVencimientoEnMes(gf: GastoFijo, mes: string): string {
  const dia = Math.min(Math.max(1, Number(gf.dia_vencimiento) || 1), diasEnMes(mes))
  return `${mes}-${String(dia).padStart(2, '0')}`
}

/** Calendario de vencimientos de servicios recurrentes con estado de pago. */
export function proyeccionGastosFijos(
  gastosFijos: GastoFijo[],
  gastosPagados: { categoria: string; descripcion: string; fecha: string; monto: number }[],
  meses: string[]
): VencimientoGastoFijo[] {
  const hoy = todayLocal()
  const out: VencimientoGastoFijo[] = []
  for (const gf of gastosFijos) {
    if (gf.activo === 'false') continue
    for (const mes of meses) {
      const fv = fechaVencimientoEnMes(gf, mes)
      const pagado = gastosPagados.some(g => {
        const mismoMes = g.fecha.slice(0, 7) === mes
        const coincide = gf.descripcion && g.descripcion.toLowerCase().includes(gf.descripcion.toLowerCase())
        return mismoMes && coincide && Number(g.monto) >= Number(gf.monto)
      })
      out.push({
        gasto_fijo: gf,
        fecha_vencimiento: fv,
        dias_restantes: Math.round((new Date(`${fv}T00:00:00`).getTime() - new Date(`${hoy}T00:00:00`).getTime()) / 86400000),
        estado: pagado ? 'pagado' : fv < hoy ? 'vencido' : 'por_vencer'
      })
    }
  }
  return out.sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento))
}

/** Total mensual comprometido en gastos fijos activos. */
export function totalGastosFijosMensual(gastosFijos: GastoFijo[]): number {
  return round2(gastosFijos.filter(g => g.activo !== 'false').reduce((s, g) => s + (Number(g.monto) || 0), 0))
}
