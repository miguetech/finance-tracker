import React, { useEffect, useState } from 'react'
import { chromeStorageAdapter, KEYS, SheetsApi } from '@ft/shared'
import { AppProvider, useReportes, useConfig } from '@ft/shared'
import { createRepository } from '@ft/shared'
import { formatMoney } from '@ft/shared'
import { StatCard, Button, IconDashboard } from '@ft/shared'
import { monthLocal } from '@ft/shared'
import { getChromeToken } from '../../src/onboarding'

function Repo() {
  const [sheet, setSheet] = useState<{ id: string } | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    chromeStorageAdapter.get(KEYS.spreadsheetId).then(async id => {
      if (!id) { setReady(true); return }
      setSheet({ id })
    }).finally(() => setReady(true))
  }, [])
  if (!ready) return null
  if (!sheet) return (
    <div className="p-4 space-y-3">
      <p className="text-sm">Necesitas configurar tu hoja de cálculo.</p>
      <Button onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('/dashboard.html') })}>Configurar</Button>
    </div>
  )
  const api = new SheetsApi(() => getChromeToken(false))
  const repo = createRepository({ api, storage: chromeStorageAdapter, getSpreadsheetId: async () => sheet.id })
  return <AppProvider repo={repo}><PopupInner /></AppProvider>
}

function PopupInner() {
  const { config } = useConfig()
  const { data: reportes } = useReportes(monthLocal())
  const moneda = config?.moneda ?? 'USD'
  const k = reportes?.kpis
  return (
    <div className="p-3 space-y-3">
      <div className="font-bold">FinanceTracker</div>
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Cobrado" value={k ? formatMoney(k.cobrado, moneda) : '…'} />
        <StatCard label="Pendiente" value={k ? formatMoney(k.pendiente, moneda) : '…'} />
        <StatCard label="Por pagar" value={k ? formatMoney(k.porPagar, moneda) : '…'} />
        <StatCard label="Vencidas" value={k ? formatMoney(k.vencidas, moneda) : '…'} />
      </div>
      <Button className="w-full" icon={<IconDashboard className="w-4 h-4" />} onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('/dashboard.html') })}>Abrir dashboard</Button>
    </div>
  )
}

export function PopupApp() { return <Repo /> }
