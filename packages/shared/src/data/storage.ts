export interface StorageAdapter {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
}

export const KEYS = {
  spreadsheetId: 'ft_spreadsheet_id',
  config: 'ft_config_cache'
} as const

export const chromeStorageAdapter: StorageAdapter = {
  async get(key) {
    const ext = chrome as unknown as { storage?: { local?: { get: (k: string, cb: (v: Record<string, string>) => void) => void } } }
    if (!ext.storage?.local) throw new Error('chrome.storage.local no disponible')
    return new Promise((resolve) => {
      ext.storage!.local!.get(key, (obj) => resolve(obj[key] ?? null))
    })
  },
  async set(key, value) {
    const ext = chrome as unknown as { storage?: { local?: { set: (v: Record<string, string>, cb?: () => void) => void } } }
    if (!ext.storage?.local) throw new Error('chrome.storage.local no disponible')
    await new Promise<void>((resolve) => ext.storage!.local!.set({ [key]: value }, () => resolve()))
  },
  async remove(key) {
    const ext = chrome as unknown as { storage?: { local?: { remove: (k: string, cb?: () => void) => void } } }
    if (!ext.storage?.local) throw new Error('chrome.storage.local no disponible')
    await new Promise<void>((resolve) => ext.storage!.local!.remove(key, () => resolve()))
  }
}

export const localStorageAdapter: StorageAdapter = {
  async get(key) {
    return window.localStorage.getItem(key)
  },
  async set(key, value) {
    window.localStorage.setItem(key, value)
  },
  async remove(key) {
    window.localStorage.removeItem(key)
  }
}
