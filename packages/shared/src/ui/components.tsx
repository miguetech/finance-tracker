import React, { createContext, useCallback, useContext, useState } from 'react'
import type { ReactNode } from 'react'

const cx = (...a: (string | false | undefined)[]) => a.filter(Boolean).join(' ')

export type ButtonVariant = 'primary' | 'outline' | 'danger' | 'ghost' | 'success'
export type ButtonSize = 'sm' | 'md' | 'lg'

export function Button({ variant = 'primary', size = 'md', icon, iconAfter, iconOnly, className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode; iconAfter?: ReactNode; iconOnly?: boolean }) {
  const styles: Record<ButtonVariant, string> = {
    primary: 'bg-primary text-white shadow-btn hover:bg-primary-hover',
    outline: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
    danger: 'bg-danger text-white hover:opacity-90',
    ghost: 'text-gray-700 hover:bg-gray-100',
    success: 'bg-green-600 text-white hover:bg-green-700'
  }
  const sizes: Record<ButtonSize, string> = {
    sm: iconOnly ? 'p-2' : 'px-2.5 py-1.5 text-xs',
    md: iconOnly ? 'p-2.5' : 'px-3.5 py-2 text-sm',
    lg: iconOnly ? 'p-3' : 'px-5 py-2.5 text-base'
  }
  return (
    <button
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1',
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

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx('w-full h-9 sm:h-10 px-3.5 border border-gray-300 rounded-lg text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30', props.className)} />
}

export function Select({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className="w-full h-9 sm:h-10 px-3.5 border border-gray-300 rounded-lg text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30">
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export function Card({ title, children, footer }: { title?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-card">
      {title && <div className="px-4 py-3 border-b border-gray-200 font-semibold">{title}</div>}
      <div className="p-4">{children}</div>
      {footer && <div className="px-4 py-3 border-t border-gray-200">{footer}</div>}
    </div>
  )
}

export function StatCard({ label, value, tone }: { label: string; value: string; tone?: 'default' | 'positive' | 'negative' }) {
  const color = tone === 'positive' ? 'text-green-600' : tone === 'negative' ? 'text-red-600' : 'text-gray-900'
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-card hover:shadow-card-hover transition-shadow">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className={cx('text-2xl font-bold mt-1', color)}>{value}</div>
    </div>
  )
}

export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: 'gray' | 'green' | 'yellow' | 'red' | 'blue' | 'success' }) {
  const styles = {
    gray: 'bg-gray-100 text-gray-700',
    green: 'bg-green-100 text-green-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    red: 'bg-red-100 text-red-700',
    blue: 'bg-primary-soft text-primary',
    success: 'bg-green-100 text-green-700'
  }
  return <span className={cx('inline-block px-2 py-0.5 rounded text-xs font-medium', styles[tone])}>{children}</span>
}

export function Table<T extends Record<string, unknown>>({ columns, rows }: { columns: { key: string; header: string; render?: (row: T) => ReactNode }[]; rows: T[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
          <tr>{columns.map(c => <th key={c.key} className="px-4 py-2 whitespace-nowrap">{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
              {columns.map(c => <td key={c.key} className="px-4 py-2 whitespace-nowrap">{c.render ? c.render(r) : String(r[c.key] ?? '')}</td>)}
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg max-h-[90vh] overflow-auto rounded-t-2xl sm:rounded-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="font-semibold">{title}</div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">✕</button>
        </div>
        <div className="p-4">{children}</div>
        {footer && <div className="px-4 py-3 border-t border-gray-200 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}

export function ConfirmDialog({ open, title, message, onConfirm, onClose }: { open: boolean; title: string; message: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={title}
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button variant="danger" onClick={onConfirm}>Eliminar</Button></>}>
      <p>{message}</p>
    </Dialog>
  )
}

export function Tabs({ tabs }: { tabs: { id: string; label: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.id)
  return (
    <div>
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActive(t.id)}
            className={cx('px-3 py-2 text-sm border-b-2', active === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500')}>
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
