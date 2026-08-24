import { createContext, useContext } from 'react'
import type { crearEspejo } from '../sync/espejo'
import type { TableName } from '../sheets/tables'

/** Valor del contexto del espejo, en módulo propio para evitar ciclos
 *  de importación entre queries.tsx y espejoContext.tsx. */
export interface EspejoCtxValue {
  /** Se incrementa tras cada pull del espejo: las queries lo meten en su
   *  queryKey para releer SIEMPRE que haya descarga nueva. */
  version: number
  /** Flag VITE_ESPEJO=on, aunque el store aún no termine de cargar. */
  habilitado: boolean
  /** Store cargado y espejo creado: las lecturas pueden ir al espejo. */
  activo: boolean
  espejo: ReturnType<typeof crearEspejo> | null
  ultimoPull: number
  sincronizarAhora: (tablas?: TableName[], opts?: { forzar?: boolean }) => Promise<void>
  /** Pull dirigido SOLO de las tablas vencidas (>60 s o sin datos) de esta sección. */
  sincronizarTablas: (tablas: TableName[]) => Promise<void>
}

export const EspejoCtx = createContext<EspejoCtxValue>({
  version: 0,
  habilitado: false,
  activo: false,
  espejo: null,
  ultimoPull: 0,
  sincronizarAhora: async () => {},
  sincronizarTablas: async () => {}
})

export function useEspejo(): EspejoCtxValue {
  return useContext(EspejoCtx)
}
