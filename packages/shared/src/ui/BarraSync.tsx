import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { suscribirCola, estadoColaActual } from '../sync/colaEscrituras'
import { useEspejo } from '../store/espejoContext'
import { useOnline } from './hooks'
import { useI18n } from '../i18n'

/**
 * Barra fina de sincronización al reconectar (spec espejo §9):
 *  1. Fase cola: progreso determinado "enviando cambios i/N".
 *  2. Fase pull: actividad indeterminada "actualizando datos".
 * Se autooculta ~1.5 s después de que todo asiente.
 */
export function BarraSync() {
  const { t } = useI18n()
  const online = useOnline()
  const { activo, pullEnCurso } = useEspejo()
  const estado = useSyncExternalStore(suscribirCola, estadoColaActual)
  const pendientes = estado.pendientes + estado.errores

  const [visible, setVisible] = useState(false)
  const totalRef = useRef(0) // ops al abrir la ventana de recuperación (% base)
  const graciaRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Base del porcentaje: máximo de pendientes visto desde que volvió la red.
  useEffect(() => {
    if (!online) { totalRef.current = 0; setVisible(false); return }
    if (pendientes > totalRef.current) totalRef.current = pendientes
  }, [online, pendientes])

  useEffect(() => {
    const trabajando = online && (pendientes > 0 || pullEnCurso)
    if (trabajando) {
      if (graciaRef.current) { clearTimeout(graciaRef.current); graciaRef.current = null }
      setVisible(true)
      return
    }
    // Gracia de salida: cubre el hueco entre fin de cola e inicio del pull.
    if (graciaRef.current || !visible) return
    graciaRef.current = setTimeout(() => {
      graciaRef.current = null
      setVisible(false)
      totalRef.current = 0
    }, 1500)
  }, [online, pendientes, pullEnCurso, visible])

  useEffect(() => () => { if (graciaRef.current) clearTimeout(graciaRef.current) }, [])

  if (!visible || !online || !activo) return null
  const enviando = totalRef.current > 0 && pendientes > 0
  const enviadas = Math.max(0, totalRef.current - pendientes)
  const pct = totalRef.current ? Math.round((enviadas / totalRef.current) * 100) : 100
  return (
    <div className="fixed top-0 left-0 right-0 z-[60] pointer-events-none">
      <div className="bg-primary-soft border-b border-primary/20 px-4 py-1 flex items-center gap-3 text-xs text-gray-600">
        <span className="truncate whitespace-nowrap overflow-hidden text-ellipsis">
          {enviando
            ? t('sync.enviando').replace('{i}', String(enviadas)).replace('{n}', String(totalRef.current))
            : t('sync.actualizando')}
        </span>
        <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden min-w-[80px]">
          {enviando ? (
            <div className="h-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
          ) : (
            <div className="h-full w-1/3 bg-primary animate-pulse" />
          )}
        </div>
      </div>
    </div>
  )
}
