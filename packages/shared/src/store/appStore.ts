import { create } from 'zustand'
import type { Config } from '../types/entities'

interface AppState {
  spreadsheetId: string | null
  url: string | null
  config: Config | null
  setSheet: (id: string, url: string) => void
  clearSheet: () => void
  setConfig: (c: Config) => void
}

export const useAppStore = create<AppState>(set => ({
  spreadsheetId: null,
  url: null,
  config: null,
  setSheet: (spreadsheetId, url) => set({ spreadsheetId, url }),
  clearSheet: () => set({ spreadsheetId: null, url: null, config: null }),
  setConfig: config => set({ config })
}))
