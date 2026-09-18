import { useI18n } from '../i18n'
import type { MessageKey } from '../i18n/locales/types'

export function estadoDe(f: { saldo: number; total: number }): { key: MessageKey; tone: 'green' | 'yellow' | 'blue' } {
  if (f.saldo <= 0) return { key: 'states.pagada', tone: 'green' }
  if (f.saldo < f.total) return { key: 'states.parcial', tone: 'yellow' }
  return { key: 'states.pendiente', tone: 'blue' }
}

export function estadoCxc(f: { saldo: number; total: number; due_date?: string }, hoy: string): { key: MessageKey; tone: 'green' | 'yellow' | 'blue' | 'red' } {
  if (f.saldo <= 0) return { key: 'states.pagada', tone: 'green' }
  if (f.due_date && f.due_date < hoy) return { key: 'states.vencida', tone: 'red' }
  if (f.saldo < f.total) return { key: 'states.parcial', tone: 'yellow' }
  return { key: 'states.pendiente', tone: 'blue' }
}

export function estadoCxp(f: { saldo: number; total_amount?: number; estado?: string; due_date?: string }, hoy: string): { key: MessageKey; tone: 'green' | 'yellow' | 'blue' | 'red' } {
  if (f.estado === 'pagada' || f.saldo <= 0) return { key: 'states.pagada', tone: 'green' }
  if (f.due_date && f.due_date < hoy) return { key: 'states.vencida', tone: 'red' }
  if (f.saldo < Number(f.total_amount || 0)) return { key: 'states.parcial', tone: 'yellow' }
  return { key: 'states.pendiente', tone: 'blue' }
}

export function useEstados() {
  const { t } = useI18n()
  return {
    estadoDe: (f: { saldo: number; total: number }) => {
      const e = estadoDe(f)
      return { label: t(e.key), tone: e.tone }
    },
    estadoCxc: (f: { saldo: number; total: number; due_date?: string }) => {
      const hoy = new Date().toLocaleDateString('en-CA')
      const e = estadoCxc(f, hoy)
      return { label: t(e.key), tone: e.tone }
    },
    estadoCxp: (f: { saldo: number; total_amount?: number; estado?: string; due_date?: string }) => {
      const hoy = new Date().toLocaleDateString('en-CA')
      const e = estadoCxp(f, hoy)
      return { label: t(e.key), tone: e.tone }
    }
  }
}
