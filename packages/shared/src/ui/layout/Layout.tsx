import React, { useState } from 'react'
import type { ReactNode } from 'react'
import { cx } from '../components'
import { IconDashboard, IconInvoice, IconClient, IconUsers, IconPayables, IconReceivable, IconProvider, IconExpense, IconReport, IconSettings, IconMenu, IconLogo, IconBox } from '../icons'
import { useI18n } from '../../i18n'
import { OfflineBanner } from '../hooks'
import { RateBubble } from '../RateBubble'
import { ColaBubble } from '../colaSync'
import { EspejoProvider } from '../../store/espejoContext'
import { crearStoreEspejo } from '../../sync/stores/sqlite'
import type { EspejoStore } from '../../sync/espejo'
import { useEffect } from 'react'

export type NavKey = 'dashboard' | 'facturas' | 'clientes' | 'empleados' | 'cuentas' | 'cxc' | 'proveedores' | 'gastos' | 'reportes' | 'configuracion' | 'compartir' | 'inventario'

export interface NavItem { key: NavKey; label: string; Icon: (p: { className?: string }) => ReactNode }

export function Layout({ current, onNavigate, children, headerExtra, filterNav, extraItems, espejoForzado }: {
  current: NavKey
  onNavigate: (k: NavKey) => void
  children: ReactNode
  headerExtra?: ReactNode
  filterNav?: (key: NavKey) => boolean
  extraItems?: NavItem[]
  /** Sesión offline: activa el espejo aunque el flag de entorno esté off. */
  espejoForzado?: boolean
}) {
  const { t } = useI18n()
  const [mobileOpen, setMobileOpen] = useState(false)
  const NAV: NavItem[] = [
    { key: 'dashboard', label: t('nav.dashboard'), Icon: IconDashboard },
    { key: 'facturas', label: t('nav.facturas'), Icon: IconInvoice },
    { key: 'clientes', label: t('nav.clientes'), Icon: IconClient },
    { key: 'empleados', label: t('nav.empleados'), Icon: IconUsers },
    { key: 'cxc', label: t('nav.cxc'), Icon: IconReceivable },
    { key: 'cuentas', label: t('nav.cuentas'), Icon: IconPayables },
    { key: 'proveedores', label: t('nav.proveedores'), Icon: IconProvider },
    { key: 'inventario', label: t('nav.inventario'), Icon: IconBox },
    { key: 'gastos', label: t('nav.gastos'), Icon: IconExpense },
    { key: 'reportes', label: t('nav.reportes'), Icon: IconReport },
    { key: 'configuracion', label: t('nav.configuracion'), Icon: IconSettings }
  ]
  const visible = NAV.filter(n => !filterNav || filterNav(n.key))
  const items = extraItems?.length ? [...visible, ...extraItems] : visible
  const nav = (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
      <div className="flex items-center gap-2.5 px-3 pb-5">
        <IconLogo className="text-primary w-7 h-7" />
        <div>
          <div className="font-bold text-lg tracking-tight text-gray-900 leading-none">FinanceTracker</div>
          <div className="text-xs text-muted-foreground mt-0.5">{t('nav.facturacionPersonal')}</div>
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
  const contenido = (
    <div className="min-h-screen bg-muted md:flex">
      <OfflineBanner />
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
      <RateBubble onNavigate={onNavigate} />
      <ColaBubble />
    </div>
  )
  // El espejo se activa con VITE_ESPEJO=on (o forzado en sesión offline); por
  // defecto queda en ruta directa a Sheets.
  const flagEntorno = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_ESPEJO ?? 'off'
  const flag = espejoForzado ? 'on' : flagEntorno
  const [espejoStore, setEspejoStore] = useState<EspejoStore | null>(null)
  useEffect(() => {
    if (flag !== 'on') return
    let vivo = true
    void crearStoreEspejo().then(s => { if (vivo) setEspejoStore(s) })
    return () => { vivo = false }
  }, [flag])
  return (
    <EspejoProvider flag={flag} store={espejoStore}>
      {contenido}
    </EspejoProvider>
  )
}
