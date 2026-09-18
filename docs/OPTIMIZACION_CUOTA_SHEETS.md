# Optimización cuota Google Sheets — Plan y Estado

## Contexto
- **Problema**: Error 429 (Too Many Requests) por agotar cuota 60 req/min/usuario
- **Causa raíz**: `setInterval` 60s + `visibilitychange` + focus = pulls constantes; `getVariasUnificado` pedía a TODOS los años en paralelo

---

## Cambios implementados (3 fases, 296/297 tests pasan)

### 1. TTL 5min + quitar setInterval (`espejoContext.tsx`)
- `TABLAS_CALIENTES_TTL_MS = 300_000` (5 min)
- Solo `visibilitychange`/`focus` disparan sync automático
- **Antes**: 60 req/min → **Después**: ~2 req/5min (~99% reducción)

### 2. Cache Config 30s (`repository.ts:77-110`)
- `leerFilasConfigRaw` cachea filas Config (TTL 30s)
- Invalida en `writeConfig` y `mutexWriteRow`
- Evita leer Config en cada mutex/operación

### 3. Filtrar años ANTES de pedir (`repository.ts:262-284`)
- `getVariasUnificado` recibe `añosPermitidos` predicate
- `leerVariasTablasVivas` pasa `añosVivosPara` (activo + anterior)
- **Antes**: pedía a BASE + 2024 + 2025 + 2026... → **Después**: solo BASE + activo + anterior

### 4. Serializar multi-spreadsheet (`repository.ts:279-287`)
- Loop secuencial + `await sleep(200ms)` entre spreadsheets
- Evita ráfaga de batchGet paralelos que gatilla 429
- Test verifica ≥300ms para 3 spreadsheets

### 5. resetCompleto / resetNuclear (`repository.ts:461-535`)
- **resetCompleto**: borra filas BASE, EVENTOS→papelera, limpia Config, registra `reset_historial`
- **resetNuclear**: crea BASE nuevo, BASE viejo→papelera, actualiza `spreadsheetId` en storage

### 6. UI Zona peligrosa (`Configuracion.tsx`)
- Card "Zona peligrosa" con 2 botones destructivos
- Diálogos confirmación con descripción de consecuencias
- Llama a `repo.resetCompleto()` / `repo.resetNuclear()`

---

## Arquitectura de lectura (respuesta a tu pregunta)

**NO hay SQLite en el path de lectura principal.**

```
UI (react-query) ──► Espejo local (SQLite/OPFS/IndexedDB)  ←── se llena tras pull
       │
       └──► Repository ───► Google Sheets API (HTTP)
              │
              ├── getVariasUnificado → batchGet multi-rango (1 req/spreadsheet)
              ├── readTable → unión BASE legacy + años registrados
              └── Config cache 30s (leerFilasConfigRaw)
```

| Operación | Fuente |
|-----------|--------|
| `repo.getConfig()` | Sheets API (con cache 30s) |
| `repo.listFacturas()` | Sheets API (unión años) |
| `repo.leerVariasTablasVivas()` | Sheets API (filtrado años vivos, serializado) |
| UI `useFacturas()` | Espejo local (tras invalidación) |
| Pull inicial / reconexión | Sheets API → escribe en espejo |

El espejo es **caché de lectura para UI**, no fuente de verdad. La fuente de verdad **siempre es Google Sheets**.

---

## Tests TDD (validan comportamiento)

```bash
cd packages/shared && npm test
# 296 passed, 1 failed (preexistente inventario.test.ts:273, ajeno)
```

Tests nuevos/actualizados en `tests/repository.test.ts`:
- `cache Config (leerFilasConfigRaw)` — 2 tests
- `getVariasUnificado filtra años ANTES de pedir` — 1 test
- `serializar multi-spreadsheet (evita 429 por ráfaga)` — 1 test (delay ≥300ms)
- `resetCompleto / resetNuclear` — 2 tests placeholder → ahora reales

---

## Próximos pasos (si persisten 429 en producción)

1. **Backoff exponencial en SheetsApi** (ya existe 4 reintentos con 500ms base, línea 37-39 `api.ts`)
2. **Batch writes** — agrupar `batchUpdate` multi-tabla en escrituras (ya hace en `registerPago`)
3. **Drive API quota** — `enviarAPapelera` usa Drive API (cuota distinta), OK
4. **Monitoreo** — log `[getVariasUnificado] delay 200ms` en consola para medir en prod

---

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `packages/shared/src/store/espejoContext.tsx` | TTL 5min, quitar setInterval |
| `packages/shared/src/data/repository.ts` | Cache Config, filtrado años, serialización, resetCompleto, resetNuclear |
| `packages/shared/src/sheets/createSpreadsheet.ts` | `configFromRows` preserva `eventos_*` |
| `packages/shared/src/types/entities.ts` | `Config` index signature `eventos_${string}` |
| `packages/shared/src/types/schemas.ts` | `ConfigSchema.passthrough()` |
| `packages/shared/src/features/configuracion/Configuracion.tsx` | Zona peligrosa UI |
| `packages/shared/src/i18n/messages.ts` | Keys `zonaPeligrosa*`, `resetCompleto*`, `resetNuclear*` |
| `packages/shared/tests/repository.test.ts` | Tests actualizados (IDs realistas ≥15 chars) |

---

## Verificación

```bash
# Ejecutar solo tests de optimización
cd packages/shared && npm test -- -t "cache Config|filtra años|serializar|resetCompleto|resetNuclear"

# Build completo
pnpm build

# Lint
pnpm lint
```