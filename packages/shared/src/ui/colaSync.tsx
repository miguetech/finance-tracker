import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Repository } from '../data/repository'
import type { StorageAdapter } from '../data/storage'
import { espejoBus } from '../sync/espejoBus'
import { vaciarCola, refrescarEstadoCola, reencolarErrores, descartarErrores, suscribirCola, estadoColaActual, TABLAS_POR_METODO, cargarCola } from '../sync/colaEscrituras'
import type { OperacionEnCola } from '../sync/colaEscrituras'
import { useI18n } from '../i18n'

/** Chip fijo con escrituras pendientes/fallidas del modo offline. */
export function ColaBubble({ onReintentar, onDescartar }: {
  onReintentar?: () => void
  onDescartar?: () => void
}) {
  const { t } = useI18n()
  const estado = useSyncExternalStore(suscribirCola, estadoColaActual)
  if (!estado.pendientes && !estado.errores) return null
  const disparar = (evento: string) => window.dispatchEvent(new CustomEvent(evento))
  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-full bg-surface border border-gray-200 shadow-lg px-3 py-1.5 text-xs">
      <span className={estado.errores ? 'text-red-600 font-medium' : 'text-amber-600'}>
        {estado.errores
          ? t('cola.conError').replace('{n}', String(estado.errores))
          : t('cola.pendientes').replace('{n}', String(estado.pendientes))}
      </span>
      {estado.errores > 0 && (
        <>
          <button className="text-blue-600 hover:underline" onClick={() => (onReintentar ?? (() => disparar('ft-cola-reintentar')))()}>{t('cola.reintentar')}</button>
          <button className="text-gray-500 hover:underline" onClick={() => (onDescartar ?? (() => disparar('ft-cola-descartar')))()}>{t('cola.descartar')}</button>
        </>
      )}
    </div>
  )
}

/**
 * Reaplica los ecos de la cola pendiente sobre el espejo local (sin red).
 * Tras una recarga de página, los registros guardados offline vuelven a
 * pintarse aunque el snapshot del espejo sea anterior a esos registros.
 */
export async function repetirEcosLocales(almacen: StorageAdapter): Promise<number> {
  const ops = await cargarCola(almacen)
  for (const op of ops) {
    try { espejoBus.onEscrituraLocal?.(op.metodo, op.args) } catch { /* noop */ }
  }
  return ops.length
}

/**
 * Vacía la cola de escrituras cuando vuelve la red (o al recuperar foco)
 * y refresca espejo + queries con lo reproducido. Sin red se limita a
 * re-aplicar los ecos locales. Montar SIEMPRE: es quien flushea la cola
 * sobreviviente a recargas de página.
 */
export function SincronizadorCola({ almacen, repo }: {
  almacen: StorageAdapter
  repo: Repository
}) {
  const qc = useQueryClient()
  const vaciar = useCallback(async () => {
    const ops = await cargarCola(almacen)
    if (!ops.length) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      await repetirEcosLocales(almacen)
      return
    }
    const res = await vaciarCola(almacen, repo)
    if (res.ejecutadas > 0) {
      qc.invalidateQueries()
      const tablas = new Set(ops.flatMap(op => TABLAS_POR_METODO[op.metodo] ?? []))
      if (tablas.size) espejoBus.onEscritura?.([...tablas])
    }
  }, [almacen, repo, qc])

  useEffect(() => {
    void refrescarEstadoCola(almacen)
    void vaciar()
    const alVisible = () => { if (document.visibilityState === 'visible') void vaciar() }
    const reintentar = async () => { await reencolarErrores(almacen); await vaciar() }
    const descartar = () => { void descartarErrores(almacen).then(() => refrescarEstadoCola(almacen)) }
    window.addEventListener('online', vaciar)
    document.addEventListener('visibilitychange', alVisible)
    window.addEventListener('ft-cola-reintentar', reintentar as EventListener)
    window.addEventListener('ft-cola-descartar', descartar as EventListener)
    const timer = setInterval(() => { void vaciar() }, 30_000)
    return () => {
      window.removeEventListener('online', vaciar)
      document.removeEventListener('visibilitychange', alVisible)
      window.removeEventListener('ft-cola-reintentar', reintentar as EventListener)
      window.removeEventListener('ft-cola-descartar', descartar as EventListener)
      clearInterval(timer)
    }
  }, [vaciar, almacen])
  return null
}

export type { OperacionEnCola }
