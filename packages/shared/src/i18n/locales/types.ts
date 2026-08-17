import type { messages } from '../messages'

export type Dict = { [k: string]: Dict | string }
export type MessageKey = NestedKeys<typeof messages>

type NestedKeys<T> = {
  [K in keyof T]: T[K] extends object ? `${K & string}.${NestedKeys<T[K]>}` : K & string
}[keyof T]
