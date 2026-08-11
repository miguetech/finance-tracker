import { describe, expect, it } from 'vitest'
import { uid } from '../src/lib/uid'
import { ClienteSchema, FacturaInputSchema } from '../src/types/schemas'

describe('uid', () => {
  it('genera prefijo + base36 largo', () => {
    const id = uid('cli_')
    expect(id.startsWith('cli_')).toBe(true)
    expect(id.length).toBeGreaterThan(8)
  })
  it('genera ids distintos', () => {
    expect(uid('cli_')).not.toBe(uid('cli_'))
  })
})

describe('schemas', () => {
  it('ClienteSchema exige nombre', () => {
    expect(ClienteSchema.safeParse({ rfc: 'X' }).success).toBe(false)
    expect(ClienteSchema.safeParse({ nombre: 'ACME' }).success).toBe(true)
  })
  it('FacturaInputSchema exige >=1 item completo y cantidad>0', () => {
    const base = { id_cliente: 'cli_1', fecha_emision: '2026-08-11', items: [] }
    expect(FacturaInputSchema.safeParse(base).success).toBe(false)
    const ok = { ...base, items: [{ descripcion: 'srv', cantidad: 2, precio_unitario: 100 }] }
    expect(FacturaInputSchema.safeParse(ok).success).toBe(true)
    const mal = { ...base, items: [{ descripcion: 'srv', cantidad: 0, precio_unitario: -1 }] }
    expect(FacturaInputSchema.safeParse(mal).success).toBe(false)
  })
})
