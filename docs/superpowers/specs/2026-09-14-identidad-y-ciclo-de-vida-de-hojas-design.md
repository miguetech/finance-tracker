# Identidad y ciclo de vida de hojas de cálculo

- Fecha: 2026-09-14
- Rama base: `feature/hoja-por-anio`
- Estado: aprobado para implementación (spec review + auditoría aplicada)
- Predecesores: `2026-08-25-hoja-por-anio-arquitectura-design.md` (rollover),
  `2026-08-23-espejo-sqlite-lectura-design.md` (espejo), especs de Config.
- Revisado: auditoría `software-developer` (16 hallazgos; aplicados en §3-§17).

## 1. Problema

Toda la identificación de hojas se basa en el **nombre del archivo** en Drive.
Eso produce duplicados (arranque sin id local, búsqueda `findSpreadsheet('FinanceTracker')`),
adopción de hojas ajenas con nombre parecido, y confusión entre el spreadsheet
BASE (Config + catálogos) y las hojas EVENTOS-{año} (datos). Además:

- No hay forma de saber quién es dueño de cada hoja ni de distinguir editores.
- Vincular un BASE nuevo arranca vacío: se pierden catálogos y el mapa de años.
- No existe vía sanada para "mandar las hojas a otro correo".
- El registro de años (`eventos_{año}`, `anio_activo`, `mutex`) convive con la
  configuración de negocio en la misma pestaña `Config`, mezclando la edición
  del usuario con metadatos de sistema.
- El backend Apps Script (`apps/script`), desplegado por separado y hardcodeado
  a `Config`, es ajeno a cualquier cambio de registro/mutex → riesgo de doble
  dominio de exclusión que duplica folios.

## 2. Decisiones (brainstorming 2026-09-14)

| # | Tema | Decisión |
|---|---|---|
| 1 | Identidad | **Huella doble**: `appProperties` en Drive (búsqueda) + marcador en pestaña `Sistema` del BASE (prueba) |
| 2 | Transferencia | **Propiedad real** vía Drive API (scope incremental on-demand) |
| 3 | Cambio de BASE | **Re-sync** de Config + catálogos: nunca arrancar vacío |
| 4 | Rollover | Automático silencioso |
| 5 | Inventario | Dueño (email), acciones por hoja, rol y estado por hoja |
| 6 | Vinculación | **Estricta**: huella requerida; legacy solo con pestañas reconocibles + confirmación explícita |
| 7 | Propiedad | **Solo el dueño** (Google) puede vincular/crear/transferir; una hoja compartida (editor ≠ owner) NO es vinculable |
| 8 | Separación | Pestaña **`Sistema`** dedicada a metadatos; `Config` queda solo con configuración de negocio |
| 9 | Año pasado sin hoja | **Auto-crear la hoja del año** en la primera escritura, dentro de rango plausible |
| 10 | Datos retro | **Backfill**: mover filas legacy de un año a la hoja de ese año |

## 3. Huella de identidad

Metadatos `appProperties` sobre cada spreadsheet creado por la app (Drive
`files/patch` justo después de crear; scope `drive.file` alcanza para archivos
creados por la app):

| clave | valor |
|---|---|
| `ft_vers` | `"1"` |
| `ft_tipo` | `"base"` \| `"eventos"` |
| `ft_instancia` | UUID identidad del sistema (BASE y sus años comparten) |
| `ft_id` | UUID del archivo; inmutable, sobrevive renombres |
| `ft_estado` | `"activo"` \| `"reemplazado"` (BASE viejo tras F6) \| `"transferido"` |

**Marcador autoritativo** (solo en BASE): filas `ft_instancia`, `ft_id` y
`ft_estado` en la pestaña `Sistema`. `appProperties` son editables por
cualquiera con acceso → tratar como pista, nunca prueba. Para BASE, la pestaña
`Sistema` es la prueba (dentro de la hoja). Para hojas EVENTOS (sin pestañas de
configuración), la prueba = que su `ft_instancia` figure en el mapa
`eventos_{año}` del BASE vinculado.

Búsquedas (reemplazan la búsqueda por nombre):

```ts
q: mimeType='application/vnd.google-apps.spreadsheet'
   and trashed=false
   and appProperties has { key='ft_tipo' and value='base' }
```

**Hito de entrada F2 (bloqueante)**: verificar que web y extensión usan el
**mismo OAuth client ID** (a nivel `drive.file` el namespace es por client).
Si difieren, estampa/lectura de huella y probe de ownership fallan en una de
las dos. Resolver antes de tocar código de huella (opciones: unificar client,
o añadir asociación cross-client vía picker/permissions).

## 4. Pestaña Sistema

Nueva tabla `Sistema` (clave, valor) en el BASE. Misma forma que `Config`
(parejas desde A1, `HEADER_ROWS=0`).

Contenido:

| clave | valor |
|---|---|
| `eventos_{año}` | id del spreadsheet EVENTOS-{año} (o `borrado` si se eliminó) |
| `anio_activo` | año activo |
| `ft_instancia` | UUID del sistema |
| `ft_id` | UUID del archivo BASE |
| `ft_estado` | `activo` \| `reemplazado` \| `transferido` |
| `ft_historial` | trazas de acciones (vincular, transferir, crear año, backfill) con fecha |
| `ft_dueño_email` | email del dueño (mejor esfuerzo) |
| `ft_transferencia` | estado por hoja de una transferencia en curso (retomable) |
| `ft_lock_largo` | candado con heartbeat para operaciones largas (backfill/re-sync/transfer) |
| `mutex` | fila candado para operaciones concurrentes cortas |
| `reset_historial` | trazas de resets |

Efectos:

- `Config` deja de crecer con cada año y ya no mezcla metadatos con la
  configuración del negocio.
- `writeConfig(config)` reescribe SOLO `Config` (A1:Bn). El split elimina el
  bug latente de pisar el mapa de años al guardar configuración.
- `readConfig()` lee solo `Config`; el registro sistema tiene funciones propias
  (`leerSistema`, `mutexRead/Write` apuntando a `'Sistema'!A1:B…`).
- `configFromRows` pierde el hack de `eventos_*`/`anio_activo`/`mutex`.
- `configCache` debe **keyearse por id de BASE** (`sid`) como ya hace
  `baseTablasCache`; toda ruta que cambie de BASE invalida/centraliza la
  invalidación en `ctx.storage.set(KEYS.spreadsheetId, …)`.

**Migración de bases existentes** (en `ensureTables`, una vez, para dueño):

1. Crear pestaña `Sistema` si falta (con `ft_vers="1"`); si `Config` no tiene
   columnas de sobra, ampliar.
2. Copiar de `Config` a `Sistema` las claves del sistema (`eventos_*`,
   `anio_activo`, `mutex`, `reset_historial`).
3. **Limpiar el rango completo `Config!A1:B500`** (clear) y reescribir SOLO las
   claves de negocio. NO dejar filas de sistema huérfanas más abajo: ningún
   `writeConfig` actual las pisa (escribe `A1:B{len}`) y un build viejo o el
   Apps Script las resucitaría.
4. Generar y escribir `ft_instancia`, `ft_id`, `ft_estado=activo`.

**Reconciliación en boot (`ft_vers`)**: si `Sistema` existe pero `Config` aún
trae claves de sistema (migración a medias por crash/concurrencia), re-migrar
antes de cualquier operación. Estado medio-migrado nunca se acepta: o todo en
`Sistema`, o todo en `Config`+`Sistema` sin claves duplicadas.

**Re-apunte atómico**: todos los lectores/escritores que hoy tocan el registro
(`leerFilasConfigRaw`, `idsDeAñosRegistrados`, `estadoAlmacenamiento`,
`eliminarAño`, `resetCompleto`, `leerVariasTablasVivas`, `mutexRead/Write`)
se repuntan a `Sistema` **en el mismo commit** — no hay fase intermedia.

**Backend Apps Script (obligatorio para F1)**: el deployment `apps/script` tiene
`read/writeConfig` y `mutexRead/Write` propios hardcodeados a `Config`
(`backend.ts:87-102`). Si no se migra a `Sistema` al mismo tiempo, coexisten dos
dominios de mutex → folios duplicados en `createFactura`, y su `configFromRows`
resucita `eventos_*` en `Config`. F1 debe incluir **rebuild + redeploy** de
`dist/Code.js` (el dueño lo pega a mano, ver README) o **retirar** el
deployment Apps Script en favor del backend Hono. Sin esto, F1 no existe.

## 5. Anti-duplicación en arranque

Reemplaza `connectOrCreateSpreadsheet` / búsqueda por nombre (App.tsx,
`createSpreadsheet.ts:81`):

1. Id de localStorage → fallback appDataFolder `ft_config.json` → **probe**:
   abrir el id, verificar huella `ft_tipo=base` y `ft_estado != reemplazado`,
   **ownership** (§7) y **escritura real** (write-probe a una celda).
   - Si el id de appData **falla** el probe → NO error duro: continuar a la
     búsqueda por huella (paso 2). Un `ft_config.json` stale (F6/F7) no deja el
     sistema muerto.
   - Si pasa → vincular. Si es EVENTO, sin huella, reemplazado o no-propio →
     NO confiar.
2. Sin id → buscar por huella `ft_tipo=base` y `ft_estado != reemplazado`:
   - **1 resultado** → probe → adoptar.
   - **varios** → NO adivinar: abrir picker del inventario.
   - **cero** → crear nuevo BASE **estampado** (huella + pestaña Sistema),
     sin consultar nombres de terceros.

Ninguna decisión se toma por nombre. El nombre queda solo como etiqueta visual.

## 6. Distinción BASE vs EVENTOS

- Señal primaria: `ft_tipo`. Señal de respaldo (legacy/sin huella): pestañas
  existentes (`detectarTipoSpreadsheet`), usada solo para clasificar, nunca para
  decidir identidad.
- `hojaActual()` → `infoHoja(id)`: id, título, url, `tipo`, `instancia`, dueño,
  rol, estado. Base del inventario.
- Guardas:
  - `conectarHojaPorId`: rechazar `ft_tipo=eventos` como BASE; aceptar solo base
    con huella (o legacy + confirmación). Debe cumplir ownership (§7).
  - `conectarAñoPorId`: rechazar id == BASE actual y `ft_tipo=base` de otra
    instancia; requerir `ft_tipo=eventos` (o pestañas evento + confirmación).
  - `ensureTables`/`ensureTablasEvento` inyectan pestañas solo si el tipo
    detectado coincide → nunca `addSheet` de Facturas sobre un BASE.

## 7. Seguridad — propiedad estricta

**Regla**: solo el DUEÑO (cuenta Google) del spreadsheet puede vincularlo,
crearlo, re-sincronizarlo o transferirlo. Una hoja compartida con permisos de
edición NO es vinculable. Única vía para ceder el sistema a otro correo: la
transferencia de propiedad (§10) o que el nuevo dueño obtenga un archivo propio
y lo vincule.

- **Gate de ownership** en: boot-probe, `conectarHojaPorId`, `conectarAñoPorId`,
  adopción legacy, crear BASE nuevo, auto-creación de año, re-sync y
  transferencia.
- **Limitación de `drive.file`**: `files.get(owners)` y `files.list` solo
  alcanzan archivos creados por la app (o abiertos vía picker). Hojas creadas
  por Apps Script, por el service account del backend o adoptadas por id sin
  picker están fuera de namespace → `404`. El probe debe contemplar tres estados:
  `es_dueño` / `no_es_dueño` / `no_verificable`. Para `no_verificable`:
  - online con archivo accesible por Sheets (`spreadsheets` scope) → sustituir
    por write-probe + `capabilities.canEdit` como "prueba de edición", marcando
    en `ft_historial` que el owner real no fue verificable; o asociar el archivo
    al namespace vía **Google Picker** cuando haya que estampar/leer huella.
  - offline (sin token) + sesión local previa → **fail-open** al modo offline
    (nunca rechazar a un dueño ya operando sin red).
  - online sin email resoluble → pedir re-login, nunca rechazo silencioso.
- **Comparación de emails case-insensitive** (reusar `emailIgual` de
  `data/guards.ts`). La extensión puede devolver `'user'` cuando el perfil no
  tiene email → tratar como `no_verificable`, no como `no_es_dueño`.
- **Modo backend**: el repository compartido lo usa el backend Hono con service
  account (editor compartido, nunca owner). El gate **se salta** en modo
  backend mediante flag explícito en `RepoContext`:
  `ctx.modo: 'owner' | 'backend'`. Y **prohibir auto-creación de hojas en modo
  backend** (`storeDeEventos` degrada a legacy/BASE como hoy): si el service
  account creara un año, el archivo nacería owned por él e invisible para la web.
- Empleados/visitantes vía modalidad remota (`remoteRepository` + código):
  intactos. La modalidad directa queda restringida al dueño.
- Después de transferir, el correo viejo deja de pasar el gate (se muestra
  "transferida" y se ofrece desvincular); el nuevo dueño lo pasa.
- Protecciones base (se mantienen): scopes mínimos por defecto, write-probe
  antes de vincular, papelera en lugar de borrado duro, historial en
  `ft_historial`, y exigir el scope amplio solo al ejecutar transferencia.

## 8. Auto-creación de años (rollover + años pasados)

- **Rollover** (ya existe): al arrancar se garantiza `EVENTOS-{año actual}`.
  Se endurece: estampa huella con `ft_instancia` del BASE, registro en `Sistema`,
  si adopta se hace por huella, **no por nombre** (§12 y fix de `crearHojaEventos`).
- **Auto-creación por escritura**: `storeDeEventos(anio)` pasa de "año pasado
  sin registro → fragmento legacy del BASE" a "año sin registro dentro de rango
  **plausible** → crear hoja del año". Rango: `[anio_activo − 20, anio_activo + 1]`.
- Fuera de rango → la UI rechaza la fecha en el formulario.
- Año marcado `borrado` → NO se recrea; fallback al fragmento legacy del BASE.
- Creación falla (permisos/quota) → fallback legacy + traza en `ft_historial`.
- El año creado aparece en el inventario con badge; si fue basura, el dueño lo
  manda a papelera y queda `borrado`.
- Solo en modo `owner` (§7). En modo `backend` nunca se auto-crea.

**Fix de routing de `Factura_Items` (PRECEDE a F5, no reemplazable por backfill)**:
`Factura_Items` no tiene fecha → `añoDeFila` devuelve `''` y hoy cae al año en
curso. Si solo se hiciera backfill, el próximo `updateFactura` →
`replaceTable('Factura_Items')` → `reemplazarEventoFragmentado` re-rutearía todos
los items al año en curso y **desharía el backfill**. Por tanto, antes de F5:

- `storeDestino('Factura_Items', fila)` y `reemplazarEventoFragmentado` para
  items resuelven el año vía el padre (`id_factura` → mapa de `Facturas` de
  todos los años). Alternativa aceptada: columna oculta `ft_anio` en
  `Factura_Items`.
- El backfill incluye una pasada de **re-homing** que barre TODAS las hojas de
  año (no solo el fragmento del BASE): items de una factura del BASE/otra hoja
  se recolocan junto a su padre. Facturas retrocreadas hoy ya tienen items en
  hojas distintas → sin re-homing quedan rotas.

## 9. Mutex para operaciones largas

`withMutex` actual caduca a los 30 s (`mutex.ts:2`). Backfill, re-sync de
catálogos y transferencia exceden ese límite → un segundo dispositivo vería el
candado libre y escribiría en paralelo. Refuerzo:

- **Candado dedicado `ft_lock_largo`** en `Sistema` con heartbeat (renovación
  cada ~15 s) y dueño (dispositivo+sesión). Las operaciones largas lo adquieren;
  el segundo dispositivo espera con reintento, no escribe.
- La creación de año se envuelve en `withMutex` con **re-chequeo** de
  `eventos_{año}` antes de crear (dos dispositivos en la misma escritura no
  fabrican dos `EVENTOS-2023`). Eliminar el doble `mutexWriteRow` actual
  (`repository.ts:215-217`).

## 10. Transferencia a otro correo

Flujo "Mover sistema completo" (y por hoja) desde el inventario, solo owner:

1. El usuario ingresa el email destino.
2. **Preflight** por hoja: rol owner del BASE y de cada EVENTOS; lista las
   imposibles con motivo. Lee el marcador `ft_transferencia` para retomar lo
   pendiente de una transferencia anterior (idempotencia desde AMBOS lados).
3. **Scope**: verificar primero si `transferOwnership` es permitido. En web,
   consentimiento incremental del scope Drive en este punto (nunca en login).
   En la **extensión `chrome.identity`** no hay scopes dinámicos: usar
   `launchWebAuthFlow` con scope amplio solo aquí, o plan B (§10.9) como ruta
   primaria. Verificar en implementación si `drive.file` alcanza.
4. **Orden de transferencia**: PRIMERO todos los `eventos_{año}`, **el BASE al
   último**. El iniciador conserva acceso al BASE hasta el paso final; así una
   cuota o restricción de Workspace a mitad no deja los años en "nadie" (si el
   BASE pasa primero, el correo viejo pierde el gate y ya no puede re-ejecutar).
   Cada hoja: `permissions` (`role=owner`, `type=user`,
   `transferOwnership=true`), secuencial, con retry; al terminar cada una se
   actualiza `ft_transferencia`.
5. **Antes** de transferir una hoja: escribir `ft_dueño_email` (mejor esfuerzo)
   y marcar `ft_transferencia={año:id:estado}`. `ft_instancia` NO cambia → ids y
   mapa siguen válidos.
6. **App en el correo nuevo**: primer arranque sin id → busca por huella
   `ft_tipo=base` → probe de ownership pasa → adopta y escribe su
   `ft_config.json`.
7. **App en el correo viejo**: gate falla → aviso "estas hojas viven ahora en
   otro correo" + botón desvincular. No rompe el modo offline local.
8. **Fallos a mitad**: retomable desde cualquiera de los dos lados vía
   `ft_transferencia` (preflight lista pendientes). Nunca re-transfiere lo
   migrado.
9. **Límite honesto**: si Google rechaza (Workspace entre dominios, scope
   insuficiente), ofrecer plan B primario: compartir como editor + instrucciones
   + la nueva persona copiará a su Drive y vinculará su propio archivo.

## 11. Re-sync al cambiar BASE (nunca arrancar vacío)

Reemplaza el `crearBaseVacia` actual (repository.ts:1390). Solo modo `owner`:

1. Preflight: huella + ownership del BASE actual y del nuevo.
2. Crear BASE nuevo **estampado**: **mismo `ft_instancia`** (los EVENTOS-{año}
   siguen asociados), nuevo `ft_id`, `ft_estado=activo`.
3. **Re-sync de Config**: copiar parejas de configuración de negocio
   (rango completo: clear + reescritura).
4. **Re-sync de Sistema**: copiar `eventos_{año}`, `anio_activo`,
   `ft_historial`, `reset_historial` (ajustando `ft_id`; conservando
   `ft_instancia`).
5. **Re-sync de catálogos**: tablas BASE pestaña a pestaña (Clientes,
   Productos, Proveedores, Empleados, Usuarios, Codigos_Acceso, Gastos_Fijos,
   Dispositivos) con `batchUpdate` paginado, progreso visible y validación de
   conteos al final. Bajo `ft_lock_largo` (§9).
6. **Invalidar el BASE viejo** (evita dos sistemas vivos con la misma
   `ft_instancia`): re-estampar `ft_estado=reemplazado` en su `appProperties` y
   en su pestaña `Sistema`. El probe de boot (§5) exige `ft_estado != reemplazado`,
   así los dispositivos que aún apuntan al viejo re-adoptan el nuevo.
7. **Propagar el nuevo BASE id**: `saveAppConfig` como **PATCH** del archivo
   existente (no POST que acumula N `ft_config.json` — ver §13) para que los
   otros dispositivos tomen el nuevo id.
8. **Re-apuntar consumidores de infraestructura**: actualizar el
   `SPREADSHEET_ID` del backend Hono (o hacer que lo lea de
   `Sistema.ft_id`/huella en vez de env) y regenerar el deployment Apps Script
   (contenedor-bound al spreadsheet viejo) sobre el BASE nuevo. Sin esto, los
   empleados por backend ven datos viejos.
9. El BASE viejo NO se borra automáticamente (papelera manual si el dueño quiere).

Variante con BASE anterior perdido: usar `ft_historial`/`reset_historial` para
diagnóstico; re-sync desde el espejo local si aplica, o aviso claro de pérdida.

## 12. Backfill (datos retro en el legacy) + re-homing

Al **vincular un año existente** o al **auto-crear una hoja de año**, si hay
filas de ese año en el fragmento legacy del BASE **o dispersas en otras hojas**,
se migran a la hoja del año:

1. Particionar por tabla según fecha del documento: `Facturas`→`fecha_emision`;
   `Gastos`/`Pagos`/`Asistencias`/`Movimientos_Stock`/`Tasas_Historial`→`fecha`;
   `Cuentas_Pagar`→`fecha_emision`; `Nomina_Detalles`→`fecha`;
   `Factura_Items`→año heredado del `id_factura` padre (fix §8).
2. Mover por **unidad de negocio** (factura + sus items, CxP + sus pagos), no
   fila suelta: evitar huérfanos referenciales.
3. **Re-homing**: barrer BASE + todas las hojas de año; recolocar items junto a
   su factura padre. Cubre el estado heredado de hoy (factura en `EVENTOS-2023`,
   items en `EVENTOS-2026`).
4. Append de las filas del año a la hoja destino + limpieza de las fuentes.
5. Idempotente por id único; bajo `ft_lock_largo`; progreso en el panel; conteo
   movido vs fuente validado por pestaña.

Sin backfill no habría pérdida (el próximo `replaceTable` federal rutea por año),
pero explícito y con re-homing es lo que garantiza la invariante
"los items viven con su factura".

## 13. Fiabilidad de `ft_config.json` (appData)

- `saveAppConfig` debe **PATCH el archivo existente** (buscar por
  `name='ft_config.json'` y `'appDataFolder' in parents`, luego `files.update`),
  no POST acumulando copias.
- `loadAppConfig` con `orderBy=modifiedTime desc` para no elegir un archivo
  viejo arbitrario.
- El boot continúa a la búsqueda por huella si el id de appData falla el probe
  (§5).

## 14. Migración de hojas legacy (sin huella)

- Legacy BASE: pestaña `Config` (o `Sistema` reconocible) + al menos una pestaña
  catálogo FT. Adopción solo si el usuario es **dueño** (o `no_verificable`
  con write-probe, §7) y confirma explícitamente. Al adoptar: migrar a
  `Sistema`, estampar huella (`appProperties` + marcador), limpiar `Config`.
- Legacy EVENTOS: pestañas de evento sin `ft_tipo`. Adoptar solo si el usuario
  es dueño, confirma, y el id aparece en el mapa del BASE vinculado (o se está
  vinculando a un año concreto). Estampar `appProperties`.
- Nunca por nombre.

## 15. Casos límite

| Caso | Comportamiento |
|---|---|
| Arranque sin id | huella → 1=adoptar / varios=picker / cero=crear estampado |
| `ft_config.json` stale (F6/F7) | probe falla → continúa a búsqueda por huella (§5) |
| Hoja ajena con mismo nombre (editor) | rechazada: huella y ownership |
| BASE compartido como editor, no owner | rechazado |
| Hoja de año intentada como BASE | rechazada (`ft_tipo=eventos`) |
| Factura 2033 por typo | fecha fuera de rango → rechazada en formulario |
| Año pasado sin registro + factura 2023 | auto-crear EVENTOS-2023 + backfill + re-homing |
| Año marcado borrado + write de ese año | fallback fragmento legacy, sin recrear |
| Creación de año falla (permisos/quota) | fallback legacy + traza en ft_historial |
| Dos dispositivos crean el mismo año | mutex + re-chequeo → un solo EVENTOS |
| Transferir a mitad falla | retomar desde ambos lados vía ft_transferencia (EVENTOS primero, BASE último) |
| Correo viejo tras transferir | gate de ownership falla → "transferida" + desvincular |
| Cambio de BASE | re-sync + invalida BASE viejo (`ft_estado=reemplazado`) |
| Dispositivo apuntando al BASE viejo | probe rechaza reemplazado → re-adopta el nuevo |
| Huérfano detectado | oferta "vincular a un año" u "olvidar" |
| BASE perdido (papelera) | 404 en boot → recuperar vía huella o aviso claro |
| Migración a medias Config/Sistema | reconciliación en boot vía `ft_vers` (§4) |
| Hoja creada por backend/Script (service account) | fuera de namespace drive.file → no_verificable/write-probe; nunca auto-crear desde backend |
| Backend Hono con BASE nuevo | re-apunta env o lee `Sistema.ft_id` (§11.8) |
| Operación larga >30 s | `ft_lock_largo` con heartbeat (§9) |

## 16. Fases de implementación (orden auditado)

Hito de entrada **F0** (bloqueante): mismo OAuth client ID web+extensión (§3);
rebuild/redeploy (o retiro) del deployment Apps Script (§4). Sin esto, el resto
corre sobre bases inconsistentes.

| # | Entregable | Depende |
|---|---|---|
| F0 | Gate de entrada: client IDs + desacople Apps Script | — |
| F1 | Pestaña Sistema + separación de lecturas/escrituras + migración (clear de Config) + reconciliación `ft_vers` + re-apunte atómico de lectores | F0 |
| F2 | Huella `appProperties` + marcador + creación estampada + búsqueda por huella + **fin de la adopción por nombre** (BASE y años, incluye `crearHojaEventos`) | F1 |
| F3 | Gate de ownership (modo owner/backend via `ctx.modo`, tres estados, fail-open offline) + strict linking + legacy adoption | F2, F5-boot |
| F4 | Anti-dup de arranque (probe + picker) + inventario extendido (rol/estado/dueño/acciones) + `saveAppConfig` PATCH + `loadAppConfig` orderBy | F3 |
| F5 | **Fix de routing `Factura_Items` (precedente)** + auto-creación de años con rango plausible + backfill + re-homing + `ft_lock_largo` + tests legacy reescritos | F1, F2, F3 |
| F6 | Re-sync al cambiar BASE + invalida BASE viejo + propagación a appData + re-apuntado de backends | F5 |
| F7 | Transferencia de propiedad (EVENTOS primero, BASE último + `ft_transferencia` + scope/plan B) | F3 |

Nota de dependencia corregida: **el probe del boot (F4) es requisito del gate
(F3)**, no al revés; el gate no puede cerrar el boot sin que exista el probe.
F3 y F4 se desarrollan juntos y su orden interno no cambia el resultado.

## 17. Tests clave

- Arranque sin id: 1 huella=adoptar, varias=picker, cero=crear estampado;
  `ft_config.json` stale → continúa por huella.
- Hoja ajena mismo nombre (editor ≠ owner) → rechazo por huella y ownership.
- BASE compartido editor-no-owner → rechazo.
- Gate en modo backend (`ctx.modo='backend'`) → skip; nunca auto-crea año.
- `conectarAñoPorId` con BASE → rechazo; con `ft_tipo=base` de otra instancia →
  rechazo.
- Migración Config→Sistema: clear de rango completo, claves de sistema
  copiadas/borradas, `writeConfig` no toca `Sistema`, reconciliación de
  medio-migrado en boot.
- Adopción legacy: Config reconocible + confirmación owner → estampa; negada sin
  confirmación, sin owner, o en no_verificable sin write-probe.
- Routing `Factura_Items`: update de factura 2023 deja los items EN
  `EVENTOS-2023` (no los re-rutea al año en curso).
- Backfill + re-homing: factura 2023 + items se recolocan juntos; idempotente;
  conteos cuadran; items dispersos en otra hoja de año vuelven con su padre.
- Auto-creación 2023 por escritura: rango ok → crea estampado + backfill; 2099 →
  rechazo; borrado → fallback legacy. Dos dispositivos → un solo EVENTOS (mutex).
- Operación larga: `ft_lock_largo` no se vence a los 30 s; segundo dispositivo
  espera.
- Transferir: EVENTOS antes que BASE; `ft_transferencia` retoma desde ambos
  lados; ownership tras el cambio; preflight de pendientes.
- Re-sync BASE: claves dinámicas de Sistema conservadas, catálogos con conteos
  idénticos, BASE viejo con `ft_estado=reemplazado` rechazado por el probe.
- Rollover: EVENTOS-2027 se crea con `ft_instancia` del BASE y sin duplicado
  aunque exista un "FinanceTracker 2027" ajeno.
- `saveAppConfig` PATCH (no acumula) y `loadAppConfig` con `orderBy`.

## 18. Fuera de alcance

- Backup remoto opt-in y backend de control (specs futuros ya costurados).
- Multi-empresa centralizada: cada empresa mantiene SUS hojas en SU correo.
- Cambiar el modelo de acceso de empleados por código (backend): se conserva.
- Integraciones fiscales (VeriFactu).
- El desacople del deployment Apps Script se limita a alinear registro/mutex con
  el repository (F0); si se retira, sí toca el modelo de negocio de flujos que
  dependen de él — decidir explícitamente en F0.