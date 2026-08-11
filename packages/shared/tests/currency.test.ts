import { describe, expect, it } from 'vitest'
import { CURRENCIES, getCurrency, formatMoney } from '../src/currency'

describe('currency catalog', () => {
  it('contiene monedas clave', () => {
    const codes = CURRENCIES.map(c => c.code)
    for (const c of ['USD', 'MXN', 'EUR']) expect(codes).toContain(c)
  })
  it('getCurrency devuelve USD por defecto', () => {
    expect(getCurrency('USD').code).toBe('USD')
  })
  it('formatMoney formatea con símbolo y decimales', () => {
    const s = formatMoney(1234.5, 'USD')
    expect(s).toContain('$')
    expect(s).toContain('1,234')
  })
  it('getCurrency con código desconocido cae a USD', () => {
    expect(getCurrency('XXX').code).toBe('USD')
  })
})
