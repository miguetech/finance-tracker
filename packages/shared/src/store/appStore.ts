import { create } from 'zustand'
import type { Config } from '../types/entities'

interface AppState {
  config: Config | null
  setConfig: (c: Config) => void
}

/** La config se persiste en localStorage: el modo offline la necesita para
 *  monedas/comisiones cuando Sheets no responde (y sobrevive recargas). */
const KEY_CONFIG_CACHE = 'ft_config_cache'

function hidratar(): Config | null {
  try {
    const raw = window.localStorage.getItem(KEY_CONFIG_CACHE)
    return raw ? (JSON.parse(raw) as Config) : null
  } catch { return null }
}

export const useAppStore = create<AppState>(set => ({
  config: hidratar(),
  setConfig: config => {
    set({ config })
    try { window.localStorage.setItem(KEY_CONFIG_CACHE, JSON.stringify(config)) } catch { /* sin espacio */ }
  }
}))
