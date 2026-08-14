# Compartir por Roles (visitantes + asistentes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que el dueño del spreadsheet comparta la app con visitantes de solo lectura y con asistentes que crean/editan ciertos módulos, sin exponer jamás la hoja de cálculo cruda (todo pasa por un backend Apps Script que filtra server-side).

**Architecture:** Se agrega un backend **Google Apps Script** desplegado como web app que ejecuta como el dueño (`USER_DEPLOYING`, acceso `ANYONE_ANONYMOUS`). El backend identifica a cada visitante verificando su **Google id_token** contra `tokeninfo` y aplica los permisos definidos en una nueva hoja `Usuarios`. La web app en modo visitante usa un `RemoteRepository` (misma interfaz `Repository`) que habla con el backend en vez de con la Sheets API. El modo dueño queda intacto (Sheets directo). El código del backend se **bundlea desde TypeScript compartido** con esbuild para no duplicar lógica de negocio (IVA, folio, mutex, schemas).

**Tech Stack:** Google Apps Script (V8), esbuild (bundle TS→`.gs`), TypeScript, pnpm workspace, zod (validación compartida), React 19 + react-query (web), Vitest (tests).

## Global Constraints

- pnpm 11.1.2, Node 22+. Workspace pnpm con `apps/*` y `packages/*`.
- `@ft/shared` se consume desde fuente (`main: ./src/index.ts`); NO tiene build propio.
- TypeScript `strict`, `moduleResolution: Bundler`, target ES2022. El bundle del backend usa target `es2020`, platform `neutral`, format `iife`.
- **El backend importa SOLO módulos hoja de `packages/shared`** (nunca el barrel `index.ts`, que arrastraría React/zustand al bundle).
- La hoja de cálculo se mantiene **privada del dueño**. Nunca compartirla por Google, nunca dar acceso de editor al proyecto Apps Script.
- Permisos de verdad en el **servidor** (backend). El cliente usa permisos solo para UI (ocultar botones/nav).
- `admin` = dueño (email efectivo del deploy). Determinado en el backend por `Session.getEffectiveUser().getEmail()`.
- Código sin comentarios (regla del repo). UI en español.
- Espacios: 2. Idiomas de código en inglés, copy en español.

---

## Task 1: Modelo de roles y permisos

**Files:**
- Create: `packages/shared/src/roles/roles.ts`
- Test: `packages/shared/tests/roles.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type ModuleKey = 'dashboard' | 'facturas' | 'clientes' | 'gastos' | 'empleados' | 'proveedores' | 'cuentas' | 'reportes'`
  - `type UserRole = 'admin' | 'asistente' | 'solo_lectura' | 'ver_facturas' | 'ver_reportes' | 'ver_gastos' | 'ver_empleados' | 'ver_cuentas' | 'personalizado'`
  - `interface Usuario { email: string; rol: UserRole; modulos_ver: string; modulos_editar: string }`
  - `interface Perms { isAdmin: boolean; rol: UserRole | null; canView(m: ModuleKey): boolean; canEdit(m: ModuleKey): boolean }`
  - `interface PermsInfo { isAdmin: boolean; rol: UserRole | null; view: ModuleKey[]; edit: ModuleKey[] }`
  - `const MODULE_KEYS: readonly ModuleKey[]`
  - `const ROLE_PRESETS: Record<'solo_lectura'|'ver_facturas'|'ver_reportes'|'ver_gastos'|'ver_empleados'|'ver_cuentas', ModuleKey[]>`
  - `function parseModules(csv: string): ModuleKey[]`
  - `function viewModulesOf(u: Usuario): ModuleKey[]`
  - `function editModulesOf(u: Usuario): ModuleKey[]`
  - `function permsFor(email: string, ownerEmail: string, u: Usuario | null): Perms`
  - `function permsFromInfo(info: PermsInfo): Perms`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { parseModules, viewModulesOf, editModulesOf, permsFor, MODULE_KEYS, ROLE_PRESETS } from '../src/roles/roles'
import type { Usuario } from '../src/roles/roles'

const u = (rol: Usuario['rol'], ver = '', editar = ''): Usuario => ({ email: 'a@b.c', rol, modulos_ver: ver, modulos_editar: editar })

describe('parseModules', () => {
  it('filtra solo keys válidas', () => {
    expect(parseModules('facturas,reportes,noexiste')).toEqual(['facturas', 'reportes'])
    expect(parseModules('')).toEqual([])
  })
})

describe('presets', () => {
  it('solo_lectura ve todos los módulos', () => {
    expect(ROLE_PRESETS.solo_lectura).toEqual([...MODULE_KEYS])
  })
  it('ver_facturas ve dashboard, facturas y clientes', () => {
    expect(ROLE_PRESETS.ver_facturas).toEqual(['dashboard', 'facturas', 'clientes'])
  })
})

describe('viewModulesOf', () => {
  it('personalizado usa modulos_ver', () => {
    expect(viewModulesOf(u('personalizado', 'gastos,reportes'))).toEqual(['gastos', 'reportes'])
  })
  it('asistente ve editar ∪ ver', () => {
    expect(viewModulesOf(u('asistente', 'reportes', 'gastos,facturas'))).toEqual(['reportes', 'gastos', 'facturas'])
  })
  it('preset usa su mapa', () => {
    expect(viewModulesOf(u('ver_reportes'))).toEqual(['dashboard', 'reportes'])
  })
})

describe('editModulesOf', () => {
  it('solo asistente edita sus módulos', () => {
    expect(editModulesOf(u('asistente', '', 'clientes'))).toEqual(['clientes'])
    expect(editModulesOf(u('solo_lectura'))).toEqual([])
    expect(editModulesOf(u('personalizado'))).toEqual([])
  })
})

describe('permsFor', () => {
  it('dueño es admin', () => {
    const p = permsFor('d@e.f', 'd@e.f', null)
    expect(p.isAdmin).toBe(true)
    expect(p.canView('facturas')).toBe(true)
    expect(p.canEdit('gastos')).toBe(true)
  })
  it('email no registrado → sin acceso', () => {
    const p = permsFor('x@y.z', 'd@e.f', null)
    expect(p.isAdmin).toBe(false)
    expect(p.canView('facturas')).toBe(false)
  })
  it('asistente puede editar solo sus módulos', () => {
    const p = permsFor('a@b.c', 'd@e.f', u('asistente', '', 'gastos'))
    expect(p.canEdit('gastos')).toBe(true)
    expect(p.canEdit('facturas')).toBe(false)
    expect(p.canView('gastos')).toBe(true)
  })
  it('ignora mayúsculas en email', () => {
    const p = permsFor('A@B.C', 'd@e.f', u('ver_gastos'))
    expect(p.canView('gastos')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ft/shared test -- roles`
Expected: FAIL con "Cannot find module '../src/roles/roles'"

- [ ] **Step 3: Write the implementation**

```ts
export const MODULE_KEYS = ['dashboard', 'facturas', 'clientes', 'gastos', 'empleados', 'proveedores', 'cuentas', 'reportes'] as const
export type ModuleKey = (typeof MODULE_KEYS)[number]

export type UserRole = 'admin' | 'asistente' | 'solo_lectura' | 'ver_facturas' | 'ver_reportes' | 'ver_gastos' | 'ver_empleados' | 'ver_cuentas' | 'personalizado'

export interface Usuario {
  email: string
  rol: UserRole
  modulos_ver: string
  modulos_editar: string
}

export interface Perms {
  isAdmin: boolean
  rol: UserRole | null
  canView(m: ModuleKey): boolean
  canEdit(m: ModuleKey): boolean
}

export interface PermsInfo {
  isAdmin: boolean
  rol: UserRole | null
  view: ModuleKey[]
  edit: ModuleKey[]
}

export const ROLE_PRESETS: Record<'solo_lectura' | 'ver_facturas' | 'ver_reportes' | 'ver_gastos' | 'ver_empleados' | 'ver_cuentas', ModuleKey[]> = {
  solo_lectura: [...MODULE_KEYS],
  ver_facturas: ['dashboard', 'facturas', 'clientes'],
  ver_reportes: ['dashboard', 'reportes'],
  ver_gastos: ['dashboard', 'gastos'],
  ver_empleados: ['dashboard', 'empleados'],
  ver_cuentas: ['dashboard', 'proveedores', 'cuentas']
}

export function parseModules(csv: string): ModuleKey[] {
  return csv.split(',').map(s => s.trim()).filter((m): m is ModuleKey => (MODULE_KEYS as readonly string[]).includes(m))
}

export function viewModulesOf(u: Usuario): ModuleKey[] {
  if (u.rol === 'admin') return [...MODULE_KEYS]
  if (u.rol === 'personalizado') return parseModules(u.modulos_ver)
  if (u.rol === 'asistente') {
    const ver = parseModules(u.modulos_ver)
    const editar = parseModules(u.modulos_editar)
    return Array.from(new Set([...ver, ...editar]))
  }
  return ROLE_PRESETS[u.rol] ?? []
}

export function editModulesOf(u: Usuario): ModuleKey[] {
  if (u.rol === 'admin') return [...MODULE_KEYS]
  if (u.rol === 'asistente') return parseModules(u.modulos_editar)
  return []
}

export function permsFor(email: string, ownerEmail: string, u: Usuario | null): Perms {
  const e = email.toLowerCase()
  if (e && e === ownerEmail.toLowerCase()) {
    return { isAdmin: true, rol: 'admin', canView: () => true, canEdit: () => true }
  }
  if (!u) return { isAdmin: false, rol: null, canView: () => false, canEdit: () => false }
  const view = new Set(viewModulesOf(u))
  const edit = new Set(editModulesOf(u))
  return {
    isAdmin: false,
    rol: u.rol,
    canView: m => view.has(m),
    canEdit: m => edit.has(m)
  }
}

export function permsFromInfo(info: PermsInfo): Perms {
  const view = new Set(info.view)
  const edit = new Set(info.edit)
  return {
    isAdmin: info.isAdmin,
    rol: info.rol,
    canView: m => view.has(m),
    canEdit: m => edit.has(m)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ft/shared test -- roles`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/roles/roles.ts packages/shared/tests/roles.test.ts
git commit -m "feat: modelo de roles y permisos para compartir"
```

---

## Task 2: Tabla `Usuarios`, schema y exports

**Files:**
- Modify: `packages/shared/src/sheets/tables.ts`
- Modify: `packages/shared/src/types/schemas.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/tests/sheets.test.ts`

**Interfaces:**
- Consumes: `Usuario`, `UserRole` de `roles/roles` (Task 1).
- Produces:
  - `TableName` incluye `'Usuarios'`; `TABLES.Usuarios` con columnas `email | rol | modulos_ver | modulos_editar`.
  - `export const UsuarioSchema` (zod) validando email, rol (`UserRole` sin `admin`), `modulos_ver`, `modulos_editar`.
  - Exports desde `@ft/shared`: `roles/*`, `UsuarioSchema`.

- [ ] **Step 1: Write the failing test (append a `describe` block to `sheets.test.ts`)**

```ts
describe('Usuarios', () => {
  it('serializa y deserializa una fila de Usuarios', () => {
    const spec = TABLES.Usuarios
    const row = serializeRow(spec, { email: 'a@b.c', rol: 'asistente', modulos_ver: 'facturas', modulos_editar: 'gastos' })
    expect(row).toEqual(['a@b.c', 'asistente', 'facturas', 'gastos'])
    const obj = deserializeRow(spec, row)
    expect(obj).toMatchObject({ email: 'a@b.c', rol: 'asistente', modulos_ver: 'facturas', modulos_editar: 'gastos' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ft/shared test -- sheets`
Expected: FAIL con "Property 'Usuarios' does not exist on type ... TABLES"

- [ ] **Step 3: Implement**

Primero, ajustar las 2 assertions existentes en `sheets.test.ts` que cuentan tablas (agregar `Usuarios`): el `describe('tables')` pasa de `toHaveLength(10)` a `toHaveLength(11)`, y el primer test de `ensureTables` incluye `'Usuarios'` en la lista hardcodeada de hojas existentes (ver el archivo y actualizar ambos valores; el resto del test queda igual).

En `tables.ts`:

```ts
export type TableName = 'Config' | 'Clientes' | 'Empleados' | 'Facturas' | 'Factura_Items' | 'Gastos' | 'Proveedores' | 'Cuentas_Pagar' | 'Pagos' | 'Metas' | 'Usuarios'
```

Dentro de `TABLES`, después de `Metas`:

```ts
  Usuarios: [
    { key: 'email', header: 'email', type: S },
    { key: 'rol', header: 'rol', type: S },
    { key: 'modulos_ver', header: 'modulos_ver', type: S },
    { key: 'modulos_editar', header: 'modulos_editar', type: S }
  ]
```

En `schemas.ts` (al final):

```ts
export const UsuarioSchema = z.object({
  email: z.string().min(1, 'Email obligatorio'),
  rol: z.enum(['asistente', 'solo_lectura', 'ver_facturas', 'ver_reportes', 'ver_gastos', 'ver_empleados', 'ver_cuentas', 'personalizado']),
  modulos_ver: z.string().default(''),
  modulos_editar: z.string().default('')
})
```

En `index.ts`:

```ts
export * from './roles/roles'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ft/shared test -- sheets`
Expected: PASS (incluye las 2 assertions actualizadas a 11 tablas)

- [ ] **Step 4b: Correr la suite completa**

Run: `pnpm --filter @ft/shared test`
Expected: PASS completo

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/sheets/tables.ts packages/shared/src/types/schemas.ts packages/shared/src/index.ts packages/shared/tests/sheets.test.ts
git commit -m "feat: tabla Usuarios y schema de acceso"
```

---

## Task 3: Config `share_backend_url` y repositorio de usuarios

**Files:**
- Modify: `packages/shared/src/types/entities.ts` (Config)
- Modify: `packages/shared/src/types/schemas.ts` (ConfigSchema)
- Modify: `packages/shared/src/sheets/createSpreadsheet.ts` (DEFAULT_CONFIG, configFromRows)
- Modify: `packages/shared/src/data/repository.ts` (métodos de Usuarios)
- Test: `packages/shared/tests/repository.test.ts`

**Interfaces:**
- Consumes: `Usuario`, `UsuarioSchema`, `TABLES.Usuarios`.
- Produces (en `Repository`, `repository.ts`):
  - `listUsuarios(): Promise<Usuario[]>`
  - `saveUsuario(u: Usuario): Promise<Usuario>` (upsert por `email`)
  - `deleteUsuario(email: string): Promise<void>`
  - `Config.share_backend_url: string`

- [ ] **Step 1: Write the failing test (append to `repository.test.ts`)**

```ts
describe('usuarios', () => {
  it('guarda, lista y elimina usuarios por email', async () => {
    const api = new SheetsApi(async () => 'token')
    const mockValues: Record<string, (string | number)[][]> = {
      'Usuarios': [['a@b.c', 'asistente', 'facturas', 'gastos']]
    }
    global.fetch = vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('values:batchGet')) {
        return { ok: true, json: async () => ({ valueRanges: [{ values: mockValues['Usuarios'] }] }) } as unknown as Response
      }
      if (u.includes('values:append')) return { ok: true, json: async () => ({}) } as unknown as Response
      if (u.includes('values:batchUpdate')) return { ok: true, json: async () => ({}) } as unknown as Response
      if (u.includes(':clear')) return { ok: true, json: async () => ({}) } as unknown as Response
      return { ok: true, json: async () => ({}) } as unknown as Response
    }) as unknown as typeof fetch
    const repo = createRepository({ api, storage: { get: async () => 'SID', set: async () => {}, remove: async () => {} }, getSpreadsheetId: async () => 'SID' })
    const list = await repo.listUsuarios()
    expect(list).toHaveLength(1)
    expect(list[0].email).toBe('a@b.c')
    const saved = await repo.saveUsuario({ email: 'x@y.z', rol: 'ver_gastos', modulos_ver: 'gastos', modulos_editar: '' })
    expect(saved.email).toBe('x@y.z')
    await repo.deleteUsuario('a@b.c')
  })
})
```

Nota: adapta el mock de `fetch` al patrón de mocks ya existente en `repository.test.ts` (revisar el archivo; si ya hay un helper de mock, reusarlo).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ft/shared test -- repository`
Expected: FAIL con "listUsuarios is not a function"

- [ ] **Step 3: Implement**

En `entities.ts` (Config): agregar al final de la interfaz:

```ts
  share_backend_url: string
```

En `schemas.ts` (ConfigSchema): agregar antes del cierre:

```ts
  share_backend_url: z.string().default('')
```

En `createSpreadsheet.ts` (DEFAULT_CONFIG): agregar:

```ts
  share_backend_url: ''
```

En `configFromRows` (mismo archivo): agregar al return:

```ts
    share_backend_url: map.get('share_backend_url') ?? '',
```

En `repository.ts`:

```ts
import type { Usuario } from '../roles/roles'
import { UsuarioSchema } from '../types/schemas'
```

Dentro del `return {` de `createRepository`:

```ts
    async listUsuarios(): Promise<Usuario[]> { return readTable('Usuarios') as unknown as Usuario[] },

    async saveUsuario(usuario: Usuario): Promise<Usuario> {
      const parsed = UsuarioSchema.parse(usuario)
      const saved = { ...parsed, email: parsed.email.trim().toLowerCase() } as Usuario
      await insertOrReplace('Usuarios', 'email', saved as unknown as Record<string, string | number>)
      return saved
    },

    async deleteUsuario(email: string): Promise<void> {
      const all = (await readTable('Usuarios')).filter(r => String(r.email).toLowerCase() !== email.toLowerCase())
      await replaceTable('Usuarios', all)
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ft/shared test -- repository`
Expected: PASS

- [ ] **Step 5: Typecheck todo el shared**

Run: `pnpm --filter @ft/web build` o `npx tsc -p packages/shared/tsconfig.json --noEmit`
Expected: sin errores

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types/entities.ts packages/shared/src/types/schemas.ts packages/shared/src/sheets/createSpreadsheet.ts packages/shared/src/data/repository.ts packages/shared/tests/repository.test.ts
git commit -m "feat: config de backend y CRUD de usuarios en repositorio"
```

---

## Task 4: Scaffold `apps/script` + esbuild

**Files:**
- Create: `apps/script/package.json`
- Create: `apps/script/tsconfig.json`
- Create: `apps/script/appsscript.json`
- Create: `apps/script/build.mjs`
- Create: `apps/script/src/backend.ts` (stub mínimo, se completa en Tasks 5-6)
- Modify: `package.json` (root) → script `build:script`
- Modify: `pnpm-workspace.yaml` (no hace falta: `apps/*` ya cubre `apps/script`)

**Interfaces:**
- Produces: `pnpm build:script` → genera `apps/script/dist/Code.js` (IIFE con `doPost`/`doGet` en `globalThis`).

- [ ] **Step 1: Write the failing build test (command)**

Crea `apps/script/src/backend.ts`:

```ts
declare const ContentService: { createTextOutput: (s: string) => { setMimeType: (m: { JSON: string }) => void } }

function respond(obj: unknown) {
  const out = ContentService.createTextOutput(JSON.stringify(obj))
  out.setMimeType(ContentService.MimeType.JSON)
  return out
}

function doGet() {
  return respond({ ok: true, service: 'ft-backend' })
}

const g = globalThis as Record<string, unknown>
g.doGet = doGet
g.doPost = doGet
```

- [ ] **Step 2: Run to verify it fails (no hay script aún)**

Run: `pnpm build:script`
Expected: FAIL con "Command build:script not found"

- [ ] **Step 3: Implement scaffold**

`apps/script/package.json`:

```json
{
  "name": "@ft/script",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node build.mjs",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "esbuild": "^0.25.0",
    "typescript": "^5.9.3"
  }
}
```

`apps/script/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "lib": ["ES2020", "DOM"],
    "types": [],
    "noEmit": true
  },
  "include": ["src"]
}
```

`apps/script/appsscript.json`:

```json
{
  "timeZone": "America/Mexico_City",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  }
}
```

`apps/script/build.mjs`:

```js
import { build } from 'esbuild'

await build({
  entryPoints: ['src/backend.ts'],
  outfile: 'dist/Code.js',
  bundle: true,
  format: 'iife',
  platform: 'neutral',
  target: 'es2020',
  minify: false,
  sourcemap: false,
  logLevel: 'info'
})
```

Root `package.json`: agregar en `scripts`:

```json
    "build:script": "pnpm --filter @ft/script build"
```

- [ ] **Step 4: Instalar y compilar**

```bash
pnpm install
pnpm build:script
```

Expected: genera `apps/script/dist/Code.js` y la salida dice "Done".

- [ ] **Step 5: Typecheck del script**

```bash
pnpm --filter @ft/script typecheck
```

Expected: sin errores (el stub usa `globalThis` y `declare const`).

- [ ] **Step 6: Commit**

```bash
git add apps/script package.json pnpm-lock.yaml
git commit -m "feat: scaffold apps/script con bundle esbuild"
```

---

## Task 5: Backend — auth, IO de hoja y endpoints de lectura

**Files:**
- Modify: `apps/script/src/backend.ts`
- Create: `apps/script/README.md` (notas de despliegue, referenciado en Task 13)

**Interfaces:**
- Consumes (módulos hoja de `packages/shared`):
  - `TABLES`, `sheetName`, `TableName`, `HEADER_ROWS` desde `../../../packages/shared/src/sheets/tables`
  - `serializeRow`, `deserializeRow`, `migrateFacturaLegacyRow` desde `.../sheets/rows`
  - `configFromRows`, `configToRows` desde `.../sheets/createSpreadsheet`
  - `permsFor`, `parseModules`, `type Perms`, `type PermsInfo`, `type Usuario`, `MODULE_KEYS` desde `.../roles/roles`
  - `kpisForMonth`, `gastosPorCategoria`, `topClientes` desde `.../calc/kpis`
  - `estadoDesdeSaldo` desde `.../calc/invoice`
  - `type Config`, `type Factura`, `type Gasto`, `type Cliente`, `type CuentaPagar`, `type Pago`, `type Empleado`, `type Proveedor`, `type FacturaItem` desde `.../types/entities`
- Produces: `doPost(e)` router con acciones de **lectura**; `doGet` de status; helper `verifyIdToken`.

- [ ] **Step 1: Write a stub call the backend will serve (document the contract in README)**

`apps/script/README.md`:

```markdown
# Backend FinanceTracker (Apps Script)

Backend desplegado como Google Apps Script web app. Ejecuta como el dueño (`USER_DEPLOYING`), acceso `ANYONE_ANONYMOUS`. Toda la autorización es a nivel de app vía `id_token` de Google.

## Despliegue (dueño, 1 vez)

1. Abrir el spreadsheet → Extensions → Apps Script.
2. Borrar `Code.gs` y pegar el contenido de `dist/Code.js` (generado con `pnpm build:script`).
3. Deploy → New deployment → **Web app** → "Execute as: **Me**" → "Who has access: **Anyone**".
4. Copiar la URL del deployment y pegarla en la app → sección **Compartir**.

## Protocolo

- POST con `Content-Type: text/plain` y body JSON:
  `{ "id_token": "<google id token>", "action": "<action>", "payload": {...} }`
- Respuesta: `{ "ok": true, "data": ... }` | `{ "ok": false, "error": "..." }`.
- Acciones de lectura: `getPerms`, `getConfig`, `listClientes`, `listFacturas`,
  `getFactura`, `listGastos`, `listEmpleados`, `listProveedores`, `listCxp`,
  `listPagos`, `getReportes`, `getCategorias`.
- Acciones de escritura (asistentes): `saveCliente`, `saveGasto`, `createFactura`.
```

- [ ] **Step 2: Implement helpers de auth e IO**

En `apps/script/src/backend.ts`, reemplaza el stub por:

```ts
import { TABLES, sheetName, HEADER_ROWS, type TableName } from '../../../packages/shared/src/sheets/tables'
import { serializeRow, deserializeRow, migrateFacturaLegacyRow } from '../../../packages/shared/src/sheets/rows'
import { configFromRows, configToRows } from '../../../packages/shared/src/sheets/createSpreadsheet'
import { permsFor, parseModules, type Perms, type PermsInfo, type Usuario, MODULE_KEYS } from '../../../packages/shared/src/roles/roles'
import { kpisForMonth, gastosPorCategoria, topClientes } from '../../../packages/shared/src/calc/kpis'
import { estadoDesdeSaldo } from '../../../packages/shared/src/calc/invoice'
import type { Config, Factura, Gasto, Cliente, CuentaPagar, Pago, Empleado, Proveedor, FacturaItem } from '../../../packages/shared/src/types/entities'

declare const SpreadsheetApp: any
declare const Session: any
declare const ContentService: any
declare const UrlFetchApp: any
declare const CacheService: any

const g = globalThis as Record<string, unknown>
const tokenCache = new Map<string, { email: string; at: number }>()

function ss() { return SpreadsheetApp.getActiveSpreadsheet() }

function sheet(t: TableName) { return ss().getSheetByName(sheetName(t)) }

function readRaw(t: TableName): (string | number)[][] {
  const s = sheet(t)
  if (!s) return []
  const values = s.getDataRange().getValues() as (string | number)[][]
  const skip = HEADER_ROWS(t)
  return skip ? values.slice(skip) : values
}

function readTable(t: TableName): Record<string, string | number>[] {
  const spec = TABLES[t]
  const data = readRaw(t)
  if (t === 'Facturas') return data.map(r => deserializeRow(spec, migrateFacturaLegacyRow(r))).filter(r => Object.values(r).some(v => v !== ''))
  return data.map(r => deserializeRow(spec, r)).filter(r => Object.values(r).some(v => v !== ''))
}

function appendRow(t: TableName, obj: Record<string, string | number>): void {
  const s = sheet(t)
  if (!s) return
  s.appendRow(serializeRow(TABLES[t], obj))
}

function replaceTable(t: TableName, rows: Record<string, string | number>[]): void {
  const s = sheet(t)
  if (!s) return
  const spec = TABLES[t]
  const base = HEADER_ROWS(t) + 1
  if (rows.length === 0) {
    s.getRange(base, 1, Math.max(1, s.getMaxRows() - base + 1), spec.length).clearContent()
    return
  }
  s.getRange(base, 1, rows.length, spec.length).setValues(rows.map(r => serializeRow(spec, r)))
  const extra = s.getMaxRows() - (base + rows.length - 1)
  if (extra > 0) s.getRange(base + rows.length, 1, extra, spec.length).clearContent()
}

function insertOrReplace(t: TableName, idKey: string, obj: Record<string, string | number>): void {
  const all = readTable(t)
  const exists = all.some(r => r[idKey] === obj[idKey])
  if (!exists) { appendRow(t, obj); return }
  replaceTable(t, all.map(r => (r[idKey] === obj[idKey] ? obj : r)))
}

function readConfig(): Config {
  const s = sheet('Config')
  if (!s) return { share_backend_url: '' } as unknown as Config
  const values = (s.getDataRange().getValues() as (string | number)[][]).filter(r => String(r[0]) !== 'mutex')
  return configFromRows(values)
}

function writeConfig(cfg: Config): void {
  const rows = configToRows(cfg)
  sheet('Config')!.getRange(1, 1, rows.length, 2).setValues(rows)
}

function mutexReadRow(clave: string): Promise<string | null> {
  const s = sheet('Config')
  if (!s) return Promise.resolve(null)
  const data = s.getDataRange().getValues() as (string | number)[][]
  for (const [k, v] of data) if (String(k) === clave) return Promise.resolve(String(v ?? ''))
  return Promise.resolve(null)
}

function mutexWriteRow(clave: string, valor: string): Promise<void> {
  const s = sheet('Config')!
  const data = s.getDataRange().getValues() as (string | number)[][]
  let row = -1
  for (let i = 0; i < data.length; i++) if (String(data[i][0]) === clave) { row = i + 1; break }
  if (row === -1) row = Math.max(data.length + 1, 27)
  s.getRange(`A${row}:B${row}`).setValues([[clave, valor]])
  return Promise.resolve()
}

async function verifyIdToken(idToken: string): Promise<string> {
  if (!idToken) throw new Error('Sesión requerida')
  const cached = tokenCache.get(idToken)
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.email
  const res = UrlFetchApp.fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`)
  const body = JSON.parse(res.getContentText())
  if (!body.email || body.email_verified !== true) throw new Error('Sesión inválida')
  tokenCache.set(idToken, { email: String(body.email), at: Date.now() })
  return String(body.email)
}

function ownerEmail(): string {
  return String(Session.getEffectiveUser().getEmail() ?? '')
}

function usuarios(): Usuario[] {
  return readTable('Usuarios') as unknown as Usuario[]
}

function usuarioFor(email: string): Usuario | null {
  const e = email.toLowerCase()
  return usuarios().find(u => u.email.toLowerCase() === e) ?? null
}

function permsInfo(p: Perms): PermsInfo {
  return {
    isAdmin: p.isAdmin,
    rol: p.rol,
    view: MODULE_KEYS.filter(m => p.canView(m)),
    edit: MODULE_KEYS.filter(m => p.canEdit(m))
  }
}

function sanitizeConfig(cfg: Config): Record<string, unknown> {
  const { contador_folio: _c, prefijo_folio: _p, ...rest } = cfg
  return rest
}
```

- [ ] **Step 3: Implement endpoints de lectura + router**

En el mismo archivo:

```ts
function denied(): never { throw new Error('No tienes permiso') }

function listFacturasFiltro(filtro: { estado?: string; mes?: string }): Factura[] {
  let rows = readTable('Facturas') as unknown as Factura[]
  if (filtro.mes) rows = rows.filter(f => f.fecha_emision.slice(0, 7) === filtro.mes)
  if (filtro.estado) {
    const pagos = readTable('Pagos')
    rows = rows.filter(f => {
      const tienePagos = pagos.some(p => p.id_origen === f.id_factura)
      const est = estadoDesdeSaldo(Number(f.saldo), Number(f.total), tienePagos)
      if (filtro.estado === 'pendientes') return est === 'pendiente' || est === 'parcial'
      return est === filtro.estado
    })
  }
  return rows
}

async function route(action: string, payload: any, p: Perms): Promise<unknown> {
  switch (action) {
    case 'getPerms': return permsInfo(p)
    case 'getConfig': {
      const cfg = readConfig()
      return p.isAdmin ? cfg : sanitizeConfig(cfg)
    }
    case 'listClientes':
      if (!p.canView('clientes')) return denied()
      return readTable('Clientes')
    case 'listFacturas':
      if (!p.canView('facturas')) return denied()
      return listFacturasFiltro(payload ?? {})
    case 'getFactura': {
      if (!p.canView('facturas')) return denied()
      const facturas = readTable('Facturas') as unknown as Factura[]
      const factura = facturas.find(f => f.id_factura === payload)
      if (!factura) throw new Error('Factura no existe')
      const items = (readTable('Factura_Items') as unknown as FacturaItem[]).filter(i => i.id_factura === payload)
      return { factura, items }
    }
    case 'listGastos':
      if (!p.canView('gastos')) return denied()
      return readTable('Gastos')
    case 'listEmpleados':
      if (!p.canView('empleados')) return denied()
      return readTable('Empleados')
    case 'listProveedores':
      if (!p.canView('proveedores')) return denied()
      return readTable('Proveedores')
    case 'listCxp':
      if (!p.canView('cuentas')) return denied()
      return readTable('Cuentas_Pagar')
    case 'listPagos':
      if (!p.canView('cuentas') && !p.canView('facturas')) return denied()
      const pagos = readTable('Pagos') as unknown as Pago[]
      return payload ? pagos.filter(p => p.id_origen === payload) : pagos
    case 'getReportes': {
      if (!p.canView('reportes') && !p.canView('dashboard')) return denied()
      const mes = String(payload ?? '')
      const facturas = readTable('Facturas') as unknown as Factura[]
      const gastos = readTable('Gastos') as unknown as Gasto[]
      const cxps = readTable('Cuentas_Pagar') as unknown as CuentaPagar[]
      const pagos = readTable('Pagos') as unknown as Pago[]
      const kpis = kpisForMonth(facturas, gastos, cxps, pagos, mes)
      const categorias = gastosPorCategoria(gastos.filter(g => g.fecha.slice(0, 7) === mes))
      const top = topClientes(facturas.filter(f => f.fecha_emision.slice(0, 7) === mes))
      return { kpis, categorias, top }
    }
    case 'getCategorias': {
      if (!p.canView('gastos') && !p.canView('cuentas')) return denied()
      const cfg = readConfig()
      const raw = payload === 'cxp' ? cfg.categorias_cxp : cfg.categorias_gastos
      return raw.split(',').map(s => s.trim()).filter(Boolean)
    }
    default:
      return denied()
  }
}

async function handle(e: any): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const body = JSON.parse(e.postData.contents)
    const email = await verifyIdToken(body.id_token)
    const p = permsFor(email, ownerEmail(), usuarioFor(email))
    const data = await route(body.action, body.payload, p)
    return { ok: true, data }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Error interno' }
  }
}

function respond(obj: unknown) {
  const out = ContentService.createTextOutput(JSON.stringify(obj))
  out.setMimeType(ContentService.MimeType.JSON)
  return out
}

function doGet() {
  return respond({ ok: true, service: 'ft-backend' })
}

async function doPost(e: any) {
  return respond(await handle(e))
}

g.doGet = doGet
g.doPost = doPost
```

Nota: `handle` es async y `respond` lo serializa; Apps Script resuelve la promesa al responder (`doPost` puede devolver la promesa sin problema en V8).

- [ ] **Step 4: Build + typecheck**

```bash
pnpm build:script
pnpm --filter @ft/script typecheck
```

Expected: sin errores, `dist/Code.js` generado.

- [ ] **Step 5: Commit**

```bash
git add apps/script
git commit -m "feat: backend Apps Script con auth y endpoints de lectura"
```

---

## Task 6: Backend — escrituras de asistente (cliente, gasto, factura)

**Files:**
- Modify: `apps/script/src/backend.ts`

**Interfaces:**
- Consumes (módulos hoja):
  - `buildFactura`, `round2` desde `.../calc/invoice`
  - `expandFolioTemplate` desde `.../calc/folio`
  - `uid` desde `.../lib/uid`
  - `withMutex` desde `.../sheets/mutex`
  - `ClienteSchema`, `GastoSchema`, `FacturaInputSchema` desde `.../types/schemas`
  - `getCurrency` desde `.../currency`
- Produces: acciones `saveCliente`, `saveGasto`, `createFactura` en el router, cada una exigiendo `canEdit('clientes' | 'gastos' | 'facturas')`.

- [ ] **Step 1: Write the failing test (compile-time contract)**

Añade los imports al tope de `backend.ts`:

```ts
import { buildFactura, round2 } from '../../../packages/shared/src/calc/invoice'
import { expandFolioTemplate } from '../../../packages/shared/src/calc/folio'
import { uid } from '../../../packages/shared/src/lib/uid'
import { withMutex } from '../../../packages/shared/src/sheets/mutex'
import { ClienteSchema, GastoSchema, FacturaInputSchema } from '../../../packages/shared/src/types/schemas'
import { getCurrency } from '../../../packages/shared/src/currency'
```

- [ ] **Step 2: Run typecheck to verify the contract still compiles**

Run: `pnpm --filter @ft/script typecheck`
Expected: PASS (aún no se usan; se usan en Step 3)

- [ ] **Step 3: Implement las funciones de escritura**

```ts
function todayISO(): string { return new Date().toISOString().slice(0, 10) }

function backendSaveCliente(c: Cliente): Cliente {
  const parsed = ClienteSchema.parse(c)
  const saved = { ...parsed, id_cliente: parsed.id_cliente || uid('cli_'), fecha_registro: parsed.fecha_registro || todayISO() } as unknown as Cliente
  insertOrReplace('Clientes', 'id_cliente', saved as unknown as Record<string, string | number>)
  return saved
}

function backendSaveGasto(ga: Gasto): Gasto {
  const parsed = GastoSchema.parse(ga)
  const saved = { ...parsed, id_gasto: parsed.id_gasto || uid('gas_'), monto: round2(parsed.monto) } as unknown as Gasto
  insertOrReplace('Gastos', 'id_gasto', saved as unknown as Record<string, string | number>)
  return saved
}

async function backendCreateFactura(input: { id_cliente: string; items: { descripcion: string; cantidad: number; precio_unitario: number }[]; fecha_emision: string; fecha_vencimiento: string; notas: string }): Promise<Factura> {
  const parsed = FacturaInputSchema.parse(input)
  const clientes = readTable('Clientes') as unknown as Cliente[]
  const cliente = clientes.find(c => c.id_cliente === parsed.id_cliente)
  if (!cliente) throw new Error('Cliente no existe')
  const cfg = readConfig()
  const { items, totals } = buildFactura(parsed.items, cfg.iva_porcentaje, getCurrency(cfg.moneda).decimals)
  const id_factura = uid('fac_')
  const folio = await withMutex(mutexReadRow, mutexWriteRow, async () => {
    const c = readConfig()
    const folioN = c.contador_folio
    writeConfig({ ...c, contador_folio: c.contador_folio + 1 })
    return `${expandFolioTemplate(c.prefijo_folio, parsed.fecha_emision)}${String(folioN).padStart(3, '0')}`
  })
  const factura: Factura = {
    id_factura,
    folio,
    id_cliente: parsed.id_cliente,
    nombre_cliente: String(cliente.nombre),
    fecha_emision: parsed.fecha_emision,
    fecha_vencimiento: parsed.fecha_vencimiento,
    subtotal: totals.subtotal,
    iva: totals.iva,
    total: totals.total,
    saldo: totals.total,
    fecha_pago: '',
    notas: parsed.notas
  }
  appendRow('Facturas', factura as unknown as Record<string, string | number>)
  for (const it of items) appendRow('Factura_Items', { id_factura, ...it } as unknown as Record<string, string | number>)
  return factura
}
```

- [ ] **Step 4: Registrar acciones en el router**

En `route`, antes de `default`:

```ts
    case 'saveCliente':
      if (!p.canEdit('clientes')) return denied()
      return backendSaveCliente(payload)
    case 'saveGasto':
      if (!p.canEdit('gastos')) return denied()
      return backendSaveGasto(payload)
    case 'createFactura':
      if (!p.canEdit('facturas')) return denied()
      return backendCreateFactura(payload)
```

- [ ] **Step 5: Build + typecheck**

```bash
pnpm build:script
pnpm --filter @ft/script typecheck
```

Expected: sin errores; `dist/Code.js` incluye la lógica de folio.

- [ ] **Step 6: Commit**

```bash
git add apps/script/src/backend.ts
git commit -m "feat: escrituras de asistente en backend (cliente, gasto, factura)"
```

---

## Task 7: Smoke test del backend (manual, checklist)

**Files:** ninguno.

- [ ] **Step 1: Deploy en un spreadsheet de prueba**

Siguiendo `apps/script/README.md`: pegar `dist/Code.js` en un proyecto Apps Script **contenido** en un spreadsheet de prueba con una hoja `Usuarios` con 1 fila (`email|rol|modulos_ver|modulos_editar` + tu cuenta como `asistente` con `modulos_editar=gastos`). Deploy web app: "Execute as: Me", "Access: Anyone". Copiar URL.

- [ ] **Step 2: Probar GET de status**

Abrir la URL en el navegador (sin sesión): debe responder JSON `{ "ok": true, "service": "ft-backend" }`.

- [ ] **Step 3: Probar POST con curl (token del propio Google)**

```bash
curl -s -X POST "<URL>" \
  -H "Content-Type: text/plain" \
  -d '{"id_token":"<token>","action":"getPerms","payload":{}}'
```

Obtén un id_token de prueba con OAuth Playground (scope `openid email`) y verifica que `getPerms` refleja `rol: asistente` y `edit: ["gastos"]`. Con un email no listado → `{ "ok": false, "error": "No tienes permiso" }`.

- [ ] **Step 4: Verificar CORS desde navegador**

En la consola de la web app en modo visitante (después de Task 10) confirmar que el fetch cross-origin recibe la respuesta. Si el navegador bloquea por CORS (falta `Access-Control-Allow-Origin`), registrar el hallazgo: se resolverá en Task 8 con `Content-Type: text/plain` (request simple, sin preflight) y, si aún falla, documentar la mitigación (servir el backend bajo el mismo dominio vía un proxy `?proxy=` del web app o migrar a Cloudflare Worker).

- [ ] **Step 5: Commit (si hubo cambios)**

```bash
git status
```

Sin cambios esperados; este task valida el despliegue. Si se corrige algo, commit con mensaje `fix(script): ...`.

---

## Task 8: `RemoteRepository`

**Files:**
- Create: `packages/shared/src/data/remoteRepository.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/tests/remoteRepository.test.ts`

**Interfaces:**
- Consumes: `type Repository` de `./repository`, `type PermsInfo` de `../roles/roles`.
- Produces:
  - `interface RemoteRepositoryCtx { apiUrl: string; getIdToken: () => Promise<string> }`
  - `function createRemoteRepository(ctx: RemoteRepositoryCtx): Repository & { getPerms(): Promise<PermsInfo> }`
  - POST a `apiUrl` con `Content-Type: text/plain` y body `{ id_token, action, payload }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRemoteRepository } from '../src/data/remoteRepository'

const fetchMock = vi.fn()

describe('createRemoteRepository', () => {
  beforeEach(() => { fetchMock.mockReset() })
  it('envía id_token y action; parsea data', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: [{ id: 1 }] }) })
    const repo = createRemoteRepository({ apiUrl: 'https://script.example/exec', getIdToken: async () => 'TOK' })
    const res = await repo.listClientes()
    expect(res).toEqual([{ id: 1 }])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://script.example/exec')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('text/plain')
    expect(init.body).toBe(JSON.stringify({ id_token: 'TOK', action: 'listClientes', payload: {} }))
  })
  it('lanza el error del backend', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: false, error: 'No tienes permiso' }) })
    const repo = createRemoteRepository({ apiUrl: 'https://script.example/exec', getIdToken: async () => 'TOK' })
    await expect(repo.deleteGasto('x')).rejects.toThrow('No tienes permiso')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ft/shared test -- remoteRepository`
Expected: FAIL con "Cannot find module"

- [ ] **Step 3: Implement**

```ts
import type { Repository } from './repository'
import type { PermsInfo } from '../roles/roles'

export interface RemoteRepositoryCtx {
  apiUrl: string
  getIdToken: () => Promise<string>
}

export function createRemoteRepository(ctx: RemoteRepositoryCtx): Repository & { getPerms(): Promise<PermsInfo> } {
  async function call<T>(action: string, payload: unknown = {}): Promise<T> {
    const idToken = await ctx.getIdToken()
    const res = await fetch(ctx.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ id_token: idToken, action, payload })
    })
    const data = (await res.json()) as { ok: boolean; data?: T; error?: string }
    if (!data.ok) throw new Error(data.error ?? 'Error')
    return data.data as T
  }
  return {
    getPerms: () => call('getPerms'),
    getConfig: () => call('getConfig'),
    saveConfig: c => call('saveConfig', c),
    listClientes: () => call('listClientes'),
    saveCliente: c => call('saveCliente', c),
    deleteCliente: id => call('deleteCliente', id),
    createFactura: i => call('createFactura', i),
    listFacturas: f => call('listFacturas', f ?? {}),
    getFactura: id => call('getFactura', id),
    deleteFactura: id => call('deleteFactura', id),
    listGastos: f => call('listGastos', f ?? {}),
    saveGasto: ga => call('saveGasto', ga),
    deleteGasto: id => call('deleteGasto', id),
    listProveedores: () => call('listProveedores'),
    saveProveedor: pr => call('saveProveedor', pr),
    deleteProveedor: id => call('deleteProveedor', id),
    listEmpleados: () => call('listEmpleados'),
    saveEmpleado: e => call('saveEmpleado', e),
    deleteEmpleado: id => call('deleteEmpleado', id),
    registerNomina: i => call('registerNomina', i),
    createCxp: i => call('createCxp', i),
    listCxp: f => call('listCxp', f ?? {}),
    deleteCxp: id => call('deleteCxp', id),
    registerPago: p => call('registerPago', p),
    listPagos: id => call('listPagos', id ?? null),
    getReportes: mes => call('getReportes', mes),
    getCategorias: kind => call('getCategorias', kind),
    listUsuarios: () => call('listUsuarios'),
    saveUsuario: u => call('saveUsuario', u),
    deleteUsuario: email => call('deleteUsuario', email)
  }
}
```

En `index.ts`, exportar:

```ts
export * from './data/remoteRepository'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ft/shared test -- remoteRepository`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/data/remoteRepository.ts packages/shared/src/index.ts packages/shared/tests/remoteRepository.test.ts
git commit -m "feat: RemoteRepository sobre backend Apps Script"
```

---

## Task 9: `popupOAuth` con id_token + parámetros de compartir

**Files:**
- Modify: `packages/shared/src/auth/popupOAuth.ts`
- Create: `apps/web/src/mode.ts`
- Test: `packages/shared/tests/auth.test.ts` (crear)

**Interfaces:**
- Consumes: `AuthProvider` (types).
- Produces:
  - En `popupOAuth`: scope `openid email drive.file`, `response_type=id_token token`, método `getIdToken(interactive: boolean): Promise<string>`.
  - `apps/web/src/mode.ts`: `saveShareParams(apiUrl: string)`, `loadShareParams(): { apiUrl: string } | null`, `clearShareParams(): void`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { popupOAuth } from '../src/auth/popupOAuth'

describe('popupOAuth id_token', () => {
  afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })
  it('persiste id_token desde el hash y lo devuelve', async () => {
    const hash = '#access_token=ACC&id_token=IDT&expires_in=3600'
    Object.defineProperty(window, 'location', { value: { hash, pathname: '/', href: 'http://x/', search: '', replaceState: () => {} }, configurable: true, writable: true })
    const auth = popupOAuth({ clientId: 'C', redirectUri: 'http://x/' })
    const t = await auth.getIdToken(false)
    expect(t).toBe('IDT')
    expect(localStorage.getItem('ft_web_id_token')).toBe('IDT')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ft/shared test -- auth`
Expected: FAIL con "auth.getIdToken is not a function"

- [ ] **Step 3: Implement (modificar `popupOAuth.ts`)**

```ts
import type { AuthProvider } from './types'

export function popupOAuth(options: { clientId: string; redirectUri: string; prompt?: 'consent' | 'none' }): AuthProvider & { getIdToken: (interactive: boolean) => Promise<string> } {
  const { clientId, redirectUri, prompt: defaultPrompt = 'consent' } = options
  const SCOPE = encodeURIComponent(['openid', 'email', 'https://www.googleapis.com/auth/drive.file'].join(' '))
  const TOKEN_KEY = 'ft_web_access_token'
  const ID_TOKEN_KEY = 'ft_web_id_token'
  const EXPIRES_KEY = 'ft_web_token_expires_at'

  function authUrl(prompt: 'consent' | 'none'): string {
    return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=id_token%20token&scope=${SCOPE}&prompt=${prompt}`
  }

  function persistFromHash(hash: string): { access: string | null; idToken: string | null } {
    try {
      const params = new URLSearchParams(hash.replace(/^#/, ''))
      const access = params.get('access_token')
      const idToken = params.get('id_token')
      const expiresIn = Number(params.get('expires_in') ?? '3600')
      const exp = String(Date.now() + expiresIn * 1000 - 60000)
      if (access) window.localStorage.setItem(TOKEN_KEY, access)
      if (idToken) window.localStorage.setItem(ID_TOKEN_KEY, idToken)
      window.localStorage.setItem(EXPIRES_KEY, exp)
      return { access, idToken }
    } catch { return { access: null, idToken: null } }
  }

  function storedIdToken(): string | null {
    try {
      const t = window.localStorage.getItem(ID_TOKEN_KEY)
      const exp = Number(window.localStorage.getItem(EXPIRES_KEY) ?? 0)
      if (t && exp > Date.now()) return t
    } catch { /* storage no disponible */ }
    return null
  }

  function silentRefresh(): Promise<{ access: string | null; idToken: string | null }> {
    return new Promise(resolve => {
      const iframe = document.createElement('iframe')
      iframe.style.display = 'none'
      iframe.src = authUrl('none')
      const cleanup = () => { iframe.remove() }
      const timer = window.setTimeout(() => { cleanup(); resolve({ access: null, idToken: null }) }, 15000)
      iframe.onload = () => {
        try {
          const hash = iframe.contentWindow?.location.hash ?? ''
          const got = persistFromHash(hash)
          if (got.access || got.idToken) { cleanup(); clearTimeout(timer); resolve(got); return }
        } catch { /* cross-origin o página sin hash */ }
        cleanup(); clearTimeout(timer)
        resolve({ access: null, idToken: null })
      }
      document.body.appendChild(iframe)
    })
  }

  function fullRedirect(): never {
    window.location.href = authUrl(defaultPrompt)
    throw new Error('Redirecting a OAuth…')
  }

  return {
    async getToken(interactive: boolean): Promise<string> {
      if (window.self !== window.top) throw new Error('Nested OAuth')
      const hash = window.location.hash
      const got = persistFromHash(hash)
      if (got.access) {
        window.history.replaceState({}, document.title, window.location.pathname)
        return got.access
      }
      const cached = (() => { try { return window.localStorage.getItem(TOKEN_KEY) } catch { return null } })()
      if (cached) return cached
      const refreshed = await silentRefresh()
      if (refreshed.access) return refreshed.access
      if (!interactive) throw new Error('No token')
      return fullRedirect()
    },
    async getIdToken(interactive: boolean): Promise<string> {
      if (window.self !== window.top) throw new Error('Nested OAuth')
      const hash = window.location.hash
      const got = persistFromHash(hash)
      if (got.idToken) {
        window.history.replaceState({}, document.title, window.location.pathname)
        return got.idToken
      }
      const cached = storedIdToken()
      if (cached) return cached
      const refreshed = await silentRefresh()
      if (refreshed.idToken) return refreshed.idToken
      if (!interactive) throw new Error('No token')
      return fullRedirect()
    },
    async getSignedInUser(): Promise<{ email: string } | null> {
      return storedIdToken() ? { email: 'user' } : null
    },
    async signOut(): Promise<void> {
      try {
        window.localStorage.removeItem(TOKEN_KEY)
        window.localStorage.removeItem(ID_TOKEN_KEY)
        window.localStorage.removeItem(EXPIRES_KEY)
      } catch { /* storage no disponible */ }
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }
}
```

`apps/web/src/mode.ts`:

```ts
const KEY = 'ft_share_params'

export function saveShareParams(apiUrl: string): void {
  sessionStorage.setItem(KEY, JSON.stringify({ apiUrl }))
}

export function loadShareParams(): { apiUrl: string } | null {
  const q = new URLSearchParams(window.location.search)
  if (q.get('vista') === '1' && q.get('api')) {
    const p = { apiUrl: String(q.get('api')) }
    sessionStorage.setItem(KEY, JSON.stringify(p))
    window.history.replaceState({}, document.title, window.location.pathname)
    return p
  }
  const raw = sessionStorage.getItem(KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as { apiUrl: string } } catch { return null }
}

export function clearShareParams(): void {
  sessionStorage.removeItem(KEY)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ft/shared test -- auth`
Expected: PASS

- [ ] **Step 5: Typecheck web**

Run: `pnpm --filter @ft/web build`
Expected: sin errores (el wrapper `apps/web/src/auth/popupOAuth.ts` sigue devolviendo `AuthProvider`; ajustar su tipo si TS lo pide).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/auth/popupOAuth.ts packages/shared/tests/auth.test.ts apps/web/src/mode.ts
git commit -m "feat: id_token en popupOAuth y parámetros de compartir"
```

---

## Task 10: Modo visita en la web app + contexto de permisos

**Files:**
- Create: `packages/shared/src/store/perms.tsx`
- Modify: `packages/shared/src/store/index.ts` (si existe) o `index.ts`
- Modify: `packages/shared/src/ui/layout/Layout.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/extension/entrypoints/dashboard/DashboardApp.tsx`
- Modify: `packages/shared/src/ui/icons.tsx` (IconShare para Task 11; opcional aquí)

**Interfaces:**
- Consumes: `permsFromInfo`, `type Perms`, `type ModuleKey` de roles; `createRemoteRepository`; `loadShareParams`, `saveShareParams`, `clearShareParams` de `apps/web/src/mode`.
- Produces:
  - `store/perms.tsx`: `PermsProvider`, `usePerms()`, `adminPerms()`.
  - `Layout`: props opcionales `filterNav?: (key: NavKey) => boolean` y `extraItems?: NavItem[]`.

- [ ] **Step 1: Implement `perms.tsx`**

```tsx
import React, { createContext, useContext } from 'react'
import type { ModuleKey } from '../roles/roles'

export interface PermsCtx {
  isAdmin: boolean
  canView(m: ModuleKey): boolean
  canEdit(m: ModuleKey): boolean
}

export function adminPerms(): PermsCtx {
  return { isAdmin: true, canView: () => true, canEdit: () => true }
}

const Ctx = createContext<PermsCtx>(adminPerms())

export function PermsProvider({ perms, children }: { perms: PermsCtx; children: React.ReactNode }) {
  return <Ctx.Provider value={perms}>{children}</Ctx.Provider>
}

export function usePerms(): PermsCtx {
  return useContext(Ctx)
}
```

Export desde `packages/shared/src/index.ts`:

```ts
export * from './store/perms'
```

- [ ] **Step 2: Modificar `Layout.tsx`**

```tsx
export interface NavItem { key: NavKey; label: string; Icon: (p: { className?: string }) => ReactNode }

const NAV: NavItem[] = [ /* igual que hoy */ ]

export function Layout({ current, onNavigate, children, headerExtra, filterNav, extraItems }: {
  current: NavKey
  onNavigate: (k: NavKey) => void
  children: ReactNode
  headerExtra?: ReactNode
  filterNav?: (key: NavKey) => boolean
  extraItems?: NavItem[]
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const visible = NAV.filter(n => !filterNav || filterNav(n.key))
  const items = extraItems?.length ? [...visible, ...extraItems] : visible
  const nav = (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
      {/* wordmark igual */}
      {items.map(n => (
        <button key={n.key} onClick={() => { onNavigate(n.key); setMobileOpen(false) }} className={cx('w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors', current === n.key ? 'bg-primary-soft text-primary font-semibold' : 'text-gray-600 hover:bg-muted')}>
          <n.Icon className="w-5 h-5" />{n.label}
        </button>
      ))}
    </nav>
  )
  /* resto del componente igual */
}
```

- [ ] **Step 3: Reescribir `apps/web/src/App.tsx`**

```tsx
import React, { useEffect, useMemo, useState } from 'react'
import { createRepository, createRemoteRepository, localStorageAdapter, KEYS, SheetsApi, createInitialSpreadsheet, ensureTables, AppProvider, Layout, Dashboard, Facturas, Clientes, Empleados, Gastos, Proveedores, CuentasPagar, Reportes, Configuracion, Compartir, Toaster, PermsProvider, adminPerms, usePerms, permsFromInfo, IconShare } from '@ft/shared'
import type { NavKey, NavItem, ModuleKey } from '@ft/shared'
import { webAuth } from './auth/popupOAuth'
import { loadShareParams, saveShareParams, clearShareParams } from './mode'

const NAV_MODULE: Partial<Record<NavKey, ModuleKey>> = {
  dashboard: 'dashboard', facturas: 'facturas', clientes: 'clientes', empleados: 'empleados',
  cuentas: 'cuentas', proveedores: 'proveedores', gastos: 'gastos', reportes: 'reportes'
}

function OwnerShell() {
  const [sheet, setSheet] = useState<{ id: string } | null>(null)
  const [nav, setNav] = useState<NavKey>(() => (sessionStorage.getItem('ft_nav') as NavKey) || 'dashboard')
  const [mes, setMes] = useState(() => sessionStorage.getItem('ft_mes') || new Date().toISOString().slice(0, 7))
  const [error, setError] = useState('')

  const navigate = (k: NavKey) => { sessionStorage.setItem('ft_nav', k); setNav(k) }
  const cambiarMes = (m: string) => { sessionStorage.setItem('ft_mes', m); setMes(m) }
  const makeApi = () => new SheetsApi(async () => { try { return await webAuth.getToken(false) } catch { return await webAuth.getToken(true) } })

  useEffect(() => {
    if (window.self !== window.top) return
    (async () => {
      try {
        clearShareParams()
        let id = await localStorageAdapter.get(KEYS.spreadsheetId)
        if (!id) {
          await webAuth.getToken(true)
          id = await localStorageAdapter.get(KEYS.spreadsheetId)
          if (!id) {
            const token = await webAuth.getToken(false)
            const api = new SheetsApi(async () => token)
            const created = await createInitialSpreadsheet(api)
            await localStorageAdapter.set(KEYS.spreadsheetId, created.spreadsheetId)
            id = created.spreadsheetId
          }
        }
        await ensureTables(makeApi(), id)
        setSheet({ id })
      } catch (e) { setError((e as Error).message) }
    })()
  }, [])

  if (error) return <div className="p-8 text-red-600">{error}</div>
  if (!sheet) return <div className="p-8">Conectando a Google Sheets…</div>
  const repo = createRepository({ api: makeApi(), storage: localStorageAdapter, getSpreadsheetId: async () => sheet.id })
  const extraItems: NavItem[] = [{ key: 'compartir', label: 'Compartir', Icon: IconShare }]
  return (
    <AppProvider repo={repo}>
      <PermsProvider perms={adminPerms()}>
        <Toaster>
          <Layout current={nav} onNavigate={navigate} extraItems={extraItems}>
            {nav === 'dashboard' && <Dashboard mes={mes} onNavigate={navigate} />}
            {nav === 'facturas' && <Facturas />}
            {nav === 'clientes' && <Clientes />}
            {nav === 'empleados' && <Empleados />}
            {nav === 'gastos' && <Gastos />}
            {nav === 'proveedores' && <Proveedores />}
            {nav === 'cuentas' && <CuentasPagar />}
            {nav === 'reportes' && <Reportes mes={mes} setMes={cambiarMes} />}
            {nav === 'configuracion' && <Configuracion />}
            {nav === 'compartir' && <Compartir />}
          </Layout>
        </Toaster>
      </PermsProvider>
    </AppProvider>
  )
}

function VisitorInner({ apiUrl }: { apiUrl: string }) {
  const { canView } = usePerms()
  const [nav, setNav] = useState<NavKey>(() => {
    const first = (Object.keys(NAV_MODULE) as NavKey[]).find(k => NAV_MODULE[k] && canView(NAV_MODULE[k]!))
    return first ?? 'dashboard'
  })
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7))
  const navigate = (k: NavKey) => setNav(k)
  const cambiarMes = (m: string) => setMes(m)
  const repo = useMemo(() => createRemoteRepository({ apiUrl, getIdToken: async () => { try { return await webAuth.getIdToken(false) } catch { return await webAuth.getIdToken(true) } } }), [apiUrl])
  const filterNav = (k: NavKey) => k === 'configuracion' ? false : (NAV_MODULE[k] ? canView(NAV_MODULE[k]!) : true)
  return (
    <AppProvider repo={repo}>
      <Toaster>
        <Layout current={nav} onNavigate={navigate} filterNav={filterNav}>
          {nav === 'dashboard' && <Dashboard mes={mes} onNavigate={navigate} />}
          {nav === 'facturas' && <Facturas />}
          {nav === 'clientes' && <Clientes />}
          {nav === 'empleados' && <Empleados />}
          {nav === 'gastos' && <Gastos />}
          {nav === 'proveedores' && <Proveedores />}
          {nav === 'cuentas' && <CuentasPagar />}
          {nav === 'reportes' && <Reportes mes={mes} setMes={cambiarMes} />}
        </Layout>
      </Toaster>
    </AppProvider>
  )
}

function VisitorShell({ apiUrl }: { apiUrl: string }) {
  const [state, setState] = useState<'boot' | 'ready' | 'denied' | 'error'>('boot')
  const [perms, setPerms] = useState<ReturnType<typeof permsFromInfo> | null>(null)
  useEffect(() => {
    if (window.self !== window.top) return
    (async () => {
      try {
        let token = ''
        try { token = await webAuth.getIdToken(false) } catch { saveShareParams(apiUrl); await webAuth.getIdToken(true); return }
        const repo = createRemoteRepository({ apiUrl, getIdToken: async () => token })
        const info = await repo.getPerms()
        const p = permsFromInfo(info)
        if (!p.isAdmin && info.view.length === 0) { setState('denied'); return }
        setPerms(p)
        setState('ready')
      } catch (e) { setState('error') }
    })()
  }, [apiUrl])
  if (state === 'boot') return <div className="p-8">Conectando…</div>
  if (state === 'denied') return <div className="p-8 text-center text-gray-600">No tienes acceso a este panel. Pide acceso al administrador.</div>
  if (state === 'error') return <div className="p-8 text-red-600">Error de conexión</div>
  return <PermsProvider perms={perms!}><VisitorInner apiUrl={apiUrl} /></PermsProvider>
}

export function App() {
  const share = loadShareParams()
  const [ownerId, setOwnerId] = useState<string | null>(null)
  useEffect(() => { localStorageAdapter.get(KEYS.spreadsheetId).then(setOwnerId) }, [])
  if (share && !ownerId) return <VisitorShell apiUrl={share.apiUrl} />
  return <OwnerShell />
}
```

Nota: `IconShare` y `Compartir` se crean en Task 11; si compilas antes, comenta esas líneas. Este task se valida junto al Task 11.

- [ ] **Step 4: Ajustar extensión (`DashboardApp.tsx`)**

Envolver el `AppProvider` con `PermsProvider`:

```tsx
import { PermsProvider, adminPerms } from '@ft/shared'
// ...
    <AppProvider repo={repo}>
      <PermsProvider perms={adminPerms()}>
        <Toaster>
          {/* ...igual */}
        </Toaster>
      </PermsProvider>
    </AppProvider>
```

- [ ] **Step 5: Typecheck + build**

```bash
pnpm --filter @ft/web build
pnpm --filter @ft/extension build
```

Expected: sin errores (hasta que existan `Compartir` e `IconShare`; ver nota del Step 3).

- [ ] **Step 6: Commit (si `Compartir`/`IconShare` ya existen, caso contrario se hace en Task 11)**

```bash
git add packages/shared/src/store/perms.tsx packages/shared/src/ui/layout/Layout.tsx apps/web/src/App.tsx apps/extension/entrypoints/dashboard/DashboardApp.tsx packages/shared/src/index.ts
git commit -m "feat: modo visita en web app con contexto de permisos"
```

---

## Task 11: Feature Compartir (dueño)

**Files:**
- Modify: `packages/shared/src/ui/icons.tsx` (IconShare)
- Create: `packages/shared/src/features/compartir/Compartir.tsx`
- Modify: `packages/shared/src/features/index.ts`
- Modify: `packages/shared/src/store/queries.tsx` (hook `useUsuarios`)
- Modify: `packages/shared/src/types/entities.ts` (si `NavKey` no lo cubre) — no hace falta

**Interfaces:**
- Consumes: `useUsuarios`, `useConfig`, `saveShareParams` (web), `ROLE_PRESETS`, `MODULE_KEYS`, `type UserRole`, `type Usuario`, `type ModuleKey`.
- Produces: `Compartir` (vista de gestión), `useUsuarios()`.

- [ ] **Step 1: Hook `useUsuarios` en `queries.tsx`**

```tsx
export function useUsuarios() {
  const repo = useRepo()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['usuarios'], queryFn: () => repo.listUsuarios() })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['usuarios'] })
  const save = useMutation({ mutationFn: (u: Usuario) => repo.saveUsuario(u), onSuccess: invalidate })
  const del = useMutation({ mutationFn: (email: string) => repo.deleteUsuario(email), onSuccess: invalidate })
  return { usuarios: q.data ?? [], isLoading: q.isLoading, saveUsuario: save, deleteUsuario: del }
}
```

Import de `Usuario` en `queries.tsx`.

- [ ] **Step 2: `IconShare` en `icons.tsx`**

```tsx
export function IconShare({ className }: { className?: string }) {
  return <Icon className={className}><circle cx="6" cy="12" r="3" /><circle cx="18" cy="6" r="3" /><circle cx="18" cy="18" r="3" /><path d="M8.7 10.7l6.6-3.4M8.7 13.3l6.6 3.4" /></Icon>
}
```

- [ ] **Step 3: `Compartir.tsx`**

```tsx
import React, { useState } from 'react'
import { useUsuarios, useConfig } from '../../store/queries'
import { Table, Button, Input, Select, ConfirmDialog, Dialog } from '../../ui/components'
import { useToast } from '../../ui/components'
import { IconPlus, IconTrash } from '../../ui/icons'
import { MODULE_KEYS, ROLE_PRESETS, type ModuleKey, type Usuario, type UserRole } from '../../roles/roles'

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'solo_lectura', label: 'Solo lectura (todo)' },
  { value: 'ver_facturas', label: 'Ver facturas' },
  { value: 'ver_reportes', label: 'Ver reportes' },
  { value: 'ver_gastos', label: 'Ver gastos' },
  { value: 'ver_empleados', label: 'Ver empleados' },
  { value: 'ver_cuentas', label: 'Ver cuentas por pagar' },
  { value: 'asistente', label: 'Asistente (edita módulos)' },
  { value: 'personalizado', label: 'Personalizado' }
]

function copyToClipboard(text: string) { navigator.clipboard?.writeText(text) }

function ModulePicker({ value, onChange }: { value: string; onChange: (csv: string) => void }) {
  const set = new Set(value.split(',').map(s => s.trim()).filter(Boolean))
  const toggle = (m: ModuleKey) => {
    const next = new Set(set)
    if (next.has(m)) next.delete(m); else next.add(m)
    onChange([...next].join(','))
  }
  return (
    <div className="flex flex-wrap gap-2">
      {MODULE_KEYS.map(m => (
        <button key={m} type="button" onClick={() => toggle(m)}
          className={cx('px-2 py-1 rounded-md text-xs border', set.has(m) ? 'bg-primary text-white border-primary' : 'border-gray-300 text-gray-600')}>
          {m}
        </button>
      ))}
    </div>
  )
}

function AddUserForm({ onClose }: { onClose: () => void }) {
  const { saveUsuario } = useUsuarios()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [rol, setRol] = useState<UserRole>('solo_lectura')
  const [ver, setVer] = useState('')
  const [editar, setEditar] = useState('')
  const submit = async () => {
    try {
      await saveUsuario.mutateAsync({ email, rol, modulos_ver: ver, modulos_editar: editar } as Usuario)
      toast('Usuario guardado')
      onClose()
    } catch (e) { toast((e as Error).message, 'error') }
  }
  const showModules = rol === 'personalizado' || rol === 'asistente'
  return (
    <Dialog open onClose={onClose} title="Agregar usuario"
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit}>Guardar</Button></>}>
      <div className="space-y-3">
        <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@ejemplo.com" />
        <Select value={rol} onChange={setRol as (v: string) => void} options={ROLES} />
        {showModules && (
          <div className="space-y-2">
            <div><div className="text-xs font-semibold mb-1">Ver</div><ModulePicker value={ver} onChange={setVer} /></div>
            {rol === 'asistente' && (
              <div><div className="text-xs font-semibold mb-1">Editar</div><ModulePicker value={editar} onChange={setEditar} /></div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  )
}

function rolLabel(rol: UserRole): string {
  return ROLES.find(r => r.value === rol)?.label ?? rol
}

export function Compartir() {
  const { usuarios, deleteUsuario } = useUsuarios()
  const { config, saveConfig } = useConfig()
  const toast = useToast()
  const [backendUrl, setBackendUrl] = useState(config?.share_backend_url ?? '')
  const [addOpen, setAddOpen] = useState(false)
  const [deleteEmail, setDeleteEmail] = useState<string | null>(null)

  const saveBackendUrl = async () => {
    try {
      await saveConfig.mutateAsync({ ...config!, share_backend_url: backendUrl.trim() })
      toast('URL guardada')
    } catch (e) { toast((e as Error).message, 'error') }
  }

  const copyLink = () => {
    const url = backendUrl.trim()
    if (!url) { toast('Primero guarda la URL del backend', 'error'); return }
    const link = `${window.location.origin}${window.location.pathname}?vista=1&api=${encodeURIComponent(url)}`
    copyToClipboard(link)
    toast('Link copiado')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Compartir</h1>
        <p className="text-sm text-gray-500">Configura el backend y decide quién ve qué. La hoja queda privada.</p>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl shadow-card p-4 space-y-3">
        <div className="text-sm font-semibold">URL del backend</div>
        <div className="flex gap-2">
          <Input value={backendUrl} onChange={e => setBackendUrl(e.target.value)} placeholder="https://script.google.com/macros/s/.../exec" />
          <Button onClick={saveBackendUrl}>Guardar</Button>
          <Button variant="outline" onClick={copyLink}>Copiar link</Button>
        </div>
        <p className="text-xs text-gray-500">El link que compartas será: tu-app.com/?vista=1&amp;api=...</p>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="text-sm font-semibold">Usuarios con acceso</div>
          <Button icon={<IconPlus className="w-4 h-4" />} onClick={() => setAddOpen(true)}>Agregar</Button>
        </div>
        <Table columns={[
          { key: 'email', header: 'Email', render: r => String(r.email) },
          { key: 'rol', header: 'Rol', render: r => rolLabel(String(r.rol) as UserRole) },
          { key: 'modulos', header: 'Módulos', render: r => { const v = String(r.modulos_ver || ''); const e = String(r.modulos_editar || ''); return <span className="text-xs text-gray-600">{[v, e && `edita: ${e}`].filter(Boolean).join(' · ') || '—'}</span> } },
          { key: 'acciones', header: '', render: r => (
            <Button variant="danger" icon={<IconTrash className="w-4 h-4" />} onClick={() => setDeleteEmail(String(r.email))}>Eliminar</Button>
          ) }
        ]} rows={usuarios as unknown as Record<string, unknown>[]} />
      </div>
      {addOpen && <AddUserForm onClose={() => setAddOpen(false)} />}
      <ConfirmDialog open={deleteEmail !== null} title="Eliminar acceso" message="Este usuario perderá el acceso de inmediato. ¿Continuar?"
        onConfirm={async () => { if (deleteEmail) { try { await deleteUsuario.mutateAsync(deleteEmail); toast('Acceso eliminado') } catch (e) { toast((e as Error).message, 'error') } } setDeleteEmail(null) }}
        onClose={() => setDeleteEmail(null)} />
    </div>
  )
}
```

En `features/index.ts`:

```ts
export { Compartir } from './compartir/Compartir'
```

- [ ] **Step 4: Agregar `compartir` a `NavKey` y tipo de estado**

En `ui/layout/Layout.tsx`:

```ts
export type NavKey = 'dashboard' | 'facturas' | 'clientes' | 'empleados' | 'cuentas' | 'proveedores' | 'gastos' | 'reportes' | 'configuracion' | 'compartir'
```

En `index.ts` exportar `NavKey` (ya se exporta vía `./ui`). Verificar que `App.tsx` compila.

- [ ] **Step 5: Typecheck + build + tests**

```bash
pnpm --filter @ft/web build
pnpm --filter @ft/shared test
```

Expected: sin errores, todos los tests pasan.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/ui/icons.tsx packages/shared/src/ui/layout/Layout.tsx packages/shared/src/features/compartir/Compartir.tsx packages/shared/src/features/index.ts packages/shared/src/store/queries.tsx
git commit -m "feat: sección Compartir para gestionar usuarios y roles"
```

---

## Task 12: Solo-lectura en features (gating por permisos)

**Files:**
- Modify: `packages/shared/src/features/clientes/Clientes.tsx`
- Modify: `packages/shared/src/features/gastos/Gastos.tsx`
- Modify: `packages/shared/src/features/facturas/Facturas.tsx`
- Modify: `packages/shared/src/features/facturas/FacturaDetail.tsx`
- Modify: `packages/shared/src/features/empleados/Empleados.tsx`
- Modify: `packages/shared/src/features/proveedores/Proveedores.tsx`
- Modify: `packages/shared/src/features/cuentasPagar/CuentasPagar.tsx`

**Interfaces:**
- Consumes: `usePerms` de `store/perms`.

Patrón: importar `usePerms`, `const { canEdit, isAdmin } = usePerms()` y envolver:
- Botones de crear/editar → `canEdit('<módulo>')`
- Botones de eliminar → `isAdmin`
- Acciones de pago/nómina → `isAdmin`

- [ ] **Step 1: Clientes** (`clientes`)

Añadir import y al inicio del componente:

```tsx
import { usePerms } from '../../store/perms'
// dentro de Clientes():
const { canEdit, isAdmin } = usePerms()
```

Envolver:
- Línea `Nuevo cliente`: `{canEdit('clientes') && (<Button icon={<IconPlus className="w-4 h-4" />} onClick={() => { setEditando(null); setFormOpen(true) }}>Nuevo cliente</Button>)}`
- Línea `Editar`: `{canEdit('clientes') && (<Button variant="ghost" icon={<IconEdit className="w-4 h-4" />} onClick={() => { setEditando(c as unknown as Cliente); setFormOpen(true) }}>Editar</Button>)}`
- Línea `Eliminar`: `{isAdmin && (<Button variant="danger" icon={<IconTrash className="w-4 h-4" />} onClick={() => setDeleteId((c as unknown as Cliente).id_cliente)}>Eliminar</Button>)}`

- [ ] **Step 2: Gastos** (`gastos`)

Mismo patrón: `canEdit('gastos')` para "Registrar gasto" y "Editar"; `isAdmin` para "Eliminar".

- [ ] **Step 3: Facturas** (`facturas`)

En `Facturas.tsx`: `canEdit('facturas')` para "Nueva factura"; `isAdmin` para "Eliminar". "Ver" siempre visible.

En `FacturaDetail.tsx`: importar `usePerms`; `isAdmin` para "Registrar cobro"; "Descargar PDF" y "Cerrar" siempre visibles.

- [ ] **Step 4: Empleados** (`empleados`)

`isAdmin` para "Nuevo empleado", "Editar", "Nómina" y "Eliminar" (módulo empleados no se da a asistentes).

- [ ] **Step 5: Proveedores** (`proveedores`)

`canEdit('proveedores')` para "Nuevo proveedor" y "Editar"; `isAdmin` para "Eliminar".

- [ ] **Step 6: CuentasPagar** (`cuentas`)

`canEdit('cuentas')` para "Nueva CXP"; `isAdmin` para "Eliminar"; "Ver" siempre.

- [ ] **Step 7: Typecheck + build + tests**

```bash
pnpm --filter @ft/web build
pnpm --filter @ft/shared test
```

Expected: sin errores, tests pasan.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/features
git commit -m "feat: gating de solo-lectura por permisos en features"
```

---

## Task 13: Docs de despliegue + README

**Files:**
- Create: `docs/DEPLOY_BACKEND.md`
- Modify: `README.md`

- [ ] **Step 1: Escribir `docs/DEPLOY_BACKEND.md`**

Incluir: requisitos, paso a paso con capturas (se agregan luego), tabla de roles, reglas de seguridad (hoja privada, no compartir proyecto del script), solución de problemas (CORS, cuotas).

- [ ] **Step 2: Actualizar `README.md`**

Agregar sección "Compartir con roles" con: cómo genera el dueño el link, qué ve cada rol, referencia a `DEPLOY_BACKEND.md`.

- [ ] **Step 3: Commit**

```bash
git add docs/DEPLOY_BACKEND.md README.md
git commit -m "docs: guía de despliegue del backend y sección Compartir"
```

---

## Self-Review

**Spec coverage:** Roles (presets, personalizado, asistente con edición por módulo) → Tasks 1-2, 6, 11-12. Ocultar hoja (backend con identidad del dueño, filtrado server-side) → Tasks 5-7. Dueño con control total → Task 5 (`ownerEmail` = `admin` en `permsFor`) + modo dueño intacto (Task 10). Facilidad para no técnicos: un solo archivo `Code.js` + URL pegada → Task 4-7, 11, 13. Multi-asistente: tabla `Usuarios` por email → Tasks 2-3, 11.

**Placeholder scan:** Sin "TBD"/"TODO". Todos los pasos de código incluyen el contenido real.

**Type consistency:** `permsFor(email, ownerEmail, u)` con `ownerEmail` en minúsculas en backend y comparación case-insensitive en roles; `PermsInfo.view/edit` alimentan `permsFromInfo`; `RemoteRepository` implementa la interfaz `Repository` (Task 8) y Task 10 la consume con `createRemoteRepository({ apiUrl, getIdToken })`. `NavKey` incluye `'compartir'` (Task 11). `Config.share_backend_url` fluye por DEFAULT_CONFIG → configFromRows → Compartir.
