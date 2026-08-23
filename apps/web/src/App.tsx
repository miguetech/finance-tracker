import React, { useEffect, useMemo, useState } from 'react'
import { createRepository, createRemoteRepository, localStorageAdapter, KEYS, SheetsApi, connectOrCreateSpreadsheet, ensureTables, AppProvider, Layout, Dashboard, Facturas, Clientes, Empleados, Gastos, Proveedores, CuentasPagar, CuentasPorCobrar, Inventario, Reportes, Configuracion, Compartir, Toaster, PermsProvider, adminPerms, usePerms, permsFromInfo, IconShare, I18nProvider, useI18n, Button, Input, cargarRegistroSesion, guardarRegistroSesion, borrarRegistroSesion, conColaEscrituras, SincronizadorCola, useAppStore, crearStoreEspejo, SesionOffline, PantallaPinCifrado } from '@ft/shared'
import type { NavKey, NavItem, ModuleKey, PermsInfo, RegistroSesion, EspejoStore } from '@ft/shared'
import { monthLocal } from '@ft/shared'
import { webAuth } from './auth/popupOAuth'
import { loadShareParams, saveShareParams, clearShareParams, loadSessionToken, saveSessionToken, clearSessionToken, saveDeviceToken, loadDeviceToken } from './mode'

const NAV_MODULE: Partial<Record<NavKey, ModuleKey>> = {
  dashboard: 'dashboard', facturas: 'facturas', clientes: 'clientes', empleados: 'empleados',
  cuentas: 'cuentas', cxc: 'cxc', proveedores: 'proveedores', gastos: 'gastos', reportes: 'reportes', inventario: 'inventario'
}

function OwnerShell() {
  const [idHoja, setIdHoja] = useState<string | null>(null)
  const [sesionLocal, setSesionLocal] = useState<RegistroSesion | null>(null)
  const [modoOffline, setModoOffline] = useState(false)
  // Clave del espejo cifrado: derivada del PIN y retenida solo en memoria.
  const [claveEspejo, setClaveEspejo] = useState<(() => Promise<string>) | null>(null)
  const [storeCifrado, setStoreCifrado] = useState<EspejoStore | null>(null)
  const [pendientePinCifrado, setPendientePinCifrado] = useState<RegistroSesion | null>(null)
  const [nav, setNav] = useState<NavKey>(() => (sessionStorage.getItem('ft_nav') as NavKey) || 'dashboard')
  const [mes, setMes] = useState(() => sessionStorage.getItem('ft_mes') || monthLocal())
  const [error, setError] = useState('')

  const navigate = (k: NavKey) => { sessionStorage.setItem('ft_nav', k); setNav(k) }
  const cambiarMes = (m: string) => { sessionStorage.setItem('ft_mes', m); setMes(m) }
  const makeApi = () => new SheetsApi(async () => { try { return await webAuth.getToken(false) } catch { return await webAuth.getToken(true) } })

  // Hooks SIEMPRE antes de cualquier return temprano (Rules of Hooks).
  const repoBase = useMemo(
    () => createRepository({ api: makeApi(), storage: localStorageAdapter, getSpreadsheetId: async () => idHoja ?? '' }),
    [idHoja]
  )
  // En modo offline las escrituras se encolan localmente y se reproducen al volver la red.
  const repo = useMemo(
    () => conColaEscrituras(repoBase, {
      storage: localStorageAdapter,
      activo: () => modoOffline || (typeof navigator !== 'undefined' && navigator.onLine === false),
      configActual: () => useAppStore.getState().config ?? null
    }),
    [repoBase, modoOffline]
  )

  useEffect(() => {
    if (!claveEspejo || storeCifrado) return
    let vivo = true
    void crearStoreEspejo({ clave: claveEspejo }).then(s => { if (vivo) setStoreCifrado(s) })
    return () => { vivo = false }
  }, [claveEspejo, storeCifrado])

  useEffect(() => {
    if (window.self !== window.top) return
    ;(async () => {
      try {
        clearShareParams()
        let id = await localStorageAdapter.get(KEYS.spreadsheetId)
        if (!id) {
          await webAuth.getToken(true)
          id = await localStorageAdapter.get(KEYS.spreadsheetId)
          if (!id) {
            // Conecta a la hoja principal existente; solo crea una si no hay ninguna.
            const token = await webAuth.getToken(false)
            const api = new SheetsApi(async () => token)
            const connected = await connectOrCreateSpreadsheet(api)
            await localStorageAdapter.set(KEYS.spreadsheetId, connected.spreadsheetId)
            id = connected.spreadsheetId
          }
        }
        setIdHoja(id)
        try {
          await ensureTables(makeApi(), id)
          const email = (await webAuth.getSignedInUser())?.email
          if (email) void guardarRegistroSesion(localStorageAdapter, { cuenta: email })
          const reg = await cargarRegistroSesion(localStorageAdapter)
          // Espejo cifrado de sesión anterior: exige PIN antes de abrirlo.
          if (reg?.cifrado) setPendientePinCifrado(reg)
        } catch {
          // Sin red (o Sheets sin responder): se ofrece modo offline si hubo sesión.
          setSesionLocal(await cargarRegistroSesion(localStorageAdapter))
        }
      } catch (e) { setError((e as Error).message) }
    })()
  }, [])

  // Revalidación al volver la red: si la cuenta OAuth difiere del registro
  // local, se descarta el desbloqueo offline y se exige login limpio (§9.3).
  useEffect(() => {
    if (!modoOffline) return
    const revalidar = async () => {
      try {
        await webAuth.getIdToken(false)
        const email = (await webAuth.getSignedInUser())?.email
        const reg = await cargarRegistroSesion(localStorageAdapter)
        if (email && reg && email !== reg.cuenta) {
          await borrarRegistroSesion(localStorageAdapter)
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

  if (error) return <div className="p-8 text-red-600">{error}</div>
  if (!idHoja) return <div className="p-8">Conectando a Google Sheets…</div>
  if (!modoOffline && sesionLocal) {
    return (
      <SesionOffline
        almacen={localStorageAdapter}
        registro={sesionLocal}
        onEntrar={(pinEntrado) => {
          setModoOffline(true)
          if (sesionLocal.cifrado && pinEntrado) setClaveEspejo(() => async () => pinEntrado)
        }}
        onLoginGoogle={() => { void webAuth.getToken(true).catch(() => {}) }}
      />
    )
  }
  // Espejo cifrado de la sesión anterior: desbloqueo por PIN antes de abrir.
  if (!modoOffline && pendientePinCifrado && !claveEspejo) {
    return (
      <PantallaPinCifrado
        almacen={localStorageAdapter}
        registro={pendientePinCifrado}
        onOk={pin => { setClaveEspejo(() => async () => pin); setPendientePinCifrado(null) }}
        onCancelar={() => setPendientePinCifrado(null)}
      />
    )
  }
  if (claveEspejo && !storeCifrado) return <div className="p-8">Preparando datos locales…</div>
  const extraItems: NavItem[] = [{ key: 'compartir', label: 'Compartir', Icon: IconShare }]
  return (
    <AppProvider repo={repo}>
      {modoOffline && <SincronizadorCola almacen={localStorageAdapter} repo={repoBase} activo={() => modoOffline} />}
      <PermsProvider perms={adminPerms()}>
        <Toaster>
          <Layout current={nav} onNavigate={navigate} extraItems={extraItems} espejoForzado={modoOffline} storeExterno={storeCifrado}>
            {nav === 'dashboard' && <Dashboard mes={mes} onNavigate={navigate} />}
            {nav === 'facturas' && <Facturas />}
            {nav === 'clientes' && <Clientes />}
            {nav === 'empleados' && <Empleados />}
            {nav === 'gastos' && <Gastos />}
            {nav === 'proveedores' && <Proveedores />}
            {nav === 'cuentas' && <CuentasPagar />}
            {nav === 'cxc' && <CuentasPorCobrar />}
            {nav === 'inventario' && <Inventario />}
            {nav === 'reportes' && <Reportes mes={mes} setMes={cambiarMes} />}
            {nav === 'configuracion' && <Configuracion />}
            {nav === 'compartir' && <Compartir />}
          </Layout>
        </Toaster>
      </PermsProvider>
    </AppProvider>
  )
}

function VisitorInner({ apiUrl }: { apiUrl: string }) {
  const { canView } = usePerms()
  const [nav, setNav] = useState<NavKey>(() => {
    const first = (Object.keys(NAV_MODULE) as NavKey[]).find(k => NAV_MODULE[k] && canView(NAV_MODULE[k]!))
    return first ?? 'dashboard'
  })
  const [mes, setMes] = useState(() => monthLocal())
  const navigate = (k: NavKey) => setNav(k)
  const cambiarMes = (m: string) => setMes(m)
  const repo = useMemo(() => createRemoteRepository({
    apiUrl,
    getIdToken: async () => { try { return await webAuth.getIdToken(false) } catch { return await webAuth.getIdToken(true) } },
    getSessionToken: async () => loadSessionToken()
  }), [apiUrl])
  const filterNav = (k: NavKey) => k === 'configuracion' ? false : (NAV_MODULE[k] ? canView(NAV_MODULE[k]!) : true)
  return (
    <AppProvider repo={repo}>
      <Toaster>
        <Layout current={nav} onNavigate={navigate} filterNav={filterNav}>
          {nav === 'dashboard' && <Dashboard mes={mes} onNavigate={navigate} />}
          {nav === 'facturas' && canView('facturas') && <Facturas />}
          {nav === 'clientes' && canView('clientes') && <Clientes />}
          {nav === 'empleados' && canView('empleados') && <Empleados />}
          {nav === 'gastos' && canView('gastos') && <Gastos />}
          {nav === 'proveedores' && canView('proveedores') && <Proveedores />}
          {nav === 'cuentas' && canView('cuentas') && <CuentasPagar />}
          {nav === 'cxc' && canView('cxc') && <CuentasPorCobrar />}
          {nav === 'inventario' && canView('inventario') && <Inventario />}
          {nav === 'reportes' && canView('reportes') && <Reportes mes={mes} setMes={cambiarMes} />}
        </Layout>
      </Toaster>
    </AppProvider>
  )
}

function VisitorShell({ apiUrl }: { apiUrl: string }) {
  const { t } = useI18n()
  const [state, setState] = useState<'boot' | 'login' | 'ready' | 'denied' | 'error'>('boot')
  const [session, setSession] = useState<ReturnType<typeof permsFromInfo> | null>(null)
  const [paso, setPaso] = useState<'codigo' | 'verificacion'>('codigo')
  const [codigo, setCodigo] = useState('')
  const [intentoId, setIntentoId] = useState('')
  const [verifCodigo, setVerifCodigo] = useState('')
  const [loginError, setLoginError] = useState('')
  const [entrando, setEntrando] = useState(false)
  const repo = useMemo(() => createRemoteRepository({
    apiUrl,
    getIdToken: async () => { try { return await webAuth.getIdToken(false) } catch { return await webAuth.getIdToken(true) } },
    getSessionToken: async () => loadSessionToken()
  }), [apiUrl])

  const entrarConPermisos = (info: PermsInfo) => {
    const p = permsFromInfo(info)
    if (!p.isAdmin && info.view.length === 0) { setState('denied'); return }
    setSession(p)
    setState('ready')
  }

  const iniciarConGoogle = async () => {
    saveShareParams(apiUrl)
    try {
      await webAuth.getIdToken(true)
    } catch {}
  }

  const entrarConCodigo = async () => {
    if (!codigo.trim() || entrando) return
    setEntrando(true)
    setLoginError('')
    try {
      const res = await fetch(`${apiUrl}/api/auth/codigo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: codigo.trim(), dispositivo: loadDeviceToken() })
      })
      const data = await res.json() as { ok?: boolean; data?: { token?: string; necesitaVerificacion?: boolean; intentoId?: string; dev?: string }; error?: string }
      if (!data.ok) throw new Error(data.error ?? '')
      if (data.data?.necesitaVerificacion && data.data.intentoId) {
        setIntentoId(data.data.intentoId)
        setPaso('verificacion')
        return
      }
      if (!data.data?.token) throw new Error(data.error ?? '')
      if (data.data.dev) saveDeviceToken(data.data.dev)
      saveSessionToken(data.data.token)
      setPaso('codigo')
      entrarConPermisos(await repo.getPerms())
    } catch (e) {
      setLoginError(e instanceof Error && e.message ? e.message : t('auth.codigoInvalido'))
    } finally {
      setEntrando(false)
    }
  }

  const verificarCodigo = async () => {
    if (!verifCodigo.trim() || entrando) return
    setEntrando(true)
    setLoginError('')
    try {
      const res = await fetch(`${apiUrl}/api/auth/verificar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intentoId, codigo: verifCodigo.trim() })
      })
      const data = await res.json() as { ok?: boolean; data?: { token?: string; dev?: string }; error?: string }
      if (!data.ok || !data.data?.token) throw new Error(data.error ?? '')
      if (data.data.dev) saveDeviceToken(data.data.dev)
      saveSessionToken(data.data.token)
      setPaso('codigo')
      entrarConPermisos(await repo.getPerms())
    } catch {
      setLoginError(t('auth.verifInvalido'))
    } finally {
      setEntrando(false)
    }
  }

  useEffect(() => {
    if (window.self !== window.top) return
    (async () => {
      try {
        if (loadSessionToken()) {
          try {
            entrarConPermisos(await repo.getPerms())
            return
          } catch { clearSessionToken() }
        }
        try {
          await webAuth.getIdToken(false)
          entrarConPermisos(await repo.getPerms())
        } catch { setState('login') }
      } catch { setState('error') }
    })()
  }, [apiUrl, repo])

  if (state === 'boot') return <div className="p-8">{t('auth.conectando')}</div>
  if (state === 'login') return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold text-center">{t('auth.loginTitle')}</h1>
        <Button className="w-full" onClick={iniciarConGoogle}>{t('auth.conGoogle')}</Button>
        <div className="text-sm text-gray-500">{t('auth.conCodigo')}</div>
        {paso === 'codigo' ? (
          <form className="space-y-2" onSubmit={e => { e.preventDefault(); entrarConCodigo() }}>
            <Input value={codigo} onChange={e => setCodigo(e.target.value)} placeholder={t('auth.codigo')} autoCapitalize="characters" />
            <Button type="submit" className="w-full" disabled={entrando}>{t('auth.entrar')}</Button>
          </form>
        ) : (
          <form className="space-y-2" onSubmit={e => { e.preventDefault(); verificarCodigo() }}>
            <p className="text-sm text-gray-600">{t('auth.verifEnviado')}</p>
            <Input value={verifCodigo} onChange={e => setVerifCodigo(e.target.value)} placeholder={t('auth.verifCodigo')} inputMode="numeric" autoComplete="one-time-code" />
            <Button type="submit" className="w-full" disabled={entrando}>{t('auth.verificar')}</Button>
            <button type="button" onClick={() => { setPaso('codigo'); setLoginError('') }} className="w-full text-center text-sm text-blue-600">{t('auth.conCodigo')}</button>
          </form>
        )}
        {loginError && <div className="text-sm text-red-600">{loginError}</div>}
      </div>
    </div>
  )
  if (state === 'denied') return <div className="p-8 text-center text-gray-600">{t('auth.sinAcceso')}</div>
  if (state === 'error') return <div className="p-8 text-red-600">{t('common.errorConexion')}</div>
  return <PermsProvider perms={session!}><VisitorInner apiUrl={apiUrl} /></PermsProvider>
}

export function App() {
  const share = loadShareParams()
  const [ownerId, setOwnerId] = useState<string | null>(null)
  useEffect(() => { localStorageAdapter.get(KEYS.spreadsheetId).then(setOwnerId) }, [])
  const inner = share && !ownerId ? <VisitorShell apiUrl={share.apiUrl} /> : <OwnerShell />
  return <I18nProvider>{inner}</I18nProvider>
}
