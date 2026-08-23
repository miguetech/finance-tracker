import { describe, expect, it } from 'vitest'
import {
  cargarRegistroSesion,
  guardarRegistroSesion,
  borrarRegistroSesion,
  configurarPin,
  verificarPin,
  desbloqueoPermitido,
  pinValido,
  VENTANA_OFFLINE_MS
} from '../src/auth/sesionOffline'
import type { RegistroSesion } from '../src/auth/sesionOffline'
import type { StorageAdapter } from '../src/data/storage'

function kvFalso(): StorageAdapter & { mapa: Map<string, string> } {
  const mapa = new Map<string, string>()
  return {
    mapa,
    get: async k => mapa.get(k) ?? null,
    set: async (k, v) => { mapa.set(k, v) },
    remove: async k => { mapa.delete(k) }
  }
}

describe('sesión offline — registro local', () => {
  it('guarda, carga y borra el registro', async () => {
    const s = kvFalso()
    expect(await cargarRegistroSesion(s)).toBeNull()
    await guardarRegistroSesion(s, { cuenta: 'dueño@test.com', creado_en: 100, ultimo_pull: 200 })
    const reg = await cargarRegistroSesion(s)
    expect(reg?.cuenta).toBe('dueño@test.com')
    expect(reg?.creado_en).toBe(100)
    expect(reg?.ultimo_pull).toBe(200)
    await borrarRegistroSesion(s)
    expect(await cargarRegistroSesion(s)).toBeNull()
  })

  it('actualizar el registro conserva el PIN configurado', async () => {
    const s = kvFalso()
    await guardarRegistroSesion(s, { cuenta: 'a@b.c' })
    await configurarPin(s, '1234')
    await guardarRegistroSesion(s, { cuenta: 'a@b.c', ultimo_pull: 555 })
    const reg = await cargarRegistroSesion(s)
    expect(reg?.pin).toBeTruthy()
    expect(reg?.ultimo_pull).toBe(555)
  })

  it('JSON corrupto se trata como sin sesión', async () => {
    const s = kvFalso()
    await s.set('ft_sesion_local', '{roto')
    expect(await cargarRegistroSesion(s)).toBeNull()
  })
})

describe('sesión offline — PIN (PBKDF2 WebCrypto)', () => {
  it('valida formato de 4 a 6 dígitos', () => {
    expect(pinValido('1234')).toBe(true)
    expect(pinValido('123456')).toBe(true)
    expect(pinValido('123')).toBe(false)
    expect(pinValido('1234567')).toBe(false)
    expect(pinValido('12a4')).toBe(false)
  })

  it('configura y verifica PIN correcto; rechaza incorrecto', async () => {
    const s = kvFalso()
    await guardarRegistroSesion(s, { cuenta: 'a@b.c' })
    await configurarPin(s, '9876')
    expect(await verificarPin(s, '9876')).toBe(true)
    expect(await verificarPin(s, '9875')).toBe(false)
    expect(await verificarPin(s, '98761')).toBe(false)
  })

  it('rechaza PIN inválido o sin registro previo', async () => {
    const s = kvFalso()
    await expect(configurarPin(s, 'abcd')).rejects.toThrow()
    await guardarRegistroSesion(s, { cuenta: 'a@b.c' })
    await expect(configurarPin(s, '12')).rejects.toThrow()
  })
})

describe('sesión offline — ventana de desbloqueo', () => {
  const reg = (extra: Partial<RegistroSesion>): RegistroSesion => ({ cuenta: 'x@y.z', creado_en: 0, ultimo_pull: 0, ...extra })

  it('con PIN configurado siempre permite', () => {
    const ahora = Date.now()
    expect(desbloqueoPermitido(reg({ pin: { salt: 's', hash: 'h', iteraciones: 1 }, ultimo_pull: 0 }), ahora)).toBe(true)
  })

  it('sin PIN exige pull en las últimas 24 h', () => {
    const ahora = 10_000_000
    expect(desbloqueoPermitido(reg({ ultimo_pull: ahora - 1000 }), ahora)).toBe(true)
    expect(desbloqueoPermitido(reg({ ultimo_pull: ahora - VENTANA_OFFLINE_MS - 1 }), ahora)).toBe(false)
  })
})
