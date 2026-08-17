import type { Currency } from './catalog'
import type { Config } from '../types/entities'
import { CURRENCIES, DEFAULT_CURRENCY, getCurrency, registerCurrency } from './catalog'
import { parseRates, ratesToRow, rateFor, convert, toBase, fetchExchangeRates, tasasFrescas, parseCustomCurrencies, activeCurrencies } from './rates'

export function formatMoney(amount: number, code: string): string {
  const cur = getCurrency(code)
  try {
    return new Intl.NumberFormat(cur.locale, {
      style: 'currency',
      currency: cur.code,
      currencyDisplay: 'symbol'
    }).format(amount)
  } catch {
    const sym = cur.symbol || cur.code
    const n = new Intl.NumberFormat(cur.locale, { minimumFractionDigits: cur.decimals, maximumFractionDigits: cur.decimals }).format(amount)
    return `${sym} ${n}`.trim()
  }
}

/** Muestra el monto en su moneda y, si difiere de la base, el equivalente en base. */
export function formatMoneyConverted(monto: number, moneda: string, base: string, cfg?: Config | null): string {
  if (!cfg) return formatMoney(monto, moneda || base)
  if (!moneda || moneda === base) return formatMoney(monto, moneda || base)
  const rate = rateFor(cfg, base, moneda)
  const baseEq = rate > 0 && rate !== 1 ? convert(monto, moneda, base, cfg) : null
  const montoStr = formatMoney(monto, moneda)
  return baseEq !== null && baseEq !== monto ? `${montoStr} ≈ ${formatMoney(baseEq, base)}` : montoStr
}

export { CURRENCIES, DEFAULT_CURRENCY, getCurrency, registerCurrency }
export { parseRates, ratesToRow, rateFor, convert, toBase, fetchExchangeRates, tasasFrescas, parseCustomCurrencies, activeCurrencies }
export type { Rates } from './rates'
export type { Currency }
