import React, { useEffect, useState } from 'react'
import { createRepository, localStorageAdapter, KEYS, SheetsApi, createInitialSpreadsheet, AppProvider, Layout, Dashboard, Facturas, Clientes, Empleados, Gastos, Proveedores, CuentasPagar, Reportes, Configuracion, Toaster } from '@ft/shared'
import type { NavKey } from '@ft/shared'
import { webAuth } from './auth/popupOAuth'

function Shell() {
  const [sheet, setSheet] = useState<{ id: string } | null>(null)
  const [nav, setNav] = useState<NavKey>('dashboard')
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7))
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      try {
        let id = await localStorageAdapter.get(KEYS.spreadsheetId)
        if (!id) {
          await webAuth.getToken(true) // redirige y vuelve con access_token
          id = await localStorageAdapter.get(KEYS.spreadsheetId)
          if (!id) {
            const token = await webAuth.getToken(false)
            const api = new SheetsApi(async () => token)
            const created = await createInitialSpreadsheet(api)
            await localStorageAdapter.set(KEYS.spreadsheetId, created.spreadsheetId)
            id = created.spreadsheetId
          }
        }
        setSheet({ id })
      } catch (e) { setError((e as Error).message) }
    })()
  }, [])

  if (error) return <div className="p-8 text-red-600">{error}</div>
  if (!sheet) return <div className="p-8">Conectando a Google Sheets…</div>
  const api = new SheetsApi(async () => {
    try {
      return await webAuth.getToken(false)
    } catch {
      return await webAuth.getToken(true)
    }
  })
  const repo = createRepository({ api, storage: localStorageAdapter, getSpreadsheetId: async () => sheet.id })
  return (
    <AppProvider repo={repo}>
      <Toaster>
        <Layout current={nav} onNavigate={setNav}>
          {nav === 'dashboard' && <Dashboard mes={mes} onNavigate={setNav} />}
          {nav === 'facturas' && <Facturas />}
          {nav === 'clientes' && <Clientes />}
          {nav === 'empleados' && <Empleados />}
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

export function App() { return <Shell /> }
