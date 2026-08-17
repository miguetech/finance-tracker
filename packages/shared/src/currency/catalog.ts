export interface Currency {
  code: string
  symbol: string
  decimals: number
  locale: string
  name: string
}

export const CURRENCIES: Currency[] = [
  { code: 'USD', symbol: '$', decimals: 2, locale: 'en-US', name: 'Dólar estadounidense' },
  { code: 'VES', symbol: 'Bs', decimals: 2, locale: 'es-VE', name: 'Bolívar venezolano' },
  { code: 'MXN', symbol: '$', decimals: 2, locale: 'es-MX', name: 'Peso mexicano' },
  { code: 'EUR', symbol: '€', decimals: 2, locale: 'es-ES', name: 'Euro' },
  { code: 'GBP', symbol: '£', decimals: 2, locale: 'en-GB', name: 'Libra esterlina' },
  { code: 'ARS', symbol: '$', decimals: 2, locale: 'es-AR', name: 'Peso argentino' },
  { code: 'CLP', symbol: '$', decimals: 0, locale: 'es-CL', name: 'Peso chileno' },
  { code: 'COP', symbol: '$', decimals: 0, locale: 'es-CO', name: 'Peso colombiano' },
  { code: 'PEN', symbol: 'S/', decimals: 2, locale: 'es-PE', name: 'Sol peruano' },
  { code: 'BRL', symbol: 'R$', decimals: 2, locale: 'pt-BR', name: 'Real brasileño' },
  { code: 'CRC', symbol: '₡', decimals: 2, locale: 'es-CR', name: 'Colón costarricense' },
  { code: 'DOP', symbol: 'RD$', decimals: 2, locale: 'es-DO', name: 'Peso dominicano' },
  { code: 'GTQ', symbol: 'Q', decimals: 2, locale: 'es-GT', name: 'Quetzal guatemalteco' },
  { code: 'HNL', symbol: 'L', decimals: 2, locale: 'es-HN', name: 'Lempira hondureño' },
  { code: 'NIO', symbol: 'C$', decimals: 2, locale: 'es-NI', name: 'Córdoba nicaragüense' },
  { code: 'PAB', symbol: 'B/.', decimals: 2, locale: 'es-PA', name: 'Balboa panameño' },
  { code: 'UYU', symbol: '$U', decimals: 2, locale: 'es-UY', name: 'Peso uruguayo' },
  { code: 'PYG', symbol: '₲', decimals: 0, locale: 'es-PY', name: 'Guaraní paraguayo' },
  { code: 'BOB', symbol: 'Bs', decimals: 2, locale: 'es-BO', name: 'Boliviano' },
  { code: 'CAD', symbol: 'C$', decimals: 2, locale: 'en-CA', name: 'Dólar canadiense' },
  { code: 'AUD', symbol: 'A$', decimals: 2, locale: 'en-AU', name: 'Dólar australiano' },
  { code: 'CHF', symbol: 'CHF', decimals: 2, locale: 'de-CH', name: 'Franco suizo' },
  { code: 'JPY', symbol: '¥', decimals: 0, locale: 'ja-JP', name: 'Yen japonés' },
  { code: 'CNY', symbol: 'CN¥', decimals: 2, locale: 'zh-CN', name: 'Yuan chino' },
  { code: 'INR', symbol: '₹', decimals: 2, locale: 'en-IN', name: 'Rupia india' },
  { code: 'KRW', symbol: '₩', decimals: 0, locale: 'ko-KR', name: 'Won surcoreano' },
  { code: 'SEK', symbol: 'kr', decimals: 2, locale: 'sv-SE', name: 'Corona sueca' },
  { code: 'NOK', symbol: 'kr', decimals: 2, locale: 'nb-NO', name: 'Corona noruega' },
  { code: 'DKK', symbol: 'kr', decimals: 2, locale: 'da-DK', name: 'Corona danesa' },
  { code: 'PLN', symbol: 'zł', decimals: 2, locale: 'pl-PL', name: 'Złoty polaco' },
  { code: 'TRY', symbol: '₺', decimals: 2, locale: 'tr-TR', name: 'Lira turca' },
  { code: 'ZAR', symbol: 'R', decimals: 2, locale: 'en-ZA', name: 'Rand sudafricano' },
  { code: 'EGP', symbol: 'E£', decimals: 2, locale: 'ar-EG', name: 'Libra egipcia' },
  { code: 'NGN', symbol: '₦', decimals: 2, locale: 'en-NG', name: 'Naira nigeriana' }
]

export const DEFAULT_CURRENCY = 'USD'

const CUSTOM = new Map<string, Currency>()

export function registerCurrency(c: Currency): void {
  CUSTOM.set(c.code, c)
}

export function getCurrency(code: string): Currency {
  return CUSTOM.get(code) ?? CURRENCIES.find(c => c.code === code) ?? CURRENCIES[0]
}
