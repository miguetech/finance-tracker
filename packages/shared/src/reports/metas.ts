import type { Factura } from '../types/entities'
import { round2, roundTo } from '../calc/invoice'
import { toBase } from '../currency/rates'

export interface MetasMensuales {
  [mes: string]: number
}

export function parseMetas(raw: string | undefined): MetasMensuales {
  if (!raw) return {}
  try {
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {}
    const out: MetasMensuales = {}
    for (const [k, v] of Object.entries(obj)) {
      const n = Number(v)
      if (/^\d{4}-\d{2}$/.test(k) && Number.isFinite(n)) out[k] = n
    }
    return out
  } catch {
    return {}
  }
}

export function metasToRow(metas: MetasMensuales): string {
  return JSON.stringify(metas)
}

export interface MetaVsLogro {
  mes: string
  meta: number
  logro: number
  avance_pct: number
  diferencia: number
}

/** Comparativa objetivo de ventas vs facturación real por mes. */
export function metasVsLogros(facturas: Factura[], metas: MetasMensuales, meses: string[]): MetaVsLogro[] {
  const logrado = new Map<string, number>()
  for (const f of facturas) {
    const mes = f.issue_date.slice(0, 7)
    logrado.set(mes, round2((logrado.get(mes) ?? 0) + toBase(f.total, Number(f.exchange_rate) || 1)))
  }
  return meses.map(mes => {
    const meta = metas[mes] ?? 0
    const logro = round2(logrado.get(mes) ?? 0)
    return {
      mes,
      meta,
      logro,
      avance_pct: meta > 0 ? roundTo((logro / meta) * 100, 1) : 0,
      diferencia: round2(logro - meta)
    }
  })
}

export interface PerdidasGanancias {
  ingresos: number
  perdidas: number
  balance: number
  rentable: boolean
  margen_seguridad_pct: number
}

/** Balance general pérdidas vs ganancias: ¿los ingresos cubren el mínimo para ser rentable? */
export function perdidasVsGanancias(ingresos: number, costosTotales: number, costoMinimoOperacion: number): PerdidasGanancias {
  const balance = round2(ingresos - Math.max(costosTotales, costoMinimoOperacion))
  return {
    ingresos: round2(ingresos),
    perdidas: round2(Math.max(costosTotales, costoMinimoOperacion)),
    balance,
    rentable: balance >= 0,
    margen_seguridad_pct: ingresos > 0 ? roundTo(((ingresos - costoMinimoOperacion) / ingresos) * 100, 1) : 0
  }
}
