# OAuth por Dueño (Refresh Tokens Multi-Tenant) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada dueño de negocio conecta SU cuenta de Google una vez; el backend escribe en la hoja del dueño firmando con el token del dueño, aislando la cuota de Google Sheets por cliente (~60 escrituras/min cada uno) en vez de compartirla vía service account.

**Architecture:** Se agrega flujo OAuth `authorization_code` + `access_type=offline`: el dueño visita `/api/auth/google/iniciar`, acepta en Google y el callback intercambia el `code` por un refresh token que se guarda **cifrado (AES-256-GCM)** en una tabla nueva `TokensGoogle` de la hoja de CONTROL (`env.SPREADSHEET_ID`, accedida con la service account actual — evita la búsqueda circular). El callback crea/conecta la hoja del dueño con SU propio token (`connectOrCreateSpreadsheet`). Las sesiones JWT ya llevan `owner`; el proxy resuelve el repositorio destino según el owner: `OWNER_EMAIL` sigue con service account (compatibilidad total), otros owners usan su refresh token. El módulo de billing queda EXPLÍCITAMENTE fuera de alcance.

**Tech Stack:** Hono 4, jose 6, node:crypto (AES-256-GCM), Google Sheets/Drive REST API, Vitest, pnpm workspace.

## Global Constraints

- Sin módulo de billing en este plan (decisión del dueño del proyecto).
- Compatibilidad: el flujo `id_token` de la extensión y el flujo service-account para `OWNER_EMAIL` NO cambian de comportamiento.
- Los refresh tokens se guardan cifrados con AES-256-GCM; jamás en texto plano.
- Mensajes de error visibles al usuario en español.
- Tests con Vitest por paquete: `pnpm --filter @ft/backend test`, `pnpm --filter @ft/shared test`. Typecheck: `pnpm --filter @ft/backend typecheck`.
- Fase 2 (fuera de alcance): códigos de acceso por negocio y emisión de sesiones con `owner` ≠ `OWNER_EMAIL`.

---

### Task 1: Cifrado AES-256-GCM para secretos

**Files:**
- Create: `apps/backend/src/crypto.ts`
- Test: `apps/backend/tests/crypto.test.ts`

**Interfaces:**
- Consumes: nada (solo `node:crypto`).
- Produces: `encryptSecret(plain: string, secret: string): string`, `decryptSecret(payload: string, secret: string): string` (formato base64 de `iv(12B) | authTag(16B) | ciphertext`). Tasks 4 y 5 los usan.

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/tests/crypto.test.ts
import { describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret } from '../src/crypto'

describe('crypto secrets', () => {
  const SECRET = 'clave-de-prueba-suficientemente-larga'

  it('roundtrip devuelve el texto original', () => {
    const plain = '1//0gRefreshTokenDePrueba'
    expect(decryptSecret(encryptSecret(plain, SECRET), SECRET)).toBe(plain)
  })

  it('secret distinto falla (auth tag GCM)', () => {
    const payload = encryptSecret('dato', SECRET)
    expect(() => decryptSecret(payload, 'otra-clave-distinta')).toThrow()
  })

  it('payload alterado falla', () => {
    const payload = encryptSecret('dato', SECRET)
    const raw = Buffer.from(payload, 'base64')
    raw[raw.length - 1] ^= 0xff
    expect(() => decryptSecret(raw.toString('base64'), SECRET)).toThrow()
  })

  it('payload demasiado corto lanza error claro', () => {
    expect(() => decryptSecret(Buffer.from('corto').toString('base64'), SECRET)).toThrow('Payload cifrado inválido')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ft/backend exec vitest run tests/crypto.test.ts`
Expected: FAIL — no se puede resolver `../src/crypto`

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/backend/src/crypto.ts
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest()
}

/** Cifra con AES-256-GCM. Devuelve base64(iv | authTag | ciphertext). */
export function encryptSecret(plain: string, secret: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64')
}

/** Descifra el formato base64(iv | authTag | ciphertext). Lanza si fue alterado. */
export function decryptSecret(payload: string, secret: string): string {
  const raw = Buffer.from(payload, 'base64')
  if (raw.length < 28) throw new Error('Payload cifrado inválido')
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), raw.subarray(0, 12))
  decipher.setAuthTag(raw.subarray(12, 28))
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ft/backend exec vitest run tests/crypto.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/crypto.ts apps/backend/tests/crypto.test.ts
git commit -m "feat(backend): cifrado AES-256-GCM para refresh tokens"
```

---

### Task 2: Variables de entorno opcionales del flujo OAuth

**Files:**
- Modify: `apps/backend/src/env.ts`
- Test: `apps/backend/tests/env.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `Env.OAUTH_CLIENT_SECRET?: string` y `Env.SECRET_CIFRADO?: string`; `loadEnv()` las valida si están presentes (≥32 caracteres el secreto de cifrado). Tasks 4-6 las consumen.

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/tests/env.test.ts
import { describe, expect, it } from 'vitest'
import { loadEnv } from '../src/env'

const BASE = {
  OAUTH_CLIENT_ID: 'cid',
  SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'a@b.iam', private_key: 'x' }),
  SECRET_JWT: 'jwt',
  SPREADSHEET_ID: 'sid',
  OWNER_EMAIL: 'owner@ft.com'
}

describe('loadEnv OAuth multi-tenant', () => {
  it('sin variables nuevas carga igual que antes (compatibilidad)', () => {
    const env = loadEnv(BASE)
    expect(env.OAUTH_CLIENT_SECRET).toBeUndefined()
    expect(env.SECRET_CIFRADO).toBeUndefined()
  })

  it('con variables presentes las expone', () => {
    const env = loadEnv({ ...BASE, OAUTH_CLIENT_SECRET: 'sec', SECRET_CIFRADO: 'a'.repeat(32) })
    expect(env.OAUTH_CLIENT_SECRET).toBe('sec')
    expect(env.SECRET_CIFRADO).toBe('a'.repeat(32))
  })

  it('SECRET_CIFRADO corto lanza error', () => {
    expect(() => loadEnv({ ...BASE, SECRET_CIFRADO: 'corta' })).toThrow('SECRET_CIFRADO')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ft/backend exec vitest run tests/env.test.ts`
Expected: FAIL — propiedades no existen en `Env`

- [ ] **Step 3: Implement**

En `apps/backend/src/env.ts` agregar al final de la interfaz `Env`:

```ts
  /** Secreto OAuth para el flujo authorization_code (conexión Google del dueño). Opcional hasta activar multi-tenant. */
  OAUTH_CLIENT_SECRET?: string
  /** Clave para cifrar refresh tokens en reposo (AES-GCM). Mínimo 32 caracteres. */
  SECRET_CIFRADO?: string
```

Y dentro de `loadEnv`, justo antes del `return`, añadir:

```ts
  if (source.SECRET_CIFRADO !== undefined && source.SECRET_CIFRADO.length < 32) {
    throw new Error('SECRET_CIFRADO debe tener al menos 32 caracteres')
  }
```

y al objeto retornado:

```ts
    ...(source.OAUTH_CLIENT_SECRET ? { OAUTH_CLIENT_SECRET: source.OAUTH_CLIENT_SECRET } : {}),
    ...(source.SECRET_CIFRADO ? { SECRET_CIFRADO: source.SECRET_CIFRADO } : {})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ft/backend exec vitest run tests/env.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Typecheck y commit**

Run: `pnpm --filter @ft/backend typecheck`

```bash
git add apps/backend/src/env.ts apps/backend/tests/env.test.ts
git commit -m "feat(backend): envs opcionales OAUTH_CLIENT_SECRET y SECRET_CIFRADO"
```

---

### Task 3: Entidad TokenGoogle en shared (tabla + repositorio)

**Files:**
- Modify: `packages/shared/src/types/entities.ts` (junto a `CodigoAcceso`, ~línea 232)
- Modify: `packages/shared/src/types/schemas.ts` (~línea 222, tras `UsuarioSchema`)
- Modify: `packages/shared/src/sheets/tables.ts` (union `TableName` línea 1 y `TABLES`)
- Modify: `packages/shared/src/data/repository.ts` (métodos junto a los de Usuarios, ~línea 483-495)
- Test: `packages/shared/tests/repository.test.ts` (nuevo `describe` al final, reutiliza helpers `memoryStorage`/`fakeApi` ya existentes ahí)

**Interfaces:**
- Consumes: patrones existentes `readTable`/`insertOrReplace`/`replaceTable` dentro de `createRepository`.
- Produces: tipo `TokenGoogle`, schema Zod `TokenGoogleSchema`, tabla `'TokensGoogle'` en `TableName`, métodos `listTokensGoogle()`, `saveTokenGoogle(t)`, `deleteTokenGoogle(email)` en `Repository`. Tasks 5 y 6 los usan. La tabla vive en la HOJA DE CONTROL (`env.SPREADSHEET_ID`); `ensureTables` la creará automáticamente en hojas nuevas y en `/iniciar` para las existentes (Task 5).

- [ ] **Step 1: Write the failing test**

Al final de `packages/shared/tests/repository.test.ts` (usando los mismos helpers del archivo):

```ts
describe('TokensGoogle', () => {
  it('saveTokenGoogle guarda y normaliza email; listTokensGoogle lo lee', async () => {
    const repo = createRepository({ api: fakeApi() as never, storage: memoryStorage(), getSpreadsheetId: async () => 'SID' })
    await repo.saveTokenGoogle({
      email: ' Dueño@FT.com ',
      refresh_token_cifrado: 'CIFRADO123',
      spreadsheet_id: 'SS_DUEÑO',
      conectado_en: '2026-08-25',
      estado: 'activo'
    })
    const tokens = await repo.listTokensGoogle()
    expect(tokens).toHaveLength(1)
    expect(tokens[0].email).toBe('dueño@ft.com')
    expect(tokens[0].estado).toBe('activo')
  })

  it('saveTokenGoogle reemplaza por email (no duplica)', async () => {
    const repo = createRepository({ api: fakeApi() as never, storage: memoryStorage(), getSpreadsheetId: async () => 'SID' })
    const base = { refresh_token_cifrado: 'A', spreadsheet_id: 'S', conectado_en: '', estado: 'activo' } as const
    await repo.saveTokenGoogle({ email: 'x@ft.com', ...base })
    await repo.saveTokenGoogle({ email: 'x@ft.com', ...base, spreadsheet_id: 'S2' })
    const tokens = await repo.listTokensGoogle()
    expect(tokens).toHaveLength(1)
    expect(tokens[0].spreadsheet_id).toBe('S2')
  })

  it('deleteTokenGoogle elimina solo al indicado', async () => {
    const repo = createRepository({ api: fakeApi() as never, storage: memoryStorage(), getSpreadsheetId: async () => 'SID' })
    const base = { refresh_token_cifrado: 'A', spreadsheet_id: 'S', conectado_en: '', estado: 'activo' } as const
    await repo.saveTokenGoogle({ email: 'a@ft.com', ...base })
    await repo.saveTokenGoogle({ email: 'b@ft.com', ...base })
    await repo.deleteTokenGoogle('a@ft.com')
    const tokens = await repo.listTokensGoogle()
    expect(tokens.map(t => t.email)).toEqual(['b@ft.com'])
  })
})
```

Nota: si `fakeApi()` del archivo requiere seed distinto o firma diferente, adaptar SOLO la construcción del repo siguiendo cómo lo hacen los tests de usuarios ya presentes en ese archivo.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ft/shared exec vitest run tests/repository.test.ts`
Expected: FAIL — `repo.saveTokenGoogle is not a function`

- [ ] **Step 3: Implement**

En `packages/shared/src/types/entities.ts` (tras `CodigoAcceso`):

```ts
/** Refresh token OAuth de un dueño (cifrado en reposo) + su hoja asignada.
 *  Vive SOLO en la hoja de control de la plataforma, nunca en la del cliente. */
export interface TokenGoogle {
  email: string
  refresh_token_cifrado: string
  spreadsheet_id: string
  conectado_en: string
  /** 'activo' | 'desconectado' */
  estado: string
}
```

En `packages/shared/src/types/schemas.ts` (tras `UsuarioSchema`):

```ts
export const TokenGoogleSchema = z.object({
  email: z.string().min(1, 'Email obligatorio'),
  refresh_token_cifrado: z.string().default(''),
  spreadsheet_id: z.string().default(''),
  conectado_en: z.string().default(''),
  estado: z.enum(['activo', 'desconectado']).default('activo')
})
```

En `packages/shared/src/sheets/tables.ts`:

```ts
// En la union TableName agregar 'TokensGoogle':
export type TableName = 'Config' | ... | 'Asistencias' | 'TokensGoogle'

// En TABLES agregar:
  TokensGoogle: [
    { key: 'email', header: 'email', type: S },
    { key: 'refresh_token_cifrado', header: 'refresh_token_cifrado', type: S },
    { key: 'spreadsheet_id', header: 'spreadsheet_id', type: S },
    { key: 'conectado_en', header: 'conectado_en', type: D },
    { key: 'estado', header: 'estado', type: S }
  ],
```

En `packages/shared/src/data/repository.ts`: importar `TokenGoogle` desde `'../types/entities'` y `TokenGoogleSchema` desde `'../types/schemas'` (unir a imports existentes), y dentro del objeto retornado por `createRepository`, después de los métodos de Usuarios:

```ts
    async listTokensGoogle(): Promise<TokenGoogle[]> { return readTable<TokenGoogle>('TokensGoogle') },

    async saveTokenGoogle(token: TokenGoogle): Promise<TokenGoogle> {
      const parsed = TokenGoogleSchema.parse(token)
      const saved = { ...parsed, email: parsed.email.trim().toLowerCase() } as TokenGoogle
      await insertOrReplace('TokensGoogle', 'email', saved)
      return saved
    },

    async deleteTokenGoogle(email: string): Promise<void> {
      const all = (await readTable<TokenGoogle>('TokensGoogle')).filter(r => !emailIgual(r.email, email))
      await replaceTable('TokensGoogle', all)
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ft/shared exec vitest run tests/repository.test.ts && pnpm --filter @ft/shared build`
Expected: PASS. La tabla entra a `ALL_TABLES` automáticamente → `ensureTables` la crea sola.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src packages/shared/tests/repository.test.ts
git commit -m "feat(shared): entidad TokenGoogle con repositorio para refresh tokens"
```

---

### Task 4: OAuth del dueño en google.ts (URL, exchange, refresh)

**Files:**
- Modify: `apps/backend/src/google.ts`
- Test: `apps/backend/tests/google.test.ts` (nuevo `describe` al final)

**Interfaces:**
- Consumes: `Env.OAUTH_CLIENT_SECRET`, `decryptSecret` (Task 1), `listTokensGoogle` (Task 3), constantes ya existentes `TOKEN_URL`/`SCOPES`/`GRANT_TTL`/`CACHE_MARGIN`/`accessTokenCache`.
- Produces:
  - `construirUrlAutorizacion(env: Env, redirectUri: string, state: string): string`
  - `intercambiarCodigo(env: Env, code: string, redirectUri: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }>`
  - `getAccessTokenDeRefresh(env: Env, refreshToken: string): Promise<string>` — cachea por SHA-256 del refresh token; lanza `Error('ACCESO_REVOCADO')` si Google responde `invalid_grant`
  - `crearSheetsApiDeDueño(env: Env, repoControl: Repository, ownerEmail: string): Promise<{ api: SheetsApi; spreadsheetId: string }>`

- [ ] **Step 1: Write the failing test**

Al final de `apps/backend/tests/google.test.ts`:

```ts
import { construirUrlAutorizacion, getAccessTokenDeRefresh, intercambiarCodigo } from '../src/google'
import type { Env } from '../src/env'

function envOauth(): Env {
  return {
    OAUTH_CLIENT_ID: 'cid',
    SERVICE_ACCOUNT_JSON: { client_email: 'a@b.iam', private_key: 'x' },
    SECRET_JWT: 'jwt',
    SPREADSHEET_ID: 'sid',
    OWNER_EMAIL: 'owner@ft.com',
    OAUTH_CLIENT_SECRET: 'sec',
    SECRET_CIFRADO: 'k'.repeat(32)
  }
}

describe('oauth dueño', () => {
  it('construirUrlAutorizacion incluye offline+consent y state', () => {
    const url = new URL(construirUrlAutorizacion(envOauth(), 'https://b.cb', 'ST'))
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
    expect(url.searchParams.get('state')).toBe('ST')
    expect(url.searchParams.get('redirect_uri')).toBe('https://b.cb')
  })

  it('intercambiarCodigo pide grant authorization_code y devuelve tokens', async () => {
    const calls: { url: string; body: URLSearchParams }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: new URLSearchParams(String(init?.body)) })
      return new Response(JSON.stringify({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }), { status: 200 })
    }))
    const r = await intercambiarCodigo(envOauth(), 'CODE', 'https://b.cb')
    expect(r.refreshToken).toBe('RT')
    expect(calls[0].body.get('grant_type')).toBe('authorization_code')
    expect(calls[0].body.get('code')).toBe('CODE')
    vi.unstubAllGlobals()
  })

  it('intercambiarCodigo sin refresh_token explica cómo corregirlo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ access_token: 'AT' }), { status: 200 })))
    await expect(intercambiarCodigo(envOauth(), 'CODE', 'https://b.cb'))
      .rejects.toThrow(/prompt=consent/)
    vi.unstubAllGlobals()
  })

  it('getAccessTokenDeRefresh refresca y cachea (una sola llamada HTTP)', async () => {
    let llamadas = 0
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      llamadas++
      expect(new URLSearchParams(String(init?.body)).get('grant_type')).toBe('refresh_token')
      return new Response(JSON.stringify({ access_token: `AT${llamadas}`, expires_in: 3600 }), { status: 200 })
    }))
    const env = envOauth()
    expect(await getAccessTokenDeRefresh(env, 'RT_CACHE')).toBe('AT1')
    expect(await getAccessTokenDeRefresh(env, 'RT_CACHE')).toBe('AT1') // caché
    expect(llamadas).toBe(1)
    vi.unstubAllGlobals()
  })

  it('invalid_grant lanza ACCESO_REVOCADO', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('invalid_grant', { status: 400 })))
    await expect(getAccessTokenDeRefresh(envOauth(), 'RT_MUERTO')).rejects.toThrow('ACCESO_REVOCADO')
    vi.unstubAllGlobals()
  })
})
```

Si `vi` no está importado en ese archivo, agregar `vi` al import de `vitest` existente.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ft/backend exec vitest run tests/google.test.ts`
Expected: FAIL — no existen los exports

- [ ] **Step 3: Implement**

En `apps/backend/src/google.ts` agregar imports arriba: `import crypto from 'node:crypto'`, `import { SheetsApi } from '@ft/shared'` ya existe — añadir `type Repository` al import de `@ft/shared`, más `import { decryptSecret } from './crypto'`. Luego al final del archivo:

```ts
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'

interface TokensRespuesta { access_token?: string; refresh_token?: string; expires_in?: number }

function requerirSecreto(env: Env): string {
  if (!env.OAUTH_CLIENT_SECRET) throw new Error('Configuración OAuth pendiente (falta OAUTH_CLIENT_SECRET)')
  return env.OAUTH_CLIENT_SECRET
}

/** URL de consentimiento para que el dueño conecte su cuenta (offline → refresh token). */
export function construirUrlAutorizacion(env: Env, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: env.OAUTH_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state
  })
  return `${AUTH_URL}?${params.toString()}`
}

/** Intercambia ?code= por tokens. Exige refresh_token (prompt=consent lo garantiza). */
export async function intercambiarCodigo(
  env: Env,
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const clientSecret = requerirSecreto(env)
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.OAUTH_CLIENT_ID,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  })
  if (!res.ok) throw new Error(`OAuth exchange ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = (await res.json()) as TokensRespuesta
  if (!data.access_token || !data.refresh_token) {
    throw new Error('Google no devolvió refresh_token. El dueño debe revocar el acceso en myaccount.google.com/permissions y reconectar.')
  }
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in ?? GRANT_TTL }
}

function claveCache(refreshToken: string): string {
  return crypto.createHash('sha256').update(refreshToken).digest('hex')
}

/** Access token desde refresh token del dueño. Cachea 1h - margen. invalid_grant → ACCESO_REVOCADO. */
export async function getAccessTokenDeRefresh(env: Env, refreshToken: string): Promise<string> {
  const clientSecret = requerirSecreto(env)
  const now = Math.floor(Date.now() / 1000)
  const key = claveCache(refreshToken)
  const cached = accessTokenCache.get(key)
  if (cached && now < cached.exp) return cached.token

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.OAUTH_CLIENT_ID,
      client_secret: clientSecret,
      grant_type: 'refresh_token'
    })
  })
  if (!res.ok) {
    const text = await res.text()
    if (text.includes('invalid_grant')) throw new Error('ACCESO_REVOCADO')
    throw new Error(`OAuth refresh ${res.status}: ${text.slice(0, 300)}`)
  }
  const data = (await res.json()) as TokensRespuesta
  if (!data.access_token) throw new Error('OAuth refresh sin access_token')
  accessTokenCache.set(key, {
    token: data.access_token,
    exp: now + (data.expires_in ?? GRANT_TTL) - CACHE_MARGIN
  })
  return data.access_token
}

/** SheetsApi firmante = identidad del dueño + SU spreadsheet. Lanza si nunca conectó. */
export async function crearSheetsApiDeDueño(
  env: Env,
  repoControl: Repository,
  ownerEmail: string
): Promise<{ api: SheetsApi; spreadsheetId: string }> {
  if (!env.SECRET_CIFRADO) throw new Error('Configuración OAuth pendiente (falta SECRET_CIFRADO)')
  const tokens = await repoControl.listTokensGoogle()
  const t = tokens.find(x => x.email.toLowerCase() === ownerEmail.toLowerCase())
  if (!t || t.estado !== 'activo' || !t.refresh_token_cifrado) throw new Error(`Negocio sin conectar Google (${ownerEmail})`)
  if (!t.spreadsheet_id) throw new Error(`Negocio sin hoja creada (${ownerEmail})`)
  const refreshToken = decryptSecret(t.refresh_token_cifrado, env.SECRET_CIFRADO)
  return { api: new SheetsApi(() => getAccessTokenDeRefresh(env, refreshToken)), spreadsheetId: t.spreadsheet_id }
}
```

- [ ] **Step 4: Run tests y typecheck**

Run: `pnpm --filter @ft/backend exec vitest run tests/google.test.ts && pnpm --filter @ft/backend typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/google.ts apps/backend/tests/google.test.ts
git commit -m "feat(backend): flujo OAuth del dueño (exchange, refresh, SheetsApi por dueño)"
```

---

### Task 5: Rutas `/api/auth/google/iniciar` y `/callback`

**Files:**
- Modify: `apps/backend/src/index.ts` (rutas tras `/api/auth/verificar`, ~línea 185)
- Test: `apps/backend/tests/oauth-callback.test.ts`

**Interfaces:**
- Consumes: Task 1 (`encryptSecret`), Task 4 (`construirUrlAutorizacion`, `intercambiarCodigo`), shared (`ensureTables`, `connectOrCreateSpreadsheet`, `createSheetsApi` local).
- Produces: `GET /api/auth/google/iniciar` (302 a Google; de paso garantiza la pestaña `TokensGoogle` en la hoja de control) y `GET /api/auth/google/callback?code=...&state=...` (HTML de confirmación). Task 6 depende de que este flujo llene `TokensGoogle`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/tests/oauth-callback.test.ts
import { describe, expect, it, vi } from 'vitest'
import { createApp, type AppDeps } from '../src/index'
import { createRateLimiter } from '../src/ratelimit'
import { createVerificador } from '../src/auth/verificacion'
import type { Env } from '../src/env'

function makeDeps(envOverride: Partial<Env> = {}): AppDeps & { env: () => Env } {
  const env: Env = {
    OAUTH_CLIENT_ID: 'cid',
    SERVICE_ACCOUNT_JSON: JSON.parse(process.env.SERVICE_ACCOUNT_JSON ?? '{}'),
    SECRET_JWT: 'jwt-test',
    SPREADSHEET_ID: 'CONTROL',
    OWNER_EMAIL: 'owner@ft.com',
    OAUTH_CLIENT_SECRET: 'sec',
    SECRET_CIFRADO: 'k'.repeat(32),
    ...envOverride
  }
  return {
    env: () => env,
    makeRepo: (() => ({}) as never) as unknown as AppDeps['makeRepo'],
    rateLimit: createRateLimiter(),
    verif: createVerificador({ store: new Map(), enviar: () => {} })
  }
}

function appConEnv(deps: ReturnType<typeof makeDeps>) {
  return createApp({ ...deps, loadEnv: deps.env })
}

describe('GET /api/auth/google/iniciar', () => {
  it('sin OAUTH_CLIENT_SECRET responde error claro', async () => {
    const deps = makeDeps({ OAUTH_CLIENT_SECRET: undefined })
    const res = await appConEnv(deps).fetch('http://localhost/api/auth/google/iniciar')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: false, error: 'Configuración OAuth pendiente (falta OAUTH_CLIENT_SECRET)' })
  })

  it('configurado redirige a Google', async () => {
    const deps = makeDeps()
    const res = await appConEnv(deps).fetch('http://localhost/api/auth/google/iniciar')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('accounts.google.com/o/oauth2/v2/auth')
  })
})

describe('GET /api/auth/google/callback', () => {
  it('sin code responde 400', async () => {
    const deps = makeDeps()
    const res = await appConEnv(deps).fetch('http://localhost/api/auth/google/callback')
    expect(res.status).toBe(400)
  })

  it('flujo feliz: intercambia, cifra, guarda token y crea hoja del dueño', async () => {
    const guardadas: unknown[] = []
    const repoFalso = {
      listTokensGoogle: async () => [],
      saveTokenGoogle: async (t: unknown) => void guardadas.push(t)
    }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'AT_OWNER', refresh_token: 'RT_OWNER', expires_in: 3600 }), { status: 200 })
      }
      if (u.includes('oauth2/v2/userinfo')) {
        return new Response(JSON.stringify({ email: 'dueño@gmail.com' }), { status: 200 })
      }
      if (u.includes('drive/v3/files')) {
        return new Response(JSON.stringify({ files: [] }), { status: 200 }) // sin hoja previa → crearla
      }
      if (u.startsWith('https://sheets.googleapis.com')) {
        return new Response(JSON.stringify({ spreadsheetId: 'SS_NUEVO', spreadsheetUrl: 'https://x', sheets: [] }), { status: 200 })
      }
      throw new Error(`URL no mockeada: ${u}`)
    }))
    const deps = makeDeps()
    deps.makeRepo = (() => repoFalso) as unknown as AppDeps['makeRepo']
    const res = await appConEnv(deps).fetch('http://localhost/api/auth/google/callback?code=CODE')
    const html = await res.text()
    expect(res.status).toBe(200)
    expect(html).toContain('conectado')
    expect(guardadas.length).toBeGreaterThanOrEqual(1)
    vi.unstubAllGlobals()
  })
})
```

Nota sobre tipos: `AppDeps.loadEnv?: () => Env` ya existe; el helper usa eso. Si `SERVICE_ACCOUNT_JSON` tipado molesta en el fixture, castear con `as Env`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ft/backend exec vitest run tests/oauth-callback.test.ts`
Expected: FAIL — rutas no existen (404 / undefined location)

- [ ] **Step 3: Implement**

En `apps/backend/src/index.ts`:

Imports nuevos (unir a los existentes):

```ts
import { createRepository, type StorageAdapter, type Repository, type CodigoAcceso, vigente, usosRestantes, usosInfinitos, ensureTables, connectOrCreateSpreadsheet } from '@ft/shared'
import { encryptSecret } from './crypto'
import { construirUrlAutorizacion, intercambiarCodigo, crearSheetsApiDeDueño } from './google'
```

(`crearSheetsApiDeDueño` se usa en Task 6; importarla desde ya.)

Rutas (insertar después del bloque `app.post('/api/auth/verificar', ...)`):

```ts
  app.get('/api/auth/google/iniciar', c => {
    const env = getEnv()
    try {
      if (!env.OAUTH_CLIENT_SECRET) {
        return c.json({ ok: false, error: 'Configuración OAuth pendiente (falta OAUTH_CLIENT_SECRET)' })
      }
      const origin = new URL(c.req.url).origin
      // Garantiza la pestaña TokensGoogle en la hoja de control (idempotente).
      void ensureTables(createSheetsApi(env), env.SPREADSHEET_ID).catch(err =>
        console.error('[oauth] ensureTables TokensGoogle:', err)
      )
      return c.redirect(construirUrlAutorizacion(env, `${origin}/api/auth/google/callback`, crypto.randomUUID()))
    } catch (err) {
      return c.json({ ok: false, error: err instanceof Error ? err.message : 'Error interno' })
    }
  })

  app.get('/api/auth/google/callback', async c => {
    const env = getEnv()
    const url = new URL(c.req.url)
    const code = url.searchParams.get('code')
    if (!code) return c.text('Falta el parámetro code de Google', 400)
    try {
      const { accessToken, refreshToken } = await intercambiarCodigo(env, code, `${url.origin}/api/auth/google/callback`)

      const uiRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      })
      if (!uiRes.ok) throw new Error('No se pudo leer el email de Google')
      const ui = (await uiRes.json()) as { email?: string }
      if (!ui.email) throw new Error('Google no devolvió email')

      if (!env.SECRET_CIFRADO) throw new Error('Configuración OAuth pendiente (falta SECRET_CIFRADO)')
      const repoControl = deps.makeRepo(env)
      const previos = await repoControl.listTokensGoogle()
      const previo = previos.find(x => x.email.toLowerCase() === ui.email.toLowerCase())

      let spreadsheetId = previo?.spreadsheet_id ?? ''
      if (!spreadsheetId) {
        const apiDueño = new SheetsApi(async () => accessToken)
        const hoja = await connectOrCreateSpreadsheet(apiDueño)
        spreadsheetId = hoja.spreadsheetId
      }

      await repoControl.saveTokenGoogle({
        email: ui.email,
        refresh_token_cifrado: encryptSecret(refreshToken, env.SECRET_CIFRADO),
        spreadsheet_id: spreadsheetId,
        conectado_en: new Date().toISOString().slice(0, 10),
        estado: 'activo'
      })

      return c.html(`<html lang="es"><body style="font-family:sans-serif;text-align:center;padding-top:4rem">
        <h2>Negocio conectado ✅</h2>
        <p>${ui.email} ya tiene su hoja propia. Puedes cerrar esta pestaña.</p>
      </body></html>`)
    } catch (err) {
      console.error('[oauth] callback:', err)
      return c.html(`<html lang="es"><body style="font-family:sans-serif;text-align:center;padding-top:4rem">
        <h2>No pudimos conectar</h2><p>${err instanceof Error ? err.message : 'Error interno'}</p>
      </body></html>`, 500)
    }
  })
```

Importar también `crypto` global: en Node 22+ existe como global `crypto.randomUUID()`; si el tsconfig lo marca ausente, usar `randomUUID` de `'node:crypto'`. Y `new SheetsApi(...)` requiere import: `import { SheetsApi } from '@ft/shared'` (añadir a la lista).

- [ ] **Step 4: Run tests completos del paquete**

Run: `pnpm --filter @ft/backend test`
Expected: PASS (incluye suites previas intactas)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/index.ts apps/backend/tests/oauth-callback.test.ts
git commit -m "feat(backend): conexión Google del dueño (/iniciar + /callback)"
```

---

### Task 6: Resolución multi-tenant del repositorio por `owner`

**Files:**
- Create: `apps/backend/src/multitenant.ts`
- Modify: `apps/backend/src/index.ts` (función `proxy`, líneas ~50-58)
- Test: `apps/backend/tests/multitenant.test.ts`

**Interfaces:**
- Consumes: Task 4 (`crearSheetsApiDeDueño`), shared (`createRepository`, `StorageAdapter`, `Repository`).
- Produces: `crearRepoDeDueño(env: Env, repoControl: Repository, ownerEmail: string): Promise<Repository>` — repo apuntando a la hoja del dueño con SU token. El proxy lo usa cuando `claims.owner ≠ env.OWNER_EMAIL`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/tests/multitenant.test.ts
import { describe, expect, it, vi } from 'vitest'
import { crearRepoDeDueño } from '../src/multitenant'
import type { Env } from '../src/env'
import type { Repository } from '@ft/shared'

const ENV: Env = {
  OAUTH_CLIENT_ID: 'cid',
  SERVICE_ACCOUNT_JSON: { client_email: 'a@b.iam', private_key: 'x' },
  SECRET_JWT: 'jwt',
  SPREADSHEET_ID: 'CONTROL',
  OWNER_EMAIL: 'owner@ft.com',
  OAUTH_CLIENT_SECRET: 'sec',
  SECRET_CIFRADO: 'k'.repeat(32)
}

function repoControlFalso(token: { email: string; refresh_token_cifrado: string; spreadsheet_id: string; estado: string }): Repository {
  return { listTokensGoogle: async () => [token] } as unknown as Repository
}

describe('crearRepoDeDueño', () => {
  it('dueño desconocido lanza error claro', async () => {
    const vacio = { listTokensGoogle: async () => [] } as unknown as Repository
    await expect(crearRepoDeDueño(ENV, vacio, 'nadie@ft.com')).rejects.toThrow('sin conectar Google')
  })

  it('dueño conectado produce repo que resuelve SU spreadsheet', async () => {
    // RT real cifrado con la misma clave del ENV
    const { encryptSecret } = await import('../src/crypto')
    const cifrado = encryptSecret('RT_VALIDO', ENV.SECRET_CIFRADO!)
    const repo = await crearRepoDeDueño(
      ENV,
      repoControlFalso({ email: 'dueño@ft.com', refresh_token_cifrado: cifrado, spreadsheet_id: 'SS_DUEÑO', estado: 'activo' }),
      'Dueño@FT.com'
    )
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'AT', expires_in: 3600 }), { status: 200 })
      }
      // Cubre getSpreadsheet ({sheets}) y values:batchGet ({valueRanges})
      return new Response(JSON.stringify({ spreadsheetId: 'SS_DUEÑO', sheets: [], valueRanges: [] }), { status: 200 })
    }))
    // listClientes fuerza lectura contra SS_DUEÑO usando AT del refresh
    await expect(repo.listUsuarios()).resolves.toBeDefined()
    vi.unstubAllGlobals()
  })

  it('refresh token revocado propaga ACCESO_REVOCADO', async () => {
    const { encryptSecret } = await import('../src/crypto')
    const cifrado = encryptSecret('RT_MUERTO', ENV.SECRET_CIFRADO!)
    const repo = await crearRepoDeDueño(
      ENV,
      repoControlFalso({ email: 'd@ft.com', refresh_token_cifrado: cifrado, spreadsheet_id: 'SS', estado: 'activo' }),
      'd@ft.com'
    )
    vi.stubGlobal('fetch', vi.fn(async () => new Response('invalid_grant', { status: 400 })))
    await expect(repo.listUsuarios()).rejects.toThrow('ACCESO_REVOCADO')
    vi.unstubAllGlobals()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ft/backend exec vitest run tests/multitenant.test.ts`
Expected: FAIL — módulo no existe

- [ ] **Step 3: Implement**

```ts
// apps/backend/src/multitenant.ts
import { createRepository, type Repository, type StorageAdapter } from '@ft/shared'
import type { Env } from './env'
import { crearSheetsApiDeDueño } from './google'

const STORAGE_NULO: StorageAdapter = {
  get: async () => null,
  set: async () => {},
  remove: async () => {}
}

/** Repo del negocio del dueño: SU hoja, SU cuota de Google. */
export async function crearRepoDeDueño(env: Env, repoControl: Repository, ownerEmail: string): Promise<Repository> {
  const { api, spreadsheetId } = await crearSheetsApiDeDueño(env, repoControl, ownerEmail)
  return createRepository({ api, storage: STORAGE_NULO, getSpreadsheetId: async () => spreadsheetId })
}
```

En `apps/backend/src/index.ts`, dentro de `proxy`, reemplazar la rama de sesión (bloque `if (input.token)`) por:

```ts
      if (input.token) {
        const claims = await verificarSessionJwt(env.SECRET_JWT, String(input.token))
        if (claims.dev) {
          const devs = await repo.listDispositivos()
          if (!devs.some(d => d.dispositivo === claims.dev)) throw new Error('Sesión revocada')
        }
        const p = permsFromSession(claims)
        const owner = claims.owner ?? env.OWNER_EMAIL
        const repoDestino = owner.toLowerCase() === env.OWNER_EMAIL.toLowerCase()
          ? repo
          : await crearRepoDeDueño(env, repo, owner)
        const data = await route(repoDestino, input.action, input.payload, p)
        return c.json({ ok: true, data })
      }
```

Añadir import: `import { crearRepoDeDueño } from './multitenant'`.

- [ ] **Step 4: Suite completa + typecheck**

Run: `pnpm --filter @ft/backend test && pnpm --filter @ft/backend typecheck && pnpm --filter @ft/shared test`
Expected: PASS todo (los flujos actuales emiten `owner = env.OWNER_EMAIL` → comportamiento idéntico al de hoy)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/multitenant.ts apps/backend/src/index.ts apps/backend/tests/multitenant.test.ts
git commit -m "feat(backend): resolución multi-tenant del repo según claims.owner"
```

---

## Verificación manual post-plan (sin automatizar)

1. Configurar en Vercel/local: `OAUTH_CLIENT_SECRET` (de Google Cloud Console → OAuth client web) y `SECRET_CIFRADO` (`openssl rand -base64 32`).
2. En Google Cloud Console, agregar `https://<dominio>/api/auth/google/callback` a los redirect URIs del cliente OAuth.
3. Visitar `https://<dominio>/api/auth/google/iniciar` con la cuenta del dueño → aceptar → verificar pantalla "Negocio conectado" y fila nueva en pestaña `TokensGoogle` de la hoja de control.
4. Confirmar que la hoja creada aparece en el Drive DEL DUEÑO (no en el service account) y que la app sigue funcionando igual para `OWNER_EMAIL` (extensión incluida).

## Fase 2 (fuera de alcance, siguiente plan)

- Códigos de acceso por negocio: mover `Codigos_Acceso` al sheet de cada dueño y buscar el código entre negocios al hacer login (`/api/auth/codigo`).
- Emisión de sesiones con `owner` ≠ `OWNER_EMAIL` (vendedores facturando contra la hoja de su dueño).
- Panel "Mi conexión" (reconectar si `ACCESO_REVOCADO`, borrar token con `deleteTokenGoogle`).
