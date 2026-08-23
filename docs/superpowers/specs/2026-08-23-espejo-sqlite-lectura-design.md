# Espejo SQLite de lectura siempre sincronizado — Diseño

**Fecha**: 2026-08-23
**Estado**: Propuesta para revisión
**Alcance**: Fase A (lectura local) + fundación para Fases B/C

## 1. Problema

Google Sheets como única fuente de lectura hace cada pantalla dependiente de
fetch HTTP: 300 ms–2 s por consulta, cuota API, parsing A1. El dashboard y los
reportes encadenan varias lecturas por render.

## 2. Objetivo

SQLite local (WASM) como **capa principal de lectura**, mantenida como espejo
**siempre sincronizado** de Google Sheets. Sheets deja de consultarse en el
camino de lectura normal.

Requisitos:

1. R1 — Toda lectura de la app sale del espejo local (<5 ms).
2. R2 — El espejo se mantiene fresco sin intervención del usuario:
   pull al abrir, pull al recuperar foco, invalidación dirigida tras cada
   escritura, TTL de seguridad y sincronización manual.
3. R3 — Sheets sigue siendo la fuente de verdad persistente: el espejo es
   desechable y reconstruible en cualquier momento.
4. R4 — Los folios y operaciones atómicas siguen arbitrándose en Sheets
   (mutex existente). El espejo nunca genera folios.
5. R5 — Funciona en web (Vite) y extensión (WXT/MV3).

## 3. Decisión de motor

| Opción | Pros | Contras | Decisión |
|---|---|---|---|
| `@sqlite.org/sqlite-wasm` + OPFS | Persistencia real, SQL completo | COOP/COEP si usa hilos; CSP `wasm-unsafe-eval` en MV3; OPFS no disponible en algunos contextos | **Opción A (web)** |
| `sql.js` (wasm en memoria) + volcado a IndexedDB | Sin COOP/COEP; funciona igual en web y extensión | Persistir = exportar binario completo | **Opción B (fallback/extensión)** |
| IndexedDB puro sin SQL | Cero dependencias | Se pierde SQL/índices declarativos | Descartada |

**Elección**: adaptador `EspejoStore` con dos implementaciones detrás de una
misma interfaz. Web usa sqlite-wasm+OPFS cuando está disponible; si no,
sql.js+IndexedDB. La app solo conoce la interfaz.

```ts
interface EspejoStore {
  init(): Promise<void>                       // abre/crea BD y tablas espejo
  replaceTable(t: TableName, rows: Row[]): Promise<void>   // sync full
  query(sql: string, params?: unknown[]): Promise<Row[]>   // lecturas
  close(): Promise<void>
}
```

El DDL del espejo se **genera desde `TABLES`** (`sheets/tables.ts`), que ya es
la especificación canónica de columnas y tipos. Fuente única de verdad:
una tabla nueva en `TABLES` aparece automáticamente en el espejo.

## 4. Comportamiento "siempre sincronizado"

Cinco disparadores de refresco, todos convergen en un mismo pipeline con
debounce y cola única (nunca dos pulls simultáneos):

| Disparador | Momento | Alcance |
|---|---|---|
| Arranque | Al montar la app | Full pull (todas las hojas) |
| Foco de ventana | `visibilitychange` → visible | Pull de tablas "calientes" si TTL vencido |
| Post-escritura | Tras cada mutation exitosa | Invalidación dirigida (tabla afectada + dependientes) |
| TTL de seguridad | Cada 60 s con app abierta | Pull de calientes si hubo pull previo exitoso |
| Manual | Botón en RateBubble / Configuración | Full pull forzado |

**Tablas calientes** (lectura frecuente, cambian seguido): `Facturas`,
`Factura_Items`, `Pagos`, `Gastos`, `Cuentas_Pagar`, `Productos`.
**Frías** (cambian poco): `Clientes`, `Proveedores`, `Empleados`, `Config`,
resto. Las frías se refrescan solo en arranque, manual o post-escritura propia.

### Pipeline de sincronización

```
pull(tablas[]) ──► mutex interno ──► batchGet Sheets (1 request/tabla)
              ──► comparar hash por tabla ──► si difiere: replaceTable espejo
              ──► invalidar queries react-query afectadas
```

- **Hash por tabla**: SHA-1 de la serialización de filas. Si no cambió, no se
  toca el espejo ni se invalidan queries (evita re-renders fantasma).
- **Escrituras (Fase A)**: siguen siendo write-through a Sheets; al confirmarse
  el write, se actualiza la tabla en el espejo con las filas resultantes que el
  propio repositorio ya tiene en memoria (sin esperar al próximo pull).
- **Indicador de frescura**: timestamp de último pull expuesto en la UI
  (punto verde/ámbar junto al nombre de cada tabla en Configuración → Datos).

## 5. Cambios por capa

1. **Nuevo `packages/shared/src/sync/espejo.ts`**: pipeline, hashes, TTL,
   debounce, selección de tablas calientes/frías. Puro e inyectable
   (`{ store, fetchTables }`) → 100 % testeable en vitest sin navegador.
2. **Nuevo `packages/shared/src/sync/stores/`**: `SqliteOpfsStore`,
   `SqlMemoryIdbStore`. Contrato probado con suite compartida.
3. **DDL generado**: `sync/ddl.ts` — `CREATE TABLE` desde `TABLES` + índices
   sobre claves foráneas lógicas (`id_factura`, `id_empleado`, `fecha`).
4. **`store/queries.tsx`**: los hooks pasan de `repo.listX()` a leer del espejo;
   `repo.*` queda para escrituras. Detrás de flag `VITE_ESPEJO=on|off` para
   rollback inmediato sin deploy.
5. **UI**: indicador de frescura + botón "Sincronizar ahora" (reutiliza
   burbuja existente).
6. **Backend Apps Script**: sin cambios en Fase A (el espejo lee vía API Sheets
   con el token del dueño, igual que hoy).

## 6. Testing

- Unitarios (Node/vitest): generación de DDL desde `TABLES`; pipeline de sync
  (hash igual → sin reemplazo; hash distinto → replace + invalidación);
  debounce/cola única; TTL; invalidación dirigida post-write.
- Suite de contrato compartida ejecutada contra ambos stores.
- E2E manual checklist: primera carga, segunda carga (sin red → app funcional),
  editar factura en otra pestaña → foco → espejo actualizado, botón manual.

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| OPFS/CSP indisponible (MV3) | Adaptador alternativo sql.js+IndexedDB automático |
| Espejo obsoleto entre dispositivos | TTL 60 s + pull-on-focus; indicador visual de frescura |
| Wasm ~1 MB inicial | Carga diferida tras autenticación; caché HTTP larga |
| Cuota API en pulls frecuentes | Hash evita reescrituras; batchGet agrupa; pulls solo de calientes |
| Rollback | Flag `VITE_ESPEJO=off` restaura ruta Sheets-directa |

Fuera de alcance (Fases B/C): cola de escrituras offline, reconciliación de
conflictos, folios locales.

## 8. Criterios de aceptación

1. Segunda apertura de la app renderiza dashboard/reportes sin ninguna llamada
   a Sheets hasta que vence el TTL.
2. Un cambio hecho fuera (otra pestaña/dispositivo) aparece al volver el foco
   en ≤60 s, o instantáneo con botón manual.
3. Toda la suite actual sigue verde; nuevos unitarios ≥90 % del pipeline sync.
