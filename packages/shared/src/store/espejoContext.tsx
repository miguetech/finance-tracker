import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { crearEspejo, TABLAS_CALIENTES, type EspejoStore } from '../sync/espejo'
import { espejoBus } from '../sync/espejoBus'
import type { TableName } from '../sheets/tables'
import { useRepo, _repoCtx as RepoCtx } from './queries'
import { EspejoCtx, type EspejoCtxValue } from './espejoReact'
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
    await espejo.pull(tablas ?? (ultimoRef.current === 0 ? undefined : TABLAS_CALIENTES))
    ultimoRef.current = espejo.estado().ultimoPull
    setUltimoPull(ultimoRef.current)
  }

  useEffect(() => {
    if (!activo || !espejo) return
    void sincronizarAhora() // arranque: full pull
    const alFoco = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      if (Date.now() - ultimoRef.current >= TABLAS_CALIENTES_TTL_MS) void sincronizarAhora(TABLAS_CALIENTES)
    }
    espejoBus.onEscritura = (tablas) => { void sincronizarAhora(tablas) }
    document.addEventListener('visibilitychange', alFoco)
    const timer = setInterval(alFoco, TABLAS_CALIENTES_TTL_MS)
    return () => {
      espejoBus.onEscritura = undefined
      document.removeEventListener('visibilitychange', alFoco)
      clearInterval(timer)
    }
  }, [activo, espejo])

  const value: EspejoCtxValue = { habilitado, activo, espejo, ultimoPull, sincronizarAhora }
  return <EspejoCtx.Provider value={value}>{children}</EspejoCtx.Provider>
}

export { useEspejo } from './espejoReact'
