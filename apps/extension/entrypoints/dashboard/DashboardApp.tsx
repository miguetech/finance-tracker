import React, { useState, useEffect } from 'react'
import { ensureSheet, getChromeToken } from '../../src/onboarding'
import { createRepository, chromeStorageAdapter, KEYS, SheetsApi, AppProvider, Layout, Dashboard, Facturas, Clientes, Gastos, Proveedores, CuentasPagar, Reportes, Configuracion, Toaster, useConfig } from '@ft/shared'
import type { NavKey } from '@ft/shared'

function Boot() {
  const [sheet, setSheet] = useState<{ id: string } | null>(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [nav, setNav] = useState<NavKey>('dashboard')
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7))

  useEffect(() => {
    (async () => {
      try {
        const s = await ensureSheet((chrome.runtime as unknown as { getManifest: () => { oauth2?: { client_id?: string } } }).getManifest().oauth2?.client_id ?? '')
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
      <Toaster>
        <SyncOnOpen />
        <Layout current={nav} onNavigate={setNav}>
          {nav === 'dashboard' && <Dashboard mes={mes} onNavigate={setNav} />}
          {nav === 'facturas' && <Facturas />}
          {nav === 'clientes' && <Clientes />}
          {nav === 'gastos' && <Gastos />}
          {nav === 'proveedores' && <Proveedores />}
          {nav === 'cuentas' && <CuentasPagar />}
          {nav === 'reportes' && <Reportes mes={mes} setMes={setMes} />}
          {nav === 'configuracion' && <Configuracion />}
        </Layout>
      </Toaster>
    </AppProvider>
  )
}

function SyncOnOpen() {
  useConfig()
  return null
}

export function DashboardApp() { return <Boot /> }
