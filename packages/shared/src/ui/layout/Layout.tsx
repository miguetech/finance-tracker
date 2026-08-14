import React, { useState } from 'react'
import type { ReactNode } from 'react'
import { cx } from '../components'
import { IconDashboard, IconInvoice, IconClient, IconUsers, IconPayables, IconProvider, IconExpense, IconReport, IconSettings, IconMenu, IconLogo } from '../icons'

export type NavKey = 'dashboard' | 'facturas' | 'clientes' | 'empleados' | 'cuentas' | 'proveedores' | 'gastos' | 'reportes' | 'configuracion' | 'compartir'

export interface NavItem { key: NavKey; label: string; Icon: (p: { className?: string }) => ReactNode }

const NAV: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', Icon: IconDashboard },
  { key: 'facturas', label: 'Facturas', Icon: IconInvoice },
  { key: 'clientes', label: 'Clientes', Icon: IconClient },
  { key: 'empleados', label: 'Empleados', Icon: IconUsers },
  { key: 'cuentas', label: 'Cuentas por Pagar', Icon: IconPayables },
  { key: 'proveedores', label: 'Proveedores', Icon: IconProvider },
  { key: 'gastos', label: 'Gastos', Icon: IconExpense },
  { key: 'reportes', label: 'Reportes', Icon: IconReport },
  { key: 'configuracion', label: 'Configuración', Icon: IconSettings }
]

export function Layout({ current, onNavigate, children, headerExtra, filterNav, extraItems }: {
  current: NavKey
  onNavigate: (k: NavKey) => void
  children: ReactNode
  headerExtra?: ReactNode
  filterNav?: (key: NavKey) => boolean
  extraItems?: NavItem[]
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const visible = NAV.filter(n => !filterNav || filterNav(n.key))
  const items = extraItems?.length ? [...visible, ...extraItems] : visible
  const nav = (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
      <div className="flex items-center gap-2.5 px-3 pb-5">
        <IconLogo className="text-primary w-7 h-7" />
        <div>
          <div className="font-bold text-lg tracking-tight text-gray-900 leading-none">FinanceTracker</div>
          <div className="text-xs text-muted-foreground mt-0.5">Facturación personal</div>
        </div>
      </div>
      {items.map(n => (
        <button key={n.key} onClick={() => { onNavigate(n.key); setMobileOpen(false) }}
          className={cx(
            'w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors',
            current === n.key ? 'bg-primary-soft text-primary font-semibold' : 'text-gray-600 hover:bg-muted'
          )}>
          <n.Icon className="w-5 h-5" />{n.label}
        </button>
      ))}
    </nav>
  )
  return (
    <div className="min-h-screen bg-muted md:flex">
      <aside className="hidden md:flex md:flex-col md:w-60 md:min-h-screen bg-surface border-r border-gray-100">{nav}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden bg-black/40" onClick={() => setMobileOpen(false)}>
          <div className="w-64 h-full bg-surface" onClick={e => e.stopPropagation()}>{nav}</div>
        </div>
      )}
      <div className="flex-1 flex flex-col">
        <header className="md:hidden sticky top-0 z-30 bg-surface border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <button className="p-1 rounded-lg text-gray-600 hover:bg-muted" onClick={() => setMobileOpen(true)}><IconMenu className="w-6 h-6" /></button>
          <div className="font-semibold">FinanceTracker</div>
          <div className="w-6">{headerExtra}</div>
        </header>
        <main className="flex-1 p-4 md:p-8"><div className="max-w-6xl mx-auto">{children}</div></main>
      </div>
    </div>
  )
}
