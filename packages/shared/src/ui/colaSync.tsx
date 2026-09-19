import { useCallback, useEffect, useSyncExternalStore, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Repository } from '../data/repository'
import type { StorageAdapter } from '../data/storage'
import { espejoBus } from '../sync/espejoBus'
import { vaciarCola, refrescarEstadoCola, reencolarErrores, descartarErrores, descartarOp, suscribirCola, estadoColaActual, TABLAS_POR_METODO, cargarCola } from '../sync/colaEscrituras'
import type { OperacionEnCola } from '../sync/colaEscrituras'
import { useI18n } from '../i18n'

/** Chip fijo con escrituras pendientes/fallidas del modo offline. */
export function ColaBubble({ onReintentar, onDescartar }: {
  onReintentar?: () => void
  onDescartar?: () => void
}) {
  const { t } = useI18n()
  const estado = useSyncExternalStore(suscribirCola, estadoColaActual)
  const [detalleAbierto, setDetalleAbierto] = useState(false)
  if (!estado.pendientes && !estado.errores) return null
  const disparar = (evento: string) => window.dispatchEvent(new CustomEvent(evento))
  return (
    <>
      <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-full bg-surface border border-gray-200 shadow-lg px-3 py-1.5 text-xs">
        <span className={estado.errores ? 'text-red-600 font-medium' : 'text-amber-600'}>
          {estado.errores
            ? t('cola.conError').replace('{n}', String(estado.errores))
            : t('cola.pendientes').replace('{n}', String(estado.pendientes))}
        </span>
        <button className="text-gray-500 hover:underline" onClick={() => setDetalleAbierto(a => !a)}>{t('cola.detalle')}</button>
        {estado.errores > 0 && (
          <>
            <button className="text-blue-600 hover:underline" onClick={() => (onReintentar ?? (() => disparar('ft-cola-reintentar')))()}>{t('cola.reintentar')}</button>
            <button className="text-gray-500 hover:underline" onClick={() => (onDescartar ?? (() => disparar('ft-cola-descartar')))()}>{t('cola.descartar')}</button>
          </>
        )}
      </div>
      {detalleAbierto && <PanelCola onClose={() => setDetalleAbierto(false)} />}
    </>
  )
}

// Almacén de la cola: lo inyecta SincronizadorCola (mismo host que monta el
// chip) para que el panel lea las operaciones sin prop drilling.
let almacenCola: StorageAdapter | null = null

interface FilaOp { op: OperacionEnCola; confirmar: boolean }

/** Lista legible de la cola: qué operación es, cuándo se creó y por qué falló.
 *  El descarte exige un segundo clic (nada se pierde por accidente). */
export function PanelCola({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const [filas, setFilas] = useState<FilaOp[]>([])
  const almacen = almacenCola

  const recargar = useCallback(async () => {
    if (!almacen) return
    const ops = await cargarCola(almacen)
    // Errores primero (lo urgente), luego pendientes; viejas arriba.
    ops.sort((a, b) => (a.estado === b.estado ? a.creado_en - b.creado_en : a.estado === 'error' ? -1 : 1))
    setFilas(ops.map(op => ({ op, confirmar: false })))
  }, [almacen])

  useEffect(() => { void recargar() }, [recargar])

  const etiqueta = (metodo: string): string => {
    const clave = `cola.metodos.${metodo}`
    const texto = t(clave as Parameters<typeof t>[0])
    return texto === clave ? metodo : texto
  }
  const hora = (ms: number): string =>
    new Date(ms).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="fixed bottom-16 left-4 z-50 w-96 max-w-[calc(100vw-2rem)] rounded-xl bg-surface border border-gray-200 shadow-2xl p-4 text-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold">{t('cola.detalle')}</span>
        <button className="text-gray-400 hover:text-gray-600" onClick={onClose}>{t('cola.cerrar')}</button>
      </div>
      {!almacen && <p className="text-xs text-gray-500">{t('cola.sinDetalle')}</p>}
      {almacen && filas.length === 0 && <p className="text-xs text-gray-500">{t('cola.sinDetalle')}</p>}
      <ul className="space-y-2 max-h-80 overflow-y-auto">
        {filas.map(({ op, confirmar }, i) => (
          <li key={op.id_op} className={`rounded-lg border p-2 ${op.estado === 'error' ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-white'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium truncate">{etiqueta(op.metodo)}</div>
                <div className="text-xs text-gray-500">{hora(op.creado_en)}</div>
                {op.error && (
                  <div className="text-xs text-red-600 mt-1 break-words">
                    <span className="font-medium">{t('cola.errorRotulo')}:</span> {op.error}
                  </div>
                )}
              </div>
              <button
                className={`shrink-0 text-xs px-2 py-1 rounded-md border ${confirmar ? 'border-red-300 bg-red-100 text-red-700 font-medium' : 'border-gray-200 text-gray-500 hover:bg-muted'}`}
                onClick={() => {
                  if (!confirmar) {
                    setFilas(fs => fs.map((f, j) => (j === i ? { ...f, confirmar: true } : f)))
                    return
                  }
                  if (almacen) void descartarOp(almacen, op.id_op).then(recargar)
                }}
              >
                {confirmar ? t('cola.descartarSeguro') : t('cola.descartarUna')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Reaplica los ecos de la cola pendiente sobre el espejo local (sin red).
 * Tras una recarga de página, los registros guardados offline vuelven a
 * pintarse aunque el snapshot del espejo sea anterior a esos registros.
 */
export async function repetirEcosLocales(almacen: StorageAdapter): Promise<number> {
  // Solo pendientes: una op con error aún no se decidió, pero reproducir ecos
  // de ops YA sincronizadas insertaba filas fantasma sobre el espejo fresco.
  const ops = (await cargarCola(almacen)).filter(o => o.estado === 'pendiente')
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
  // El panel de detalle lee la cola desde esta referencia (mismo módulo).
  almacenCola = almacen
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
      // Pull FORZADO: al reconectar el cooldown suele estar armado por los
      // pulls fallidos de la desconexión; sin esto el espejo quedaría viejo.
      if (tablas.size) espejoBus.onFlushCompletado?.([...tablas])
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
