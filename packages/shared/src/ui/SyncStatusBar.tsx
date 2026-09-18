import { useSyncExternalStore } from 'react'
import { suscribirCola, estadoColaActual } from '../sync/colaEscrituras'
import { useOnlineDebounced } from './hooks'
import { useI18n } from '../i18n'

/**
 * Barra de estado de sincronización (badge en esquina superior derecha).
 * Estados:
 *  - Offline: "● Sin conexión"
 *  - Online + cola pendiente: "↑ N pendientes"
 *  - Online + cola vacía: "● Sincronizado"
 */
export function SyncStatusBar() {
  const { t } = useI18n()
  const online = useOnlineDebounced(2000)
  const estado = useSyncExternalStore(suscribirCola, estadoColaActual)
  const pendientes = estado.pendientes + estado.errores

  if (!online) {
    return (
      <div className="fixed top-4 right-4 z-40 flex items-center gap-2 rounded-full bg-amber-100 border border-amber-300 px-3 py-1.5 text-xs text-amber-800 shadow">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
        </span>
        {t('sync.sinConexion')}
      </div>
    )
  }

  if (pendientes > 0) {
    return (
      <div className="fixed top-4 right-4 z-40 flex items-center gap-2 rounded-full bg-blue-100 border border-blue-300 px-3 py-1.5 text-xs text-blue-800 shadow">
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        {t('sync.pendientes').replace('{n}', String(pendientes))}
      </div>
    )
  }

  return (
    <div className="fixed top-4 right-4 z-40 flex items-center gap-2 rounded-full bg-green-100 border border-green-300 px-3 py-1.5 text-xs text-green-800 shadow">
      <span className="relative flex h-2 w-2">
        <span className="inline-flex rounded-full h-2 w-2 bg-green-500"></span>
      </span>
      {t('sync.sincronizado')}
    </div>
  )
}