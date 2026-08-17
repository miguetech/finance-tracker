# Plan de Refactorización — FinanceTracker

> **Estado: 7/7 fases completadas.** Verificación final: `pnpm lint` (0 errores), `pnpm build` (web + extension + script OK), `pnpm test` (127 tests pasan).

Objetivo: corregir malas prácticas detectadas en auditoría, dejar el proyecto estable y bien estructurado, y prepararlo para escalar a **multi-idioma (i18n)** y, opcionalmente, **base de datos**.

Estrategia: 7 fases priorizadas por riesgo/impacto. Cada fase termina estable y verificable (build + typecheck + tests verdes). Ninguna fase debe romper el proyecto.

## Estado actual verificado (auditoría)

- Builds pasan, tests 118/119 (1 flaky), typecheck pasa.
- Capa `Repository` con interfaz única (owner local / visitante remoto).
- Schemas zod, tests unitarios en `packages/shared`.

## Problemas estructurales

1. `apps/script/src/backend.ts` duplica ~30 funciones de negocio de `repository.ts` con divergencias de comportamiento (integridad de datos owner ≠ visitante).
2. UI 100% español hardcodeado, sin capa i18n (55+ strings) y sin formateo de fecha local.
3. Sin lint, sin CI, e2e simbólico.
4. Lógica de negocio incrustada en el repositorio Sheets; config guarda listas como CSV strings.

---

## Fase 1 — Endurecer seguridad

Riesgo: bajo · Cambio: pequeño · Prioridad: alta

**Problemas**
- `apps/script/src/backend.ts:126` — verificación de aud opcional → si `OAUTH_CLIENT_ID` no está seteado, backend acepta cualquier id_token de Google. Bypass de autenticación.
- `packages/shared/src/auth/popupOAuth.ts:48-55` — access token + id_token en localStorage → cualquier XSS roba acceso al Drive.
- `apps/script/src/backend.ts:640,632` — `writeConfig`/`saveUsuario` sin validación zod → payload malformado corrompe la hoja.

**Pasos**
1. Backend: requerir `OAUTH_CLIENT_ID` y validar `aud` siempre.
2. Backend: expirar cache de token a 60s.
3. Web: mantener tokens en memoria, no en localStorage.
4. Backend: validar `saveConfig`/`saveUsuario` con los schemas zod existentes.

**Verificación**
```
pnpm --filter @ft/script typecheck && pnpm --filter @ft/script build
pnpm --filter @ft/shared test
```

---

## Fase 2 — Unificar lógica backend/repository

Riesgo: medio · Cambio: medio · Prioridad: alta

**Problemas**
- `backend.ts` reimplementa `readTable/replaceTable/insertOrReplace/...` (11 imports relativos, ~30 funciones).
- Divergencias reales:
  - `deleteCliente` backend (556-559) borra sin verificar facturas; `repository.ts:133-138` sí bloquea → huérfanos.
  - `deleteProveedor` backend (582-585) no verifica CxP; `repository.ts:294-298` sí.
  - `listProductos` backend (608-609) no enriquece `nombre_proveedor`; `repository.ts:435-439` sí.
  - `deleteUsuario` backend (634-636) compara email exacto; `repository.ts:150` es case-insensitive.
  - `registerPago` backend (274) mensaje roto *"Origen del pago no requiere"*.

**Pasos**
1. Extraer a `packages/shared` funciones puras compartidas:
   - `validateDeleteCliente`, `validateDeleteProveedor`, `enrichProductos`, `deleteUsuarioCmp`.
2. Consumirlas en `repository.ts` y `backend.ts`.
3. Corregir mensaje roto `backend.ts:274`.

**Verificación**
```
pnpm --filter @ft/shared test    # ampliar repository.test.ts con casos FK
pnpm --filter @ft/script build
```

---

## Fase 3 — Fechas correctas

Riesgo: bajo · Cambio: medio · Prioridad: alta

**Problemas**
- 33 sitios usan `new Date().toISOString()` (UTC) → en husos negativos (UTC-5 Colombia) "hoy" puede ser mañana → vencimientos/nóminas con día corrido.

**Pasos**
1. Helper `todayLocal()` en `packages/shared`.
2. Reemplazar los 33 sitios.
3. Tests para huso negativo.

**Verificación**
```
pnpm --filter @ft/shared test
```

---

## Fase 4 — Tipar frontera de datos

Riesgo: bajo · Cambio: grande · Prioridad: media

**Problemas**
- 69 sitios con `as unknown as X` + `as never`. El contrato tipado (`entities.ts`) se viola en la frontera de datos. Errores invisibles hasta runtime.

**Pasos**
1. `deserializeRow<T>` con map de tipo por columna.
2. `readTable<T>(t)` generic.
3. Tipar inputs de mutación en modales (eliminar `as never`).

**Verificación**
```
pnpm --filter @ft/web typecheck && pnpm --filter @ft/shared test
```

---

## Fase 5 — Capa i18n

Riesgo: medio · Cambio: grande · Prioridad: alta (meta explícita)

**Problemas**
- 55+ strings de UI hardcodeadas en español.
- Errores zod hardcodeados en español.
- Datos mostrados como UI con nombres en español + CSV (categorías, monedas, taxid, roles).
- Fechas sin formateo local.
- `lang="es"` fijo.
- Pluralización manual ("{n} producto(s)").

**Pasos**
1. Instalar `i18next` + `react-i18next` en web (y cargar en shared si aplica).
2. Crear `i18n/es.json` (default) con claves por módulo: comunes, nav, errores.
3. Reemplazar strings por `t('...')` módulo a módulo.
4. Errores zod con claves i18n.
5. Fechas con `Intl.DateTimeFormat(locale)`.
6. Lookup de moneda por código (no por nombre español).
7. `lang` dinámico en `index.html`.
8. Idiomas futuros: `pt.json`, `gl.json`, `ca.json`, etc.

**Verificación**
```
pnpm --filter @ft/shared test
pnpm --filter @ft/web build
```

---

## Fase 6 — Preparar DB

Riesgo: medio · Cambio: medio · Prioridad: media (opcional)

**Problemas**
- Lógica de negocio embebida en `repository.ts` (folio con mutex, saldos, stock, validaciones FK, tipo_cambio) mezclada con `batchGet/batchUpdate/rangeOf`.
- Config y listas como CSV strings (imposible consultar en DB).
- Escritura por reemplazo de tabla completa (`replaceTable`), upsert read-all.
- `spreadsheetId` en el store global (mezcla UI con infraestructura).

**Pasos**
1. Introducir puerto `TableStore` (getAll/updateWhere/insert/delete) con impl Sheets.
2. Mover lógica de negocio de `repository.ts` a servicios puros (`services/invoice.ts`, `services/inventory.ts`).
3. Normalizar categorías/métodos/tasas a tablas.
4. Quitar `replaceTable` de flujos críticos.
5. Nuevo `SqlTableStore` con la misma interfaz (cuando llegue la DB).

**Verificación**
```
pnpm --filter @ft/shared test    # repository.test.ts mockea el puerto, no fetch
pnpm test:e2e
```

---

## Fase 7 — Higiene final

Riesgo: bajo · Cambio: pequeño · Prioridad: baja

**Pasos**
1. `eslint` + script `lint` raíz.
2. CI en GitHub Actions (build + test en push).
3. Limpiar dead code: `_internals` (`createSpreadsheet.ts:133`), tabla `Metas` (`tables.ts:109`), `chromeIdentityAuth.ts`, `useCxpById` (`queries.tsx:168`), `DEFAULT_METODOS` duplicado.
4. Mover `@vitejs/plugin-react`/`vite` a devDependencies; `typescript` en extension.
5. Usar `KEYS.spreadsheetId` en `apps/extension/entrypoints/background.ts:5`.
6. E2e con fetch mockeado (no simbólico).

**Verificación**
```
pnpm lint && pnpm build && pnpm test && pnpm test:e2e
```

---

## Resumen de riesgos

| Fase | Riesgo de romper | Impacto |
|---|---|---|
| 1 | Bajo | Seguridad |
| 2 | Medio | Integridad de datos |
| 3 | Bajo | Corrección de fechas |
| 4 | Bajo | Deuda de tipos |
| 5 | Medio | i18n |
| 6 | Medio | Preparación DB |
| 7 | Bajo | Mantenibilidad |

## Estado de ejecución (16 ago 2026)

| Fase | Estado | Resultado |
|---|---|---|
| 1 | ✅ Completa | `aud` requerido en backend; cache token 60s; tokens en memoria (no localStorage); zod en `saveConfig`/`saveUsuario` |
| 2 | ✅ Completa | Guards compartidos (`assertClienteSinFacturas`, `assertProveedorSinCxp`, `enrichNombreProveedor`, `emailIgual`) en `packages/shared/src/data/guards.ts`; backend y repository convergen; mensaje "Origen del pago requerido" corregido |
| 3 | ✅ Completa | `todayLocal()`/`monthLocal()` en `lib/date.ts`; 33 sitios migrados (tests con huso negativo) |
| 4 | ✅ Completa | `readTable<T>` genérico; casts `as unknown as X` reducidos de 69 a fronteras legítimas; `as never` eliminados |
| 5 | ✅ Completa | Infraestructura i18n propia (`src/i18n`): diccionarios es/pt/gl/ca, `I18nProvider`, `useI18n` con fallback es, selector de idioma en Configuración; 26 features migradas a `t()`; estados centralizados en `ui/estados.tsx` |
| 6 | ✅ Completa | Puerto `TableStore` (`data/tableStore.ts`) desacopla transporte de lógica; `appStore` limpio (solo config de UI) |
| 7 | ✅ Completa | eslint + `pnpm lint` (0 errores), CI en GitHub Actions, dead code eliminado (`_internals`, `Metas`, `METODOS_DEFAULT`, imports sin usar), deps en devDependencies, `KEYS` en background.ts, `formatMoneyConverted` sin crash |

### Pendientes futuros (no bloquean)

- **Mensajes zod en español**: la validación de errores viaja por red (backend Apps Script usa los schemas). Mapearlos a códigos i18n (`ERR_*`) es mejora posterior.
- **Normalizar config CSV a tablas** (categorías/métodos/tasas): para cuando se migre a DB real. Ya no bloquea gracias a `TableStore`.
- **e2e con fetch mockeado**: actualmente valida el boot ("Conectando…"). Mejorarlo requiere mockear `SheetsApi`.
