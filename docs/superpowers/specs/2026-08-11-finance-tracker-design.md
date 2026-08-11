# Design — Finance Tracker: extensión Chrome + web app con Google Sheets como DB

Fecha: 2026-08-11
Fuente: `FUNCIONALIDADES.md` (especificación funcional de la app actual en Google Apps Script).

## 1. Objetivo

Migrar la app de facturación personal (actualmente Google Apps Script + Google Sheets + SPA vanilla) a una **extensión de Chrome (Manifest V3) + sitio web responsive**, con un único código base y **Google Sheets como base de datos** accesible vía Sheets REST API directo (OAuth2). El primer uso solo pide permisos, crea el spreadsheet automáticamente y queda listo. Sin deploy de backend, sin servidor.

Alcance nuevo respecto al spec:

- Módulo completo de **cuentas por pagar** (proveedores, facturas a crédito, vencimiento, estado, saldo, pagos parciales, anticipos).
- **Varias monedas** seleccionables en configuración.
- **Pagos parciales** unificados (cobros de clientes y abonos a proveedores).
- No hay migración de datos existentes: se empieza desde cero con hoja nueva.

## 2. Stack y estructura del proyecto

Monorepo **pnpm** con 2 apps + 1 paquete compartido.

```
finance-tracker/
├── apps/
│   ├── extension/            WXT (Manifest V3, TypeScript, HMR)
│   │   ├── popup/            KPIs rápidos + acciones + abrir dashboard
│   │   ├── tabs/             dashboard completo en pestaña
│   │   └── background/       chrome.identity.getAuthToken, maneja install/onboarding
│   └── web/                  Vite + React → mismo dashboard, responsive, OAuth popup
└── packages/
    └── shared/
        ├── types/            Factura, Cliente, Gasto, Proveedor, CuentaPagar, Pago, Config
        ├── sheets/           cliente Sheets REST, serialización fila↔objeto, crear hoja, mutex
        ├── auth/             abstracción de auth: chromeIdentityAuth (ext) | popupOAuth (web)
        ├── calc/             subtotal/IVA/total, KPIs, utilidad, saldos
        ├── currency/         catálogo de monedas + formateo Intl
        └── ui/               componentes shadcn/ui (Radix + Tailwind), tema, layout responsive
```

### Framework

| Capa | Tecnología |
|---|---|
| Extensión | **WXT** (MV3, TS-first, HMR) |
| Web | **Vite + React** |
| UI | React + Tailwind CSS + **shadcn/ui** |
| Estado | TanStack Query (server-state sobre Sheets) + Zustand (UI-state) |
| Tests | Vitest (unit) + Playwright (e2e web) |
| PDF | `window.print()` + `@media print` CSS |

### Auth / permisos

- Proyecto **Google Cloud**: habilitar Google Sheets API.
- 2 OAuth client IDs: tipo *Chrome extension* (usa el ID de la extensión) y tipo *Web application* (para la web).
- Scope único: `https://www.googleapis.com/auth/spreadsheets`.
- Extensión: `chrome.identity.getAuthToken({ interactive: true })`.
- Web: OAuth popup con redirect a la app.

### Flujo primer uso

1. Click en la extensión → `chrome.identity.getAuthToken` → consentimiento de Google.
2. Aprobado → `spreadsheets.create` → hoja **"FinanceTracker"** con 9 pestañas (ver modelo).
3. `spreadsheetId` guardado en `chrome.storage.local` (extensión) / `localStorage` (web).
4. Dashboard listo.

## 3. Modelo de datos (hojas del spreadsheet)

9 pestañas:

### Config
Pares `clave`/`valor`:

| Clave | Tipo | Default |
|---|---|---|
| `empresa_nombre` | string | `Mi Empresa S.A.` |
| `empresa_rfc` | string | `XAXX010101000` |
| `empresa_direccion` | string | `''` |
| `empresa_telefono` | string | `''` |
| `empresa_email` | string | `''` |
| `empresa_logo` | string | `''` |
| `prefijo_folio` | string | `FAC-` |
| `contador_folio` | number | `1` |
| `moneda` | string (código) | `USD` |
| `iva_porcentaje` | number | `16` |
| `categorias_gastos` | string (CSV) | `Renta,Internet,Papelería,Servicios` |
| `categorias_cxp` | string (CSV) | `Materiales,Servicios,Impuestos,Otros` |
| `version_esquema` | number | `1` |
| `mutex` | string (timestamp) | `''` |

### Clientes
`id_cliente` (`cli_*`), `nombre`, `rfc`, `email`, `telefono`, `direccion`, `fecha_registro`.

### Facturas
`id_factura` (`fac_*`), `folio`, `id_cliente`, `nombre_cliente` (denormalizado), `fecha_emision`, `fecha_vencimiento`, `subtotal`, `iva`, `total`, `saldo`, `fecha_pago` (último pago), `notas`.

### Factura_Items
`id_factura`, `descripcion`, `cantidad`, `precio_unitario`, `importe`.

### Gastos
`id_gasto` (`gas_*`), `fecha`, `categoria`, `descripcion`, `monto`, `metodo_pago` (`Efectivo`/`Transferencia`/`Tarjeta`), `proveedor`.

### Proveedores
`id_proveedor` (`prov_*`), `nombre`, `rfc`, `email`, `telefono`, `direccion`, `fecha_registro`.

### Cuentas_Pagar
`id_cxp` (`cxp_*`), `id_proveedor`, `nombre_proveedor` (denormalizado), `folio_documento`, `categoria`, `descripcion`, `fecha_emision`, `fecha_vencimiento`, `monto_total`, `saldo`, `estado` (`pendiente`/`parcial`/`pagada`), `notas`.

### Pagos
`id_pago` (`pag_*`), `tipo` (`cobro`/`abono`), `id_origen` (id de factura o cxp), `fecha`, `monto`, `metodo_pago`, `notas`.

### Metas (reservada, futura)
Vacía, para funcionalidad futura.

### Decisiones de modelo

- **Estado de factura derivado del saldo**: sin pagos → `pendiente`; saldo = 0 → `pagada`; saldo > 0 con pagos → `parcial`. `fecha_pago` = fecha del último cobro. Aplica igual a Cuentas_Pagar.
- **Pagos unificados**: cobros de clientes y abonos a proveedores en una sola hoja. Registrar pago = append a `Pagos` + actualización del saldo en la misma `batchUpdate` (atómica por request).
- **Monedas**: catálogo fijo en `shared/currency` (USD, MXN, EUR, GBP, ARS, CLP, COP, PEN, BRL, etc.) con código, símbolo, decimales y locale. `Config.moneda` selecciona la activa. Formato vía `Intl.NumberFormat`.
- **IDs**: `uid(prefix)` = `prefix` + timestamp base36 + sufijo aleatorio base36.

## 4. Folio atómico (sin Apps Script)

Sin `LockService`, se usa mutex en celda + reintentos:

1. Leer celda `mutex`.
2. Vacía o con timestamp viejo (> 30 s) → escribir con timestamp actual.
3. Ocupada → esperar 300 ms y reintentar (máx 10).
4. Leer `contador_folio`, calcular folio (`prefijo + contador`), escribir `contador + 1`.
5. Append factura con el folio.
6. Limpiar `mutex`.

Protege contra doble-submit. Seguro para single-user (baja concurrencia).

## 5. Cálculos financieros

Iguales que el spec:

- Importe = cantidad × precio_unitario (2 decimales).
- Subtotal = Σ importes. IVA = subtotal × (iva/100). Total = subtotal + iva.
- Facturado/Cobrado/Pendiente (mes) según estado y saldo.
- Gastos (mes) = Σ montos.
- Utilidad (mes) = cobrado − gastos.

Nuevos (cuentas por pagar):

- Total por pagar = Σ saldo de cxp pendientes/parciales.
- Vencidas = cxp con saldo > 0 y fecha_vencimiento < hoy.
- Por vencer = cxp con saldo > 0 y fecha_vencimiento ≥ hoy.
- Top 5 clientes por total facturado.

## 6. UI

- **Sidebar**: Dashboard, Facturas, Clientes, Cuentas por Pagar, Proveedores, Gastos, Reportes, Configuración.
- **Dashboard**: KPIs del mes — Facturado, Cobrado, Pendiente, Por pagar, Vencidas, Gastos, Utilidad + acciones rápidas.
- **Popup extensión**: 3 KPIs clave + "Nueva factura", "Registrar pago", "Abrir dashboard" (abre pestaña).
- **Responsive web**: sidebar colapsable (hamburguesa en móvil), tablas → tarjetas, modales full-screen en móvil. Mismo layout en pestaña de extensión y web (componentes compartidos de `shared/ui`).
- Formularios en modales, toasts, diálogos de confirmación, escape HTML en toda interpolación (anti-XSS).
- Formato de moneda según `Config.moneda`, cambia en vivo.

## 7. PDF

- `window.print()` con `@media print` CSS.
- Plantilla: datos emisor (empresa, logo), cliente, folio, fechas, conceptos, subtotal/IVA/total, notas.
- Funciona igual en extensión y web; el navegador ofrece "Guardar como PDF".

## 8. Sincronización

- Cache en memoria + IndexedDB (persistencia offline de la vista).
- Pull al abrir la app + botón "Sincronizar" + auto-refresh tras cada escritura.
- Single-user → last-write-wins, sin resolución de conflictos.

## 9. Reglas de negocio y validaciones

Mismas que el spec, más:

| Entidad | Regla |
|---|---|
| Proveedor | `nombre` obligatorio. No eliminar si tiene cxp asociadas. |
| CuentaPagar | Mínimo: proveedor, descripción, monto > 0, fecha vencimiento. No registrar pago > saldo (bloquear, avisar). |
| Pago | `monto > 0`. Tipo `cobro`/`abono` con `id_origen` válido. |
| Moneda | Debe existir en catálogo `shared/currency`. |
| Config | `empresa_nombre`, `prefijo_folio` obligatorios; `contador_folio` entero; `iva_porcentaje` numérico. |

## 10. Testing

- **Vitest (unit)**: `calc/*`, `sheets/*` (serialización fila↔objeto, mutex), `currency/*`.
- **Playwright (e2e, web)**: flujo completo crear cliente → factura → pago parcial → reporte.
- **Extensión**: vitest para lógica + checklist manual e2e (instalar, permisos, crear hoja, popup → pestaña).

## 11. Docs

- README con pasos GCP: habilitar Sheets API, crear OAuth client (extension + web), build/load unpacked, deploy web (Netlify/Vercel).
- Variables de entorno: client IDs de OAuth, scopes.

## 12. Criterios de aceptación

1. CRUD completo de clientes, facturas (con conceptos), gastos, proveedores y cuentas por pagar.
2. Folio autoincremental atómico sin duplicados, prefijo configurable.
3. IVA configurable, redondeo 2 decimales.
4. Estados derivados `pendiente`/`parcial`/`pagada` con pagos parciales.
5. Reportes mensuales: KPIs, gastos por categoría, top 5 clientes, KPIs de cuentas por pagar.
6. PDF por factura con datos del emisor.
7. Varias monedas configurables con formato correcto.
8. Validaciones de obligatoriedad, tipos y negativos.
9. Primer uso: solo permisos → se crea la hoja → listo.
10. Mismo código base para extensión y web responsive.
