import { useState } from 'react'
import { Button, Input, useI18n, configurarPin, verificarPin, desbloqueoPermitido, activarCifradoEspejo, marcarDesbloqueoSesion } from '@ft/shared'
import type { RegistroSesion, StorageAdapter } from '@ft/shared'

/** Se perdió la conexión y hay sesión local: ofrecer entrar al modo offline
 *  sin recargar. Con PIN configurado o espejo cifrado lo pide; sin PIN solo
 *  dentro de la ventana de 24 h.
 *  @param yaDesbloqueado — true si la sesión ya está desbloqueada (PIN ya verificado
 *  esta pestaña o sin PIN/cifrado). En ese caso no pide PIN y muestra el texto informativo. */
export function ModalConexionPerdida({ almacen, registro, onEntrar, yaDesbloqueado = false }: {
  almacen: StorageAdapter
  registro: RegistroSesion
  onEntrar: (pin?: string) => void
  yaDesbloqueado?: boolean
}) {
  const { t } = useI18n()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  // Si ya está desbloqueado (PIN verificado o sin PIN/cifrado), no pide PIN.
  const pidePin = yaDesbloqueado ? false : (!!registro.pin || !!registro.cifrado)

  const entrar = async () => {
    if (pidePin) {
      if (!(await verificarPin(almacen, pin))) {
        setError(t('authOffline.pinInvalido'))
        return
      }
      marcarDesbloqueoSesion()
      onEntrar(pin)
      return
    }
    if (!desbloqueoPermitido(registro)) {
      setError(t('authOffline.sesionExpirada'))
      return
    }
    marcarDesbloqueoSesion()
    onEntrar()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
      <div className="w-full max-w-sm space-y-4 rounded-xl bg-surface border border-gray-200 shadow-2xl p-5">
        <h2 className="text-lg font-semibold text-center">{t('authOffline.conexionPerdida')}</h2>
        <p className="text-sm text-center text-gray-600">
          {t('authOffline.continuarComo')} <span className="font-medium">{registro.cuenta}</span>
        </p>
        {/* Texto informativo: explica qué hace el modo offline. */}
        <p className="text-xs text-gray-500 text-center">{t('authOffline.modoOfflineInfo')}</p>
        {pidePin ? (
          <form className="space-y-2" onSubmit={e => { e.preventDefault(); void entrar() }}>
            <Input value={pin} onChange={e => setPin(e.target.value)} placeholder={t('authOffline.pin')} inputMode="numeric" autoComplete="off" type="password" />
            <Button type="submit" className="w-full" disabled={!pin}>{t('authOffline.entrarSinConexion')}</Button>
          </form>
        ) : (
          <Button className="w-full" onClick={() => void entrar()}>{t('authOffline.activarModoOffline')}</Button>
        )}
        {!desbloqueoPermitido(registro) && !pidePin && (
          <div className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg p-2">
            {t('authOffline.sesionExpirada')}
          </div>
        )}
        {error && <div className="text-sm text-red-600">{error}</div>}
      </div>
    </div>
  )
}

/** Puerta de entrada sin red (spec espejo §9): "Continuar como <cuenta>",
 *  desbloqueo por PIN local o ventana de 24 h si no hay PIN.
 *  Compartida por web (localStorage) y extensión (chrome.storage). */
export function SesionOffline({ almacen, registro, onEntrar, onLoginGoogle }: {
  almacen: StorageAdapter
  registro: RegistroSesion
  onEntrar: (pin?: string) => void
  onLoginGoogle: () => void
}) {
  const { t } = useI18n()
  const [pin, setPin] = useState('')
  const [nuevoPin, setNuevoPin] = useState('')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [cifrar, setCifrar] = useState(false)
  const pidiendoPin = !!registro.pin
  const permitido = desbloqueoPermitido(registro)

  const entrarConPin = async () => {
    if (!(await verificarPin(almacen, pin))) {
      setError(t('authOffline.pinInvalido'))
      return
    }
    if (cifrar && !registro.cifrado) {
      try { await activarCifradoEspejo(almacen, pin) } catch { /* ya verificado */ }
    }
    marcarDesbloqueoSesion()
    onEntrar(pin)
  }

  const guardarNuevoPin = async () => {
    try {
      await configurarPin(almacen, nuevoPin)
      setNuevoPin('')
      setError('')
      setAviso(t('authOffline.pinGuardado'))
    } catch {
      setError(t('authOffline.pinInvalido'))
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold text-center">{t('authOffline.titulo')}</h1>
        <p className="text-sm text-center text-gray-600">
          {t('authOffline.continuarComo')} <span className="font-medium">{registro.cuenta}</span>
        </p>
        <p className="text-xs text-center text-gray-400">
          {t('authOffline.ultimaSync')}: {new Date(registro.ultimo_pull).toLocaleString()}
        </p>

        {!pidiendoPin && !permitido && (
          <div className="text-sm text-amber-600 bg-amber-50 border border-amber-100 rounded-lg p-3">
            {t('authOffline.sesionExpirada')}
          </div>
        )}

        {permitido && (
          <>
            {pidiendoPin ? (
              <form className="space-y-2" onSubmit={e => { e.preventDefault(); void entrarConPin() }}>
                <p className="text-sm text-gray-600">{t('authOffline.pedirPin')}</p>
                <Input value={pin} onChange={e => setPin(e.target.value)} placeholder={t('authOffline.pin')} inputMode="numeric" autoComplete="off" type="password" />
                {!registro.cifrado && (
                  <label className="flex items-center gap-2 text-xs text-gray-500">
                    <input type="checkbox" checked={cifrar} onChange={e => setCifrar(e.target.checked)} />
                    {t('authOffline.cifrarDatos')}
                  </label>
                )}
                <Button type="submit" className="w-full" disabled={!pin}>{t('authOffline.entrarSinConexion')}</Button>
              </form>
            ) : (
              <Button className="w-full" onClick={() => { marcarDesbloqueoSesion(); onEntrar() }}>{t('authOffline.entrarSinConexion')}</Button>
            )}

            {!registro.pin && (
              <div className="space-y-2 border-t pt-3">
                <p className="text-xs text-gray-500">{t('authOffline.configurarPin')}</p>
                <Input value={nuevoPin} onChange={e => setNuevoPin(e.target.value)} placeholder={t('authOffline.pin')} inputMode="numeric" autoComplete="off" type="password" />
                <Button variant="outline" className="w-full" disabled={!nuevoPin} onClick={() => void guardarNuevoPin()}>{t('authOffline.guardarPin')}</Button>
              </div>
            )}
          </>
        )}

        {aviso && <div className="text-sm text-green-600">{aviso}</div>}
        {error && <div className="text-sm text-red-600">{error}</div>}

        <button type="button" onClick={onLoginGoogle} className="w-full text-center text-sm text-blue-600">
          {t('auth.conGoogle')}
        </button>
      </div>
    </div>
  )
}

/** Desbloqueo del espejo cifrado al arrancar (Fase C). */
export function PantallaPinCifrado({ almacen, registro, onOk, onCancelar }: {
  almacen: StorageAdapter
  registro: RegistroSesion
  onOk: (pin: string) => void
  onCancelar: () => void
}) {
  const { t } = useI18n()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')

  const desbloquear = async () => {
    if (await verificarPin(almacen, pin)) onOk(pin)
    else setError(t('authOffline.pinInvalido'))
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form className="w-full max-w-sm space-y-4" onSubmit={e => { e.preventDefault(); void desbloquear() }}>
        <h1 className="text-xl font-semibold text-center">{t('espejo.modoOffline')}</h1>
        <p className="text-sm text-center text-gray-600">{t('authOffline.pedirPinCifrado')}</p>
        <p className="text-xs text-center text-gray-400">
          {t('authOffline.continuarComo')} {registro.cuenta}
        </p>
        <Input value={pin} onChange={e => setPin(e.target.value)} placeholder={t('authOffline.pin')} inputMode="numeric" autoComplete="off" type="password" />
        <Button type="submit" className="w-full" disabled={!pin}>{t('common.guardar')}</Button>
        {error && <div className="text-sm text-red-600">{error}</div>}
        <button type="button" onClick={onCancelar} className="w-full text-center text-sm text-gray-500 hover:underline">
          {t('common.cancelar')}
        </button>
      </form>
    </div>
  )
}
