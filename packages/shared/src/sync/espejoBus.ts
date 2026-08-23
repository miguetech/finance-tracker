import type { TableName } from '../sheets/tables'

/** Bus mínimo para que las mutaciones (queries.tsx) avisen al espejo
 *  sin acoplamiento circular: el provider registra el handler. */
export const espejoBus: { onEscritura?: (tablas: TableName[]) => void } = {}
