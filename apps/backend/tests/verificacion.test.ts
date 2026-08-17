import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createVerificador } from '../src/auth/verificacion'

const SECRET = 'secreto-de-prueba-123'
const EMAIL = 'resp@x.com'

function setup() {
  const store = new Map<string, unknown>()
  const enviar = vi.fn()
  const verif = createVerificador({ store: store as never, enviar })
  return { store, enviar, verif }
}

describe('createVerificador', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('iniciar guarda intento con exp TTL y llama enviar con 6 dígitos', () => {
    const { store, enviar, verif } = setup()
    const { intentoId } = verif.iniciar({ codigo: 'ANA-2026-ABCD', dispositivo: 'dev_x', email: EMAIL })
    expect(intentoId).toBeTruthy()
    expect(enviar).toHaveBeenCalledTimes(1)
    expect(enviar.mock.calls[0][0]).toBe(EMAIL)
    expect(enviar.mock.calls[0][1]).toMatch(/^\d{6}$/)
    const intento = store.get(intentoId) as { exp: number; verif: string }
    expect(intento).toBeTruthy()
    expect(intento.exp - Date.now()).toBe(10 * 60 * 1000)
    expect(intento.verif).toBe(enviar.mock.calls[0][1])
  })

  it('validar con código correcto devuelve el intento y lo borra', () => {
    const { store, enviar, verif } = setup()
    const { intentoId } = verif.iniciar({ codigo: 'ANA-2026-ABCD', dispositivo: 'dev_x', email: EMAIL })
    const code = enviar.mock.calls[0][1]
    const intento = verif.validar(intentoId, code)
    expect(intento).not.toBeNull()
    expect(intento?.codigo).toBe('ANA-2026-ABCD')
    expect(store.get(intentoId)).toBeUndefined()
  })

  it('validar con código equivocado → null y borra el intento', () => {
    const { store, verif } = setup()
    const { intentoId } = verif.iniciar({ codigo: 'ANA-2026-ABCD', dispositivo: 'dev_x', email: EMAIL })
    expect(verif.validar(intentoId, '000000')).toBeNull()
    expect(store.get(intentoId)).toBeUndefined()
  })

  it('validar expirado → null', () => {
    const { store, verif } = setup()
    const { intentoId } = verif.iniciar({ codigo: 'ANA-2026-ABCD', dispositivo: 'dev_x', email: EMAIL })
    vi.advanceTimersByTime(10 * 60 * 1000 + 1)
    const code = (store.get(intentoId) as { verif: string }).verif
    expect(verif.validar(intentoId, code)).toBeNull()
  })

  it('validar intento desconocido → null', () => {
    const { verif } = setup()
    expect(verif.validar('noexiste', '123456')).toBeNull()
  })
})