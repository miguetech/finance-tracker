import { createContext, useContext } from 'react'
import type { crearEspejo } from '../sync/espejo'
import type { TableName } from '../sheets/tables'

/** Valor del contexto del espejo, en módulo propio para evitar ciclos
 *  de importación entre queries.tsx y espejoContext.tsx. */
export interface EspejoCtxValue {
  /** Se incrementa tras cada pull; useOrigenLectura la combina con las
   *  fechas de las tablas de la sección para una versión granular. */
  version: number | string
  /** Flag VITE_ESPEJO=on, aunque el store aún no termine de cargar. */
  habilitado: boolean
  /** Store cargado y espejo creado: las lecturas pueden ir al espejo. */
  activo: boolean
  espejo: ReturnType<typeof crearEspejo> | null
  ultimoPull: number
  sincronizarAhora: (tablas?: TableName[], opts?: { forzar?: boolean }) => Promise<void>
  /** Pull dirigido SOLO de las tablas vencidas (>60 s o sin datos) de esta sección. */
  sincronizarTablas: (tablas: TableName[]) => Promise<void>
  /** Un batchGet está en vuelo: la barra de sync muestra actividad. */
  pullEnCurso: boolean
}

export const EspejoCtx = createContext<EspejoCtxValue>({
  version: 0,
  habilitado: false,
  activo: false,
  espejo: null,
  ultimoPull: 0,
  sincronizarAhora: async () => {},
  sincronizarTablas: async () => {},
  pullEnCurso: false
})

export function useEspejo(): EspejoCtxValue {
  return useContext(EspejoCtx)
}
