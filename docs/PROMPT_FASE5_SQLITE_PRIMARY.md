# Prompt para nuevo chat — Fase 5: SQLite Primary + Bidirectional Sync

## Contexto actual

**Stack**: React 19 + TanStack Query + Zustand + Vite + Vitest + jsdom
- Google Sheets API v4 + Drive API (fuente de verdad actual)
- SQLite WASM (sql.js) / OPFS / IndexedDB via `packages/shared/src/sync/`
- `EspejoProvider` hace pull periódico → llena espejo local → UI lee del espejo
- **Repository SIEMPRE va a Sheets** para lecturas/escrituras de negocio

**Optimización cuota ya hecha** (docs/OPTIMIZACION_CUOTA_SHEETS.md):
- TTL 5min, cache Config 30s, filtrado años, serialización 200ms, resetCompleto/Nuclear

---

## Bug bloqueante en modo offline — **ARREGLADO**

**Síntoma 1 (modal colgado)**: Al crear factura/cliente/gasto offline con `navigator.onLine` mintiendo (dice online pero no hay red):
1. Usuario llena modal → click "Guardar"
2. `await repo.createFactura(...)` se quedaba colgado 8s+ (reintentos `withMutex` × timeout 8s)
3. Modal no se cerraba, toast no aparecía, dato no llegaba a SQLite

**Fix**: Reducir timeouts para que el fallback a cola offline sea rápido (3s en vez de 8s+):
- `packages/shared/src/sync/colaEscrituras.ts:316` — `TECHO_INTENTO_DIRECTO_MS`: 8000→3000
- `packages/shared/src/sheets/api.ts:21` — timeout fetch: 8000→3000
- `apps/web/src/App.tsx:47` — `techoMs: 3_000` en `conColaEscrituras`
- `apps/extension/.../DashboardApp.tsx` — `techoMs: 3_000` en `conColaEscrituras`

**Síntoma 2 (había que recargar para entrar offline)**: Al caer la red, el modal dependía solo de `navigator.onLine` (miente con WiFi conectado pero internet caído), y para sesiones planas exigía `hayDesbloqueoSesion()` (flag solo presente si ya entraste offline antes en la pestaña). Sin él: modal bloqueante → usuario recargaba → boot detectaba el fallo → gate SesionOffline.

**Fix — detección de red real + auto-entrada sin recargar**:
- `packages/shared/src/sync/redStore.ts` (nuevo) — flag global `falloRed` + suscriptores (`marcarFalloRed`/`marcarRedOk`/`hayFalloRed`)
- `packages/shared/src/sheets/api.ts` — fetch abortado/timeout → `marcarFalloRed()`; éxito → `marcarRedOk()`
- `packages/shared/src/sync/colaEscrituras.ts` — error de transporte → `marcarFalloRed()`; éxito online → `marcarRedOk()`
- `packages/shared/src/store/espejoContext.tsx` — pull fallido por red → `marcarFalloRed()`; pull ok → `marcarRedOk()` + `espejoBus.onPullCompletado`
- `packages/shared/src/sync/espejoBus.ts` — nuevo evento `onPullCompletado` (host refresca `ultimo_pull`)
- `apps/web/src/App.tsx` + `apps/extension/.../DashboardApp.tsx` — modal usa `!online || falloRed`; auto-entrada offline para sesión plana con pull <24h (sin gate de `hayDesbloqueoSesion`); salida automática al volver la red; `activo` incluye `hayFalloRed()`

**Comportamiento final**:
- Red cae → se detecta fallo real → sesión plana reciente → **modo offline automático, sin modal ni recarga**
- Sesión cifrada-bloqueada → modal pide PIN (necesario para descifrar)
- Red vuelve → `evento online` limpia fallo → sale de modo offline → `SincronizadorCola` flushea la cola

**Verificación**: 304/304 tests pasan.

---

## Objetivo Fase 5

**SQLite como fuente de lectura principal** + **sync bidireccional automático**

```
┌─────────────┐     ┌─────────────┐     ┌──────────────────┐
│   UI        │────▶│  SQLite     │◀───▶│  Background Sync │
│  (react-    │     │  (OPFS/     │     │  - Push outbox   │
│   query)    │     │   IndexedDB)│     │  - Pull delta    │
└─────────────┘     └─────────────┘     └──────────────────┘
                           │                    │
                           ▼                    ▼
                    ┌─────────────┐     ┌──────────────────┐
                    │  Repository │     │  Google Sheets   │
                    │  (lee SQLite)│     │  (fuente verdad) │
                    └─────────────┘     └──────────────────┘
```

### Entregables

1. **SqlTableStore** implementando `TableStore` interface:
   - `getAll`, `getVarias`, `append`, `replace` → SQL
   - Outbox table: `idempotency_key`, `method`, `args`, `created_at`, `synced_at`

2. **Repository dual-mode**:
   - `createRepository({ store: 'sqlite' | 'sheets' })`
   - Lecturas → SQLite; Escrituras → SQLite + enqueue outbox
   - `repo.flushOutbox()` público para forzar sync

3. **Sync engine** (service worker o `setInterval` 30s):
   - `pushOutbox()` → batchUpdate Sheets (reintenta con backoff)
   - `pullDelta(since)` → batchGet `updated_at > lastSync` → upsert SQLite
   - Conflict resolution: last-write-wins por `updated_at` (vector clock opcional)

4. **Migración datos existentes**:
   - Backfill `updated_at` en Sheets (timestamp última modificación)
   - Pull inicial completo → SQLite vacío → danach solo delta

5. **Fix bug offline modal** — prioridad 0

---

## Archivos clave (ya existen, hay que extender)

| Archivo | Qué toca |
|---------|----------|
| `packages/shared/src/data/tableStore.ts` | Interface `TableStore` — agregar `query`, `updateWhere`, `deleteWhere` |
| `packages/shared/src/sync/espejo.ts` | `EspejoStore` — base para `SqlTableStore` |
| `packages/shared/src/sync/colaEscrituras.ts` | Outbox + flush logic |
| `packages/shared/src/data/repository.ts` | Dual mode + `flushOutbox()` |
| `packages/shared/src/store/espejoContext.tsx` | Inicializa SQLite store, arranca sync loop |
| `packages/shared/src/features/*/FacturaForm.tsx` etc. | Submit usa `repo` (ya funciona si store es SQLite) |

---

## Tests TDD a escribir primero (en `tests/sqlite-primary.test.ts`)

```typescript
describe('SqlTableStore', () => {
  it('getAll/getVarias leen de SQLite, no de Sheets')
  it('append/replace escriben en SQLite + enqueue outbox')
  it('outbox tiene idempotency_key único por operación')
})

describe('Repository dual-mode', () => {
  it('modo sqlite: listFacturas lee de SQLite')
  it('modo sqlite: createFactura escribe en SQLite + outbox')
  it('flushOutbox vacía outbox y hace batchUpdate a Sheets')
})

describe('Sync engine', () => {
  it('pushOutbox reintenta con backoff en 429/5xx')
  it('pullDelta trae solo updated_at > lastSync')
  it('conflicto: gana updated_at mayor')
})

describe('Bug offline modal', () => {
  it('createFactura offline resuelve inmediato, cierra modal, dato en SQLite')
})
```

---

## Comandos de verificación

```bash
cd packages/shared
npm test                    # 296+ tests verdes
npm test -t "SqlTableStore|dual-mode|Sync engine|Bug offline"
pnpm build                  # sin errores TypeScript
pnpm lint                   # sin warnings
```

---

## Instrucciones para el nuevo chat

1. **Lee primero**: `docs/OPTIMIZACION_CUOTA_SHEETS.md` + `docs/PLAN_EJECUCION.md` (Fase 5)
2. **Reproduce el bug**: crea factura offline → ve el modal colgado
3. **Arregla el bug offline** (prioridad 0) — que `repo.createFactura` offline resuelva inmediato y escriba en SQLite
4. **Implementa SqlTableStore** con outbox
5. **Haz Repository dual-mode**
6. **Sync loop** push/pull con backoff
7. **Tests TDD** para cada paso

---

## Notas técnicas

- `sql.js` WASM ya está en `packages/shared/src/sync/` (ver `sync-sqlite.test.ts`)
- OPFS en navegador, IndexedDB fallback, memoria en Node/tests
- `EspejoStore` ya tiene `replaceTable`, `getAllRows`, `init(DDL)` — reutilizar
- `colaEscrituras.ts` ya tiene `enqueue`, `flush`, `retry` — extender para outbox persistente
- Idempotency key: `${method}:${argsHash}:${timestamp}` para dedup en flush

---

**¿Empezamos por el bug del modal offline?**