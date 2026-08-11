import type { Currency } from './catalog'
import { CURRENCIES, DEFAULT_CURRENCY, getCurrency } from './catalog'

export function formatMoney(amount: number, code: string): string {
  const cur = getCurrency(code)
  return new Intl.NumberFormat(cur.locale, {
    style: 'currency',
    currency: cur.code,
    currencyDisplay: 'symbol'
  }).format(amount)
}

export { CURRENCIES, DEFAULT_CURRENCY, getCurrency }
export type { Currency }
