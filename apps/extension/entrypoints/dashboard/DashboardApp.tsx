import React, { useState, useEffect } from 'react'
import { ensureSheet, getChromeToken } from '../../src/onboarding'
import { createRepository, chromeStorageAdapter, SheetsApi, AppProvider, Layout, Dashboard, Facturas, Clientes, Empleados, Gastos, Proveedores, CuentasPagar, CuentasPorCobrar, Inventario, Reportes, Configuracion, Toaster, useConfig, PermsProvider, adminPerms } from '@ft/shared'
import type { NavKey } from '@ft/shared'
import { monthLocal } from '@ft/shared'

function Boot() {
  const [sheet, setSheet] = useState<{ id: string } | null>(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [nav, setNav] = useState<NavKey>('dashboard')
  const [mes, setMes] = useState(monthLocal())

  useEffect(() => {
    (async () => {
      try {
        const s = await ensureSheet()
        if (s) setSheet({ id: s.spreadsheetId })
      } catch (e) { setErr((e as Error).message) }
      setLoading(false)
    })()
  }, [])

  if (loading) return <div className="p-8">Conectando a Google Sheets…</div>
  if (err || !sheet) return <div className="p-8 text-red-600">{err || 'Error de configuración'}</div>
  const api = new SheetsApi(() => getChromeToken(false))
  const repo = createRepository({ api, storage: chromeStorageAdapter, getSpreadsheetId: async () => sheet.id })

  return (
    <AppProvider repo={repo}>
      <PermsProvider perms={adminPerms()}>
        <Toaster>
          <SyncOnOpen />
          <Layout current={nav} onNavigate={setNav}>
            {nav === 'dashboard' && <Dashboard mes={mes} onNavigate={setNav} />}
            {nav === 'facturas' && <Facturas />}
            {nav === 'clientes' && <Clientes />}
            {nav === 'empleados' && <Empleados />}
            {nav === 'gastos' && <Gastos />}
            {nav === 'proveedores' && <Proveedores />}
            {nav === 'cuentas' && <CuentasPagar />}
            {nav === 'cxc' && <CuentasPorCobrar />}
            {nav === 'inventario' && <Inventario />}
            {nav === 'reportes' && <Reportes mes={mes} setMes={setMes} />}
            {nav === 'configuracion' && <Configuracion />}
          </Layout>
        </Toaster>
      </PermsProvider>
    </AppProvider>
  )
}

function SyncOnOpen() {
  useConfig()
  return null
}

export function DashboardApp() { return <Boot /> }
