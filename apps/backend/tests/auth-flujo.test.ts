import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/index'
import { createRateLimiter } from '../src/ratelimit'
import { createVerificador } from '../src/auth/verificacion'
import { emitirSessionJwt } from '../src/auth/codigos'
import type { CodigoAcceso, Dispositivo, Repository } from '@ft/shared'

const SECRET = 'secreto-de-prueba-123'
const OWNER = 'owner@ft.com'
const HOY = '2026-08-17'

function codigo(overrides: Partial<CodigoAcceso> = {}): CodigoAcceso {
  return {
    codigo: 'ANA-2026-ABCD',
    rol: 'asistente',
    modulos_ver: 'facturas,clientes',
    modulos_editar: 'facturas',
    expires_at: '2026-12-31',
    max_uses: '5',
    usos: '5',
    responsable: 'owner@ft.com',
    email: 'resp@x.com',
    creado: '2026-01-01',
    activo: 'true',
    ...overrides
  }
}

function makeHarness(codigosIniciales: CodigoAcceso[], dispositivosIniciales: Dispositivo[] = []) {
  const codigos = [...codigosIniciales]
  const dispositivos = [...dispositivosIniciales]
  const repo = {
    listCodigos: async () => codigos,
    listDispositivos: async () => dispositivos,
    saveCodigo: async (c: Partial<CodigoAcceso>) => {
      const idx = codigos.findIndex(x => x.codigo === c.codigo)
      if (idx >= 0) codigos[idx] = { ...codigos[idx], ...c }
      return codigos[idx] as CodigoAcceso
    },
    registrarDispositivo: async (d: Dispositivo) => {
      if (!dispositivos.some(x => x.dispositivo === d.dispositivo)) dispositivos.push(d)
      return d
    }
  } as unknown as Repository
  const env = {
    OAUTH_CLIENT_ID: 'client-id',
    SERVICE_ACCOUNT_JSON: {} as never,
    SECRET_JWT: SECRET,
    SPREADSHEET_ID: 'spreadsheet-1',
    OWNER_EMAIL: OWNER
  }
  const enviar = vi.fn()
  const verif = createVerificador({ store: new Map(), enviar })
  const app = createApp({ loadEnv: () => env, makeRepo: () => repo, rateLimit: createRateLimiter(), verif })
  return { app, repo, codigos, dispositivos, enviar }
}

async function postJson(app: ReturnType<typeof createApp>, path: string, body: unknown) {
  const res = await app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify(body)
  })
  return res.json() as Promise<Record<string, any>>
}

describe('flujo de login por código con dispositivos y 2FA', () => {
  it('código ∞ sin dispositivo → necesitaVerificacion; verificar → token + dispositivo registrado', async () => {
    const { app, dispositivos, enviar } = makeHarness([codigo({ max_uses: '', usos: '' })])
    const r1 = await postJson(app, '/api/auth/codigo', { codigo: 'ANA-2026-ABCD' })
    expect(r1.ok).toBe(true)
    expect(r1.data.necesitaVerificacion).toBe(true)
    expect(r1.data.intentoId).toBeTruthy()
    expect(dispositivos).toHaveLength(0) // aún no registrado

    const verifCode = enviar.mock.calls[0][1]
    const r2 = await postJson(app, '/api/auth/verificar', { intentoId: r1.data.intentoId, codigo: verifCode })
    expect(r2.ok).toBe(true)
    expect(r2.data.token).toBeTruthy()
    expect(r2.data.dev).toBeTruthy()
    expect(dispositivos).toHaveLength(1)
    expect(dispositivos[0].codigo).toBe('ANA-2026-ABCD')
  })

  it('código limitado sin dispositivo → token + dev directo (sin 2FA), usos decrementado', async () => {
    const { app, codigos, dispositivos } = makeHarness([codigo()])
    const r = await postJson(app, '/api/auth/codigo', { codigo: 'ANA-2026-ABCD' })
    expect(r.ok).toBe(true)
    expect(r.data.token).toBeTruthy()
    expect(r.data.dev).toBeTruthy()
    expect(dispositivos).toHaveLength(1)
    expect(codigos[0].usos).toBe('4')
  })

  it('dispositivo ya registrado → token directo, sin 2FA ni duplicado', async () => {
    const { app, dispositivos } = makeHarness([codigo()], [{ codigo: 'ANA-2026-ABCD', dispositivo: 'dev_x', ip_info: '1.2.3.4', registered_at: HOY }])
    const r = await postJson(app, '/api/auth/codigo', { codigo: 'ANA-2026-ABCD', dispositivo: 'dev_x' })
    expect(r.ok).toBe(true)
    expect(r.data.token).toBeTruthy()
    expect(dispositivos).toHaveLength(1)
  })

  it('código ∞ + dispositivo ya registrado → token directo sin 2FA', async () => {
    const { app } = makeHarness([codigo({ max_uses: '', usos: '' })], [{ codigo: 'ANA-2026-ABCD', dispositivo: 'dev_x', ip_info: '1.2.3.4', registered_at: HOY }])
    const r = await postJson(app, '/api/auth/codigo', { codigo: 'ANA-2026-ABCD', dispositivo: 'dev_x' })
    expect(r.ok).toBe(true)
    expect(r.data.token).toBeTruthy()
    expect(r.data.necesitaVerificacion).toBeUndefined()
  })

  it('código de verificación equivocado → error', async () => {
    const { app, enviar } = makeHarness([codigo({ max_uses: '', usos: '' })])
    const r1 = await postJson(app, '/api/auth/codigo', { codigo: 'ANA-2026-ABCD' })
    const r2 = await postJson(app, '/api/auth/verificar', { intentoId: r1.data.intentoId, codigo: '000000' })
    expect(r2.ok).toBe(false)
    expect(r2.error).toContain('verificación')
  })

  it('fallos repetidos de 2FA cuentan contra el rate limit (misma clave IP|codigo|2fa)', async () => {
    vi.useFakeTimers()
    try {
      const { app, enviar } = makeHarness([codigo({ max_uses: '', usos: '' })])
      const r1 = await postJson(app, '/api/auth/codigo', { codigo: 'ANA-2026-ABCD' })
      const id = r1.data.intentoId
      const backoffs = [1, 2, 4, 8] // s
      for (let i = 0; i < 4; i++) {
        const r = await postJson(app, '/api/auth/verificar', { intentoId: id, codigo: '000000' })
        expect(r.ok).toBe(false)
        expect(r.error).toContain('verificación')
        vi.advanceTimersByTime((backoffs[i] + 1) * 1000)
      }
      const quinto = await postJson(app, '/api/auth/verificar', { intentoId: id, codigo: '000000' })
      expect(quinto.error).toContain('verificación')
      const blocked = await postJson(app, '/api/auth/verificar', { intentoId: id, codigo: '000000' })
      expect(blocked.ok).toBe(false)
      expect(blocked.error).toContain('Demasiados intentos')
      expect(enviar).toHaveBeenCalledTimes(1) // no se crean nuevos intentos
    } finally {
      vi.useRealTimers()
    }
  })

  it('creación de intentos 2FA (código ∞) también está rate-limiteada', async () => {
    vi.useFakeTimers()
    try {
      const { app, enviar } = makeHarness([codigo({ max_uses: '', usos: '' })])
      const backoffs = [1, 2, 4, 8]
      for (let i = 0; i < 4; i++) {
        const r = await postJson(app, '/api/auth/codigo', { codigo: 'ANA-2026-ABCD' })
        expect(r.ok).toBe(true)
        expect(r.data.necesitaVerificacion).toBe(true)
        vi.advanceTimersByTime((backoffs[i] + 1) * 1000)
      }
      const quinto = await postJson(app, '/api/auth/codigo', { codigo: 'ANA-2026-ABCD' })
      expect(quinto.ok).toBe(true) // 5º intento: count 5 → bloqueado 30s, pero el check previo aún permite (bloqueo inicia tras 5º fallo de codigo? no — ver nota)
      // El límite de creación de intentos comparte clave con verificar: tras 5 fallos de verificación, crear intento también se bloquea.
      // Simular 5 fallos de verificación primero (los 4 primeros con backoff, el 5º deja bloqueo 30s vigente).
      const r1 = await postJson(app, '/api/auth/codigo', { codigo: 'ANA-2026-ABCD' })
      const id = r1.data.intentoId
      const vBackoffs = [1, 2, 4, 8]
      for (let i = 0; i < 4; i++) {
        await postJson(app, '/api/auth/verificar', { intentoId: id, codigo: '000000' })
        vi.advanceTimersByTime((vBackoffs[i] + 1) * 1000)
      }
      await postJson(app, '/api/auth/verificar', { intentoId: id, codigo: '000000' }) // 5º fallo → bloqueo 30s
      // ahora el check de creación de intento usa la misma clave → bloqueado
      const blocked = await postJson(app, '/api/auth/codigo', { codigo: 'ANA-2026-ABCD' })
      expect(blocked.ok).toBe(false)
      expect(blocked.error).toContain('Demasiados intentos')
    } finally {
      vi.useRealTimers()
    }
  })

  it('código inexistente cuenta fallo; tras 5 fallos bloquea (backoff respetado)', async () => {
    vi.useFakeTimers()
    try {
      const { app } = makeHarness([codigo()])
      const backoffs = [1, 2, 4, 8] // s — los 4 primeros; el 5º bloquea 30s y NO se deja expirar
      for (let i = 0; i < 4; i++) {
        const r = await postJson(app, '/api/auth/codigo', { codigo: 'NO-EXISTE' })
        expect(r.ok).toBe(false)
        expect(r.error).toBe('Código no existe')
        vi.advanceTimersByTime((backoffs[i] + 1) * 1000) // atacante espera el backoff
      }
      const quinto = await postJson(app, '/api/auth/codigo', { codigo: 'NO-EXISTE' })
      expect(quinto.error).toBe('Código no existe')
      const blocked = await postJson(app, '/api/auth/codigo', { codigo: 'NO-EXISTE' })
      expect(blocked.ok).toBe(false)
      expect(blocked.error).toContain('Demasiados intentos')
    } finally {
      vi.useRealTimers()
    }
  })

  it('proxy con token cuyo dispositivo fue removido → Sesión revocada', async () => {
    const { app, dispositivos } = makeHarness([codigo()])
    // dispositivo registrado
    const r = await postJson(app, '/api/auth/codigo', { codigo: 'ANA-2026-ABCD' })
    const token = r.data.token
    const dev = r.data.dev
    // el dueño lo remueve
    dispositivos.length = 0
    const res = await app.request(`/?action=getPerms&token=${encodeURIComponent(token)}`)
    const data = await res.json() as { ok: boolean; error?: string }
    expect(data.ok).toBe(false)
    expect(data.error).toBe('Sesión revocada')
    // con el dev presente funciona
    dispositivos.push({ codigo: 'ANA-2026-ABCD', dispositivo: dev, ip_info: '1.2.3.4', registered_at: HOY })
    const res2 = await app.request(`/?action=getPerms&token=${encodeURIComponent(token)}`)
    const data2 = await res2.json() as { ok: boolean; error?: string }
    expect(data2.ok).toBe(true)
  })

  it('JWT con dev claim round-trip', async () => {
    const token = await emitirSessionJwt(SECRET, { sub: 'ANA-2026-ABCD', rol: 'asistente', modulos_ver: 'facturas', modulos_editar: '', owner: OWNER, dev: 'dev_123' })
    const { verificarSessionJwt } = await import('../src/auth/codigos')
    const claims = await verificarSessionJwt(SECRET, token)
    expect(claims.dev).toBe('dev_123')
  })
})