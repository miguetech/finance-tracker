import type { ColumnSpec } from './tables'

export function serializeRow(spec: ColumnSpec[], obj: Record<string, unknown>): (string | number)[] {
  return spec.map(c => {
    const v = obj[c.key]
    if (v === undefined || v === null || v === '') return ''
    if (c.type === 'number') return Number(v)
    return String(v)
  })
}

export function deserializeRow(spec: ColumnSpec[], row: (string | number)[]): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  spec.forEach((c, i) => {
    const raw = row[i]
    if (raw === undefined || raw === null || raw === '') {
      out[c.key] = ''
      return
    }
    out[c.key] = c.type === 'number' ? Number(raw) : String(raw)
  })
  return out
}
