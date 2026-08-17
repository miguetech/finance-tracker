import React, { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { messages } from './messages'
import type { Dict, MessageKey } from './locales/types'
import en from './locales/en'
import pt from './locales/pt'
import gl from './locales/gl'
import ca from './locales/ca'
import { DEFAULT_LOCALE, detectLocale, LOCALE_LABELS, SUPPORTED_LOCALES, type Locale } from './constants'

const LOCALE_KEY = 'ft_locale'

const DICTS: Record<Locale, Partial<Dict>> = {
  es: messages,
  en,
  pt,
  gl,
  ca
}

export function translate(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  let value: unknown = DICTS[locale]
  for (const part of key.split('.')) {
    if (value && typeof value === 'object' && part in value) value = (value as Record<string, unknown>)[part]
    else { value = undefined; break }
  }
  if (typeof value !== 'string' || value === '') {
    value = messages
    for (const part of key.split('.')) {
      if (value && typeof value === 'object' && part in value) value = (value as Record<string, unknown>)[part]
      else { value = key; break }
    }
  }
  let out = typeof value === 'string' ? value : key
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`, String(v))
  return out
}

interface I18nCtx {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
}

const Ctx = createContext<I18nCtx | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => detectLocale(window.localStorage.getItem(LOCALE_KEY)))
  const setLocale = (l: Locale) => {
    try { window.localStorage.setItem(LOCALE_KEY, l) } catch { /* storage no disponible */ }
    document.documentElement.lang = l
    setLocaleState(l)
  }
  const t = useMemo(() => (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars), [locale])
  React.useEffect(() => { document.documentElement.lang = locale }, [locale])
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, t])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useI18n(): I18nCtx {
  const ctx = useContext(Ctx)
  if (!ctx) return { locale: DEFAULT_LOCALE, setLocale: () => {}, t: (key, vars) => translate(DEFAULT_LOCALE, key, vars) }
  return ctx
}

export { SUPPORTED_LOCALES, LOCALE_LABELS, DEFAULT_LOCALE }
