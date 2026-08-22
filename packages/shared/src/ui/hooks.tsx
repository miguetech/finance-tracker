import React, { useCallback, useEffect, useRef, useState } from 'react'

/** Indica si el navegador tiene conexión de red. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

/**
 * Guard para modales: expone `guardando` (bloquea el botón al primer submit),
 * `guardar()` idempotente y validación anti-duplicados por clave.
 */
export function useSaveGuard(): {
  guardando: boolean
  guardar: (fn: () => Promise<void>, opts?: { dedupeKey?: string; clavesExistentes?: string[]; mensajeDuplicado?: string }) => Promise<boolean>
} {
  const [guardando, setGuardando] = useState(false)
  const enCurso = useRef(false)

  const guardar = useCallback(async (
    fn: () => Promise<void>,
    opts?: { dedupeKey?: string; clavesExistentes?: string[]; mensajeDuplicado?: string }
  ): Promise<boolean> => {
    if (enCurso.current || guardando) return false
    if (opts?.dedupeKey && opts.clavesExistentes?.some(k => k.trim().toLowerCase() === opts.dedupeKey!.trim().toLowerCase())) {
      throw new Error(opts.mensajeDuplicado ?? 'Ya existe un registro con ese nombre')
    }
    enCurso.current = true
    setGuardando(true)
    try {
      await fn()
      return true
    } finally {
      enCurso.current = false
      setGuardando(false)
    }
  }, [guardando])

  return { guardando, guardar }
}

/** Permiso de notificaciones del navegador + envío simple de recordatorios. */
export function useNotificaciones(): {
  soportadas: boolean
  permiso: NotificationPermission | 'unsupported'
  activar: () => Promise<void>
  notificar: (titulo: string, cuerpo?: string) => void
  desactivar: () => void
} {
  const soportadas = typeof window !== 'undefined' && 'Notification' in window
  const [permiso, setPermiso] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  )
  const activar = async () => {
    if (!soportadas) return
    const p = await Notification.requestPermission()
    setPermiso(p)
  }
  const desactivar = () => setPermiso(Notification.permission)
  const notificar = (titulo: string, cuerpo?: string) => {
    if (!soportadas || Notification.permission !== 'granted') return
    new Notification(titulo, { body: cuerpo })
  }
  return { soportadas, permiso, activar, notificar, desactivar }
}

/** Alerta fija "Trabajando sin conexión" cuando no hay red (datos locales). */
export function OfflineBanner(): React.ReactElement | null {
  const online = useOnline()
  if (online) return null
  return (
    <div role="alert" className="fixed top-0 inset-x-0 z-[60] bg-amber-500 text-white text-sm font-medium text-center px-4 py-1.5 shadow">
      ⚠ Trabajando sin conexión — verifica tu red para sincronizar con la hoja de cálculo
    </div>
  )
}
