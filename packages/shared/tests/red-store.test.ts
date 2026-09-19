import { describe, expect, it, vi, beforeEach } from 'vitest'
import { marcarFalloRed, marcarRedOk, hayFalloRed, suscribirRed } from '../src/sync/redStore'

describe('redStore — fallo de red real', () => {
  beforeEach(() => {
    // Estado global: limpiar entre tests vía marcarRedOk (no hay reset público).
    marcarRedOk()
  })

  it('hayFalloRed inicia false y marcarFalloRed lo pone true', () => {
    expect(hayFalloRed()).toBe(false)
    marcarFalloRed()
    expect(hayFalloRed()).toBe(true)
  })

  it('marcarRedOk limpia el fallo', () => {
    marcarFalloRed()
    marcarRedOk()
    expect(hayFalloRed()).toBe(false)
  })

  it('notifica a los suscriptores con el nuevo estado', () => {
    const vistas: boolean[] = []
    const unsub = suscribirRed(v => vistas.push(v))
    marcarFalloRed()
    marcarRedOk()
    unsub()
    expect(vistas).toEqual([true, false])
  })

  it('no re-notifica si el estado no cambia', () => {
    const fn = vi.fn()
    const unsub = suscribirRed(fn)
    marcarFalloRed()
    marcarFalloRed()
    marcarFalloRed()
    unsub()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('unsubscribe detiene la notificación', () => {
    const fn = vi.fn()
    const unsub = suscribirRed(fn)
    unsub()
    marcarFalloRed()
    expect(fn).not.toHaveBeenCalled()
  })
})