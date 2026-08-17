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
| Framework backend | Node.js + TypeScript + **Hono** | TS-first, liviano, corre en Vercel/Netlify/Workers/Railway; reusa `packages/shared` |
| Auth de usuarios | Google id_token (jose) **o** código de acceso | Códigos para acceso puntual sin cuenta Google; rate limiting contra fuerza bruta |
| Identidad por dispositivo | Token emitido por el backend | El navegador no genera ID estable; IP solo informativa |
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

### Números reales para uso individual

| Uso | Filas/mes | Año 1 | Año 5 |
|---|---|---|---|
| Facturas + gastos + clientes (uso normal) | ~300 | 3 600 | 18 000 filas |
| Auditoria (1 fila por operación) | ~600 | 7 200 | 36 000 filas |
| **Total celdas** | ~1 800 | ~22 000 | ~108 000 |

El límite es **10 millones de celdas**: a este ritmo se llenaría en **~90 años**.
El espacio **no es riesgo real** para uso individual. Los riesgos reales son:

1. **Velocidad**: la hoja se degrada al crecer (~50k+ filas, años de uso).
   Mitigado: SQLite local es la capa de trabajo; Sheets queda como respaldo.
2. **Auditoria descontrolada**: la tabla de auditoría crece sin límite.
   Mitigado: rotación/archivado (ver sección 7).

### Qué pasa si se llega al límite

```
1. La API de Sheets falla: "RESOURCE_EXHAUSTED" / 429
2. El append no se escribe → crear factura falla
3. El sync falla → no puede subir cambios
```

Como la app es **offline-first**, el dueño sigue trabajando en SQLite local.
El sync se recupera cuando se archive la hoja vieja. Sheets deja de ser fuente
y queda como respaldo/archivo.

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
| Validar identidad (id_token de Google **o** código de acceso) | No guarda datos de negocio |
| Aplicar rol del usuario (canView/canEdit por módulo) | No es la fuente de verdad |
| Proxy de escritura/lectura a la hoja | No da acceso a la hoja a los invitados |
| Ser el host para invitados | — |

### Rutas por dueño

Cada dueño tiene su propia hoja (`spreadsheetId` propio). El dominio resuelve
a qué hoja pertenece cada petición:

```
ana.miapp.com    → hoja de Ana
luis.miapp.com   → hoja de Luis
```

O, con rutas:

```
miapp.com/ana    → hoja de Ana
miapp.com/luis   → hoja de Luis
```

Los códigos de acceso son **únicos por hoja** (por dueño). Dos dueños distintos
pueden tener el mismo código en sus hojas — no hay conflicto porque el servidor
nunca compara entre hojas: ya sabe a qué dueño pertenece la petición (por dominio)
y valida contra su hoja.

### Dos formas de ingreso

1. **Con Google (email verificado)** — el invitado inicia sesión con su cuenta.
   Identidad fuerte. El rol se asigna por email en la hoja `Usuarios`.
2. **Con código de acceso** — el dueño genera un código y lo comparte
   (WhatsApp/email). El invitado lo ingresa sin cuenta Google. Pensado para
   acceso puntual o personas sin Google.

### Código de acceso — proceso completo

**Paso 1 — El dueño abre Compartir → "Generar código de acceso".**

**Paso 2 — Configura el código:**

```
┌────────────────────────────────────┐
│ Rol:            [ver_facturas    ▾]│
│ Módulos:        [✓] facturas       │
│                 [ ] gastos         │
│                 [ ] inventario     │
│ Expira:         [2026-12-01]       │  ← opcional (vacío = ∞)
│ Usos máx:       [_____]            │  ← vacío = infinitos
│ Responsable:    [Ana Pérez]        │  ← nombre + email de a quién se le da
│ Generar:                          │
└────────────────────────────────────┘
```

**Paso 3 — El sistema genera y guarda el código (con unicidad validada):**

```
Tabla Codigos_Acceso (en la hoja del dueño)
┌──────────────┬─────────────┬────────────┬────────┬───────────┬────────┐
│ codigo       │ rol         │ expira_en  │ usos   │ responsable│ email  │
├──────────────┼─────────────┼────────────┼────────┼───────────┼────────┤
│ ANA-2026-XK3Q│ ver_facturas│ 2026-12-01 │ ∞      │ Ana Pérez │ ana@x │
│ LUIS-77      │ asistente   │ (vacío)    │ 5      │ Luis Gómez│ luis@y│
└──────────────┴─────────────┴────────────┴────────┴───────────┴────────┘
```

Unicidad: el backend compara el código contra los existentes **de esa hoja**
antes de guardar. Nunca se repite dentro de la misma hoja.

**Paso 4 — El dueño manda el código al responsable.**

**Paso 5 — El invitado abre la ruta de su dueño y elige "Con código de acceso":**

```
miapp.com/ana
  ┌────────────────────────────┐
  │ Iniciar sesión             │
  │  [ ] Con Google            │
  │  [ ] Con código de acceso  │
  │ Código: [ANA-2026-XK3Q____]│
  │        [Entrar]            │
  └────────────────────────────┘
```

**Paso 6 — El backend valida (server-side):**
1. ¿Existe el código en la hoja de ESE dueño?
2. ¿No expiró? (`expira_en` > hoy)
3. ¿Quedan usos? (`usos < usos_max`, si no es ∞)
4. ¿Dispositivo registrado? (si aplica)
5. ¿Rate limit superado? → rechaza con backoff

**Paso 7 — El invitado entra con su rol.** La hoja del dueño nunca se comparte.

### Usos del código

| Configuración | Comportamiento |
|---|---|
| `usos_max` vacío | ∞ usos (hasta expiración o revocación) |
| `usos_max = 1` | Muere en el primer login |
| `usos_max = 5` | Muere al 5º login |
| `∞ + expiración` | Muere por fecha (lo típico) |
| `∞ + sin fecha` | Vive hasta que el dueño lo revoque manualmente |

Advertencia: **∞ usos + sin expiración = llave permanente**. Si se filtra,
cualquiera entra hasta que el dueño lo borre. La revocación manual siempre
disponible (borrar el código = muere al instante).

### Registro de dispositivo

El **navegador no genera un identificador propio estable** (por privacidad).
El identificador real lo emite el backend:

```
Primer login con código:
  1. Backend crea token de dispositivo único: dev_9f2a7c1e...
  2. Lo guarda en la hoja (tabla Dispositivos) + lo envía al navegador
  3. El navegador lo conserva en localStorage/cookie

Siguientes ingresos:
  navegador manda:  { codigo, dispositivo: dev_9f2a7c1e... }
  backend: ¿ese dispositivo está registrado para el código?
```

```
Tabla Dispositivos
┌──────────────┬─────────────┬────────────┬──────────────┐
│ codigo       │ dispositivo │ ip_info   │ registrado_en│
├──────────────┼─────────────┼────────────┼──────────────┤
│ ANA-2026-XK3Q│ dev_9f2a... │ 190.10.20.30│ 2026-08-16   │
└──────────────┴─────────────┴────────────┴──────────────┘
```

- El **token de dispositivo** es el identificador real (estable, revocable).
- La **IP es solo informativa** (auditoría de "de dónde entran"), NO candado:
  NAT/router compartido e IP dinámica generan falsos bloqueos.
- **Otro dispositivo**: si el invitado entra desde un navegador no registrado,
  el backend rechaza y pide que el administrador lo autorice.
- **Remover dispositivo**: el dueño borra el token de la tabla → ese navegador
  queda fuera. Permite que el invitado use otro dispositivo.

### 2FA condicional

Para **códigos de uso infinito**, el primer registro de dispositivo pide
verificación (email/WhatsApp del responsable):

```
Código infinito → primer login:
  1. Entra con código
  2. Backend envía código de verificación al responsable
  3. Lo coloca → dispositivo queda autorizado
  4. De ahí en adelante: solo código + token (sin 2FA en cada uso)
```

El 2FA es **una vez por registro de dispositivo**, no en cada ingreso.
No molesta el uso diario.

### Protección contra fuerza bruta

El código es corto a propósito (fácil de escribir) → el rate limiting lo
protege contra intentos automatizados:

```
Intentos fallidos (por IP + token + código):
  5 fallos  → espera 30s entre intentos (slowdown)
  10 fallos → bloqueo 15 min
  20 fallos → bloqueo 1 hora
```

- **Backoff exponencial**: cada fallo duplica la espera (1s → 2s → 4s → 8s...).
- **Bloqueo por 3 dimensiones**: IP, token de dispositivo y código acumulan fallos.
  Así una botnet (muchas IPs) no evade el límite.
- El legítimo se equivoca 2-3 veces y nunca nota el límite.

### Resumen del flujo de ingreso

```
Intento con código:
  │
  ├─ ¿bloqueado por intentos? → rechazar ("Demasiados intentos, espera 15 min")
  │
  ├─ ¿código existe?  NO → contar fallo, aplicar backoff → rechazar
  │
  ├─ ¿expiró?         SÍ → rechazar
  │
  ├─ ¿dispositivo registrado?  NO →
  │      ¿código infinito?  → pedir 2FA (verificación al responsable)
  │      ¿código limitado?  → registrar token + IP informativa
  │
  └─ OK → sesión con el rol
```

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

### IA y automatizaciones futuras

Hono es agnóstico: la IA y las automatizaciones son bibliotecas que corren
dentro de sus handlers o cron jobs.

```ts
import { Hono } from 'hono'
import { openai } from '@ai-sdk/openai'

const app = new Hono()
app.post('/api/ia/resumen', async (c) => {
  const datos = await c.req.json()
  const res = await openai('gpt-4o').generateText({
    prompt: `Resume estos gastos: ${JSON.stringify(datos)}`
  })
  return c.json({ texto: res.text })
})

import { cron } from 'hono/cloudflare-workers'
cron('0 9 * * *', async () => {   // recordatorio de vencimientos
  // avisos de facturas por vencer, stock bajo, resumen semanal
})
```

Ideas para la app:
- Resumen de gastos/facturas ("¿en qué gasté más este mes?").
- Detección de anomalías (facturas duplicadas, pagos raros).
- Sugerencias de precios según historial.
- Asistente que responde sobre los datos del usuario (desde SQLite local o la hoja).
- Cron: recordatorios, alertas de stock, sync programado, resúmenes semanales.

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

## 7. Auditoría

### La advertencia clave

Todo el tráfico a la hoja pasa por el **backend (service account)**. Para Google,
"quien editó" es siempre la service account — **no distingue al usuario final**:

```
Invitado (Ana) → backend → escribe en hoja     → Sheets ve: service-account
Invitado (Luis) → backend → escribe en hoja    → Sheets ve: service-account
```

El historial de versiones de Sheets **no sirve para auditoría**:
1. Todo entra por una cuenta (service account) → Sheets no distingue usuarios.
2. Para que Sheets distinguiera, habría que compartir la hoja (rompe la regla de privacidad).
3. Por eso la auditoría vive en la capa del backend, no en el historial de Google.
4. El historial de Sheets queda solo como **respaldo de versiones**, no como registro de actividad.

### Solución: el backend sella la identidad

El backend **sí sabe** quién es cada quien en el momento de escribir
(email verificado o código → responsable). Lo graba de dos formas.

**1. Columna `editado_por` en cada fila de datos:**

```
Facturas (en la hoja del dueño)
┌─────────┬────────┬─────────┬──────────────┐
│ id      │ total  │ saldo   │ editado_por  │
├─────────┼────────┼─────────┼──────────────┤
│ fac_001 │ 1160   │ 0       │ ana@x        │  ← lo pone el backend
│ fac_002 │ 580    │ 580     │ ANA-2026     │
└─────────┴────────┴─────────┴──────────────┘
```

El backend **siempre** sella cada escritura con el usuario autenticado.
Al ver la fila, sabes quién la tocó por última vez — sin consulta extra.

**2. Tabla `Auditoria` — historial completo de eventos:**

```
Tabla Auditoria (en la hoja del dueño)
┌──────────┬───────────────┬────────┬──────────┬─────────┬──────────┐
│ id       │ usuario       │ tipo   │ accion   │ detalle │ fecha    │
├──────────┼───────────────┼────────┼──────────┼─────────┼──────────┤
│ aud_001  │ ana@x (email) │ factura│ crear    │ FAC-001 │ 2026-08-16│
│ aud_002  │ ANA-2026 (cod)│ gasto  │ editar   │ gas_99  │ 2026-08-16│
│ aud_003  │ ana@x (email) │ acceso │ agregar  │ luis@y  │ 2026-08-16│
└──────────┴───────────────┴────────┴──────────┴─────────┴──────────┘
```

Reglas:
- **Solo escritura** (crear/editar/eliminar) se audita. Las lecturas no, o el volumen explota.
- **Los cambios de permisos también se auditan** (agregar/revocar códigos, cambiar rol) — la parte más sensible.
- El registro es **inmutable**: se agrega, nunca se edita/borra.
- Es una tabla más de la hoja → usa `TableStore` como las demás.

### Filtros por persona

```
Pantalla "Auditoría" (solo el dueño la ve)
  Persona: [ana@x ▾] · Módulo: [Todos ▾] · Tipo: [Todos ▾] · Fecha: [desde→hasta]
  ┌──────────┬──────────┬────────┬─────────┬─────────┐
  │ usuario  │ tipo     │ accion │ detalle │ fecha   │
  ├──────────┼──────────┼────────┼─────────┼─────────┤
  │ ana@x    │ factura  │ crear  │ FAC-001 │ 08-16   │
  │ ANA-2026 │ gasto    │ editar │ gas_99  │ 08-16   │
  └──────────┴──────────┴────────┴─────────┴─────────┘
```

- Por persona: `WHERE usuario = X` (dropdown con quienes han actuado).
- Por módulo/tipo, por rango de fechas.
- Con SQLite local: `SELECT ... WHERE usuario=?` con índices — instantáneo.
- El dueño ve exactamente qué hizo cada quien, cuándo y en qué registro.

### Rotación (para no llenar la hoja)

- La auditoría vive en **su propia pestaña** ("Auditoria").
- Al pasar "x" filas → se archiva: se copia a un Drive aparte y se limpia.
- La hoja principal nunca se llena (ver números en sección 3).

### Por qué es viable

| Razón | Explicación |
|---|---|
| Ya tienes la identidad | Email verificado (Google) o código → responsable conocido |
| Volumen bajo | Uso individual + invitados puntuales = cientos de eventos, no millones |
| Mismo mecanismo de datos | Es una tabla más de la hoja, con `TableStore` |
| No depende de Google | La auditoría es tuya, no del historial de Sheets |
| Costo mínimo | 1 `append` por operación de escritura |

---

## 8. Búsqueda y paginación

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

## 9. Plan de implementación sugerido

1. **Decidir hosting** del backend (Vercel functions recomendado).
2. **Migrar `backend.ts` de Apps Script → Hono**: reusar `TableStore` + guards,
   borrar ~600 líneas duplicadas. Auth con `jose`.
3. **Middleware de permisos por rol** (leer `Usuarios` de la hoja).
4. **Códigos de acceso**: tablas `Codigos_Acceso` + `Dispositivos`, generación con
   unicidad, expiración, usos, registro de dispositivo (token), remoción.
5. **Seguridad de códigos**: rate limiting + backoff + bloqueo, 2FA condicional
   para códigos de uso infinito.
6. **Auditoría**: columna `editado_por` + tabla `Auditoria` con filtros por persona,
   rotación/archivado.
7. **SQLite local** en la app del dueño: ampliar `TableStore`, implementar
   `SqlTableStore`, PULL inicial desde Sheets.
8. **Sync bidireccional** (PUSH + PULL incremental con `updated_at` + merge).
9. **Backup E2E** con frase de recuperación.
10. **i18n**: agregar idiomas nuevos (el sistema ya soporta es/pt/gl/ca/en).
11. **IA y automatizaciones** (opcional, encima de Hono).

---

## 10. Riesgos

| Riesgo | Mitigación |
|---|---|
| Conflicto de folios offline | Merge con `MAX(contador)` + re-foliado marcado como editada |
| Conflicto de fila en 2 dispositivos | Last-write-wins por `updated_at` |
| Pérdida de clave E2E | Frase de recuperación guardada por el usuario |
| Velocidad de Sheets | SQLite local como capa de trabajo; Sheets solo copia |
| Service account con acceso a la hoja | Otorgar solo lo necesario (scope acotado, revocable) |
| Código infinito filtrado | 2FA en registro + revocación manual inmediata |
| Fuerza bruta sobre códigos | Rate limiting + backoff exponencial + bloqueo por IP/token/código |
| IP dinámica / NAT | La IP es informativa, no candado; el identificador real es el token de dispositivo |
| Auditoría crece sin límite | Rotación: archivar a Drive al pasar "x" filas |
| Unicidad de códigos | Validación por hoja al generar; nunca se compara entre hojas |
