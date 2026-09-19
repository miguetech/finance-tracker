import React, { useEffect, useMemo, useState, createContext, useContext } from 'react'
import { createRepository, createRemoteRepository, localStorageAdapter, KEYS, SheetsApi, vincularOCrearBase, ensureTables, listarCandidatasBase, AppProvider, Layout, Dashboard, Facturas, Clientes, Empleados, Gastos, Proveedores, CuentasPagar, CuentasPorCobrar, Inventario, Reportes, Configuracion, Compartir, Toaster, PermsProvider, adminPerms, usePerms, permsFromInfo, IconShare, I18nProvider, useI18n, Button, Input, cargarRegistroSesion, guardarRegistroSesion, borrarRegistroSesion, conColaEscrituras, SincronizadorCola, useAppStore, crearStoreEspejo, SesionOffline, desbloqueoPermitido, limpiarDesbloqueoSesion, ModalConexionPerdida, useOnline, DriveApi, hayFalloRed, marcarRedOk, suscribirRed, espejoBus } from '@ft/shared'
import type { CandidataBase } from '@ft/shared'
import { useSyncExternalStore } from 'react'
import type { NavKey, NavItem, ModuleKey, PermsInfo, RegistroSesion, EspejoStore } from '@ft/shared'
import { monthLocal } from '@ft/shared'
import { webAuth } from './auth/popupOAuth'
import { loadShareParams, saveShareParams, clearShareParams, loadSessionToken, saveSessionToken, clearSessionToken, saveDeviceToken, loadDeviceToken } from './mode'

const NAV_MODULE: Partial<Record<NavKey, ModuleKey>> = {
  dashboard: 'dashboard', facturas: 'facturas', clientes: 'clientes', empleados: 'empleados',
  cuentas: 'cuentas', cxc: 'cxc', proveedores: 'proveedores', gastos: 'gastos', reportes: 'reportes', inventario: 'inventario'
}

/** Fallo de red REAL detectado por la app (fetch abortado/timeout), no solo
 *  navigator.onLine (que miente con WiFi conectado pero internet caído). */
function useFalloRed(): boolean {
  return useSyncExternalStore(suscribirRed, hayFalloRed)
}

// Contexto para disparar modal en acción crítica tras 30s sin red
const ModalCriticoContext = createContext<{
  solicitarModalCritico: (sesionLocal: RegistroSesion) => boolean
} | null>(null)

export function useModalCritico() {
  const ctx = useContext(ModalCriticoContext)
  if (!ctx) throw new Error('useModalCritico debe usarse dentro de OwnerShell')
  return ctx
}

function OwnerShell() {
  const [idHoja, setIdHoja] = useState<string | null>(null)
  // Picker de arranque (spec F4 §5): varias bases con huella → el dueño elige,
  // nunca se decide por nombre ni se adivina la más reciente.
  const [pickerBases, setPickerBases] = useState<{ candidatas: CandidataBase[]; conectando: string | null; error?: string } | null>(null)
  const [sesionLocal, setSesionLocal] = useState<RegistroSesion | null>(null)
  const [modoOffline, setModoOffline] = useState(false)
  // Clave del espejo cifrado: derivada del PIN y retenida solo en memoria.
  const [claveEspejo, setClaveEspejo] = useState<(() => Promise<string>) | null>(null)
  const [storeCifrado, setStoreCifrado] = useState<EspejoStore | null>(null)
  const [falloArranque, setFalloArranque] = useState(false)
  const [nav, setNav] = useState<NavKey>(() => (sessionStorage.getItem('ft_nav') as NavKey) || 'dashboard')
  const volviendoOnlineRef = React.useRef(false)
  // Para modal en acciones críticas: timestamp de última red OK
  const ultimaRedOkRef = React.useRef(Date.now())
  // Flag para forzar modal en acción crítica fallida
  const [forzarModalCritico, setForzarModalCritico] = useState(false)
  const [mes, setMes] = useState(() => sessionStorage.getItem('ft_mes') || monthLocal())
  const [error, setError] = useState('')

  const navigate = (k: NavKey) => { sessionStorage.setItem('ft_nav', k); setNav(k) }
  const cambiarMes = (m: string) => { sessionStorage.setItem('ft_mes', m); setMes(m) }
  // Sin cascada a interactivo: un token vencido en mitad de una escritura
  // no debe navegar a accounts.google.com; falla y la cola local guarda.
  const makeApi = () => new SheetsApi(async () => webAuth.getToken(false))

  // Hooks SIEMPRE antes de cualquier return temprano (Rules of Hooks).
  // El id va por ref: el repositorio siempre resuelve el spreadsheet actual
  // (evita closures viejas con idHoja=null del primer render).
  const idHojaRef = React.useRef<string | null>(null)
  const repoBase = useMemo(
    () => createRepository({ api: makeApi(), storage: localStorageAdapter, getSpreadsheetId: async () => idHojaRef.current ?? '' }),
    []
  )
  useEffect(() => { idHojaRef.current = idHoja }, [idHoja])

  // En modo offline las escrituras se encolan localmente y se reproducen al volver la red.
  const repo = useMemo(
    () => conColaEscrituras(repoBase, {
      storage: localStorageAdapter,
      activo: () => modoOffline || hayFalloRed() || (typeof navigator !== 'undefined' && navigator.onLine === false),
      configActual: () => useAppStore.getState().config ?? null,
      techoMs: 3_000
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
    marcarRedOk()
    ;(async () => {
      try {
        clearShareParams()
        
        // 1. Try localStorage first
        let id = await localStorageAdapter.get(KEYS.spreadsheetId)
        
        // 2. Fallback to appDataFolder (cross-device sync)
        if (!id) {
          try {
            await webAuth.getToken(false) // ensure token
            const drive = new DriveApi(() => webAuth.getToken(false))
            const config = await drive.loadAppConfig()
            if (config?.spreadsheetId) {
              id = config.spreadsheetId
              await localStorageAdapter.set(KEYS.spreadsheetId, id) // cache locally
            }
          } catch (e) {
            console.warn('[boot] appData config unavailable:', e)
          }
        }
        
        // 3. Validar la huella del id persistido ANTES de usarlo (spec §5):
        //    una hoja de EVENTOS, un BASE reemplazado o un archivo muerto no
        //    debe secuestrar el arranque ni dejar la config atrapada en bucle.
        if (id) {
          try {
            const drive = new DriveApi(() => webAuth.getToken(false))
            const [hoja, props, meta] = await Promise.all([
              drive.getFileInfo(id),
              drive.getAppProperties(id).catch(() => null),
              makeApi().getSpreadsheet(id).catch(() => null)
            ])
            const pestañas = (meta?.sheets ?? []).map(s => (s.properties?.title ?? '').replace(/['"]/g, ''))
            let invalida = false
            if (!hoja || hoja.trashed) invalida = true
            else if (props?.ft_tipo === 'eventos' || props?.ft_estado === 'reemplazado') invalida = true
            // Estructura: sin huella base pero tampoco Config/Sistema → ni es BASE
            // legacy ni archivo principal (p. ej. una hoja de años sin estampar).
            else if (meta && !props?.ft_tipo && !pestañas.some(p => p === 'Config' || p === 'Sistema')) invalida = true
            if (invalida) {
              console.warn('[boot] id persistido inválido (hoja equivocada/reemplazada/borrada); re-vinculando por huella', { id, props, pestañas })
              await localStorageAdapter.set(KEYS.spreadsheetId, '')
              await drive.borrarAppConfig().catch(() => {})
              id = ''
            }
          } catch { /* offline: no tocar el vínculo (modo offline intacto) */ }
        }

        // 4. Last resort: connect or create new (por huella, nunca por nombre)
        if (!id) {
          await webAuth.getToken(true) // interactive
          const token = await webAuth.getToken(false)
          const api = new SheetsApi(async () => token)
          // Varias bases con huella → picker (spec §5). 1 o 0 → flujo normal.
          const candidatas = await listarCandidatasBase(api).catch(() => [])
          if (candidatas.length > 1) {
            setPickerBases({ candidatas, conectando: null })
            return
          }
          const connected = await vincularOCrearBase(api)
          await localStorageAdapter.set(KEYS.spreadsheetId, connected.spreadsheetId)
          id = connected.spreadsheetId
          // Save to appData for future devices
          try {
            await new DriveApi(() => webAuth.getToken(false))
              .saveAppConfig({ spreadsheetId: id })
          } catch (e) {
            console.warn('[boot] failed to save to appData:', e)
          }
        }
        
        idHojaRef.current = id
        setIdHoja(id)
        try {
          try {
            await ensureTables(makeApi(), id)
          } catch (e) {
            // BASE borrado/vacío (404): re-vincula o crea uno nuevo en vez de
            // quedarse cargando contra un archivo muerto.
            if (!/Sheets API 404/.test((e as Error).message)) throw e
            console.warn('[boot] BASE no accesible; recuperando…')
            await localStorageAdapter.set(KEYS.spreadsheetId, '')
            await new DriveApi(() => webAuth.getToken(false)).borrarAppConfig().catch(() => {})
            const conectada = await vincularOCrearBase(makeApi())
            id = conectada.spreadsheetId
            idHojaRef.current = id
            setIdHoja(id)
            await ensureTables(makeApi(), id)
          }
          // Hoja-por-año (spec §8): garantiza EVENTOS-{año} desde el arranque.
          void repoBase.prepararAnioActual().catch((e: unknown) => {
            console.warn('[hoja-año] arranque sin crear hoja del año:', e instanceof Error ? e.message : e)
          })
          const email = (await webAuth.getSignedInUser())?.email
          if (email) void guardarRegistroSesion(localStorageAdapter, { cuenta: email })
          const reg = await cargarRegistroSesion(localStorageAdapter)
          if (reg) {
            // Registro disponible desde ya: si la red cae a mitad de sesión,
            // el modal de conexión perdida aparece sin recargar.
            setSesionLocal(reg)
          }
        } catch {
          // Sin red (o Sheets sin responder): se ofrece modo offline si hubo sesión.
          const reg = await cargarRegistroSesion(localStorageAdapter)
          if (reg) {
            setSesionLocal(reg)
            // Sesión plana con pull <24h: continuar directo sin recargar.
            if (!reg.cifrado && desbloqueoPermitido(reg)) setModoOffline(true)
          }
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

  const online = useOnline()
  const falloRed = useFalloRed()
  // Sin red: navigator.onLine O fallo real detectado por la app (fetch
  // abortado/timeout). Evita que el modal dependa solo de onLine, que miente.
  const sinRed = !online || falloRed

  // Cada pull exitoso refresca ultimo_pull de la sesión: sin esto la ventana
  // de 24h del desbloqueo offline expira aunque se use la app a diario.
  const sesionLocalRef = React.useRef(sesionLocal)
  useEffect(() => { sesionLocalRef.current = sesionLocal }, [sesionLocal])
  useEffect(() => {
    espejoBus.onPullCompletado = () => {
      const reg = sesionLocalRef.current
      if (reg) void guardarRegistroSesion(localStorageAdapter, { cuenta: reg.cuenta })
    }
    return () => { espejoBus.onPullCompletado = undefined }
  }, [])

  // Al volver la red (evento real del navegador) se limpia el fallo marcado,
  // para que la app reintente y el flag se re-setea si el internet sigue caído.
  // Inhibe el modal 1.5s para evitar parpadeo por race useOnline/falloRed.
  // Actualiza timestamp de última red OK.
  useEffect(() => {
    const alVolver = () => {
      volviendoOnlineRef.current = true
      ultimaRedOkRef.current = Date.now()
      marcarRedOk()
      setForzarModalCritico(false)
      setTimeout(() => { volviendoOnlineRef.current = false }, 1500)
    }
    window.addEventListener('online', alVolver)
    return () => window.removeEventListener('online', alVolver)
  }, [])

  // Red de vuelta: salir del modo offline (las escrituras vuelven a Sheets
  // directo y la cola pendiente la flushea SincronizadorCola al evento online).
  useEffect(() => {
    if (sinRed || !modoOffline) return
    setModoOffline(false)
  }, [sinRed, modoOffline])

  const extraItems: NavItem[] = [{ key: 'compartir', label: 'Compartir', Icon: IconShare }]
  const valorModalCritico = React.useMemo(() => ({
    solicitarModalCritico: (sesion: RegistroSesion) => {
      if (!sinRed || modoOffline) return false
      const tiempoSinRed = Date.now() - ultimaRedOkRef.current
      if (tiempoSinRed > 30_000) {
        setForzarModalCritico(true)
        return true
      }
      return false
    }
  }), [sinRed, modoOffline])

  // ── Picker de arranque (spec F4 §5) ──────────────────────────────────────
  const elegirBase = async (id: string) => {
    setPickerBases(p => p ? { ...p, conectando: id, error: undefined } : p)
    try {
      await ensureTables(makeApi(), id)
      await localStorageAdapter.set(KEYS.spreadsheetId, id)
      await new DriveApi(() => webAuth.getToken(false)).saveAppConfig({ spreadsheetId: id })
      window.location.reload()
    } catch (e) {
      setPickerBases(p => p ? { ...p, conectando: null, error: (e as Error).message } : p)
    }
  }
  const crearBaseNueva = async () => {
    setPickerBases(p => p ? { ...p, conectando: 'nueva', error: undefined } : p)
    try {
      const token = await webAuth.getToken(false)
      const conectada = await vincularOCrearBase(new SheetsApi(async () => token))
      await localStorageAdapter.set(KEYS.spreadsheetId, conectada.spreadsheetId)
      await new DriveApi(() => webAuth.getToken(false)).saveAppConfig({ spreadsheetId: conectada.spreadsheetId })
      window.location.reload()
    } catch (e) {
      setPickerBases(p => p ? { ...p, conectando: null, error: (e as Error).message } : p)
    }
  }

  // Escape del arranque: olvida el vínculo guardado (local + carpeta oculta de
  // Drive) para que el boot vuelva a elegir por huella sin quedar en bucle.
  const restablecerVinculo = async () => {
    setError('')
    try {
      await webAuth.getToken(false).catch(() => {})
      await localStorageAdapter.set(KEYS.spreadsheetId, '')
      await new DriveApi(() => webAuth.getToken(false)).borrarAppConfig().catch(() => {})
      setPickerBases(null)
      window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  // Early returns - AFTER all hooks
  if (error) return (
    <div className="p-8">
      <div className="text-red-600">{error}</div>
      <button type="button" onClick={() => void restablecerVinculo()} className="mt-4 text-sm text-blue-600 hover:underline">
        ¿Problemas? Restablecer vínculo de la hoja y volver a elegir…
      </button>
    </div>
  )
  if (!idHoja) {
    if (pickerBases) {
      return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
          <div className="mx-auto max-w-lg rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
            <h2 className="text-base font-semibold">Tienes más de un archivo principal</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Se encontraron varios archivos principales de tu negocio. Elige cuál usar; el resto queda en tu Drive.
            </p>
            <ul className="mt-4 divide-y divide-gray-100">
              {pickerBases.candidatas.map(c => {
                const vinculable = c.rol === 'es_dueño' || c.rol === 'no_verificable'
                return (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{c.titulo}</div>
                      <div className="text-[11px] text-gray-400 truncate">{c.id}</div>
                      {!vinculable && <div className="text-[11px] text-amber-600">No eres dueño (compartida contigo). No usable.</div>}
                    </div>
                    <Button size="sm" disabled={!vinculable || pickerBases.conectando !== null}
                      onClick={() => void elegirBase(c.id)}>
                      {pickerBases.conectando === c.id ? 'Conectando…' : 'Usar esta hoja'}
                    </Button>
                  </li>
                )
              })}
            </ul>
            {pickerBases.error && <p className="mt-3 text-xs text-red-600">{pickerBases.error}</p>}
            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">¿Ninguna es la tuya?</p>
              <Button size="sm" variant="outline" disabled={pickerBases.conectando !== null} onClick={() => void crearBaseNueva()}>
                {pickerBases.conectando === 'nueva' ? 'Creando…' : 'Crear base nueva'}
              </Button>
            </div>
          </div>
        </div>
      )
    }
    return (
      <div className="p-8">
        <div>Conectando a Google Sheets…</div>
        <button type="button" onClick={() => void restablecerVinculo()} className="mt-4 text-sm text-blue-600 hover:underline">
          ¿Problemas? Restablecer vínculo de la hoja y volver a elegir…
        </button>
      </div>
    )
  }
  // Modal de acción crítica: solo aparece si se intentó una acción crítica
  // (login, compartir, importar) y la red lleva >30s caída.
  if (forzarModalCritico && sinRed && !modoOffline && sesionLocal) {
    const yaDesbloqueado = !sesionLocal.cifrado || !!claveEspejo
    return (
      <ModalConexionPerdida
        almacen={localStorageAdapter}
        registro={sesionLocal}
        yaDesbloqueado={yaDesbloqueado}
        onEntrar={pinEntrado => {
          setModoOffline(true)
          if (sesionLocal.cifrado && pinEntrado) setClaveEspejo(() => async () => pinEntrado)
          window.location.reload()
        }}
      />
    )
  }
  if (!modoOffline && sesionLocal && falloArranque) {
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
  // PIN del espejo cifrado: ya NO se pide al arranque online (los datos
  // vienen de Sheets). Se exige una sola vez, al entrar al modo offline.
  if (claveEspejo && !storeCifrado) return <div className="p-8">Preparando datos locales…</div>

  return (
    <ModalCriticoContext.Provider value={valorModalCritico}>
      <AppProvider repo={repo}>
        <SincronizadorCola almacen={localStorageAdapter} repo={repoBase} />
        <PermsProvider perms={adminPerms()}>
          <Toaster>
            <Layout current={nav} onNavigate={navigate} extraItems={extraItems} espejoForzado={modoOffline} storeExterno={storeCifrado} espejoApagado={!modoOffline && !claveEspejo && !!sesionLocal?.cifrado}>
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
    </ModalCriticoContext.Provider>
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
    getIdToken: async () => webAuth.getIdToken(false),
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
    getIdToken: async () => webAuth.getIdToken(false),
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
  // Modo offline (spec §9): precache del shell + binario SQLite. Solo build de
  // producción; en dev Vite sirve todo con no-cache y el SW estorbaría al HMR.
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
  useEffect(() => {
    if (!env?.PROD || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])
  const inner = share && !ownerId ? <VisitorShell apiUrl={share.apiUrl} /> : <OwnerShell />
  return <I18nProvider>{inner}</I18nProvider>
}
