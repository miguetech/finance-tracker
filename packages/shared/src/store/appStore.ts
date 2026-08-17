import { create } from 'zustand'
import type { Config } from '../types/entities'

interface AppState {
  config: Config | null
  setConfig: (c: Config) => void
}

export const useAppStore = create<AppState>(set => ({
  config: null,
  setConfig: config => set({ config })
}))
