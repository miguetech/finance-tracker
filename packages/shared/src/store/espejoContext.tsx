import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { crearEspejo, TABLAS_CALIENTES, type EspejoStore } from '../sync/espejo'
import { ddlDesdeTables } from '../sync/ddl'
import { espejoBus } from '../sync/espejoBus'
import { TABLAS_POR_METODO, ecoDe, ID_POR_TABLA, BAJAS_POR_METODO, esErrorRed } from '../sync/colaEscrituras'
import type { TableName } from '../sheets/tables'
import { useRepo, _repoCtx as RepoCtx } from './queries'
import { EspejoCtx, type EspejoCtxValue } from './espejoReact'
import { useAppStore } from './appStore'
import { useContext } from 'react'

/** TTL de refresco de tablas calientes. */
export const TABLAS_CALIENTES_TTL_MS = 60_000

/** TTL por sección: al abrir una pantalla, sus tablas se piden si están vencidas. */
export const TTL_SECCION_MS = 60_000

/** Query keys de react-query que se invalidan cuando el pull detecta
 *  cambios en cada tabla del espejo. */
export const QUERY_KEYS_POR_TABLA: Partial<Record<TableName, readonly string[]>> = {
  Clientes: ['clientes'],
  Proveedores: ['proveedores'],
  Empleados: ['empleados'],
  Asistencias: ['asistencias'],
  Facturas: ['facturas', 'factura', 'reportes', 'reporteFinanciero', 'ventasProducto'],
  Factura_Items: ['factura', 'reporteFinanciero', 'reportesInventario'],
  Pagos: ['pagos', 'reportes', 'reporteFinanciero'],
  Gastos: ['gastos', 'reportes', 'reporteFinanciero'],
  Productos: ['productos', 'movimientos', 'reportesInventario'],
  Cuentas_Pagar: ['cxp', 'cxpById', 'reportes', 'reporteFinanciero'],
  Movimientos_Stock: ['movimientos', 'reportesInventario']
}

// Duplicados deliberados arriba se colapsan al recorrer el array.
void QUERY_KEYS_POR_TABLA

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
      // Invalidar SIEMPRE tras descarga (hash igual incluido): el refetch lee
      // el espejo local (<5 ms) y evita pantallas con el estado previo.
      onDescarga: (tablas) => {
        for (const t of tablas) {
          const keys = QUERY_KEYS_POR_TABLA[t]
          if (!keys) continue
          for (const key of keys) void qc.invalidateQueries({ queryKey: [key] })
        }
      },
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
      // Cuota agotada: pausa larga. Otros fallos transitorios: pausa corta,
      // para que los automáticos no queden silenciados medio minuto.
      if (esErrorRed(e)) {
        const cuota = /429|RESOURCE_EXHAUSTED/i.test(e instanceof Error ? e.message : String(e))
        cooldownRef.current = Date.now() + (cuota ? 90_000 : 15_000)
        console.debug('[espejo] pull en pausa por red/cuota hasta', new Date(cooldownRef.current).toLocaleTimeString())
        return
      }
      throw e
    }
  }

  // Ecos que llegaron antes de que el store terminara de cargar: se aplican
  // en cuanto exista, si no se perderían hasta la recarga.
  const ecosPendientesRef = useRef<Array<{ metodo: string; args: unknown[] }>>([])

  /** Escritura encolada offline: inserta/reemplaza la fila del eco en el
   *  espejo local para que la UI la muestre ya guardada. El próximo pull
   *  con red reescribe las tablas tocadas con la verdad de Sheets. */
  const aplicarEscrituraLocal = async (metodo: string, args: unknown[]) => {
    if (!store) {
      ecosPendientesRef.current.push({ metodo, args })
      return
    }
    const tablas = TABLAS_POR_METODO[metodo]
    if (!tablas?.length) return

    // Baja: quitar la fila del espejo (y los items si es factura).
    const baja = BAJAS_POR_METODO[metodo]
    if (baja) {
      try {
        await store.init(ddlDesdeTables().flatMap(d => [d.create, ...d.indexes]))
        const idBaja = String(args[0])
        const filas = await store.getAllRows(baja.tabla)
        await store.replaceTable(baja.tabla, filas.filter(f => String(f[baja.idKey]) !== idBaja))
        if (baja.tabla === 'Facturas') {
          const items = await store.getAllRows('Factura_Items')
          await store.replaceTable('Factura_Items', items.filter(i => String(i.id_factura) !== idBaja))
        }
        for (const key of QUERY_KEYS_POR_TABLA[baja.tabla] ?? []) void qc.invalidateQueries({ queryKey: [key] })
      } catch { /* la baja llegará con el pull al reconectar */ }
      return
    }

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
    // Aplica los ecos que llegaron antes de que el store estuviera listo.
    for (const p of ecosPendientesRef.current.splice(0)) {
      void aplicarEscrituraLocal(p.metodo, p.args)
    }
    void sincronizarAhora() // arranque: full pull
    const alFoco = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      if (Date.now() - ultimoRef.current >= TABLAS_CALIENTES_TTL_MS) void sincronizarAhora(TABLAS_CALIENTES)
    }
    espejoBus.onEscritura = (tablas) => { void sincronizarAhora(tablas) }
    espejoBus.onFlushCompletado = (tablas) => { void sincronizarAhora(tablas, { forzar: true }) }
    espejoBus.onEscrituraLocal = (metodo, args) => { void aplicarEscrituraLocal(metodo, args) }
    document.addEventListener('visibilitychange', alFoco)
    const timer = setInterval(alFoco, TABLAS_CALIENTES_TTL_MS)
    return () => {
      espejoBus.onEscritura = undefined
      espejoBus.onFlushCompletado = undefined
      espejoBus.onEscrituraLocal = undefined
      document.removeEventListener('visibilitychange', alFoco)
      clearInterval(timer)
    }
  }, [activo, espejo])

  /** Sync perezoso por pantalla: solo trae las tablas vencidas de la sección. */
  const sincronizarTablas = async (tablas: TableName[]) => {
    if (!espejo) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    if (Date.now() < cooldownRef.current) return
    const fechas = espejo.fechasPorTabla()
    const viejas = tablas.filter(t => Date.now() - (fechas[t] ?? 0) > TTL_SECCION_MS)
    if (!viejas.length) return
    try {
      await espejo.pull(viejas)
      cooldownRef.current = 0
      ultimoRef.current = espejo.estado().ultimoPull
      setUltimoPull(ultimoRef.current)
    } catch (e) {
      if (esErrorRed(e)) {
        cooldownRef.current = Date.now() + (/429|RESOURCE_EXHAUSTED/i.test(String(e)) ? 90_000 : 15_000)
      }
    }
  }

  const value: EspejoCtxValue = { version: ultimoPull, habilitado, activo, espejo, ultimoPull, sincronizarAhora, sincronizarTablas }
  return <EspejoCtx.Provider value={value}>{children}</EspejoCtx.Provider>
}

export { useEspejo } from './espejoReact'
