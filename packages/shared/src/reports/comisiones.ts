
export interface ComisionesTransaccion {
  /** % de comisión por método de pago */
  metodos: Record<string, number>
  gastos: number
  cxp: number
  nomina: number
}

/** Comisión avanzada por método de pago: % y/o monto fijo mínimo por transacción. */
export interface ComisionMetodo {
  /** Porcentaje cobrado sobre el monto de la transacción */
  pct?: number
  /** Monto fijo mínimo cobrado por transacción (en moneda base) */
  minimo_fijo?: number
}

export const COMISIONES_DEFAULT: ComisionesTransaccion = { metodos: {}, gastos: 0, cxp: 0, nomina: 0 }

export function parseComisiones(raw: string | undefined): ComisionesTransaccion {
  if (!raw) return { ...COMISIONES_DEFAULT }
  try {
    const obj = JSON.parse(raw) as Partial<ComisionesTransaccion>
    return {
      metodos: obj.metodos && typeof obj.metodos === 'object' ? obj.metodos : {},
      gastos: Number(obj.gastos) || 0,
      cxp: Number(obj.cxp) || 0,
      nomina: Number(obj.nomina) || 0
    }
  } catch {
    return { ...COMISIONES_DEFAULT }
  }
}

/** Lee la configuración avanzada de comisiones guardada por método de pago. */
export function parseComisionesMetodos(raw: string | undefined): Record<string, ComisionMetodo> {
  if (!raw) return {}
  try {
    const obj = JSON.parse(raw) as Record<string, ComisionMetodo>
    if (!obj || typeof obj !== 'object') return {}
    const out: Record<string, ComisionMetodo> = {}
    for (const [k, v] of Object.entries(obj)) {
      if (!v || typeof v !== 'object') continue
      const pct = Number(v.pct) || 0
      const minimo = Number(v.minimo_fijo) || 0
      if (pct > 0 || minimo > 0) out[k] = { ...(pct > 0 ? { pct } : {}), ...(minimo > 0 ? { minimo_fijo: minimo } : {}) }
    }
    return out
  } catch {
    return {}
  }
}

/** Comisión aplicable a una transacción según su método: max(% × monto, fijo mínimo). */
export function comisionTransaccion(monto: number, cm?: ComisionMetodo): number {
  if (!cm) return 0
  const porPct = (Number(monto) || 0) * ((Number(cm.pct) || 0) / 100)
  const minimo = Number(cm.minimo_fijo) || 0
  return Math.round(Math.max(porPct, minimo) * 100) / 100
}

/** Comisión aplicable a una transacción del módulo dado (método de pago opcional suma su %). */
export function montoComision(monto: number, comisiones: ComisionesTransaccion, tipo: 'gastos' | 'cxp' | 'nomina', metodo?: string): number {
  const pctBase = comisiones[tipo] ?? 0
  const pctMetodo = metodo ? comisiones.metodos[metodo] ?? 0 : 0
  const pct = pctBase + pctMetodo
  return Math.round(((monto * pct) / 100) * 100) / 100
}
