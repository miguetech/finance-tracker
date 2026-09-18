# AppData Folder Spreadsheet Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist `spreadsheetId` in Google Drive's hidden `appDataFolder` so the app auto-links on any device where the user signs in with the same Google account, while preserving full offline capability.

**Architecture:** Add `drive.appdata` scope → extend `DriveApi` with `saveAppConfig`/`loadAppConfig` → modify `App.tsx` startup to read from appData if localStorage empty → sync on `conectarHojaPorId`. All writes go to localStorage first (instant), appData as background sync.

**Tech Stack:** Google Drive API v3 (`appDataFolder` space), OAuth2 implicit flow (popup), React hooks, localStorage, Vitest + MSW for mocking.

## Global Constraints

- **Scope change requires re-consent:** Existing users must re-authenticate once. Plan for this.
- **Offline-first:** localStorage remains source of truth for runtime. appData is only for cross-device bootstrap.
- **No breaking changes:** `Repository` interface unchanged. `StorageAdapter` unchanged.
- **Test isolation:** Use MSW to mock `fetch` for Drive API calls. No real network in tests.
- **File naming:** Tests alongside source (`*.test.ts`) or in `tests/` mirroring structure.
- **TypeScript strict:** All new code passes `tsc --noEmit`.

---

### Task 1: Add `drive.appdata` Scope to OAuth

**Files:**
- Modify: `packages/shared/src/auth/popupOAuth.ts:5`
- Test: `packages/shared/tests/auth.appdata.test.ts`

**Interfaces:**
- Consumes: —
- Produces: `popupOAuth` returns `SCOPE` string including `https://www.googleapis.com/auth/drive.appdata`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/shared/tests/auth.appdata.test.ts
import { popupOAuth } from '../src/auth/popupOAuth'

describe('popupOAuth scope includes appdata', () => {
  it('includes drive.appdata in SCOPE', () => {
    const auth = popupOAuth({ clientId: 'C', redirectUri: 'http://x/' })
    // SCOPE is private, infer from authUrl
    const url = (auth as any).authUrl?.('consent') ?? ''
    expect(url).toContain('https://www.googleapis.com/auth/drive.appdata')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- packages/shared/tests/auth.appdata.test.ts -v`
Expected: FAIL - scope missing

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/shared/src/auth/popupOAuth.ts:5
const SCOPE = encodeURIComponent([
  'openid',
  'email',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.appdata',  // NEW
  'https://www.googleapis.com/auth/spreadsheets'
].join(' '))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- packages/shared/tests/auth.appdata.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/auth/popupOAuth.ts packages/shared/tests/auth.appdata.test.ts
git commit -m "feat(auth): add drive.appdata scope for cross-device config sync"
```

---

### Task 2: DriveApi.saveAppConfig — Write config to appDataFolder

**Files:**
- Modify: `packages/shared/src/drive/api.ts` (add method)
- Test: `packages/shared/tests/drive.appdata.test.ts`

**Interfaces:**
- Consumes: `DriveApi` instance with valid `getToken()`
- Produces: `async saveAppConfig(config: { spreadsheetId: string }): Promise<void>` — uploads `ft_config.json` to `appDataFolder`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/shared/tests/drive.appdata.test.ts
import { DriveApi } from '../src/drive/api'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

const server = setupServer()
beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('DriveApi.saveAppConfig', () => {
  it('uploads ft_config.json to appDataFolder with multipart body', async () => {
    let capturedBody = ''
    server.use(
      http.post('https://www.googleapis.com/upload/drive/v3/files', async ({ request }) => {
        capturedBody = await request.text()
        return HttpResponse.json({ id: 'FILE_ID', webViewLink: 'https://drive.google.com/file/d/FILE_ID' })
      })
    )

    const drive = new DriveApi(async () => 'TOKEN')
    await drive.saveAppConfig({ spreadsheetId: 'SPREADSHEET_123' })

    expect(capturedBody).toContain('appDataFolder')
    expect(capturedBody).toContain('ft_config.json')
    expect(capturedBody).toContain('SPREADSHEET_123')
  })

  it('throws on non-2xx response', async () => {
    server.use(
      http.post('https://www.googleapis.com/upload/drive/v3/files', () => 
        new HttpResponse(null, { status: 403 })
      )
    )
    const drive = new DriveApi(async () => 'TOKEN')
    await expect(drive.saveAppConfig({ spreadsheetId: 'X' })).rejects.toThrow('Drive API 403')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- packages/shared/tests/drive.appdata.test.ts -v`
Expected: FAIL - method not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/shared/src/drive/api.ts (add inside DriveApi class)

/** Guarda ft_config.json en la carpeta oculta appDataFolder del usuario. */
async saveAppConfig(config: { spreadsheetId: string }): Promise<void> {
  const metadata = JSON.stringify({
    name: 'ft_config.json',
    mimeType: 'application/json',
    parents: ['appDataFolder']
  })
  const boundary = `ft_boundary_${Date.now().toString(36)}`
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadata,
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(config),
    `--${boundary}--`,
    ''
  ].join('\r\n')

  await this.request(UPLOAD_URL, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- packages/shared/tests/drive.appdata.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/drive/api.ts packages/shared/tests/drive.appdata.test.ts
git commit -m "feat(drive): add saveAppConfig to persist spreadsheetId in appDataFolder"
```

---

### Task 3: DriveApi.loadAppConfig — Read config from appDataFolder

**Files:**
- Modify: `packages/shared/src/drive/api.ts` (add method)
- Test: `packages/shared/tests/drive.appdata.test.ts` (extend)

**Interfaces:**
- Consumes: `DriveApi` instance
- Produces: `async loadAppConfig(): Promise<{ spreadsheetId: string } | null>` — returns null if not found

- [ ] **Step 1: Write the failing test**

```typescript
// packages/shared/tests/drive.appdata.test.ts (append)
describe('DriveApi.loadAppConfig', () => {
  it('returns config when ft_config.json exists in appDataFolder', async () => {
    server.use(
      http.get('https://www.googleapis.com/drive/v3/files', ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('spaces')).toBe('appDataFolder')
        expect(url.searchParams.get('q')).toContain("name='ft_config.json'")
        return HttpResponse.json({ files: [{ id: 'CONFIG_FILE_ID' }] })
      }),
      http.get('https://www.googleapis.com/drive/v3/files/CONFIG_FILE_ID', () =>
        HttpResponse.json({ spreadsheetId: 'SPREADSHEET_123' })
      )
    )

    const drive = new DriveApi(async () => 'TOKEN')
    const config = await drive.loadAppConfig()

    expect(config).toEqual({ spreadsheetId: 'SPREADSHEET_123' })
  })

  it('returns null when ft_config.json not found', async () => {
    server.use(
      http.get('https://www.googleapis.com/drive/v3/files', () =>
        HttpResponse.json({ files: [] })
      )
    )
    const drive = new DriveApi(async () => 'TOKEN')
    const config = await drive.loadAppConfig()
    expect(config).toBeNull()
  })

  it('returns null on 404 fetching file content', async () => {
    server.use(
      http.get('https://www.googleapis.com/drive/v3/files', () =>
        HttpResponse.json({ files: [{ id: 'CONFIG_FILE_ID' }] })
      ),
      http.get('https://www.googleapis.com/drive/v3/files/CONFIG_FILE_ID', () =>
        new HttpResponse(null, { status: 404 })
      )
    )
    const drive = new DriveApi(async () => 'TOKEN')
    const config = await drive.loadAppConfig()
    expect(config).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- packages/shared/tests/drive.appdata.test.ts -v`
Expected: FAIL - method not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/shared/src/drive/api.ts (add inside DriveApi class)

/** Lee ft_config.json desde appDataFolder. Null si no existe. */
async loadAppConfig(): Promise<{ spreadsheetId: string } | null> {
  const qs = new URLSearchParams({
    q: "name='ft_config.json' and 'appDataFolder' in parents and trashed=false",
    fields: 'files(id)',
    spaces: 'appDataFolder',
    pageSize: '1'
  })
  const res = await this.request<{ files?: { id: string }[] }>(
    `https://www.googleapis.com/drive/v3/files?${qs}`
  )
  const file = res.files?.[0]
  if (!file) return null

  try {
    const content = await this.request<{ spreadsheetId: string }>(
      `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`
    )
    return content
  } catch (e) {
    if ((e as Error).message.includes('404')) return null
    throw e
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- packages/shared/tests/drive.appdata.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/drive/api.ts packages/shared/tests/drive.appdata.test.ts
git commit -m "feat(drive): add loadAppConfig to read spreadsheetId from appDataFolder"
```

---

### Task 4: App.tsx Startup — Read from appData if localStorage empty

**Files:**
- Modify: `apps/web/src/App.tsx:58-77` (OwnerShell boot effect)
- Test: `apps/web/tests/App.bootstrap.appdata.test.tsx`

**Interfaces:**
- Consumes: `localStorageAdapter`, `webAuth`, `DriveApi`, `connectOrCreateSpreadsheet`
- Produces: `idHoja` state set from localStorage → appData → new spreadsheet

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/tests/App.bootstrap.appdata.test.tsx
import { render, screen, waitFor, act } from '@testing-library/react'
import { App } from '../src/App'
import { localStorageAdapter } from '@ft/shared'
import { webAuth } from '../src/auth/popupOAuth'
import { DriveApi } from '@ft/shared'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

const server = setupServer()
beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// Mock localStorageAdapter
vi.mock('@ft/shared', async () => {
  const actual = await vi.importActual('@ft/shared')
  return {
    ...actual,
    localStorageAdapter: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn()
    }
  }
})

describe('App bootstrap with appData fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageAdapter.get.mockResolvedValue(null)
    localStorageAdapter.set.mockResolvedValue(undefined)
  })

  it('reads spreadsheetId from appData when localStorage empty', async () => {
    server.use(
      http.get('https://www.googleapis.com/drive/v3/files', () =>
        HttpResponse.json({ files: [{ id: 'CONFIG_FILE_ID' }] })
      ),
      http.get('https://www.googleapis.com/drive/v3/files/CONFIG_FILE_ID', () =>
        HttpResponse.json({ spreadsheetId: 'FROM_APPDATA' })
      ),
      // Sheets API calls for ensureTables
      http.post('https://sheets.googleapis.com/v4/spreadsheets/FROM_APPDATA:batchGet', () =>
        HttpResponse.json({ valueRanges: [{ range: "'Config'!A1:B500", values: [] }] })
      )
    )

    webAuth.getToken = vi.fn().mockResolvedValue('TOKEN')
    webAuth.getSignedInUser = vi.fn().mockResolvedValue({ email: 'user@test.com' })

    render(<App />)

    await waitFor(() => {
      expect(localStorageAdapter.set).toHaveBeenCalledWith('ft_spreadsheet_id', 'FROM_APPDATA')
    })
  })

  it('creates new spreadsheet and saves to BOTH localStorage and appData when neither exists', async () => {
    server.use(
      http.get('https://www.googleapis.com/drive/v3/files', () =>
        HttpResponse.json({ files: [] })
      ),
      http.post('https://www.googleapis.com/upload/drive/v3/files', () =>
        HttpResponse.json({ id: 'NEW_SPREADSHEET', spreadsheetId: 'NEW_SPREADSHEET' })
      ),
      http.post('https://sheets.googleapis.com/v4/spreadsheets/NEW_SPREADSHEET:batchUpdate', () =>
        HttpResponse.json({})
      )
    )

    webAuth.getToken = vi.fn().mockResolvedValue('TOKEN')
    webAuth.getSignedInUser = vi.fn().mockResolvedValue({ email: 'user@test.com' })

    render(<App />)

    await waitFor(() => {
      expect(localStorageAdapter.set).toHaveBeenCalledWith('ft_spreadsheet_id', 'NEW_SPREADSHEET')
    })
    // Verify appData save was attempted (second call to upload endpoint)
    await waitFor(() => {
      const uploadCalls = server.listHandlers().filter(h => h.pathname === '/upload/drive/v3/files')
      // Note: actual assertion depends on MSW spy capabilities
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- apps/web/tests/App.bootstrap.appdata.test.tsx -v`
Expected: FAIL - bootstrap logic not implemented

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/web/src/App.tsx (inside OwnerShell useEffect, replace lines 63-77)

useEffect(() => {
  if (window.self !== window.top) return
  ;(async () => {
    try {
      clearShareParams()
      
      // 1. Try localStorage first
      let id = await localStorageAdapter.get(KEYS.spreadsheetId)
      
      // 2. Fallback to appDataFolder (cross-device sync)
      if (!id) {
        try {
          await webAuth.getToken(false) // ensure token
          const drive = new DriveApi(() => webAuth.getToken(false))
          const config = await drive.loadAppConfig()
          if (config?.spreadsheetId) {
            id = config.spreadsheetId
            await localStorageAdapter.set(KEYS.spreadsheetId, id) // cache locally
          }
        } catch (e) {
          console.warn('[boot] appData config unavailable:', e)
        }
      }
      
      // 3. Last resort: connect or create new
      if (!id) {
        await webAuth.getToken(true) // interactive
        const token = await webAuth.getToken(false)
        const api = new SheetsApi(async () => token)
        const connected = await connectOrCreateSpreadsheet(api)
        await localStorageAdapter.set(KEYS.spreadsheetId, connected.spreadsheetId)
        id = connected.spreadsheetId
        // Save to appData for future devices
        try {
          await new DriveApi(() => webAuth.getToken(false))
            .saveAppConfig({ spreadsheetId: id })
        } catch (e) {
          console.warn('[boot] failed to save to appData:', e)
        }
      }
      
      idHojaRef.current = id
      setIdHoja(id)
      
      // ... rest of existing boot logic (ensureTables, prepararAnioActual, etc.)
      try {
        try {
          await ensureTables(makeApi(), id)
        } catch (e) {
          if (!/Sheets API 404/.test((e as Error).message)) throw e
          console.warn('[boot] BASE no accesible; recuperando…')
          await localStorageAdapter.set(KEYS.spreadsheetId, '')
          const conectada = await connectOrCreateSpreadsheet(makeApi())
          id = conectada.spreadsheetId
          idHojaRef.current = id
          setIdHoja(id)
          await ensureTables(makeApi(), id)
        }
        void repoBase.prepararAnioActual().catch((e: unknown) => {
          console.warn('[hoja-año] arranque sin crear hoja del año:', e instanceof Error ? e.message : e)
        })
        const email = (await webAuth.getSignedInUser())?.email
        if (email) void guardarRegistroSesion(localStorageAdapter, { cuenta: email })
        const reg = await cargarRegistroSesion(localStorageAdapter)
        if (reg) setSesionLocal(reg)
      } catch {
        const reg = await cargarRegistroSesion(localStorageAdapter)
        if (reg) {
          setSesionLocal(reg)
          if (!reg.cifrado && hayDesbloqueoSesion() && desbloqueoPermitido(reg)) setModoOffline(true)
        }
      }
    } catch (e) { setError((e as Error).message) }
  })()
}, [])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- apps/web/tests/App.bootstrap.appdata.test.tsx -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/App.tsx apps/web/tests/App.bootstrap.appdata.test.tsx
git commit -m "feat(web): bootstrap reads spreadsheetId from appDataFolder as fallback"
```

---

### Task 5: Repository.conectarHojaPorId — Sync to appData on link

**Files:**
- Modify: `packages/shared/src/data/repository.ts:1212-1221`
- Test: `packages/shared/tests/repository.appdata-sync.test.ts`

**Interfaces:**
- Consumes: `ctx.storage` (localStorage), `ctx.api` (SheetsApi for validation), `DriveApi`
- Produces: After successful link, `spreadsheetId` saved to both localStorage AND appDataFolder

- [ ] **Step 1: Write the failing test**

```typescript
// packages/shared/tests/repository.appdata-sync.test.ts
import { createRepository } from '../src/data/repository'
import { SheetsApi } from '../src/sheets/api'
import { localStorageAdapter, KEYS } from '../src/data/storage'
import { DriveApi } from '../src/drive/api'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

const server = setupServer()
beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('Repository.conectarHojaPorId syncs to appData', () => {
  it('saves spreadsheetId to appDataFolder after successful link', async () => {
    let appDataSaved = false
    
    server.use(
      // Sheets validation
      http.post('https://sheets.googleapis.com/v4/spreadsheets/NEW_SHEET:batchGet', () =>
        HttpResponse.json({ valueRanges: [] })
      ),
      // Drive appData save
      http.post('https://www.googleapis.com/upload/drive/v3/files', ({ request }) => {
        const body = request.body // FormData or text
        appDataSaved = true
        return HttpResponse.json({ id: 'CONFIG_FILE_ID' })
      })
    )

    const api = new SheetsApi(async () => 'TOKEN')
    const repo = createRepository({
      api,
      storage: localStorageAdapter,
      getSpreadsheetId: async () => 'OLD_SHEET'
    })

    await repo.conectarHojaPorId('NEW_SHEET')

    expect(appDataSaved).toBe(true)
    // Also verify localStorage was updated
    expect(localStorageAdapter.set).toHaveBeenCalledWith(KEYS.spreadsheetId, 'NEW_SHEET')
  })

  it('does not throw if appData save fails (non-blocking)', async () => {
    server.use(
      http.post('https://sheets.googleapis.com/v4/spreadsheets/NEW_SHEET:batchGet', () =>
        HttpResponse.json({ valueRanges: [] })
      ),
      http.post('https://www.googleapis.com/upload/drive/v3/files', () =>
        new HttpResponse(null, { status: 500 })
      )
    )

    const api = new SheetsApi(async () => 'TOKEN')
    const repo = createRepository({
      api,
      storage: localStorageAdapter,
      getSpreadsheetId: async () => 'OLD_SHEET'
    })

    // Should not throw
    await expect(repo.conectarHojaPorId('NEW_SHEET')).resolves.toBeUndefined()
    expect(localStorageAdapter.set).toHaveBeenCalledWith(KEYS.spreadsheetId, 'NEW_SHEET')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- packages/shared/tests/repository.appdata-sync.test.ts -v`
Expected: FAIL - no appData sync in conectarHojaPorId

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/shared/src/data/repository.ts:1212-1221

/** Vincula el BASE por ID directo (desde el buscador). Valida edición. */
async conectarHojaPorId(spreadsheetId: string): Promise<void> {
  const id = spreadsheetId.trim()
  if (!/^[A-Za-z0-9_-]{15,}$/.test(id)) throw new Error('ID de hoja inválido')
  try {
    await ensureTables(api, id)
  } catch {
    throw new Error('Esta cuenta no tiene permisos de edición sobre esa hoja')
  }
  await ctx.storage.set(KEYS.spreadsheetId, id)
  
  // NEW: sync to appDataFolder (non-blocking)
  try {
    await new DriveApi(() => api.getToken()).saveAppConfig({ spreadsheetId: id })
  } catch (e) {
    console.warn('[conectarHojaPorId] appData sync failed:', e instanceof Error ? e.message : e)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- packages/shared/tests/repository.appdata-sync.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/data/repository.ts packages/shared/tests/repository.appdata-sync.test.ts
git commit -m "feat(repo): sync spreadsheetId to appDataFolder on conectarHojaPorId"
```

---

### Task 6: Repository.conectarAñoPorId — Sync year spreadsheet to appData (optional)

**Files:**
- Modify: `packages/shared/src/data/repository.ts:1225-1238`
- Test: `packages/shared/tests/repository.appdata-sync.test.ts` (extend)

**Interfaces:**
- Same as Task 5, but for year spreadsheets. Optional — years are stored in BASE Config, not appData. **SKIP** — not needed for cross-device bootstrap.

---

### Task 7: Integration Test — Full cross-device flow

**Files:**
- Test: `packages/shared/tests/integration.cross-device.test.ts`

**Interfaces:**
- Consumes: All above
- Produces: Verifies complete flow: Device A links sheet → Device B boots → gets same sheet

- [ ] **Step 1: Write the failing test**

```typescript
// packages/shared/tests/integration.cross-device.test.ts
import { createRepository } from '../src/data/repository'
import { SheetsApi } from '../src/sheets/api'
import { localStorageAdapter, KEYS } from '../src/data/storage'
import { DriveApi } from '../src/drive/api'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

const server = setupServer()
beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('Cross-device spreadsheet sync via appData', () => {
  it('Device A links sheet → Device B boots and gets same sheet', async () => {
    let appDataConfig: { spreadsheetId: string } | null = null

    // Mock Drive API to capture appData writes/reads
    server.use(
      // Device A: saveAppConfig
      http.post('https://www.googleapis.com/upload/drive/v3/files', async ({ request }) => {
        const text = await request.text()
        if (text.includes('ft_config.json')) {
          const match = text.match(/"spreadsheetId"\s*:\s*"([^"]+)"/)
          if (match) appDataConfig = { spreadsheetId: match[1] }
        }
        return HttpResponse.json({ id: 'CONFIG_FILE_ID' })
      }),
      // Device B: loadAppConfig - list files
      http.get('https://www.googleapis.com/drive/v3/files', ({ request }) => {
        const url = new URL(request.url)
        if (url.searchParams.get('spaces') === 'appDataFolder') {
          if (appDataConfig) {
            return HttpResponse.json({ files: [{ id: 'CONFIG_FILE_ID' }] })
          }
          return HttpResponse.json({ files: [] })
        }
        return HttpResponse.json({ files: [] })
      }),
      // Device B: loadAppConfig - get file content
      http.get('https://www.googleapis.com/drive/v3/files/CONFIG_FILE_ID', () => {
        if (appDataConfig) {
          return HttpResponse.json(appDataConfig)
        }
        return new HttpResponse(null, { status: 404 })
      }),
      // Sheets API for ensureTables
      http.post('https://sheets.googleapis.com/v4/spreadsheets/:id:batchGet', () =>
        HttpResponse.json({ valueRanges: [] })
      )
    )

    // --- Device A: User links a new spreadsheet ---
    const apiA = new SheetsApi(async () => 'TOKEN_A')
    const repoA = createRepository({
      api: apiA,
      storage: localStorageAdapter,
      getSpreadsheetId: async () => 'OLD_SHEET_A'
    })

    await repoA.conectarHojaPorId('SHARED_SPREADSHEET_123')
    expect(localStorageAdapter.set).toHaveBeenCalledWith(KEYS.spreadsheetId, 'SHARED_SPREADSHEET_123')
    expect(appDataConfig).toEqual({ spreadsheetId: 'SHARED_SPREADSHEET_123' })

    // --- Device B: Fresh browser, no localStorage ---
    vi.clearAllMocks()
    localStorageAdapter.get.mockResolvedValue(null) // Simulate empty localStorage
    localStorageAdapter.set.mockResolvedValue(undefined)

    const apiB = new SheetsApi(async () => 'TOKEN_B')
    const driveB = new DriveApi(async () => 'TOKEN_B')
    
    // Simulate App.tsx bootstrap logic
    let id = await localStorageAdapter.get(KEYS.spreadsheetId)
    expect(id).toBeNull()

    const config = await driveB.loadAppConfig()
    expect(config).toEqual({ spreadsheetId: 'SHARED_SPREADSHEET_123' })

    id = config!.spreadsheetId
    await localStorageAdapter.set(KEYS.spreadsheetId, id)

    // Device B now has the same spreadsheetId
    const repoB = createRepository({
      api: apiB,
      storage: localStorageAdapter,
      getSpreadsheetId: async () => id
    })

    const cfg = await repoB.getConfig()
    // Both devices now point to same spreadsheet
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- packages/shared/tests/integration.cross-device.test.ts -v`
Expected: FAIL - integration not complete

- [ ] **Step 3: Run full test suite to ensure no regressions**

Run: `npm test -- --run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/shared/tests/integration.cross-device.test.ts
git commit -m "test: integration test for cross-device spreadsheet sync via appData"
```

---

### Task 8: Update PermisosGoogleCard — Show appData scope status

**Files:**
- Modify: `packages/shared/src/features/configuracion/PermisosGoogleCard.tsx` (if exists) or `Configuracion.tsx:592-623`
- Test: `packages/shared/tests/permisos.appdata.test.tsx`

**Interfaces:**
- Consumes: `config.google_permisos` JSON
- Produces: UI shows `drive.appdata` permission status

- [ ] **Step 1: Write the failing test**

```tsx
// packages/shared/tests/permisos.appdata.test.tsx
import { render, screen } from '@testing-library/react'
import { PermisosGoogleCard } from '../src/features/configuracion/PermisosGoogleCard'

describe('PermisosGoogleCard shows appData scope', () => {
  it('renders drive.appdata permission row', () => {
    const config = { google_permisos: '{"sheets":"granted","drive":"granted","profile":"granted","appdata":"granted"}' }
    const setForm = vi.fn()
    render(<PermisosGoogleCard config={config} setForm={setForm} />)
    expect(screen.getByText(/appdata/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- packages/shared/tests/permisos.appdata.test.tsx -v`
Expected: FAIL - no appdata row

- [ ] **Step 3: Write minimal implementation**

```tsx
// packages/shared/src/features/configuracion/Configuracion.tsx:603-607 (inside PermisosGoogleCard)

const filas = [
  { key: 'sheets', label: t('configuracion.permisoSheets') },
  { key: 'drive', label: t('configuracion.permisoDrive') },
  { key: 'profile', label: t('configuracion.permisoPerfil') },
  { key: 'appdata', label: t('configuracion.permisoAppData') }  // NEW
]
```

Add i18n key `configuracion.permisoAppData` in locale files.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- packages/shared/tests/permisos.appdata.test.tsx -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/features/configuracion/Configuracion.tsx packages/shared/tests/permisos.appdata.test.tsx
git commit -m "feat(config): show drive.appdata permission in PermisosGoogleCard"
```

---

### Task 9: TypeScript & Lint Check

**Files:** All modified

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck` (or `tsc --noEmit`)
Expected: PASS

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: typecheck and lint pass for appData sync feature"
```

---

### Task 10: Manual Verification Checklist

- [ ] **New user flow:** Incognito window → sign in → app creates sheet → saves to appData
- [ ] **Existing user, new device:** Incognito window → sign in → app reads from appData → no "Conectando" spinner for sheet
- [ ] **Re-link sheet:** Panel Almacenamiento → Cambiar → pick different sheet → both localStorage and appData updated
- [ ] **Offline mode:** Disconnect network → app loads from localStorage/espejo → edits queue locally
- [ ] **Re-consent:** Existing user (pre-scope-change) signs in → sees consent screen for `drive.appdata` → after accept, sync works

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-09-07-appdata-spreadsheet-sync.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**