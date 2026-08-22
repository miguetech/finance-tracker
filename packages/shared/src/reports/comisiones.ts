
export interface ComisionesTransaccion {
  /** % de comisión por método de pago */
  metodos: Record<string, number>
  gastos: number
  cxp: number
  nomina: number
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

/** Comisión aplicable a una transacción del módulo dado (método de pago opcional suma su %). */
export function montoComision(monto: number, comisiones: ComisionesTransaccion, tipo: 'gastos' | 'cxp' | 'nomina', metodo?: string): number {
  const pctBase = comisiones[tipo] ?? 0
  const pctMetodo = metodo ? comisiones.metodos[metodo] ?? 0 : 0
  const pct = pctBase + pctMetodo
  return Math.round(((monto * pct) / 100) * 100) / 100
}
