import React, { createContext, useEffect, useMemo, useRef, useState } from 'react'
import { crearEspejo, TABLAS_CALIENTES, type EspejoStore } from '../sync/espejo'
import type { TableName } from '../sheets/tables'
import { useRepo, _repoCtx as RepoCtx } from './queries'
import { useContext } from 'react'

/** TTL de refresco de tablas calientes. */
export const TABLAS_CALIENTES_TTL_MS = 60_000

interface EspejoCtx {
  activo: boolean
  espejo: ReturnType<typeof crearEspejo> | null
  ultimoPull: number
  sincronizarAhora: (tablas?: TableName[]) => Promise<void>
}

const Ctx = createContext<EspejoCtx>({ activo: false, espejo: null, ultimoPull: 0, sincronizarAhora: async () => {} })

export function useEspejo() { return useContext(Ctx) }

function fetchTableDesdeRepo(repo: ReturnType<typeof useRepo>, t: TableName): Promise<Record<string, string | number>[]> {
  const r = repo as unknown as Record<string, (a?: unknown) => Promise<unknown[]>>
  const mapa: Partial<Record<TableName, string>> = {
    Clientes: 'listClientes',
    Proveedores: 'listProveedores',
    Empleados: 'listEmpleados',
    Facturas: 'listFacturas',
    Factura_Items: 'listFacturasItems',
    Pagos: 'listPagos',
    Gastos: 'listGastos',
    Productos: 'listProductos',
    Cuentas_Pagar: 'listCxp'
  }
  const metodo = mapa[t]
  if (!metodo || typeof r[metodo] !== 'function') return Promise.resolve([])
  return r[metodo]() as Promise<Record<string, string | number>[]>
}

export function EspejoProvider({ flag, store = null, fetchTable, children }: {
  flag?: string
  store?: EspejoStore | null
  /** Override para tests; por defecto usa las listX del repositorio. */
  fetchTable?: (t: TableName) => Promise<Record<string, string | number>[]>
  children: React.ReactNode
}) {
  const repo = useContext(RepoCtx) // puede ser null en tests; fetchTable override lo evita
  const activo = flag === 'on' && !!store
  const [ultimoPull, setUltimoPull] = useState(0)
  const ultimoRef = useRef(0)

  const espejo = useMemo(() => {
    if (!activo) return null
    return crearEspejo({
      store,
      fetchTable: fetchTable ?? ((t) => (repo ? fetchTableDesdeRepo(repo, t) : Promise.resolve([])))
    })
  }, [activo, store, fetchTable])

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
    document.addEventListener('visibilitychange', alFoco)
    const timer = setInterval(alFoco, TABLAS_CALIENTES_TTL_MS)
    return () => { document.removeEventListener('visibilitychange', alFoco); clearInterval(timer) }
  }, [activo, espejo])

  return <Ctx.Provider value={{ activo, espejo, ultimoPull, sincronizarAhora }}>{children}</Ctx.Provider>
}
