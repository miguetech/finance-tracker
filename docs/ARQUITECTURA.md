# Arquitectura objetivo — FinanceTracker

Versión: 1.0 (16 ago 2026)
Estado: plan de arquitectura (no implementado aún)

---

## 1. Visión general

FinanceTracker es una app de **facturación personal para un solo usuario (el dueño)**.
El dueño trabaja con sus datos de forma **individual**, con o sin internet. La app
lee/escribe local (SQLite) y sincroniza con Google Sheets como copia en la nube.

Los **roles de acceso** son una feature *facilitadora*: solo para cuando el dueño
decide dar acceso puntual a un invitado. El backend **no guarda datos de negocio**;
su único trabajo es **dar permisos** (authz) y **ser el host** (punto de entrada
para invitados). Los datos viven en la hoja del dueño.

```
┌───────────────────────────────┐         ┌──────────────────────────┐
│  App del dueño (web/ext)      │         │  App del invitado        │
│  · SQLite local (trabajo)     │         │  · sin hoja, sin datos   │
│  · offline-first              │         └───────────┬──────────────┘
└───────┬───────────────┬───────┘                     │
        │ PULL/PUSH     │                             │ HTTP (id_token)
        ▼               ▼                             ▼
┌────────────────┐  ┌──────────────────┐   ┌──────────────────────┐
│ Google Sheets  │  │ Backup E2E (SaaS)│   │ Backend Hono (authz) │
│ (copia nube,   │  │ cifrado con clave│   │ · valida identidad   │
│  fuente viva)  │  │ solo del usuario │   │ · aplica rol          │
└────────────────┘  └──────────────────┘   │ · proxy a la hoja    │
                                           └──────────┬───────────┘
                                                      │ service account
                                                      ▼
                                               Google Sheets (misma hoja)
```

Regla central: **la hoja del dueño nunca se comparte con nadie.** Los invitados
entran solo por el backend; el backend accede a la hoja con una service account
de identidad propia.

---

## 2. Decisiones de arquitectura

| Tema | Decisión | Justificación |
|---|---|---|
| Fuente de trabajo | SQLite local (navegador, via wasm/OPFS o IndexedDB) | Offline-first, búsqueda y paginación nativas (`WHERE`, `LIMIT`) |
| Fuente de respaldo | Google Sheets (ya existe, con Compartir/roles) | Sin migrar datos; la hoja es copia en la nube |
| Dirección del sync | **Bidireccional** (PULL + PUSH) | Llenar local desde la hoja; subir cambios locales |
| Identidad del backend | **Service account** en GCP | El backend habla con la hoja en nombre propio, sin usar la sesión del dueño |
| Framework backend | Node.js + TypeScript + **Hono** | TS-first, liviano, corre en Vercel/Netlify/Workers/Railway |
| Auth de usuarios | Google id_token verificado con `jose` (firma local) | Más seguro y rápido que `tokeninfo` remoto (el que usa Apps Script hoy) |
| Hosting | Vercel/Netlify functions (misma plataforma que la web) | Un solo lugar de deploy |
| Backup | E2E encriptado con frase de recuperación | Solo el usuario puede leer el backup |
| i18n | Sistema propio en `packages/shared/src/i18n` (es/pt/gl/ca/en) | Ya implementado en fases previas |

---

## 3. La hoja de cálculo como "JSON vía API"

Una hoja de Google no se envía como archivo. Es un documento en la nube con
pestañas (tablas). Se accede por la **Google Sheets REST API**:

```
GET .../spreadsheets/{id}/values/'Clientes'!A1:F100
→ [ ["id","nombre","telefono"], ["cli_1","Ana","555-0101"], ... ]
```

En `packages/shared` esto ya existe: `SheetsApi` + `serializeRow`/`deserializeRow`.
La hoja se representa como **JSON estructurado** por pestaña, y ese JSON es lo que
se sincroniza, se busca y se respalda.

### Límites de Google Sheets (para tener en cuenta)

| Límite | Valor |
|---|---|
| Celdas por hoja | 10 millones |
| Columnas por hoja | 18 278 |
| Tamaño máx. | ~50 MB / 10M celdas |

Para uso individual (50–200 filas/mes) el espacio **no es riesgo inminente**.
El problema más temprano es **velocidad** (leer tablas completas en cada render).
Por eso SQLite local es la capa de trabajo y Sheets la copia.

---

## 4. SQLite local y sync bidireccional

### Modelo

```
        PULL (descargar)               arranque con red + incremental
SQLite local  ◄──────────────────────  Google Sheets
        ──────────────────────►
        PUSH (subir)                   cambios hechos offline
```

- **PULL**: primer arranque copia toda la hoja al local; después solo los cambios nuevos.
- **PUSH**: el dueño edita local (funciona sin red); al reconectar, sube los cambios.

### Requisitos técnicos

1. **Identificador de cambios**: columna `updated_at` (timestamp) por fila para
   saber qué cambió y no repetir PULL/PUSH.
2. **Merge / conflictos**: si la misma fila se edita en 2 lugares offline, gana la
   de mayor timestamp (last-write-wins) o se marca conflicto.
3. **Folio atómico**: hoy usa `contador_folio` con mutex sobre Sheets. Offline no
   hay mutex remoto → al sync se fusionan contadores con `MAX(local, remoto)` y se
   re-folían las facturas en conflicto (el campo `editada` ya existe para marcarlas).

### Capa de datos

El puerto `TableStore` en `packages/shared/src/data/tableStore.ts` es el punto de
inserción. Hoy tiene una implementación Sheets (`createSheetsTableStore`). Se amplía:

```ts
interface TableStore {
  getAll<T>(t: TableName): Promise<T[]>
  append<T>(t: TableName, rows: T[]): Promise<void>
  replace<T>(t: TableName, rows: T[]): Promise<void>
  getRange<T>(t: TableName, offset: number, limit: number): Promise<T[]>  // paginación
  query<T>(t: TableName, filtro: Record<string, unknown>): Promise<T[]>   // búsqueda
  updateWhere<T>(t, match: Partial<T>, patch: Partial<T>): Promise<void>  // atómico
  deleteWhere<T>(t, match: Partial<T>): Promise<void>                     // atómico
}
```

- Impl **SQLite**: implementa todo con `SELECT ... LIMIT/OFFSET`, `WHERE`, `UPDATE`, `DELETE`.
- Impl **Sheets**: implementa PULL/PUSH y lectura por rango (`getRange`).

---

## 5. Backend de roles (Hono)

### Qué hace y qué no hace

| Hace | No hace |
|---|---|
| Validar identidad (id_token de Google) | No guarda datos de negocio |
| Aplicar rol del usuario (canView/canEdit por módulo) | No es la fuente de verdad |
| Proxy de escritura/lectura a la hoja | No da acceso a la hoja a los invitados |
| Ser el host para invitados | — |

### Flujo de una petición de invitado

```
POST tu-api.com/api/facturas  (body: factura + id_token)
  1. Verificar id_token (jose, firma local)
  2. Leer rol del usuario desde la hoja 'Usuarios' (o caché)
  3. Aplicar permisos del rol
  4. Escribir en la hoja vía API + service account
```

Los roles viven en la hoja `Usuarios` que ya existe. El backend no necesita otra
base de datos para esto: deja de confiar en el cliente y valida cada request.

### Configuración en Google Cloud (la hace el desarrollador 1 vez)

1. Crear proyecto GCP.
2. Crear **service account** (identidad del backend).
3. Crear **OAuth client** (login de usuarios).
4. Desplegar backend Hono + web (Vercel/Netlify).
5. Configurar env vars (client_id, service account, etc.).

El **usuario final hace 0 configuración**: solo inicia sesión con su Google. La app
le crea su hoja automáticamente y **auto-otorga** acceso a la service account vía
Drive API en el primer login (paso invisible).

### Dos modelos de propiedad de datos

| Opción | Dueño de los datos | Fricción |
|---|---|---|
| A: hoja en el Drive del usuario (recomendada) | El usuario | Ninguna visible (auto-otorga) |
| B: hojas en la infraestructura del SaaS | El desarrollador/SaaS | Cero (las crea el backend) |

Se recomienda **A**: los datos pertenecen al usuario, igual que hoy.

---

## 6. Backup E2E encriptado

### Concepto

```
Tú (usuario)                     SaaS (backend)
   │  datos                          │
   │  ── encripta con SU clave ──►   │  guarda SOLO el cifrado
   │                                 │  (no puede leerlo ni él)
```

- La app encripta los datos **en el dispositivo** antes de enviar el backup.
- El backend guarda solo texto cifrado.
- La clave la tiene **solo el usuario** (de una frase de recuperación).

### Regla de oro

**Si solo el usuario tiene la clave y la pierde, el backup es irrecuperable.**
No existe "olvidé mi contraseña" — eso exigiría que el SaaS guardara la clave y
entonces ya no sería solo del usuario.

Solución estándar: la clave se deriva de una **frase de recuperación** (recovery
phrase) que el usuario guarda al inicio. El SaaS nunca la conoce.

### Cómo se ve el backup

1. Leer cada pestaña vía API → JSON.
2. Juntar en `{ Clientes: [...], Facturas: [...], Config: {...} }`.
3. Encriptar (E2E) y guardar en el SaaS.

### Limitaciones honestas

- No hay búsqueda/reportes server-side sobre datos encriptados (el SaaS no los ve).
- No hay reset de acceso sin la frase.
- Sync multi-dispositivo requiere que el usuario ingrese la frase en cada dispositivo.

---

## 7. Búsqueda y paginación

- **Paginación**: la API de Sheets acepta rangos; `TableStore.getRange` trae solo
  la página. Cada pantalla lee solo su hoja (ya lo hace la app por módulo).
- **Búsqueda**: Sheets no tiene `WHERE`. La búsqueda vive en **SQLite local**
  (`WHERE nombre LIKE '%ana%'`), con índices reales. Sheets queda como copia.

```
Pantalla (facturas + buscador)
   └── SQLite local (SELECT ... LIMIT 20, WHERE)  ← rápido, paginado, con búsqueda
        │  sync en segundo plano
        ▼
   Google Sheets (copia segura)
```

---

## 8. Plan de implementación sugerido

1. **Decidir hosting** del backend (Vercel functions recomendado).
2. **Migrar `backend.ts` de Apps Script → Hono**: reusar `TableStore` + guards,
   borrar ~600 líneas duplicadas. Auth con `jose`.
3. **Middleware de permisos por rol** (leer `Usuarios` de la hoja).
4. **SQLite local** en la app del dueño: ampliar `TableStore`, implementar
   `SqlTableStore`, PULL inicial desde Sheets.
5. **Sync bidireccional** (PUSH + PULL incremental con `updated_at` + merge).
6. **Backup E2E** con frase de recuperación.
7. **i18n**: agregar idiomas nuevos (el sistema ya soporta es/pt/gl/ca/en).

---

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Conflicto de folios offline | Merge con `MAX(contador)` + re-foliado marcado como editada |
| Conflicto de fila en 2 dispositivos | Last-write-wins por `updated_at` |
| Pérdida de clave E2E | Frase de recuperación guardada por el usuario |
| Velocidad de Sheets | SQLite local como capa de trabajo; Sheets solo copia |
| Service account con acceso a la hoja | Otorgar solo lo necesario (scope acotado, revocable) |
