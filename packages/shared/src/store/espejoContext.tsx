import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { crearEspejo, TABLAS_CALIENTES, type EspejoStore } from '../sync/espejo'
import { ddlDesdeTables } from '../sync/ddl'
import { espejoBus } from '../sync/espejoBus'
import { TABLAS_POR_METODO, ecoDe, ID_POR_TABLA, esErrorRed } from '../sync/colaEscrituras'
import type { TableName } from '../sheets/tables'
import { useRepo, _repoCtx as RepoCtx } from './queries'
import { EspejoCtx, type EspejoCtxValue } from './espejoReact'
import { useAppStore } from './appStore'
import { useContext } from 'react'

/** TTL de refresco de tablas calientes. */
export const TABLAS_CALIENTES_TTL_MS = 60_000

/** Query keys de react-query que se invalidan cuando el pull detecta
 *  cambios en cada tabla del espejo. */
export const QUERY_KEYS_POR_TABLA: Partial<Record<TableName, readonly string[]>> = {
  Clientes: ['clientes'],
  Empleados: ['empleados'],
  Asistencias: ['asistencias'],
  Facturas: ['facturas', 'factura'],
  Factura_Items: ['factura'],
  Pagos: ['pagos'],
  Gastos: ['gastos'],
  Productos: ['productos']
}

function fetchTablasDesdeRepo(repo: ReturnType<typeof useRepo> | null, ts: TableName[]): Promise<Partial<Record<TableName, Record<string, string | number>[] | null>>> {
  const r = repo as unknown as {
    leerVariasTablas?: (ts: TableName[]) => Promise<Partial<Record<TableName, Record<string, string | number>[]>>>
  } | null
  if (!r) return Promise.resolve({})
  // Vía rápida: un batchGet para todas. Tablas sin listX quedan fuera (null).
  const conOrigen = ts.filter(t => TABLA_CON_LISTX.has(t))
  if (!conOrigen.length || typeof r.leerVariasTablas !== 'function') {
    // Fallback per-table para repos falsos de tests.
    return Promise.resolve(Object.fromEntries(ts.map(t => [t, TABLA_CON_LISTX.has(t) ? [] : null])))
  }
  return r.leerVariasTablas(conOrigen).then(res => {
    const out: Partial<Record<TableName, Record<string, string | number>[] | null>> = {}
    for (const t of ts) out[t] = TABLA_CON_LISTX.has(t) ? res[t] ?? [] : null
    return out
  })
}

const TABLA_CON_LISTX: ReadonlySet<TableName> = new Set<TableName>([
  'Clientes', 'Proveedores', 'Empleados', 'Facturas', 'Factura_Items', 'Pagos', 'Gastos',
  'Productos', 'Cuentas_Pagar', 'Gastos_Fijos', 'Tasas_Historial', 'Nomina_Detalles',
  'Usuarios', 'Codigos_Acceso', 'Dispositivos', 'Asistencias'
])
// Config (clave/valor) y Movimientos_Stock (requiere id) quedan fuera del espejo en Fase A.

export function EspejoProvider({ flag, store = null, fetchTablas: fetchTablasOverride, children }: {
  flag?: string
  store?: EspejoStore | null
  /** Override para tests; por defecto un batchGet del repositorio. */
  fetchTablas?: (ts: TableName[]) => Promise<Partial<Record<TableName, Record<string, string | number>[] | null>>>
  children: React.ReactNode
}) {
  const repo = useContext(RepoCtx) // puede ser null en tests; fetchTable override lo evita
  const qc = useQueryClient()
  const habilitado = flag === 'on'
  const activo = habilitado && !!store
  const [ultimoPull, setUltimoPull] = useState(0)
  const ultimoRef = useRef(0)

  const espejo = useMemo(() => {
    if (!activo) return null
    return crearEspejo({
      store,
      fetchTablas: fetchTablasOverride ?? ((ts) => fetchTablasDesdeRepo(repo, ts)),
      onCambio: (tablas) => {
        for (const t of tablas) {
          const keys = QUERY_KEYS_POR_TABLA[t]
          if (!keys) continue
          for (const key of keys) void qc.invalidateQueries({ queryKey: [key] })
        }
      }
    })
  }, [activo, store, fetchTablasOverride, repo, qc])

  // Cuota de Sheets agotada: pausa los pulls automáticos 90 s. El botón
  // manual de sincronización la ignora.
  const cooldownRef = useRef(0)

  const sincronizarAhora = async (tablas?: TableName[], opts?: { forzar?: boolean }) => {
    if (!espejo) return
    if (!opts?.forzar) {
      if (Date.now() < cooldownRef.current) return
      // Sin red: los pulls solo generan errores (y tormenta de 429 al volver).
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    }
    try {
      await espejo.pull(tablas ?? (ultimoRef.current === 0 ? undefined : TABLAS_CALIENTES))
      cooldownRef.current = 0
      ultimoRef.current = espejo.estado().ultimoPull
      setUltimoPull(ultimoRef.current)
    } catch (e) {
      if (esErrorRed(e)) {
        cooldownRef.current = Date.now() + 90_000
        console.debug('[espejo] pull en pausa por red/cuota hasta', new Date(cooldownRef.current).toLocaleTimeString())
        return
      }
      throw e
    }
  }

  /** Escritura encolada offline: inserta/reemplaza la fila del eco en el
   *  espejo local para que la UI la muestre ya guardada. El próximo pull
   *  con red reescribe las tablas tocadas con la verdad de Sheets. */
  const aplicarEscrituraLocal = async (metodo: string, args: unknown[]) => {
    if (!store) return
    const tablas = TABLAS_POR_METODO[metodo]
    if (!tablas?.length) return
    const eco = ecoDe(metodo, args, { configActual: () => useAppStore.getState().config ?? null })
    if (!eco) return
    const tabla = tablas.find(t => ID_POR_TABLA[t])
    if (!tabla) return
    const idKey = ID_POR_TABLA[tabla]!
    try {
      await store.init(ddlDesdeTables().flatMap(d => [d.create, ...d.indexes]))
      const filas = await store.getAllRows(tabla)
      const nueva = { ...eco } as Record<string, string | number>
      const resto = filas.filter(f => String(f[idKey]) !== String(nueva[idKey]))
      await store.replaceTable(tabla, [...resto, nueva])
      for (const key of QUERY_KEYS_POR_TABLA[tabla] ?? []) void qc.invalidateQueries({ queryKey: [key] })
      if (tabla === 'Facturas') void qc.invalidateQueries({ queryKey: ['facturas'] })
    } catch { /* espejo no disponible: la fila aparecerá tras sincronizar */ }
  }

  useEffect(() => {
    if (!activo || !espejo) return
    void sincronizarAhora() // arranque: full pull
    const alFoco = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      if (Date.now() - ultimoRef.current >= TABLAS_CALIENTES_TTL_MS) void sincronizarAhora(TABLAS_CALIENTES)
    }
    espejoBus.onEscritura = (tablas) => { void sincronizarAhora(tablas) }
    espejoBus.onEscrituraLocal = (metodo, args) => { void aplicarEscrituraLocal(metodo, args) }
    document.addEventListener('visibilitychange', alFoco)
    const timer = setInterval(alFoco, TABLAS_CALIENTES_TTL_MS)
    return () => {
      espejoBus.onEscritura = undefined
      espejoBus.onEscrituraLocal = undefined
      document.removeEventListener('visibilitychange', alFoco)
      clearInterval(timer)
    }
  }, [activo, espejo])

  const value: EspejoCtxValue = { habilitado, activo, espejo, ultimoPull, sincronizarAhora }
  return <EspejoCtx.Provider value={value}>{children}</EspejoCtx.Provider>
}

export { useEspejo } from './espejoReact'
