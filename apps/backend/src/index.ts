import { createServer, type IncomingMessage } from 'node:http'
import { Hono, type Context } from 'hono'
import { createRepository, type StorageAdapter, type Repository, type CodigoAcceso, vigente, usosRestantes, usosInfinitos } from '@ft/shared'
import { loadEnv, type Env } from './env'
import { createSheetsApi, verifyGoogleIdToken } from './google'
import { permsForRequest, permsFromSession } from './roles'
import { route } from './actions'
import { verificarSessionJwt, emitirSessionJwt, type SessionClaims } from './auth/codigos'
import { createRateLimiter, type RateLimiter } from './ratelimit'
import { createVerificador, type Verificador } from './auth/verificacion'
import { nuevoDispositivo, generarTokenDispositivo } from './auth/dispositivos'

function makeRepo(env: Env) {
  const api = createSheetsApi(env)
  const storage: StorageAdapter = {
    get: async () => null,
    set: async () => {},
    remove: async () => {}
  }
  return createRepository({
    api,
    storage,
    getSpreadsheetId: async () => env.SPREADSHEET_ID
  })
}

interface ProxyInput {
  action?: string
  id_token?: string
  token?: string
  payload?: unknown
}

export interface AppDeps {
  loadEnv?: () => Env
  makeRepo: (env: Env) => Repository
  rateLimit: RateLimiter
  verif: Verificador
}

export function createApp(deps: AppDeps) {
  const app = new Hono()
  const getEnv = deps.loadEnv ?? loadEnv

  async function proxy(c: Context, input: ProxyInput): Promise<Response> {
    try {
      if (!input.action) return c.json({ ok: true, service: 'ft-backend' })
      const env = getEnv()
      const repo = deps.makeRepo(env)
      if (input.token) {
        const claims = await verificarSessionJwt(env.SECRET_JWT, String(input.token))
        if (claims.dev) {
          const devs = await repo.listDispositivos()
          if (!devs.some(d => d.dispositivo === claims.dev)) throw new Error('Sesión revocada')
        }
        const p = permsFromSession(claims)
        const data = await route(repo, input.action, input.payload, p)
        return c.json({ ok: true, data })
      }
      const email = await verifyGoogleIdToken(env.OAUTH_CLIENT_ID, String(input.id_token ?? ''))
      const p = await permsForRequest(repo, env.OWNER_EMAIL, email)
      const data = await route(repo, input.action, input.payload, p)
      return c.json({ ok: true, data })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error interno'
      return c.json({ ok: false, error: message })
    }
  }

  function parsePayload(raw: string | undefined): unknown {
    if (!raw) return {}
    try {
      return JSON.parse(raw)
    } catch {
      return String(raw)
    }
  }

  function claimsDeCodigo(c: CodigoAcceso, owner: string, dev?: string): SessionClaims {
    return {
      sub: c.codigo,
      rol: c.rol,
      modulos_ver: c.modulos_ver,
      modulos_editar: c.modulos_editar,
      owner,
      ...(dev ? { dev } : {})
    }
  }

  async function decrementarUsos(repo: Repository, c: CodigoAcceso): Promise<void> {
    if (usosInfinitos(c)) return
    await repo.saveCodigo({ ...c, usos: String(Number(c.usos) - 1) })
  }

  app.get('/api/health', c => c.json({ ok: true }))

  app.post('/api/auth/codigo', async c => {
    const body = await c.req.json().catch(() => null) as { codigo?: string; dispositivo?: string } | null
    if (!body?.codigo) return c.json({ ok: false, error: 'Código requerido' })
    try {
      const env = getEnv()
      const repo = deps.makeRepo(env)
      const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('cf-connecting-ip') ?? 'desconocida'
      const codigo = String(body.codigo).trim().toUpperCase()
      const dispositivo = body.dispositivo ? String(body.dispositivo) : ''
      const key = `${ip}|${codigo}|${dispositivo}`
      const chk = deps.rateLimit.check(key)
      if (!chk.allowed) return c.json({ ok: false, error: `Demasiados intentos, espera ${Math.ceil(chk.retryAfterSec / 60)} min` })
      const hoy = new Date().toISOString().slice(0, 10)
      const codigos = await repo.listCodigos()
      const code = codigos.find(x => x.codigo === codigo)
      if (!code) {
        deps.rateLimit.recordFailure(key)
        return c.json({ ok: false, error: 'Código no existe' })
      }
      if (!vigente(code, hoy)) {
        deps.rateLimit.recordFailure(key)
        return c.json({ ok: false, error: 'Código expirado o inactivo' })
      }
      if (usosRestantes(code) <= 0) {
        deps.rateLimit.recordFailure(key)
        return c.json({ ok: false, error: 'Código sin usos disponibles' })
      }
      const devs = await repo.listDispositivos()
      const yaRegistrado = dispositivo !== '' && devs.some(d => d.codigo === codigo && d.dispositivo === dispositivo)
      if (yaRegistrado) {
        await decrementarUsos(repo, code)
        deps.rateLimit.reset(key)
        const token = await emitirSessionJwt(env.SECRET_JWT, claimsDeCodigo(code, env.OWNER_EMAIL, dispositivo))
        return c.json({ ok: true, data: { token } })
      }
      if (usosInfinitos(code)) {
        const { intentoId } = deps.verif.iniciar({
          codigo,
          dispositivo: dispositivo || generarTokenDispositivo(),
          email: code.email
        })
        return c.json({ ok: true, data: { necesitaVerificacion: true, intentoId } })
      }
      const d = nuevoDispositivo(codigo, ip)
      await repo.registrarDispositivo(d)
      await decrementarUsos(repo, code)
      deps.rateLimit.reset(key)
      const token = await emitirSessionJwt(env.SECRET_JWT, claimsDeCodigo(code, env.OWNER_EMAIL, d.dispositivo))
      return c.json({ ok: true, data: { token, dev: d.dispositivo } })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error interno'
      return c.json({ ok: false, error: message })
    }
  })

  app.post('/api/auth/verificar', async c => {
    const body = await c.req.json().catch(() => null) as { intentoId?: string; codigo?: string } | null
    if (!body?.intentoId || !body?.codigo) return c.json({ ok: false, error: 'Código de verificación inválido o expirado' })
    try {
      const env = getEnv()
      const repo = deps.makeRepo(env)
      const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('cf-connecting-ip') ?? 'desconocida'
      const intento = deps.verif.validar(String(body.intentoId), String(body.codigo).trim())
      if (!intento) return c.json({ ok: false, error: 'Código de verificación inválido o expirado' })
      const key = `${ip}|${intento.codigo}|${intento.dispositivo}`
      const chk = deps.rateLimit.check(key)
      if (!chk.allowed) return c.json({ ok: false, error: `Demasiados intentos, espera ${Math.ceil(chk.retryAfterSec / 60)} min` })
      const codigos = await repo.listCodigos()
      const code = codigos.find(x => x.codigo === intento.codigo)
      if (!code) return c.json({ ok: false, error: 'Código no existe' })
      await decrementarUsos(repo, code)
      await repo.registrarDispositivo(nuevoDispositivo(intento.codigo, ip, intento.dispositivo))
      deps.rateLimit.reset(key)
      const token = await emitirSessionJwt(env.SECRET_JWT, claimsDeCodigo(code, env.OWNER_EMAIL, intento.dispositivo))
      return c.json({ ok: true, data: { token, dev: intento.dispositivo } })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error interno'
      return c.json({ ok: false, error: message })
    }
  })

  app.get('/', c => {
    const q = c.req.query()
    return proxy(c, { action: q.action, id_token: q.id_token, token: q.token, payload: parsePayload(q.payload) })
  })

  app.post('/', async c => {
    const body = (await c.req.json()) as ProxyInput
    return proxy(c, body)
  })

  app.onError((err, c) => {
    console.error(err)
    return c.json({ ok: false, error: 'Error interno' })
  })

  return app
}

const app = createApp({
  makeRepo,
  rateLimit: createRateLimiter(),
  verif: createVerificador({
    store: new Map(),
    enviar: (email, codigo) => console.log(`[verificacion] Código para ${email}: ${codigo}`)
  })
})

export default app

function readBody(req: IncomingMessage): Promise<Buffer | null> {
  return new Promise(resolve => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(chunks.length > 0 ? Buffer.concat(chunks) : null))
  })
}

export function main() {
  const port = Number(process.env.PORT ?? 3000)
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const headers = new Headers()
      for (const [k, v] of Object.entries(req.headers)) {
        if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v)
      }
      const body = await readBody(req)
      const request = new Request(url, {
        method: req.method,
        headers,
        body: body ? body.toString() : undefined
      })
      const response = await app.fetch(request, {})
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()))
      res.end(Buffer.from(await response.arrayBuffer()))
    } catch (err) {
      console.error(err)
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'Error interno' }))
    }
  })
  server.listen(port, () => console.log(`ft-backend listening on http://localhost:${port}`))
}