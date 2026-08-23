import { createContext, useContext } from 'react'
import type { crearEspejo } from '../sync/espejo'
import type { TableName } from '../sheets/tables'

/** Valor del contexto del espejo, en módulo propio para evitar ciclos
 *  de importación entre queries.tsx y espejoContext.tsx. */
export interface EspejoCtxValue {
  /** Flag VITE_ESPEJO=on, aunque el store aún no termine de cargar. */
  habilitado: boolean
  /** Store cargado y espejo creado: las lecturas pueden ir al espejo. */
  activo: boolean
  espejo: ReturnType<typeof crearEspejo> | null
  ultimoPull: number
  sincronizarAhora: (tablas?: TableName[]) => Promise<void>
}

export const EspejoCtx = createContext<EspejoCtxValue>({
  habilitado: false,
  activo: false,
  espejo: null,
  ultimoPull: 0,
  sincronizarAhora: async () => {}
})

export function useEspejo(): EspejoCtxValue {
  return useContext(EspejoCtx)
}
