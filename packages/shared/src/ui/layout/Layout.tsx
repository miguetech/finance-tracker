import React, { useState } from 'react'
import type { ReactNode } from 'react'
import { cx } from '../components'

export type NavKey = 'dashboard' | 'facturas' | 'clientes' | 'cuentas' | 'proveedores' | 'gastos' | 'reportes' | 'configuracion'

const NAV: { key: NavKey; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: '📊' },
  { key: 'facturas', label: 'Facturas', icon: '🧾' },
  { key: 'clientes', label: 'Clientes', icon: '👥' },
  { key: 'cuentas', label: 'Cuentas por Pagar', icon: '💸' },
  { key: 'proveedores', label: 'Proveedores', icon: '🏭' },
  { key: 'gastos', label: 'Gastos', icon: '📉' },
  { key: 'reportes', label: 'Reportes', icon: '📈' },
  { key: 'configuracion', label: 'Configuración', icon: '⚙️' }
]

export function Layout({ current, onNavigate, children, headerExtra }: { current: NavKey; onNavigate: (k: NavKey) => void; children: ReactNode; headerExtra?: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const nav = (
    <nav className="flex-1 overflow-y-auto">
      {NAV.map(n => (
        <button key={n.key} onClick={() => { onNavigate(n.key); setMobileOpen(false) }}
          className={cx('w-full flex items-center gap-3 px-4 py-3 text-sm', current === n.key ? 'bg-primary-soft text-primary font-medium border-l-4 border-primary' : 'text-gray-700 hover:bg-gray-100')}>
          <span>{n.icon}</span>{n.label}
        </button>
      ))}
    </nav>
  )
  return (
    <div className="min-h-screen bg-gray-50 md:flex">
      <aside className="hidden md:flex md:flex-col md:w-60 md:min-h-screen bg-white border-r border-gray-200">{nav}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden bg-black/40" onClick={() => setMobileOpen(false)}>
          <div className="w-64 h-full bg-white" onClick={e => e.stopPropagation()}>{nav}</div>
        </div>
      )}
      <div className="flex-1 flex flex-col">
        <header className="md:hidden sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <button className="text-xl" onClick={() => setMobileOpen(true)}>☰</button>
          <div className="font-semibold">FinanceTracker</div>
          <div className="w-6">{headerExtra}</div>
        </header>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  )
}
