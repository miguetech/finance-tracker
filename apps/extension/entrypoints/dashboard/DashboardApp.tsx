import React, { useState, useEffect } from 'react'
import { ensureSheet, getChromeToken } from '../../src/onboarding'
import { ensureTables, hayDesbloqueoSesion, desbloqueoPermitido, limpiarDesbloqueoSesion, ModalConexionPerdida, useOnline } from '@ft/shared'
import { createRepository, chromeStorageAdapter, KEYS, SheetsApi, AppProvider, Layout, Dashboard, Facturas, Clientes, Empleados, Gastos, Proveedores, CuentasPagar, CuentasPorCobrar, Inventario, Reportes, Configuracion, Toaster, useConfig, PermsProvider, adminPerms, cargarRegistroSesion, guardarRegistroSesion, borrarRegistroSesion, conColaEscrituras, SincronizadorCola, useAppStore, crearStoreEspejo, SesionOffline, PantallaPinCifrado, chromeIdentityAuth } from '@ft/shared'
import type { NavKey, RegistroSesion, EspejoStore } from '@ft/shared'
import { monthLocal } from '@ft/shared'

function authExt() {
  try { return chromeIdentityAuth('') } catch { return null }
}

function Boot() {
  const [idHoja, setIdHoja] = useState<string | null>(null)
  const [sesionLocal, setSesionLocal] = useState<RegistroSesion | null>(null)
  const [modoOffline, setModoOffline] = useState(false)
  // Clave del espejo cifrado: derivada del PIN y retenida solo en memoria.
  const [claveEspejo, setClaveEspejo] = useState<(() => Promise<string>) | null>(null)
  const [storeCifrado, setStoreCifrado] = useState<EspejoStore | null>(null)
  const [pendientePinCifrado, setPendientePinCifrado] = useState<RegistroSesion | null>(null)
  const [falloArranque, setFalloArranque] = useState(false)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [nav, setNav] = useState<NavKey>('dashboard')
  const [mes, setMes] = useState(monthLocal())

  useEffect(() => {
    if (!claveEspejo || storeCifrado) return
    let vivo = true
    void crearStoreEspejo({ clave: claveEspejo }).then(s => { if (vivo) setStoreCifrado(s) })
    return () => { vivo = false }
  }, [claveEspejo, storeCifrado])

  useEffect(() => {
    (async () => {
      try {
        const existing = await chromeStorageAdapter.get(KEYS.spreadsheetId)
        if (!existing) {
          // Primera vez: sin hoja local no hay modo offline posible.
          const s = await ensureSheet()
          if (s) setIdHoja(s.spreadsheetId)
          setLoading(false)
          return
        }
        setIdHoja(existing)
        try {
          const api = new SheetsApi(() => getChromeToken(false))
          await ensureTables(api, existing)
          const email = (await authExt()?.getSignedInUser())?.email
          if (email) void guardarRegistroSesion(chromeStorageAdapter, { cuenta: email })
          const reg = await cargarRegistroSesion(chromeStorageAdapter)
          if (reg) setSesionLocal(reg) // disponible para el modal si la red cae a mitad de sesión
          // Espejo cifrado de la sesión anterior: exige PIN antes de abrirlo.
          if (reg?.cifrado) setPendientePinCifrado(reg)
        } catch {
          // Sin red: se ofrece modo offline si hubo sesión previa.
          const reg = await cargarRegistroSesion(chromeStorageAdapter)
          if (reg) {
            setSesionLocal(reg)
            setFalloArranque(true)
            if (!reg.cifrado && hayDesbloqueoSesion() && desbloqueoPermitido(reg)) setModoOffline(true)
          }
        }
      } catch (e) { setErr((e as Error).message) }
      setLoading(false)
    })()
  }, [])

  // Revalidación al volver la red: cuenta distinta exige login limpio (§9.3).
  useEffect(() => {
    if (!modoOffline) return
    const revalidar = async () => {
      try {
        const auth = authExt()
        if (!auth) return
        await getChromeToken(false)
        const email = (await auth.getSignedInUser())?.email
        const reg = await cargarRegistroSesion(chromeStorageAdapter)
        if (email && reg && email !== reg.cuenta) {
          await borrarRegistroSesion(chromeStorageAdapter)
          limpiarDesbloqueoSesion()
          window.location.reload()
        }
      } catch { /* aún sin red */ }
    }
    const alVisible = () => { if (document.visibilityState === 'visible') void revalidar() }
    window.addEventListener('online', revalidar)
    document.addEventListener('visibilitychange', alVisible)
    return () => {
      window.removeEventListener('online', revalidar)
      document.removeEventListener('visibilitychange', alVisible)
    }
  }, [modoOffline])

  if (loading) return <div className="p-8">Conectando a Google Sheets…</div>
  if (!idHoja && !sesionLocal) return <div className="p-8 text-red-600">{err || 'Error de configuración'}</div>
  // Arranque sin red con sesión previa: gate "Continuar como" (spec §9).
  const online = useOnline()

  if (!online && !modoOffline && sesionLocal) {
    return (
      <ModalConexionPerdida
        storage={chromeStorageAdapter}
        registro={sesionLocal}
        onEntrar={pinEntrado => {
          setModoOffline(true)
          if (sesionLocal.cifrado && pinEntrado) setClaveEspejo(() => async () => pinEntrado)
        }}
      />
    )
  }
  if (!modoOffline && sesionLocal && falloArranque) {
    return (
      <SesionOffline
        almacen={chromeStorageAdapter}
        registro={sesionLocal}
        onEntrar={pinEntrado => {
          setModoOffline(true)
          if (sesionLocal.cifrado && pinEntrado) setClaveEspejo(() => async () => pinEntrado)
        }}
        onLoginGoogle={() => { void getChromeToken(true).catch(() => {}) }}
      />
    )
  }
  if (!modoOffline && pendientePinCifrado && !claveEspejo) {
    return (
      <PantallaPinCifrado
        almacen={chromeStorageAdapter}
        registro={pendientePinCifrado}
        onOk={pin => { setClaveEspejo(() => async () => pin); setPendientePinCifrado(null) }}
        onCancelar={() => setPendientePinCifrado(null)}
      />
    )
  }
  if (!idHoja) return <div className="p-8 text-red-600">{err || 'Error de configuración'}</div>
  if (claveEspejo && !storeCifrado) return <div className="p-8">Preparando datos locales…</div>

  const repoBase = createRepository({ api: new SheetsApi(() => getChromeToken(false)), storage: chromeStorageAdapter, getSpreadsheetId: async () => idHoja })
  // En modo offline las escrituras se encolan localmente y se reproducen al volver la red.
  const repo = conColaEscrituras(repoBase, {
    storage: chromeStorageAdapter,
    activo: () => modoOffline || (typeof navigator !== 'undefined' && navigator.onLine === false),
    configActual: () => useAppStore.getState().config ?? null
  })

  return (
    <AppProvider repo={repo}>
      <SincronizadorCola almacen={chromeStorageAdapter} repo={repoBase} />
      <PermsProvider perms={adminPerms()}>
        <Toaster>
          <SyncOnOpen />
          <Layout current={nav} onNavigate={setNav} espejoForzado={modoOffline} storeExterno={storeCifrado}>
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
