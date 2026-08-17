export const SUPPORTED_LOCALES = ['es', 'en', 'pt', 'gl', 'ca'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const LOCALE_LABELS: Record<Locale, string> = {
  es: 'Español',
  en: 'English',
  pt: 'Português',
  gl: 'Galego',
  ca: 'Català'
}

export const DEFAULT_LOCALE: Locale = 'es'

export function detectLocale(stored: string | null): Locale {
  const lower = (stored ?? '').trim().toLowerCase()
  if (SUPPORTED_LOCALES.includes(lower as Locale)) return lower as Locale
  try {
    const nav = (navigator.language || 'es').toLowerCase().split('-')[0]
    if (SUPPORTED_LOCALES.includes(nav as Locale)) return nav as Locale
  } catch { /* sin navigator */ }
  return DEFAULT_LOCALE
}
