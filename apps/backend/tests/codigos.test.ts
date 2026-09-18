import { describe, expect, it, vi } from 'vitest'
import { jwtVerify } from 'jose'
import type { CodigoAcceso, Repository } from '@ft/shared'
import { emitirSessionJwt, verificarSessionJwt, intercambiarCodigo } from '../src/auth/codigos'

const SECRET = 'secreto-de-prueba-123'
const HOY = '2026-08-17'
const OWNER = 'owner@ft.com'

function codigo(overrides: Partial<CodigoAcceso> = {}): CodigoAcceso {
  return {
    codigo: 'FT-2026-ABCD',
    rol: 'asistente',
    modulos_ver: 'facturas,clientes',
    modulos_editar: 'facturas',
    expires_at: '2026-12-31',
    max_uses: '5',
    usos: '5',
    responsable: 'owner@ft.com',
    email: 'invitado@x.com',
    creado: '2026-01-01',
    activo: 'true',
    ...overrides
  }
}

function fakeRepo(codigos: CodigoAcceso[], saved: Partial<CodigoAcceso>[] = []): Repository {
  return {
    listCodigos: async () => codigos,
    saveCodigo: async (c: Partial<CodigoAcceso>) => { saved.push(c); return c as CodigoAcceso }
  } as unknown as Repository
}

describe('emitirSessionJwt / verificarSessionJwt', () => {
  it('round-trip: verifica claims y exp de 24h', async () => {
    const token = await emitirSessionJwt(SECRET, {
      sub: 'FT-2026-ABCD',
      rol: 'asistente',
      modulos_ver: 'facturas,clientes',
      modulos_editar: 'facturas',
      owner: OWNER
    })
    const claims = await verificarSessionJwt(SECRET, token)
    expect(claims.sub).toBe('FT-2026-ABCD')
    expect(claims.rol).toBe('asistente')
    expect(claims.modulos_ver).toBe('facturas,clientes')
    expect(claims.modulos_editar).toBe('facturas')
    expect(claims.owner).toBe(OWNER)
    const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET))
    expect(payload.exp! - payload.iat!).toBe(24 * 3600)
  })

  it('rechaza token firmado con otra clave', async () => {
    const token = await emitirSessionJwt('otra-clave', { sub: 'FT-2026-ABCD', rol: 'asistente', modulos_ver: '', modulos_editar: '', owner: OWNER })
    await expect(verificarSessionJwt(SECRET, token)).rejects.toThrow('Sesión inválida')
  })

  it('rechaza token manipulada', async () => {
    const token = await emitirSessionJwt(SECRET, { sub: 'FT-2026-ABCD', rol: 'asistente', modulos_ver: '', modulos_editar: '', owner: OWNER })
    const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a')
    await expect(verificarSessionJwt(SECRET, tampered)).rejects.toThrow('Sesión inválida')
  })

  it('rechaza token vacío', async () => {
    await expect(verificarSessionJwt(SECRET, '')).rejects.toThrow('Sesión requerida')
  })
})

describe('intercambiarCodigo', () => {
  it('emite token con claims del código y decrementa usos (max_uses fijo)', async () => {
    const saved: Partial<CodigoAcceso>[] = []
    const repo = fakeRepo([codigo()], saved)
    const { token } = await intercambiarCodigo(repo, 'FT-2026-ABCD', SECRET, HOY, OWNER)
    const claims = await verificarSessionJwt(SECRET, token)
    expect(claims.sub).toBe('FT-2026-ABCD')
    expect(claims.rol).toBe('asistente')
    expect(claims.modulos_ver).toBe('facturas,clientes')
    expect(claims.owner).toBe(OWNER)
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ codigo: 'FT-2026-ABCD', usos: '4' })
  })

  it('no decrementa usos cuando max_uses está vacío (∞)', async () => {
    const saved: Partial<CodigoAcceso>[] = []
    const repo = fakeRepo([codigo({ max_uses: '', usos: '' })], saved)
    const { token } = await intercambiarCodigo(repo, 'FT-2026-ABCD', SECRET, HOY, OWNER)
    expect(token).toBeTruthy()
    expect(saved).toHaveLength(0)
  })

  it('rechaza código inexistente', async () => {
    await expect(intercambiarCodigo(fakeRepo([codigo()]), 'FT-2026-XXXX', SECRET, HOY, OWNER))
      .rejects.toThrow('Código no existe')
  })

  it('rechaza código expirado', async () => {
    const repo = fakeRepo([codigo({ expires_at: '2026-01-01' })])
    await expect(intercambiarCodigo(repo, 'FT-2026-ABCD', SECRET, HOY, OWNER))
      .rejects.toThrow('Código expirado o inactivo')
  })

  it('rechaza código inactivo', async () => {
    const repo = fakeRepo([codigo({ activo: 'false' })])
    await expect(intercambiarCodigo(repo, 'FT-2026-ABCD', SECRET, HOY, OWNER))
      .rejects.toThrow('Código expirado o inactivo')
  })

  it('rechaza código sin usos disponibles', async () => {
    const repo = fakeRepo([codigo({ usos: '0' })])
    await expect(intercambiarCodigo(repo, 'FT-2026-ABCD', SECRET, HOY, OWNER))
      .rejects.toThrow('Código sin usos disponibles')
  })

  it('la búsqueda es case-sensitive', async () => {
    await expect(intercambiarCodigo(fakeRepo([codigo()]), 'ft-2026-abcd', SECRET, HOY, OWNER))
      .rejects.toThrow('Código no existe')
  })
})