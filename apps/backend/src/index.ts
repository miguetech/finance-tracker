import { createServer, type IncomingMessage } from 'node:http'
import { Hono, type Context } from 'hono'
import { createRepository, type StorageAdapter } from '@ft/shared'
import { loadEnv, type Env } from './env'
import { createSheetsApi, verifyGoogleIdToken } from './google'
import { permsForRequest } from './roles'
import { route } from './actions'

const app = new Hono()

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
  payload?: unknown
}

async function proxy(c: Context, input: ProxyInput): Promise<Response> {
  try {
    if (!input.action) return c.json({ ok: true, service: 'ft-backend' })
    const env = loadEnv()
    const email = await verifyGoogleIdToken(env.OAUTH_CLIENT_ID, String(input.id_token ?? ''))
    const repo = makeRepo(env)
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

app.get('/api/health', c => c.json({ ok: true }))

app.get('/', c => {
  const q = c.req.query()
  return proxy(c, { action: q.action, id_token: q.id_token, payload: parsePayload(q.payload) })
})

app.post('/', async c => {
  const body = (await c.req.json()) as ProxyInput
  return proxy(c, body)
})

app.onError((err, c) => {
  console.error(err)
  return c.json({ ok: false, error: 'Error interno' })
})

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

export default app