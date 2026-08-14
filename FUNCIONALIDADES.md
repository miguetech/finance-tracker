# Especificación Funcional — App de Facturación

Documento de referencia para migrar la app a otra plataforma (extensión de navegador, web app, otro stack). Describe qué hace el sistema actual, cómo se comporta y sus reglas de negocio.

---

## 1. Visión general

Aplicación de **facturación personal de un solo usuario** para:

- Crear **facturas** con PDF bajo demanda.
- Registrar **clientes**.
- Controlar **gastos** administrativos.
- Generar **reportes mensuales** (facturado, cobrado, pendiente, utilidad).

**Plataforma actual**: Google Apps Script (web app) + Google Sheets como base de datos.

**Stack actual**:

| Capa | Tecnología |
|---|---|
| Frontend | SPA HTML + CSS + vanilla JS (`index.html`, 685 líneas) |
| Backend | Google Apps Script (`Code.gs`, `Data.gs`, `Aux.gs`) |
| Base de datos | Google Sheets (5 hojas) |
| PDF | Conversión HTML→PDF vía `blob.getAs('application/pdf')` |
| Comunicación | `google.script.run` (frontend ↔ backend) |
| Autenticación | Cuenta de Google del deployer, acceso "Solo yo" |

---

## 2. Módulos funcionales

### 2.1 Dashboard
- Muestra 4 KPIs del **mes actual**:
  - Facturado (suma de totales de facturas emitidas en el mes).
  - Pendiente de cobro (facturas `pendiente`).
  - Gastos (suma de montos de gastos del mes).
  - Utilidad = cobrado − gastos.
- Acciones rápidas: "Nueva factura", "Registrar gasto".

### 2.2 Facturas
- **Crear** factura:
  - Seleccionar cliente (o crear "cliente rápido" en línea).
  - Agregar N conceptos dinámicos: descripción, cantidad, precio unitario.
  - Previsualización en vivo de subtotal, IVA y total.
  - Fecha de emisión (default: hoy), fecha de vencimiento, notas.
  - **Folio autogenerado** = `prefijo + contador` (ej. `FAC-001`), protegido contra duplicados con `LockService`.
  - IVA calculado sobre el subtotal con el porcentaje configurado.
- **Listar** con filtros por estado (`pendiente`/`pagada`) y mes.
- **Ver detalle** (modal): cliente, fechas, conceptos, subtotal/IVA/total, notas.
- **Marcar pagada / pendiente**: al marcar pagada se registra `fecha_pago` (si no existe).
- **Descargar PDF** (bajo demanda, no se almacena).
- **Eliminar** (con confirmación; elimina también sus conceptos).

### 2.3 Clientes
- **Crear / editar** con: nombre (obligatorio), RFC, email, teléfono, dirección.
- **Buscar** por nombre o RFC (filtro en el cliente).
- **Eliminar**: bloqueado si el cliente tiene facturas asociadas.

### 2.4 Gastos
- **Registrar** gasto con: fecha, categoría, descripción, monto, método de pago, proveedor.
- **Editar / eliminar**.
- **Filtrar** por mes y categoría.
- Categorías definidas en configuración.

### 2.5 Empleados y nómina
- **CRUD de empleados**: nombre (obligatorio), documento fiscal, puesto, salario mensual, fecha de ingreso y estado activo/inactivo.
- **Nómina**: registrar el pago de salario por mes → se genera automáticamente un **gasto** con categoría `Nómina` (descripción `Nómina {mes} — {nombre}`).
- La nómina se suma a los gastos del mes y aparece en Reportes dentro de "Gastos por categoría".
- Total pagado por empleado visible en la tabla de Empleados.
- **Borrado**: bloqueado si el empleado tiene nómina registrada.
- **Limitación**: la hoja `Empleados` solo se crea en spreadsheets nuevos; para hojas existentes hay que crear la hoja manualmente.

### 2.6 Reportes (por mes)
- KPIs: facturado, cobrado, pendiente, gastos, utilidad.
- **Gastos por categoría** (desglose).
- **Top 5 clientes** por total facturado.

### 2.7 Configuración
- **Datos de la empresa** (emisor): nombre, RFC, dirección, teléfono, email, logo (URL).
- **Facturación**: moneda (ej. `USD`), símbolo (ej. `$`), prefijo de folio, contador actual, IVA %.
- **Categorías de gastos** (separadas por coma).
- Validación: empresa_nombre y prefijo_folio obligatorios; contador entero; IVA numérico.
- **Prefijo de folio con plantilla de fecha**: tokens `{YYYY}` (2026), `{YY}` (26), `{MM}` (08), `{DD}` (13) expandidos con la fecha de emisión (ej. `FAC-{YYYY}-{MM}-` → `FAC-2026-08-001`). Ayuda desplegable con ejemplos y preview de la próxima factura.
- **Categorías** editables como chips con botón para quitar y modal para agregar (sin duplicados).
- **Campos del emisor**: código postal, ciudad y país (mostrados en el PDF).
- **Vista previa de PDF** con una factura de ejemplo usando los datos actuales.

---

## 3. Modelo de datos

### 3.1 Hojas y esquemas

**Config** — pares `clave` / `valor`:

| Clave | Tipo | Default |
|---|---|---|
| `empresa_nombre` | string | `Mi Empresa S.A.` |
| `empresa_rfc` | string | `XAXX010101000` |
| `empresa_direccion` | string | `''` |
| `empresa_telefono` | string | `''` |
| `empresa_email` | string | `''` |
| `empresa_logo` | string | `''` |
| `moneda` | string | `USD` |
| `moneda_simbolo` | string | `$` |
| `prefijo_folio` | string | `FAC-` |
| `contador_folio` | number | `1` |
| `iva_porcentaje` | number | `16` |
| `tipo_doc` | string | `RFC` (RFC / NIF / Cédula / Otro) |
| `tipo_doc_etiqueta` | string | `''` (si `tipo_doc = Otro`) |
| `categorias_gastos` | string (CSV) | `Renta,Internet,Papelería,Servicios` |

**Clientes**:

| Campo | Tipo |
|---|---|
| `id_cliente` | string (uid `cli_*`) |
| `nombre` | string |
| `rfc` | string |
| `email` | string |
| `telefono` | string |
| `direccion` | string |
| `fecha_registro` | date (ISO `YYYY-MM-DD`) |

**Facturas**:

| Campo | Tipo |
|---|---|
| `id_factura` | string (uid `fac_*`) |
| `folio` | string (ej. `FAC-001`) |
| `id_cliente` | string |
| `nombre_cliente` | string (denormalizado al crear) |
| `fecha_emision` | date (ISO) |
| `fecha_vencimiento` | date (ISO) |
| `subtotal` | number (2 decimales) |
| `iva` | number |
| `total` | number |
| `estado` | enum: `pendiente` / `pagada` |
| `fecha_pago` | date (ISO) |
| `notas` | string |

**Factura_Items** (1:N con Facturas):

| Campo | Tipo |
|---|---|
| `id_factura` | string |
| `descripcion` | string |
| `cantidad` | number |
| `precio_unitario` | number |
| `importe` | number (= cantidad × precio) |

**Gastos**:

| Campo | Tipo |
|---|---|
| `id_gasto` | string (uid `gas_*`) |
| `fecha` | date (ISO) |
| `categoria` | string |
| `descripcion` | string |
| `monto` | number |
| `metodo_pago` | enum: `Efectivo` / `Transferencia` / `Tarjeta` |
| `proveedor` | string |

### 3.2 Reglas de identidad

- IDs tipo `uid(prefix)` = `prefix` + timestamp base36 + sufijo aleatorio base36.
- Folios: contador autoincremental atómico (`LockService.waitLock`), nunca se reutiliza.

---

## 4. Reglas de negocio y validaciones

| Entidad | Regla |
|---|---|
| Cliente | `nombre` obligatorio. No eliminar si tiene facturas. |
| Factura | Mínimo 1 concepto. Concepto completo (descripción, cantidad, precio). `cantidad > 0`, `precio ≥ 0`. Cliente debe existir. |
| Gasto | `descripcion` y `monto` obligatorios. `monto ≥ 0`. |
| Config | `empresa_nombre` y `prefijo_folio` obligatorios. `contador_folio` entero. `iva_porcentaje` numérico. |
| Estado factura | Solo `pendiente` ↔ `pagada`. |

---

## 5. Cálculos financieros

- **Importe** de cada concepto = `cantidad × precio_unitario`, redondeado a 2 decimales.
- **Subtotal** = Σ importes.
- **IVA** = `subtotal × (iva_porcentaje / 100)`, redondeado.
- **Total** = `subtotal + iva`.
- **Facturado (mes)** = Σ totales de facturas del mes.
- **Cobrado (mes)** = Σ totales de facturas `pagada` del mes.
- **Pendiente (mes)** = Σ totales de facturas `pendiente` del mes.
- **Gastos (mes)** = Σ montos de gastos del mes.
- **Utilidad (mes)** = `cobrado − gastos`.
- **Top 5 clientes** = clientes ordenados por total facturado descendente.

---

## 6. PDF

- Generado **bajo demanda** desde el frontend (botón "PDF" / "Descargar PDF").
- Plantilla `pdfTemplate.html` con placeholders `${...}` (empresa, emisor, cliente, folio, fechas, conceptos, subtotal, IVA, total, notas, logo).
- Logo: `<img>` con URL configurada (opcional).
- Formato: `blob.getAs('application/pdf')`, nombre `Factura_<folio>.pdf`.
- Sin timbrado fiscal (CFDI/SAT): factura interna. Si se requiere, se usa servicio externo.

---

## 7. Comportamiento frontend

- SPA con navegación por sidebar: Dashboard, Facturas, Clientes, Gastos, Reportes, Configuración.
- Comunicación asíncrona con backend vía `google.script.run` (promesas).
- Formularios en **modales** (innerHTML dinámico).
- Notificaciones tipo **toast** (éxito/error) y **diálogos de confirmación** para borrados.
- Formato de moneda: `$ 1,234.56` (`toLocaleString('en-US')`).
- Interfaz con identidad fintech: paleta índigo/violeta, tipografía Inter, botones con gradiente, sidebar con iconos SVG y wordmark.
- Escape HTML en toda interpolación de datos de usuario (anti-XSS).
- Caché en memoria del lado cliente: `STATE.config`, `FACTURAS`, `CLIENTES`, `window.__GASTOS`.

---

## 8. Funciones del API (backend)

| Función | Entrada | Salida |
|---|---|---|
| `getConfig` | — | Config completa |
| `saveConfig` | objeto config | `true` |
| `listClientes` | — | array clientes |
| `saveCliente` | cliente (con/sin id) | cliente guardado (con id) |
| `deleteCliente` | `id_cliente` | `true` |
| `createFactura` | `{ id_cliente, items[], fechas, notas }` | factura creada |
| `listFacturas` | `{ estado?, mes? }` | array facturas |
| `getFactura` | `id_factura` | `{ factura, items }` |
| `setEstadoFactura` | `id`, `estado` | `true` |
| `deleteFactura` | `id_factura` | `true` |
| `listGastos` | `{ mes?, categoria? }` | array gastos |
| `saveGasto` | gasto (con/sin id) | gasto guardado |
| `deleteGasto` | `id_gasto` | `true` |
| `getReportes` | `mes (YYYY-MM)` | KPIs + categorías + top clientes |
| `buildPDF` | `id_factura` | blob PDF (base64) |

Todas responden `{ ok: true, data }` o `{ ok: false, error }`.

---

## 9. Restricciones y supuestos

- **Un solo usuario**: no hay login, ni multi-tenant. Cada persona despliega su propia instancia.
- **Sheets como DB**: sin índices ni paginación; lectura completa de hoja por consulta. Escala limitada.
- **Métodos de pago** de gastos: fijos `Efectivo`/`Transferencia`/`Tarjeta` (hardcodeados en frontend).
- **Sin exportación/importación de datos** entre instancias (migración manual vía hojas).
- **Facturas sin timbrado fiscal**.

---

## 10. Criterios de aceptación (para la migración)

La plataforma destino debe soportar como mínimo:

1. CRUD completo de clientes, facturas (con conceptos) y gastos.
2. Folio autoincremental **atómico** (sin duplicados) con prefijo configurable.
3. Cálculo de IVA configurable y redondeo a 2 decimales.
4. Estados de factura `pendiente`/`pagada` con `fecha_pago`.
5. Reportes mensuales con los 5 KPIs, gastos por categoría y top 5 clientes.
6. Generación de PDF por factura con datos del emisor.
7. Validaciones de obligatoriedad, tipos y negativos.
8. Compatibilidad con el esquema de 5 hojas (poder leer una Spreadsheet existente).
