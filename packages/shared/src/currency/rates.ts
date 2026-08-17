import type { Config } from '../types/entities'
import { roundTo } from '../calc/invoice'
import { CURRENCIES, getCurrency, type Currency } from './catalog'
import { todayLocal } from '../lib/date'

export interface Rates {
  base: string
  fecha: string
  rates: Record<string, number>
}

export function parseRates(raw: string): Rates | null {
  if (!raw) return null
  try {
    const p = JSON.parse(raw)
    if (!p || typeof p !== 'object' || !p.base || !p.rates) return null
    return { base: String(p.base), fecha: String(p.fecha ?? ''), rates: p.rates as Record<string, number> }
  } catch {
    return null
  }
}

export function ratesToRow(r: Rates): string {
  return JSON.stringify(r)
}

/**
 * Tasa: cuántas unidades de `to` equivalen a 1 unidad de `from`.
 * Las tasas guardadas son "1 base = X moneda".
 */
export function rateFor(cfg: Config, from: string, to: string): number {
  if (!from || !to || from === to) return 1
  const r = parseRates(cfg.tasas_cambio)
  if (!r) return 1
  const base = r.base || cfg.moneda
  const fromToBase = from === base ? 1 : r.rates[from] ? 1 / r.rates[from] : 1
  const baseToTo = to === base ? 1 : r.rates[to] ? r.rates[to] : 1
  return fromToBase * baseToTo
}

/** Convierte un monto de `from` a `to` redondeado a los decimales de `to`. */
export function convert(amount: number, from: string, to: string, cfg: Config): number {
  if (!from || !to || from === to) return amount
  return roundTo(amount * rateFor(cfg, from, to), getCurrency(to).decimals)
}

/**
 * Convierte un monto guardado en una moneda a la moneda base de reportes.
 * `tipoCambio` = unidades de la moneda del registro por 1 de base (se guarda al crear el registro).
 */
export function toBase(monto: number, tipoCambio: number): number {
  const t = Number(tipoCambio) || 1
  return t > 0 ? monto / t : monto
}

/** Obtiene tasas actualizadas de la API pública ExchangeRate-API (gratuita, sin API key). */
export async function fetchExchangeRates(base: string): Promise<{ rates: Record<string, number>; fecha: string }> {
  const res = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`)
  if (!res.ok) throw new Error('No se pudo consultar el tipo de cambio')
  const data = await res.json()
  if (data.result !== 'success') throw new Error(data['error-type'] ?? 'Error obteniendo tipo de cambio')
  return { rates: data.rates as Record<string, number>, fecha: todayLocal() }
}

/** Indica si las tasas están frescas (menos de 3 días). */
export function tasasFrescas(r: Rates | null): boolean {
  if (!r || !r.fecha) return false
  const days = (Date.now() - new Date(r.fecha).getTime()) / 86400000
  return days < 3
}

export function parseCustomCurrencies(raw?: string): Currency[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr
      .filter(x => x && x.code)
      .map(x => ({
        code: String(x.code).toUpperCase(),
        symbol: String(x.symbol ?? ''),
        decimals: Number(x.decimals) || 0,
        locale: String(x.locale ?? 'es-VE'),
        name: String(x.name ?? x.code)
      }))
  } catch {
    return []
  }
}

/** Monedas activas para el usuario (catálogo + personalizadas, filtradas por config). */
export function activeCurrencies(config?: Pick<Config, 'monedas_activas' | 'monedas_custom'> | null): Currency[] {
  const all = [...CURRENCIES, ...parseCustomCurrencies(config?.monedas_custom)]
  const active = (config?.monedas_activas ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (active.length === 0) return all
  return all.filter(c => active.includes(c.code))
}

export { CURRENCIES }
