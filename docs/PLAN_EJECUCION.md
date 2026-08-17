# Plan de ejecución — FinanceTracker

Versión: 1.0 (16 ago 2026)
Referencia de diseño: [ARQUITECTURA.md](ARQUITECTURA.md)

Regla de oro: **cada fase termina estable y verificable** (`pnpm lint` + `pnpm build` + `pnpm test` verdes). Nunca avanzas con tests rojos.

---

## Estructura de carpetas objetivo

```
finance-tracker/
├── apps/
│   ├── web/          # web app (Vite + React) — existe
│   ├── extension/    # extensión Chrome (WXT) — existe
│   ├── script/       # backend Apps Script — se retira al migrar (Fase 8)
│   └── backend/      # ← NUEVO: Hono (API de roles)
│       ├── src/
│       │   ├── index.ts        # arranque Hono + rutas
│       │   ├── auth/           # verificación id_token + códigos de acceso
│       │   ├── roles/          # middleware de permisos
│       │   ├── auditoria.ts    # registro de eventos
│       │   └── ratelimit.ts    # protección contra fuerza bruta
│       ├── package.json        # name: "@ft/backend", dep: "@ft/shared": "workspace:*"
│       └── tsconfig.json
├── packages/
│   └── shared/       # lógica compartida — existe (TableStore, guards, schemas)
└── pnpm-workspace.yaml        # ya incluye apps/* — no requiere cambios
```

`pnpm-workspace.yaml` ya cubre `apps/*`, así que crear `apps/backend` no exige tocar el workspace.

---

## Fase 0 — Preparación

**Objetivo:** dejar el terreno listo sin tocar código de producción.

**Pasos:**
1. Crear `apps/backend/` con `package.json`:
   ```json
   {
     "name": "@ft/backend",
     "private": true,
     "type": "module",
     "scripts": {
       "dev": "tsx watch src/index.ts",
       "build": "tsc --noEmit",
       "deploy": "vercel"
     },
     "dependencies": {
       "@ft/shared": "workspace:*",
       "hono": "^4",
       "jose": "^6"
     },
     "devDependencies": {
       "tsx": "^4",
       "typescript": "^5.9.3"
     }
   }
   ```
2. `tsconfig.json` extendiendo `tsconfig.base.json`.
3. Decidir hosting (Vercel functions recomendado).
4. En GCP (1 vez): proyecto, service account, OAuth client. Env vars en el host:
   `OAUTH_CLIENT_ID`, `SERVICE_ACCOUNT_JSON`, `SECRET_JWT`.
5. Verificar: `pnpm install && pnpm --filter @ft/backend typecheck`.

**Riesgo:** nulo (no toca producción).

---

## Fase 1 — Backend Hono básico

**Objetivo:** API mínima que valida id_token (Google) y hace proxy a la hoja.

**Pasos:**
1. `src/index.ts`: app Hono con `GET /api/health`.
2. `src/auth/`: middleware que verifica id_token con `jose` (firma local, no `tokeninfo`).
3. Rutas CRUD por módulo (facturas, clientes, gastos...) que delegan en `createRepository`/`TableStore` de `@ft/shared`.
4. Middleware de permisos: leer rol de `Usuarios` y aplicar `canView`/`canEdit`.

**Verificación:**
```
pnpm --filter @ft/backend typecheck && pnpm --filter @ft/shared test
```

**Riesgo:** bajo (código nuevo, no toca web/extension).

---

## Fase 2 — Códigos de acceso

**Objetivo:** ingreso por código sin cuenta Google.

**Pasos:**
1. Tabla `Codigos_Acceso` (código, rol, módulos, `expira_en`, `usos_max`, responsable, email) en `packages/shared/src/sheets/tables.ts` + entidad.
2. `src/auth/codigos.ts`: generar con unicidad (validar contra la hoja del dueño antes de guardar), formato `ANA-2026-XK3Q`.
3. Ruta `POST /api/auth/codigo`: valida existencia, expiración, usos; decrementa; emite JWT con rol.
4. Pantalla Compartir (web): "Generar código", lista de códigos, renovar, revocar.

**Verificación:**
```
pnpm --filter @ft/backend typecheck && pnpm --filter @ft/shared test
pnpm --filter @ft/web build
```

**Riesgo:** medio (toca web para la UI de códigos).

---

## Fase 3 — Seguridad de códigos

**Objetivo:** detener fuerza bruta y endurecer códigos infinitos.

**Pasos:**
1. `src/ratelimit.ts`: contador de fallos por IP + token + código.
   - 5 fallos → 30s de espera; 10 → 15 min; 20 → 1 hora.
   - Backoff exponencial (1s → 2s → 4s...).
2. Tabla `Dispositivos`: token de dispositivo (emitido por backend) + IP informativa.
3. Primer ingreso de un código **infinito**: exigir 2FA (verificación al responsable).
4. Remoción de dispositivo desde Compartir.

**Verificación:**
```
pnpm --filter @ft/backend typecheck && pnpm --filter @ft/shared test
```

**Riesgo:** bajo (aislado en el backend).

---

## Fase 4 — Auditoría

**Objetivo:** saber quién hizo qué.

**Pasos:**
1. Columna `editado_por` en tablas de datos (`Facturas`, `Gastos`, etc.) — el backend la sella en cada escritura.
2. Tabla `Auditoria` (usuario, tipo, acción, detalle, fecha) — solo escritura, inmutable.
3. Auditar también cambios de permisos (agregar/revocar códigos, cambiar rol).
4. Pantalla Auditoría (web) con filtros por persona/módulo/fecha.
5. Rotación: archivar a Drive al superar "x" filas.

**Verificación:**
```
pnpm --filter @ft/backend typecheck && pnpm --filter @ft/web build && pnpm --filter @ft/shared test
```

**Riesgo:** medio (cambia escrituras de datos + UI).

---

## Fase 5 — SQLite local + sync

**Objetivo:** offline-first del dueño.

**Pasos:**
1. Ampliar `TableStore` en `packages/shared`:
   `getRange`, `query`, `updateWhere`, `deleteWhere`.
2. Implementar `SqlTableStore` (navegador: OPFS/wasm o IndexedDB).
3. En la app web: usar el store local como capa de trabajo; PULL inicial desde Sheets.
4. Columna `updated_at` en filas para sync incremental.
5. Sync bidireccional: PUSH (cambios locales) + PULL (cambios nuevos), con merge last-write-wins.

**Verificación:**
```
pnpm --filter @ft/shared test && pnpm --filter @ft/web build
```

**Riesgo:** alto (cambia la fuente de trabajo del dueño). Hacerlo con `SqlTableStore` nuevo sin tocar el flujo Sheets hasta validar.

---

## Fase 6 — Backup E2E

**Objetivo:** respaldo cifrado que solo el usuario puede leer.

**Pasos:**
1. En la app: derivar clave de una **frase de recuperación** (el usuario la guarda al inicio).
2. Serializar las pestañas a JSON, encriptar en el dispositivo, enviar cifrado al SaaS.
3. Restaurar: desencriptar y escribir de vuelta vía API.

**Verificación:**
```
pnpm --filter @ft/web build
```

**Riesgo:** medio.

---

## Fase 7 — IA y automatizaciones (opcional)

**Objetivo:** asistente y recordatorios.

**Pasos:**
1. `POST /api/ia/resumen` con `@ai-sdk/openai` (resúmenes de gastos/facturas).
2. Cron de recordatorios (vencimientos, stock bajo) con `hono/cloudflare-workers` o `node-cron`.

**Verificación:**
```
pnpm --filter @ft/backend typecheck
```

**Riesgo:** bajo.

---

## Fase 8 — Migración de apps/script → Hono

**Objetivo:** retirar Apps Script.

**Pasos:**
1. Confirmar que `apps/backend` cubre las rutas del `backend.ts` actual.
2. Actualizar la web para apuntar al nuevo backend (nueva URL, mismo contrato).
3. Retirar `apps/script` y sus docs de despliegue.
4. Retirar el deployment de Apps Script en GCP.

**Verificación:**
```
pnpm build && pnpm test && pnpm test:e2e
```

**Riesgo:** medio (último cambio, requiere prueba manual con invitados reales).

---

## Resumen de riesgos

| Fase | Riesgo | Impacto |
|---|---|---|
| 0 Preparación | Nulo | Terreno |
| 1 Backend Hono | Bajo | API de roles |
| 2 Códigos | Medio | Acceso puntual |
| 3 Seguridad códigos | Bajo | Anti fuerza bruta |
| 4 Auditoría | Medio | Quién hizo qué |
| 5 SQLite + sync | Alto | Offline-first |
| 6 Backup E2E | Medio | Respaldo cifrado |
| 7 IA/automatización | Bajo | Extra |
| 8 Migración Apps Script | Medio | Retiro del backend viejo |
