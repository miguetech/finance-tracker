import React, { createContext, useCallback, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { IconX } from './icons'
import { useI18n } from '../i18n'

const cx = (...a: (string | false | undefined)[]) => a.filter(Boolean).join(' ')

export type ButtonVariant = 'primary' | 'outline' | 'danger' | 'ghost' | 'success'
export type ButtonSize = 'sm' | 'md' | 'lg'

export function Button({ variant = 'primary', size = 'md', icon, iconAfter, iconOnly, className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode; iconAfter?: ReactNode; iconOnly?: boolean }) {
  const styles: Record<ButtonVariant, string> = {
    primary: 'bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-btn-primary hover:shadow-btn-primary hover:brightness-110',
    outline: 'border border-gray-200 bg-surface text-gray-700 shadow-sm hover:bg-muted',
    danger: 'bg-danger text-white hover:opacity-90',
    ghost: 'text-gray-600 hover:bg-muted',
    success: 'bg-success text-white hover:opacity-90'
  }
  const sizes: Record<ButtonSize, string> = {
    sm: iconOnly ? 'p-2' : 'px-3 py-1.5 text-xs',
    md: iconOnly ? 'p-2.5' : 'px-4 py-2 text-sm',
    lg: iconOnly ? 'p-3' : 'px-6 py-3 text-base'
  }
  return (
    <button
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2',
        'active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none',
        styles[variant], sizes[size], className
      )}
    >
      {icon && <span className="inline-flex">{icon}</span>}
      {!iconOnly && children}
      {iconAfter && <span className="inline-flex">{iconAfter}</span>}
    </button>
  )
}

export function Input({ error, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { error?: string }) {
  return (
    <div className={className}>
      <input {...props} className={cx('w-full h-10 px-3.5 border rounded-xl text-sm bg-surface transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-2', error ? 'border-danger focus:ring-danger/25' : 'border-gray-200 focus:border-primary focus:ring-primary/25')} />
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  )
}

export function Select({ value, onChange, options, placeholder, error, className }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string; error?: string; className?: string }) {
  return (
    <div className={className}>
      <select value={value} onChange={e => onChange(e.target.value)} className={cx('w-full h-10 px-3.5 border rounded-xl text-sm bg-surface transition-colors focus:outline-none focus:ring-2', error ? 'border-danger focus:ring-danger/25' : 'border-gray-200 focus:border-primary focus:ring-primary/25')}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  )
}

export function Card({ title, children, footer }: { title?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="bg-surface border border-gray-100 rounded-2xl shadow-card">
      {title && <div className="px-5 py-4 border-b border-gray-100 font-semibold">{title}</div>}
      <div className="p-5">{children}</div>
      {footer && <div className="px-5 py-4 border-t border-gray-100">{footer}</div>}
    </div>
  )
}

export function StatCard({ label, value, tone }: { label: string; value: string; tone?: 'default' | 'positive' | 'negative' }) {
  const color = tone === 'positive' ? 'text-success' : tone === 'negative' ? 'text-danger' : 'text-gray-900'
  return (
    <div className="bg-surface border border-gray-100 rounded-2xl p-5 shadow-card hover:shadow-card-hover transition-shadow duration-200">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cx('text-2xl font-bold mt-1', color)}>{value}</div>
    </div>
  )
}

export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: 'gray' | 'green' | 'yellow' | 'red' | 'blue' | 'success' }) {
  const styles = {
    gray: 'bg-muted text-gray-600',
    green: 'bg-success-soft text-emerald-700',
    yellow: 'bg-amber-50 text-amber-700',
    red: 'bg-danger-soft text-red-700',
    blue: 'bg-primary-soft text-primary',
    success: 'bg-success-soft text-emerald-700'
  }
  return <span className={cx('inline-block px-2 py-0.5 rounded text-xs font-medium', styles[tone])}>{children}</span>
}

export function Table<T extends Record<string, unknown>>({ columns, rows }: { columns: { key: string; header: string; render?: (row: T) => ReactNode }[]; rows: T[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-card">
      <table className="min-w-full text-sm">
        <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
          <tr>{columns.map(c => <th key={c.key} className="px-4 py-3 whitespace-nowrap">{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-gray-100 hover:bg-muted/50">
              {columns.map(c => <td key={c.key} className="px-4 py-3 whitespace-nowrap">{c.render ? c.render(r) : String(r[c.key] ?? '')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Dialog({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-surface w-full sm:max-w-lg max-h-[90vh] overflow-auto rounded-t-2xl sm:rounded-2xl shadow-dialog" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="font-semibold">{title}</div>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-muted transition-colors"><IconX /></button>
        </div>
        <div className="p-4">{children}</div>
        {footer && <div className="px-4 py-3 border-t border-gray-200 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}

export function ConfirmDialog({ open, title, message, onConfirm, onClose }: { open: boolean; title: string; message: string; onConfirm: () => void; onClose: () => void }) {
  const { t } = useI18n()
  return (
    <Dialog open={open} onClose={onClose} title={title}
      footer={<><Button variant="outline" onClick={onClose}>{t('common.cancelar')}</Button><Button variant="danger" onClick={onConfirm}>{t('common.eliminar')}</Button></>}>
      <p>{message}</p>
    </Dialog>
  )
}

export function Tooltip({ text, children, side = 'top' }: { text: string; children: ReactNode; side?: 'top' | 'bottom' }) {
  return (
    <span className="relative inline-flex group">
      {children}
      <span className={cx(
        'pointer-events-none absolute z-50 w-max max-w-56 rounded-lg bg-gray-900 text-white text-xs px-2.5 py-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150',
        side === 'top' ? 'bottom-full left-1/2 -translate-x-1/2 mb-1.5' : 'top-full left-1/2 -translate-x-1/2 mt-1.5'
      )}>{text}</span>
    </span>
  )
}

export function Tabs({ tabs }: { tabs: { id: string; label: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.id)
  return (
    <div>
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActive(t.id)}
            className={cx('px-3 py-2 text-sm border-b-2', active === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground')}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="pt-4">{tabs.find(t => t.id === active)?.content}</div>
    </div>
  )
}

type ToastType = 'success' | 'error'
const ToastCtx = createContext<(msg: string, type?: ToastType) => void>(() => {})
export const useToast = () => useContext(ToastCtx)
export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; msg: string; type: ToastType }[]>([])
  const toast = useCallback((msg: string, type: ToastType = 'success') => {
    const id = Date.now()
    setToasts(t => [...t, { id, msg, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000)
  }, [])
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        {toasts.map(t => (
          <div key={t.id} className={cx('px-4 py-2 rounded-md text-sm text-white shadow-lg', t.type === 'success' ? 'bg-green-600' : 'bg-red-600')}>{t.msg}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
export { cx }
