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
    if (c.type === 'number') {
      const n = Number(raw)
      out[c.key] = Number.isFinite(n) ? n : 0
      return
    }
    out[c.key] = String(raw)
  })
  return out
}

export function migrateFacturaLegacyRow(row: (string | number)[]): (string | number)[] {
  const raw = [...row]
  const cell = raw[9]
  if (typeof cell === 'string' && cell !== '' && Number.isNaN(Number(cell))) {
    const total = Number(raw[8] ?? 0)
    raw[9] = cell === 'pagada' ? 0 : total
  }
  return raw
}
