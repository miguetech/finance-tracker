import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { crearEspejo, TABLAS_CALIENTES, type EspejoStore } from '../sync/espejo'
import { ddlDesdeTables } from '../sync/ddl'
import { espejoBus } from '../sync/espejoBus'
import { TABLAS_POR_METODO, ecoDe, ID_POR_TABLA } from '../sync/colaEscrituras'
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

function fetchTableDesdeRepo(repo: ReturnType<typeof useRepo> | null, t: TableName): Promise<Record<string, string | number>[] | null> {
  const r = repo as unknown as Record<string, (a?: unknown) => Promise<unknown[]>> | null
  if (!r) return Promise.resolve(null)
  // Tablas con listX directo en el repositorio.
  const mapa: Partial<Record<TableName, string>> = {
    Clientes: 'listClientes',
    Proveedores: 'listProveedores',
    Empleados: 'listEmpleados',
    Facturas: 'listFacturas',
    Factura_Items: 'listFacturasItems',
    Pagos: 'listPagos',
    Gastos: 'listGastos',
    Productos: 'listProductos',
    Cuentas_Pagar: 'listCxp',
    Gastos_Fijos: 'listGastosFijos',
    Tasas_Historial: 'listTasasHistorial',
    Nomina_Detalles: 'listNominaDetalles',
    Usuarios: 'listUsuarios',
    Codigos_Acceso: 'listCodigos',
    Dispositivos: 'listDispositivos',
    Asistencias: 'listAsistencias'
  }
  // Config (clave/valor) y Movimientos_Stock (requiere id) quedan fuera del espejo en Fase A.
  const metodo = mapa[t]
  if (!metodo || typeof r[metodo] !== 'function') return Promise.resolve(null)
  return r[metodo]() as Promise<Record<string, string | number>[]>
}

export function EspejoProvider({ flag, store = null, fetchTable, children }: {
  flag?: string
  store?: EspejoStore | null
  /** Override para tests; por defecto usa las listX del repositorio. */
  fetchTable?: (t: TableName) => Promise<Record<string, string | number>[] | null>
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
      fetchTable: fetchTable ?? ((t) => (repo ? fetchTableDesdeRepo(repo, t) : Promise.resolve([]))),
      onCambio: (tablas) => {
        for (const t of tablas) {
          const keys = QUERY_KEYS_POR_TABLA[t]
          if (!keys) continue
          for (const key of keys) void qc.invalidateQueries({ queryKey: [key] })
        }
      }
    })
  }, [activo, store, fetchTable, repo, qc])

  const sincronizarAhora = async (tablas?: TableName[]) => {
    if (!espejo) return
    // Sin red: los pulls solo generan errores (y tormenta de 429 al volver).
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    await espejo.pull(tablas ?? (ultimoRef.current === 0 ? undefined : TABLAS_CALIENTES))
    ultimoRef.current = espejo.estado().ultimoPull
    setUltimoPull(ultimoRef.current)
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
