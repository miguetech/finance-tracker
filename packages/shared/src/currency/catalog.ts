export interface Currency {
  code: string
  symbol: string
  decimals: number
  locale: string
  name: string
}

export const CURRENCIES: Currency[] = [
  { code: 'USD', symbol: '$', decimals: 2, locale: 'en-US', name: 'Dólar estadounidense' },
  { code: 'MXN', symbol: '$', decimals: 2, locale: 'es-MX', name: 'Peso mexicano' },
  { code: 'EUR', symbol: '€', decimals: 2, locale: 'es-ES', name: 'Euro' },
  { code: 'GBP', symbol: '£', decimals: 2, locale: 'en-GB', name: 'Libra esterlina' },
  { code: 'ARS', symbol: '$', decimals: 2, locale: 'es-AR', name: 'Peso argentino' },
  { code: 'CLP', symbol: '$', decimals: 0, locale: 'es-CL', name: 'Peso chileno' },
  { code: 'COP', symbol: '$', decimals: 0, locale: 'es-CO', name: 'Peso colombiano' },
  { code: 'PEN', symbol: 'S/', decimals: 2, locale: 'es-PE', name: 'Sol peruano' },
  { code: 'BRL', symbol: 'R$', decimals: 2, locale: 'pt-BR', name: 'Real brasileño' }
]

export const DEFAULT_CURRENCY = 'USD'

export function getCurrency(code: string): Currency {
  return CURRENCIES.find(c => c.code === code) ?? CURRENCIES[0]
}
