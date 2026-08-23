import { useState } from 'react'
import { Button, Input, useI18n, localStorageAdapter, configurarPin, verificarPin, desbloqueoPermitido, activarCifradoEspejo } from '@ft/shared'
import type { RegistroSesion } from '@ft/shared'

/** Puerta de entrada sin red (spec espejo §9): "Continuar como <cuenta>",
 *  desbloqueo por PIN local o ventana de 24 h si no hay PIN. */
export function SesionOffline({ registro, onEntrar, onLoginGoogle }: {
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
    if (!(await verificarPin(localStorageAdapter, pin))) {
      setError(t('authOffline.pinInvalido'))
      return
    }
    if (cifrar && !registro.cifrado) {
      try { await activarCifradoEspejo(localStorageAdapter, pin) } catch { /* ya verificado */ }
    }
    onEntrar(pin)
  }

  const guardarNuevoPin = async () => {
    try {
      await configurarPin(localStorageAdapter, nuevoPin)
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
              <Button className="w-full" onClick={() => onEntrar()}>{t('authOffline.entrarSinConexion')}</Button>
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

/** Desbloqueo del espejo cifrado al arrancar con red (Fase C). */
export function PantallaPinCifrado({ registro, onOk, onCancelar }: {
  registro: RegistroSesion
  onOk: (pin: string) => void
  onCancelar: () => void
}) {
  const { t } = useI18n()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')

  const desbloquear = async () => {
    if (await verificarPin(localStorageAdapter, pin)) onOk(pin)
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
