# Unificar Spanglish → Inglés (Todo el repo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar todos los identificadores del repo (variables, tipos, funciones, archivos, acciones de red, columnas de Sheets, claims JWT, storage keys) de Spanglish a inglés consistente, por fases, empezando por lo que el compilador verifica y terminando con los contratos persistentes. App en fase de pruebas: se acepta migración de datos de un solo sentido (sin compat retro de doble nombre).

**Architecture:** Renombres mecánicos conducidos por un **glosario único** (`docs/INGLES_GLOSARIO.md`) y un **codemod determinista** (`scripts/rename.mjs`). Cada fase es un commit independiente que deja el repo verde (`pnpm build && pnpm test && pnpm lint`). La fuente de verdad de nombres es el glosario; ningún nombre español sobrevive fuera de copy de UI o datos de usuario.

**Tech Stack:** TypeScript, pnpm workspace, Vitest, ESLint, Google Sheets API (Apps Script + Hono backend), WXT/Vite React.

## Global Constraints

- **App en pruebas:** no se mantiene compat de doble nombre. Backend desplegado y datos de sheets test pueden migrarse en fases coordinadas.
- **Tipos/entidades y columnas de Sheets van juntos:** el diseño actual hace `ColumnSpec.key === header === entity field` (`tables.ts`). Al renombrar campos de entidad se renombran simultáneamente las columnas (`tables.ts`) y se migra la hoja de prueba con script. No se introduce capa de mapeo.
- **Identificadores → inglés. Copy de UI y datos de usuario → se quedan en español** (producto es para usuarios hispanohablantes: facturación MX, RFC, CFDI, IVA). Enumerados controlados por código SÍ se traducen (ej. estados de factura, tipos de pago, claves de módulo).
- **Acrónimos legales/tributarios MX se conservan:** `rfc`, `cfdi` (identificadores que se imprimen en documentos oficiales). `iva` → `vat` (es importe genérico), `cxp` → `ap`, `cxc` → `ar`.
- **Campo de datos → inglés snake_case** para preservar el mirror con Sheets (`customer_id`, `issue_date`). Identificadores TS no persistidos → camelCase (`saveCustomer`). Tipos → PascalCase (`Customer`).
- **Jerarquía de riesgo (orden de fases):** 1) no rompe nada, 2) verificado por `tsc`, 3) contratos de red/datos que exigen despliegue coordinado, 4) datos persistentes + JWT + sesiones (reseteo aceptable en pruebas).
- **Dos backends despachan las mismas acciones wire:** `apps/backend/src/actions.ts` (Hono, deploy Vercel) y `apps/script/src/backend.ts` (Apps Script, `pnpm build:script`). Cualquier cambio de acción wire toca AMBOS en el mismo commit.
- **Verificación de cada fase:** `pnpm -F shared build && pnpm -F backend build && pnpm -F web build && pnpm test && pnpm lint`. E2E opcional: `pnpm test:e2e`.
- **No usar placeholders:** toda decisión de nombre sale del glosario (diccionario cerrado). Colisiones locales (ej. `date`, `name`) se resuelven manualmente; `tsc` las delata.

---

## Task 1: Glosario + codemod (no rompe nada)

**Files:**
- Create: `docs/INGLES_GLOSARIO.md`
- Create: `scripts/rename.mjs`
- Create: `scripts/rename-map.json`

**Interfaces:**
- Produces: `rename.mjs` — Node script que aplica un mapa de dos tipos de clave a todos los `.ts/.tsx/.json` del repo (salvo ignore): `idents` (renombra tokens SOLO en posición de identificador, respeta strings y comentarios → protege copy de UI) y `strings` (reemplaza valores exactos SOLO dentro de literales de string → acciones wire, keys de storage, claims, headers de Sheets). Mueve archivos/dirs vía `git mv`. Longest-first CON guard anti-solapamiento (un match cubierto por un token más largo se descarta → nunca corrompe).
- Produces: `rename-map.json` — las tablas del glosario en forma ejecutable (`{"cliente":"customer","Cliente":"Customer",...}`).
- Produces: `docs/INGLES_GLOSARIO.md` — fuente de verdad human-readable con todas las tablas (palabras, entidades, campos, acciones, tablas/hojas, módulos, estados, storage, claims JWT).

- [ ] **Step 1: Crear `docs/INGLES_GLOSARIO.md`** con estas tablas (base del diccionario definitivo):

```markdown
# Glosario ES → EN (identificadores del código)

Regla: palabras de dominio → inglés. Acrónimos legales MX (rfc, cfdi) intactos.
Felds que espejan columnas de Sheets → snake_case inglés (customer_id). Lo demás camelCase/PascalCase.

## Mapa de palabras
| ES | EN | notas |
|---|---|---|
| cliente / Cliente | customer / Customer | |
| factura / Factura | invoice / Invoice | item → item |
| gasto / Gasto | expense / Expense | |
| proveedor / Proveedor | supplier / Supplier | |
| empleado / Empleado | employee / Employee | |
| asistencia / Asistencia | attendance / Attendance | |
| nomina / Nomina | payroll / Payroll | |
| nómina (string valor) | payroll | |
| cuenta | account | cxp → ap (accounts payable), cxc → ar (receivable) |
| pago / Pago | payment / Payment | |
| producto / Producto | product / Product | |
| movimiento / Movimiento | movement / Movement | |
| stock | stock | |
| usuario / Usuario | user / User | |
| codigo / Codigo | code / Code | acceso → access |
| dispositivo / Dispositivo | device / Device | |
| tasa / Tasa | rate / Rate | historial → history, tipo_cambio → exchange_rate |
| gasto_fijo | fixed_expense | |
| inventario | inventory | |
| reporte / reportes | report / reports | |
| configuracion | settings | modulo 'configuracion' → 'settings' |
| dashboard | dashboard | |
| categoria / categorias | category / categories | |
| moneda / monedas | currency / currencies | |
| metodo / metodos | method / methods | metodos_pago → payment_methods |
| monto | amount | |
| total | total | |
| saldo | balance | |
| subtotal | subtotal | |
| iva | vat | |
| precio | price | precio_costo → cost_price, precio_venta → sale_price |
| cantidad | quantity | línea (items) → line |
| unidad / unidades | unit / units | |
| minimo | minimum | |
| max | max | |
| descripcion | description | |
| fecha / fecha_registro | date / created_at | fecha_emision → issue_date, fecha_vencimiento → due_date, fecha_pago → paid_at, fecha_ingreso → hire_date, fecha_edicion → edited_at |
| nombre | name | nombre_cliente → customer_name, nombre_proveedor → supplier_name, nombre_empleado → employee_name |
| direccion | address | direccion_pais → address_country, direccion_estado → address_state, direccion_cp → address_zip |
| telefono | phone | |
| email | email | |
| notas | notes | |
| tipo | type | |
| estado | status | (campo estado de factura/cxp); address_estado → state (región admin) |
| activo | active | |
| editada | edited | |
| enlace | link | |
| contador | counter | contador_folio → folio_counter |
| prefijo | prefix | |
| porcentaje | percent | iva_porcentaje → vat_percent |
| etiqueta | label | |
| share | share | |
| backend | backend | |
| metas | goals | |
| mensuales | monthly | |
| comisiones | fees | |
| tasa_dia | daily_rate | |
| notif | notifications | notif_gastos_activa → notifications_expense_active, notif_cxc_activa → notifications_ar_active |
| unidades_medida | measure_units | |
| nombre_base | base_name | |
| folio | serial | campo folio → serial (string). Copy 'FAC-…' queda igual |
| espejo | mirror | |
| tabla / tablas | table / tables | |
| hoja | sheet | hojaActual → currentSheet |
| año | year | |
| base | base | |
| evento | events | |
| imagen | image | |
| esqueleto | skeleton | |
| almacenamiento | storage | |
| huella | fingerprint | |

## Entidades (tipos)
| ES | EN |
|---|---|
| Cliente | Customer |
| FacturaItem | InvoiceItem |
| Factura | Invoice |
| Empleado | Employee |
| Asistencia | Attendance |
| GastoFijo | FixedExpense |
| Gasto | Expense |
| Proveedor | Supplier |
| CuentaPagar | AccountsPayable |
| Pago | Payment |
| Producto | Product |
| MovimientoStock | StockMovement |
| Config | Config |
| CodigoAcceso | AccessCode |
| Dispositivo | Device |
| MetodoPago | PaymentMethod |
| TipoPago | PaymentType |
| EstadoFactura | InvoiceStatus |
| TipoMovimiento | MovementType |
| TipoDoc | DocType |
| Kpis (reportes) | Kpis |
| InvoiceTotals | InvoiceTotals |

## Acciones wire (frontend ↔ AMBOS backends)
| ES | EN |
|---|---|
| getPerms | getPermissions |
| getConfig | getConfig |
| uploadImagen | uploadImage |
| saveConfig | saveConfig |
| listClientes | listCustomers |
| saveCliente | saveCustomer |
| deleteCliente | deleteCustomer |
| createFactura | createInvoice |
| updateFactura | updateInvoice |
| listFacturas | listInvoices |
| listFacturasItems | listInvoiceItems |
| getFactura | getInvoice |
| deleteFactura | deleteInvoice |
| listGastos | listExpenses |
| saveGasto | saveExpense |
| deleteGasto | deleteExpense |
| listGastosFijos | listFixedExpenses |
| saveGastoFijo | saveFixedExpense |
| deleteGastoFijo | deleteFixedExpense |
| listProveedores | listSuppliers |
| saveProveedor | saveSupplier |
| deleteProveedor | deleteSupplier |
| listEmpleados | listEmployees |
| saveEmpleado | saveEmployee |
| deleteEmpleado | deleteEmployee |
| registerNomina | registerPayroll |
| registerNominaAvanzada | registerAdvancedPayroll |
| listNominaDetalles | listPayrollDetails |
| listAsistencias | listAttendance |
| saveAsistencia | saveAttendance |
| deleteAsistencia | deleteAttendance |
| createCxp | createPayable |
| listCxp | listPayables |
| deleteCxp | deletePayable |
| registerPago | registerPayment |
| listPagos | listPayments |
| getReportes | getReports |
| getReporteFinanciero | getFinancialReport |
| getReportesInventario | getInventoryReports |
| getVentasProducto | getProductSales |
| getMetasVsLogros | getGoalsVsAchievements |
| getCategorias | getCategories |
| listProductos | listProducts |
| saveProducto | saveProduct |
| deleteProducto | deleteProduct |
| registrarMovimiento | registerMovement |
| listMovimientos | listMovements |
| listTasasHistorial | listRatesHistory |
| registrarTasa | registerRate |
| listUsuarios | listUsers |
| saveUsuario | saveUser |
| deleteUsuario | deleteUser |
| listCodigos | listCodes |
| saveCodigo | saveCode |
| renovarCodigo | renewCode |
| deleteCodigo | deleteCode |
| listDispositivos | listDevices |
| registrarDispositivo | registerDevice |
| removerDispositivo | removeDevice |

Otras funciones del Repository (interfaz `data/repository.ts`): leerVariasTablas → readSheets, leerVariasTablasVivas → readLiveSheets, hojaActual → currentSheet, conectarHojaPorNombre → connectSheetByName, conectarHojaPorId → connectSheetById, listarHojasDisponibles → listAvailableSheets, crearBaseVacia → createEmptyBase, resetCompleto → fullReset, resetNuclear → nuclearReset, verificarOwnership → verifyOwnership, esLegacyBase → isLegacyBase, adoptarLegacyBase → adoptLegacyBase, adoptarAñoLegacy → adoptLegacyYear, infoHoja → sheetInfo, inventarioHojas → sheetInventory, preflightTransferencia → preflightTransfer, transferirSistema → transferSystem, migrarImagenesADrive → migrateImagesToDrive, prepararAnioActual → prepareCurrentYear, estadoAlmacenamiento → storageStatus, renombrarHoja → renameSheet.

funciones readCache (…Espejo): listClientesEspejo → listCustomersFromMirror, listFacturasEspejo → listInvoicesFromMirror, getFacturaEspejo → getInvoiceFromMirror, listGastosEspejo → listExpensesFromMirror, listProductosEspejo → listProductsFromMirror, listProveedoresEspejo → listSuppliersFromMirror, listEmpleadosEspejo → listEmployeesFromMirror, listAsistenciasEspejo → listAttendanceFromMirror, listCxpEspejo → listPayablesFromMirror, listMovimientosEspejo → listMovementsFromMirror, listPagosEspejo → listPaymentsFromMirror.

## Tablas / hojas de Sheets (tables.ts + createSpreadsheet)
| ES | EN |
|---|---|
| Config | Config |
| Clientes | Customers |
| Empleados | Employees |
| Facturas | Invoices |
| Factura_Items | Invoice_Items |
| Gastos | Expenses |
| Proveedores | Suppliers |
| Cuentas_Pagar | Accounts_Payable |
| Pagos | Payments |
| Usuarios | Users |
| Productos | Products |
| Movimientos_Stock | Stock_Movements |
| Codigos_Acceso | Access_Codes |
| Dispositivos | Devices |
| Gastos_Fijos | Fixed_Expenses |
| Tasas_Historial | Rates_History |
| Nomina_Detalles | Payroll_Details |
| Asistencias | Attendance |

## Módulos / permisos (valores persistidos en modulos_ver + JWT + canView('...'))
clientes→customers, facturas→invoices, gastos→expenses, proveedores→suppliers, empleados→employees, cuentas→payables, inventario→inventory, reportes→reports, dashboard→dashboard, configuracion→settings.
Categorias kind: 'cxp'→'ap', 'gastos'→'expenses'. uploadImagen modulo: 'configuracion'→'settings', 'inventario'→'inventory'.

## Enumerados controlados (valores que viven en Sheets)
- TipoPago: cobro→payment, abono→partial
- EstadoFactura: pendiente→pending, parcial→partial, pagada→paid
- TipoMovimiento: entrada→in, salida→out, ajuste→adjustment
- Empleado.esquema_pago: semanal→weekly, quincenal→biweekly, mensual→monthly
- Roles (users/codigos): admin→admin, asistente→assistant, solo_lectura→read_only, ver_facturas→view_invoices, ver_reportes→view_reports, ver_gastos→view_expenses, ver_empleados→view_employees, ver_cuentas→view_payables, personalizado→custom

## Storage keys (localStorage/chrome.storage/sessionStorage)
ft_spreadsheet_id → ft_spreadsheet_id (queda), ft_config_cache → ft_config_cache (queda), ft_cola_escrituras → ft_write_queue, ft_sesion_local → ft_local_session, ft_offline_desbloqueada → ft_offline_unlocked, ft_web_oauth_nonce → ft_web_oauth_nonce (queda), ft_code_session → ft_code_session (queda), KEY_COLA var → ft_write_queue. Sistema.ft_id / appProperties ft_* → se conservan (marca de identidad, ya homogénea).

## Claims JWT (backend/src/auth/codigos.ts + roles.ts)
rol→role, modulos_ver→permissions_view, modulos_editar→permissions_edit, owner→owner, dev→dev, sub→sub.

## Fuera de alcance (no renombrar)
Copy de UI (mensajes i18n de texto), valores de categorías de usuario (Renta, Internet…), IDs de Google, client IDs OAuth, marcador `ft_`, acrónimos `rfc`/`cfdi`, `DEFAULT_CONFIG` público de config (DEFAULT_CURRENCY).
```

- [ ] **Step 2: Crear `scripts/rename.mjs`** — dos mapas distintos, porque las palabras cortas de campo (`cliente`, `fecha`, `total`, `nombre`) existen TAMBIÉN dentro de copy de UI en español (que NO se toca):

```js
// scripts/rename.mjs  —  uso: node scripts/rename.mjs <mapfile.json> [-n]
// mapfile: { idents: {ES:EN}, strings: {ES:EN}, files: [{from,to}], dirs: [{from,to}] }
//  - idents    : renombra solo en POSICIÓN DE IDENTIFICADOR (skipeando strings/comentarios)
//  - strings   : renombra SOLO dentro de literales de string (acciones wire, keys de storage,
//                claims JWT, headers de Sheets, valores de módulo). Nunca toca comentarios.
//  - files/dirs: git mv antes de reemplazar (los imports los arregla el pase de idents).
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { globSync } from 'node:fs'

const ROOT = new URL('..', import.meta.url).pathname
const IGNORE = /(node_modules|\.output|dist|\.wxt|\.vercel|pnpm-lock|tsbuildinfo|scripts\/rename-map\.json)/
const DRY = process.argv.includes('-n')

function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
// Boundary de separación camel/Pascal/snake. SIN after-bound a propósito: la
// composición de palabras queda permitida (Cliente dentro de listClientes,
// fecha dentro de fecha_registro) y el GUARD anti-solapamiento de apply() hace
// que siempre gane el token más largo (Clientes > Cliente, fecha_registro > fecha).
function identRe(token) {
  const up = /^[A-Z]/.test(token)
  const before = up ? '(?:(?<![A-Z0-9_$])|(?<=[a-z]))' : '(?<![A-Za-z0-9])'
  return new RegExp(`${before}${esc(token)}`, 'g')
}

// Separa el archivo en segmentos: { code:boolean, start, end } — salta /* */, //, '...', "...", `...`
function segment(text) {
  const segs = [] // {code:boolean, start:number, end:number}
  let i = 0
  const n = text.length
  let codeStart = 0
  while (i < n) {
    const c = text[i]
    if (c === '/' && text[i + 1] === '/') { segs.push({ code: true, start: codeStart, end: i }); let j = i + 2; while (j < n && text[j] !== '\n' && text[j] !== '\r') j++; i = j; codeStart = i; continue }
    if (c === '/' && text[i + 1] === '*') { segs.push({ code: true, start: codeStart, end: i }); let j = i + 2; while (j < n && !(text[j] === '*' && text[j + 1] === '/')) j++; i = j + 2; codeStart = i; continue }
    if (c === "'" || c === '"' || c === '`') {
      segs.push({ code: true, start: codeStart, end: i })
      const q = c; let j = i + 1
      while (j < n && text[j] !== q) {
        if (text[j] === '\\') j += 2; else j++
      }
      const end = Math.min(j + 1, n)
      segs.push({ code: false, start: i, end }) // el string SÍ se registra para el mapa `strings`
      i = end; codeStart = end
      continue
    }
    i++
  }
  if (codeStart < n) segs.push({ code: true, start: codeStart, end: n })
  return segs
}

// Longest-first con GUARD anti-solapamiento: un match cubierto por un token más
// largo se descarta. Elimina la corrupción (p.ej. hoja + hojaActual coexistían
// → "sheetentSheet"). En strings usa substring exacto (misma longevidad).
function apply(text, map) {
  const edits = []
  for (const seg of segment(text)) {
    const slice = text.slice(seg.start, seg.end)
    const isCode = seg.code
    const lookup = isCode ? (map.idents ?? {}) : (map.strings ?? {})
    const keys = Object.keys(lookup).sort((a, b) => b.length - a.length)
    const reFor = isCode ? identRe : (t => new RegExp(esc(t), 'g'))
    const taken = [] // rangos ya tomados por tokens más largos
    for (const from of keys) {
      const re = reFor(from); let m
      while ((m = re.exec(slice))) {
        const s = seg.start + m.index, e = s + from.length
        if (taken.some(([a, b]) => s < b && a < e)) continue
        taken.push([s, e]); edits.push([s, e, lookup[from]])
      }
    }
  }
  edits.sort((a, b) => b[0] - a[0]) // aplicar de atrás hacia adelante
  let out = text
  for (const [s, e, to] of edits) out = out.slice(0, s) + to + out.slice(e)
  return out
}

const map = JSON.parse(readFileSync(process.argv[2], 'utf8'))
// 1) git mv archivos/dirs antes de los reemplazos
for (const { from, to } of map.files ?? []) { if (DRY) continue; const s = `${ROOT}${from}`, d = `${ROOT}${to}`; const dd = d.slice(0, d.lastIndexOf('/')); if (!existsSync(dd)) execSync(`mkdir -p "${dd}"`); execSync(`git mv "${s}" "${d}"`); console.log(`  mv ${from} -> ${to}`) }
for (const { from, to } of map.dirs ?? []) { if (DRY) continue; execSync(`git mv "${ROOT}${from}" "${ROOT}${to}"`); console.log(`  mvDir ${from} -> ${to}`) }
// 2) reemplazos
let changed = 0
for (const f of globSync('**/*.{ts,tsx,json}', { cwd: ROOT }).filter(x => !IGNORE.test(x))) {
  const p = `${ROOT}${f}`; const before = readFileSync(p, 'utf8'); const after = apply(before, map)
  if (after !== before) { if (!DRY) writeFileSync(p, after); changed++; console.log(`  ${f}`) }
}
console.log(`\nTouched ${changed} files. ${DRY ? 'DRY RUN — sin escribir.' : 'Ahora: pnpm build para cazar referencias no actualizadas y colisiones.'}`)
```

Regla de seguridad del mapa: los compuestos cuyo orden NO es compositivo en inglés (**`listGastosFijos`** → `listFixedExpenses`, `registerNominaAvanzada` → `registerAdvancedPayroll`, `id_gasto_fijo` → `fixed_expense_id`, `tarifa_hora_extra`, `monto_horas_extra`…) van como token explícito en el mapa. Las palabras cortas SI pueden componer (guard anti-solapamiento: siempre gana el token más largo; p.ej. `Cliente` dentro de `listClientes`, `Cliente`+`Clientes` coexisten sin corrupción). Tras cada pase, el paso de verificación de cada task corre `rg` sobre los tokens españoles pendientes para cazar silenciosos.

- [ ] **Step 3: Crear `scripts/rename-map.json`** con la forma del nuevo diseño. Semilla inicial (vacía de aplicación): `{ "idents": {}, "strings": {}, "files": [], "dirs": [] }` y un `idents.example`/`strings.example` comentado con los primeros tokens (entidades `Customer`/`Invoice`/…, campos `id_cliente → customer_id`, acciones `listClientes → listCustomers`) para que las tasks posteriores los vayan poblando por fase. Nunca se degrada (las keys ya aplicadas no se borran).

- [ ] **Step 4: Probar el script en modo no destructivo** — `node scripts/rename.mjs scripts/rename-map.json -n` sobre el repo limpio: imprime `Touched 0 files`. Aplicarlo a un fichero de prueba real y revisar `git diff --stat`/diff para confirmar: (a) identifiers dentro de copy de UI sin tocar, (b) strings vacíos intactos, (c) comentarios intactos. Probar `node scripts/rename.mjs` sin argumentos → error de uso esperado. Revertir con `git checkout . && git clean -fd scripts docs/superpowers`.

- [ ] **Step 5: Verificación** — `pnpm build` sigue verde (tool probada en seco). Punto de control de la herramienta.

- [ ] **Step 6: Commit**

```bash
git add docs/INGLES_GLOSARIO.md scripts/rename.mjs scripts/rename-map.json
git commit -m "chore: add english rename glossary and codemod tooling"
```

---

## Task 2: Entidades de datos + columnas de Sheets (clientes, facturas, pagos, gastos, proveedores, cuentas, productos, empleados, inventario)

**Files:**
- Modify: `scripts/rename-map.json` (extender `idents` + `strings`)
- Modify: `packages/shared/src/types/entities.ts`
- Modify: `packages/shared/src/sheets/tables.ts`
- Modify: `packages/shared/src/sheets/createSpreadsheet.ts`
- Modify: `packages/shared/src/types/schemas.ts`
- Modify: `packages/shared/src/**` (referencies)
- Test: full suite

**Interfaces:**
- Consumes: glosario Task 1.
- Produces: tipos `Customer`, `Invoice`, `InvoiceItem`, `Expense`, `Supplier`, `AccountsPayable`, `Payment`, `Product`, `Employee`, `Attendance`, `FixedExpense`, `RateHistory`, `StockMovement`, `AccessCode`, `Device`, con campos snake_case inglés; `TABLES` y `TABLAS_EVENTO_AÑO`/`TABLAS_BASE` renombradas.

- [ ] **Step 1: Agregar los campos de dato de las entidades al mapa** — cada campo va en **`idents`** (renombra el identificador) Y en **`strings`** (renombra el header literal de `tables.ts`, que vive como string). Los campos multi-palabra del glosario:

```json
{
  "idents": {
    "id_cliente": "customer_id",
    "nombre_cliente": "customer_name",
    "fecha_registro": "created_at",
    "direccion_pais": "address_country",
    "direccion_estado": "address_state",
    "direccion_cp": "address_zip",
    "id_factura": "invoice_id",
    "fecha_emision": "issue_date",
    "fecha_vencimiento": "due_date",
    "fecha_pago": "paid_at",
    "fecha_edicion": "edited_at",
    "tipo_cambio": "exchange_rate",
    "precio_unitario": "unit_price",
    "id_empleado": "employee_id",
    "nombre_empleado": "employee_name",
    "salario_moneda": "salary_currency",
    "fecha_ingreso": "hire_date",
    "hora_entrada": "clock_in",
    "hora_salida": "clock_out",
    "tarifa_hora_extra": "overtime_rate",
    "esquema_pago": "pay_schedule",
    "dias_laborales": "work_days",
    "id_asistencia": "attendance_id",
    "id_gasto": "expense_id",
    "id_gasto_fijo": "fixed_expense_id",
    "dia_vencimiento": "due_day",
    "enlace_pago": "payment_link",
    "id_tasa": "rate_id",
    "id_proveedor": "supplier_id",
    "nombre_proveedor": "supplier_name",
    "folio_documento": "document_serial",
    "monto_total": "total_amount",
    "id_cxp": "ap_id",
    "id_pago": "payment_id",
    "id_origen": "origin_id",
    "metodo_pago": "payment_method",
    "id_producto": "product_id",
    "stock_minimo": "minimum_stock",
    "precio_costo": "cost_price",
    "precio_venta": "sale_price",
    "fecha_emision": "issue_date",
    "id_movimiento": "movement_id",
    "monto_horas_extra": "overtime_amount",
    "sueldo_base": "base_salary",
    "pagos_divididos": "split_payments",
    "empresa_nombre": "company_name",
    "empresa_rfc": "company_tax_id",
    "empresa_direccion": "company_address",
    "empresa_telefono": "company_phone",
    "empresa_email": "company_email",
    "empresa_logo": "company_logo",
    "empresa_cp": "company_zip",
    "empresa_ciudad": "company_city",
    "empresa_pais": "company_country",
    "prefijo_folio": "serial_prefix",
    "contador_folio": "serial_counter",
    "iva_porcentaje": "vat_percent",
    "categorias_gastos": "expense_categories",
    "categorias_cxp": "ap_categories",
    "categorias_inventario": "inventory_categories",
    "monedas_activas": "active_currencies",
    "monedas_custom": "custom_currencies",
    "tasas_cambio": "exchange_rates",
    "metodos_pago": "payment_methods",
    "tipo_doc_etiqueta": "doc_type_label",
    "share_backend_url": "share_backend_url",
    "metas_mensuales": "monthly_goals",
    "comisiones_transaccion": "transaction_fees",
    "comisiones_metodos": "method_fees",
    "tasa_dia_activa": "daily_rate_active",
    "google_permisos": "google_permissions",
    "notif_gastos_activa": "notifications_expense_active",
    "notif_cxc_activa": "notifications_ar_active",
    "unidades_medida": "measure_units",
    "nombreBaseHoja": "baseSheetName",
    "expira_en": "expires_at",
    "usos_max": "max_uses",
    "ip_info": "ip_info",
    "registrado_en": "registered_at"
  },
  "strings": {
    "id_cliente": "customer_id",
    "nombre_cliente": "customer_name",
    "fecha_registro": "created_at",
    "fecha_emision": "issue_date",
    "tipo_cambio": "exchange_rate",
    "precio_unitario": "unit_price",
    "id_factura": "invoice_id",
    "id_empleado": "employee_id",
    "id_proveedor": "supplier_id",
    "id_cxp": "ap_id",
    "id_pago": "payment_id",
    "id_producto": "product_id",
    "id_movimiento": "movement_id",
    "id_gasto_fijo": "fixed_expense_id",
    "id_tasa": "rate_id",
    "monto_total": "total_amount",
    "metodo_pago": "payment_method"
  }
}
```

> Nota 1: **`idents`** recibe CADA campo del glosario (renombra identificador y también el literal `'…'` de `tables.ts` vía `strings`). **`strings`** requiere SOLO las claves columnas de `tables.ts` (los campos que también son header). Si no hay header homónimo, el campo va solo en `idents`.
> Nota 2: las variantes de caso (`id_cliente`, `idCliente`, …) las maneja la boundary de `identRe` (segmento snake o camel); los campos multi-palabra se listan explícitamente arriba. Los camelCase equivalentes (`shareBackendUrl`…) se agregan a `idents` con el mismo `to`.
> Nota 3: el mapa NO es destructivo — se va extendiendo en cada task con las keys necesarias para esa fase. `strings` aquí solo cubre los headers de columnas; las acciones wire, storage keys y claims se añaden en sus tasks respectivos.

- [ ] **Step 2: Aplicar el codemod**

Run: `node scripts/rename.mjs scripts/rename-map.json`
Expected: `tsc` marca decenas de errores en `shared`, `web`, `extension` por referencias no actualizadas (campos de entidad en `repository.ts`, `features/**`, `store/**`, `tests/**`).

- [ ] **Step 3: Corregir colisiones y referencias residuales a mano**, usando `tsc` como guía. Reglas:
  - Campos de entidad y argumentos de repo/schemas usan el nuevo inglés snake_case.
  - No renombrar en este task nombres de funciones/acciones ni strings wire (tareas posteriores). Si una función contiene el token (ej. `listClientes`), el codemod actualizará la función completa en Task 4/5; aquí solo se permite si el token es ambigüedad de campo (ej. campo `cliente` no existe).
  - Strings wire, keys de storage y claims JWT NO se tocan todavía.

- [ ] **Step 4: Verificación**

```bash
pnpm -F shared build && pnpm -F backend build && pnpm -F web build && pnpm test && pnpm lint
```
Expected: verde. Buscar restos con: `rg -n "\b(cliente|factura|gasto_fijo|proveedor|empleado|asistencia|movimiento)\b" packages/shared/src apps --hidden -g '*.ts' -g '*.tsx' | grep -v '/' | head`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: rename entity fields and sheet columns to english snake_case"
```

---

## Task 3: Sheet headers migration (spreadsheet de prueba)

**Files:**
- Create: `apps/backend/scripts/migrate-schema-english.mjs`
- Modify: `docs/INGLES_GLOSARIO.md` (marcar datos migrados)

**Interfaces:**
- Consumes: `scripts/rename-map.json` `strings` (campo→columna).
- Produces: script Node que renombra pestañas y headers de cada hoja del spreadsheet indicado por `SPREADSHEET_ID` (usa credenciales de service account de `apps/backend`) según el glosario, idempotente.

- [ ] **Step 1: Escribir el script de migración de headers/pestañas**

```js
// apps/backend/scripts/migrate-schema-english.mjs
// Depende del glosario (misma fuente que rename-map.json).
// 1) Lee SPREADSHEET_ID de env. 2) expandToFull (ppal: pasteHeaders). 
// 3) Para cada hoja: renombra TÍTULO y primera fila (headers) según mapping de
//    tablas y columnas. Idempotente (si ya en inglés, no hace nada).
// Uso: SPREADSHEET_ID=xxx node apps/backend/scripts/migrate-schema-english.mjs
```

- [ ] **Step 2: Ejecutar contra el spreadsheet de prueba** y verificar en Google Sheets que: pestañas `Customers`, `Invoices`, `Invoice_Items`, `Payments`, `Expenses`, `Suppliers`, `Accounts_Payable`, `Users`, `Products`, `Stock_Movements`, `Access_Codes`, `Devices`, `Fixed_Expenses`, `Rates_History`, `Payroll_Details`, `Attendance`; y la primera fila de cada una con headers ingleses (`customer_id`, `invoice_id`, …).

- [ ] **Step 3: Smoke test manual** — `pnpm dev:web`, cargar módulos clientes/facturas/gastos y confirmar que leen/muestran datos. Repetir con `pnpm dev:extension` popup/dashboard.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/scripts/migrate-schema-english.mjs docs/INGLES_GLOSARIO.md
git commit -m "feat: sheet schema migration script for english headers"
```

---

## Task 4: Nombres de tipos, funciones y métodos del núcleo compartido

**Files:**
- Modify: `packages/shared/src/**` (types, repository, readCache, store, calc, reports, roles, auth, sync, drive, sheets, export, i18n)
- Modify: `apps/web/src/**`, `apps/extension/src/**`, `apps/backend/src/**`, `apps/script/src/**` (solo referencias a símbolos de shared)
- Test: full suite

**Interfaces:**
- Consumes: Task 1 glosario.
- Produces: métodos de `Repository` e inglés de funciones (`listClientes`→`listCustomers`), renames del interfaz (`readSheets`, `currentSheet`, `connectSheetByName`, `createEmptyBase`, `verifyOwnership`, …), `readCache` espejo→mirror, `espejoContext`→`mirrorContext`, `espejoReact`→`mirrorReact`, queries/store renombradas. **Sin tocar strings wire ni claves persistentes** (sus declaraciones en `remoteRepository.ts` y `actions.ts` se renombran en Task 5 — aquí solo si el símbolo TS coincide con el nuevo nombre de función local).

- [ ] **Step 1: Extender `idents` con los tokens de funciones/tipos/módulos (no wire)**

```json
{
  "idents": {
    "espejo": "mirror",
    "EspejoCtx": "MirrorContext",
    "listarHojasDisponibles": "listAvailableSheets",
    "conectarHojaPorNombre": "connectSheetByName",
    "conectarHojaPorId": "connectSheetById",
    "crearBaseVacia": "createEmptyBase",
    "resetCompleto": "fullReset",
    "resetNuclear": "nuclearReset",
    "verificarOwnership": "verifyOwnership",
    "esLegacyBase": "isLegacyBase",
    "adoptarLegacyBase": "adoptLegacyBase",
    "adoptarAñoLegacy": "adoptLegacyYear",
    "infoHoja": "sheetInfo",
    "inventarioHojas": "sheetInventory",
    "preflightTransferencia": "preflightTransfer",
    "transferirSistema": "transferSystem",
    "migrarImagenesADrive": "migrateImagesToDrive",
    "prepararAnioActual": "prepareCurrentYear",
    "estadoAlmacenamiento": "storageStatus",
    "renombrarHoja": "renameSheet",
    "leerVariasTablas": "readSheets",
    "leerVariasTablasVivas": "readLiveSheets",
    "hojaActual": "currentSheet",
    "sanitizeConfig": "sanitizeConfig"
  }
}
```
Más: todos los métodos cortos de `Repository` (list/save/get/delete de cada entidad) y funciones de `calc`/`reports`/`roles` extraídas del glosario (ej. `sanitizeConfig`, `validarConfig`→`validateConfig`, `puntoDeEquilibrio`→`breakEven`, `reconversionMonetaria`→`monetaryReconversion`, `productosStockBajo`→`lowStockProducts`, `movimientosPorMes`→`monthlyMovements`, `statsMultiproducto`→`multiProductStats`).
Ojo: **no** incluir en este task los nombres de acciones wire (Task 5) ni claves de Sheets/storage (Task 3/8) ni claims JWT (Task 8).

- [ ] **Step 2: Aplicar codemod** — `node scripts/rename.mjs scripts/rename-map.json`
- [ ] **Step 3: Corregir a mano con tsc** — colisiones reales con variables locales (verificar cada `date`/`name` nuevo), símbolos exportados en `packages/shared/src/index.ts` (actualizar barril).

- [ ] **Step 4: Verificación**

```bash
pnpm build && pnpm test && pnpm lint
rg -n "\bespejo|listarHojas|conectarHoja|leerVariasTablas|hojaActual\b" packages apps --hidden -g '*.ts' -g '*.tsx'
```
Expected: sin match.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: english method and type names in shared core"
```

---

## Task 5: i18n keys + 5 locales

**Files:**
- Modify: `packages/shared/src/i18n/messages.ts`
- Modify: `packages/shared/src/i18n/locales/{en,es-exportado,pt,ca,gl}.ts`
- Modify: referencias `t('...')`/`msg.…` en `features/**`, `web`, `extension`

**Interfaces:**
- Consumes: glosario (acciones → prefijos i18n: `createFactura`→`createInvoice`, `saveGasto`→`saveExpense`, `deleteProveedor`→`deleteSupplier`, …).
- Produces: keys tipadas `MessageKey` en inglés; locales consistentes.

- [ ] **Step 1: Renombran las keys** del bloque `actions:` de `messages.ts` y claves con tokens de dominio (`facturas.*`, `clientes.*`, `gastos.*`, …) usando el glosario de Task 5 del mapa. Generar en `messages.ts` y propagar a los 4 locales (usar el mismo codemod; `MessageKey` tipado valida en runtime de build).
- [ ] **Step 2: Actualizar usos** `useT('clientes.…')`, `msg.clientes…` en features/web/extension con tsc.
- [ ] **Step 3: Verificación** — `pnpm -F shared build && pnpm -F web build && pnpm test`. `rg "createFactura|saveGasto|deleteCliente|clientes\." apps packages` → sin match (excepto copy de texto).
- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: english i18n message keys across locales"
```

---

## Task 6: Nombres de archivos y directorios

**Files:**
- Modify: `scripts/rename-map.json` (arrays `files`, `dirs`)
- Rename: `packages/shared/src/features/{clientes→customers, facturas→invoices, gastos→expenses, proveedores→suppliers, empleados→employees, cuentasPagar→payables, cxc→receivables? (ar), inventario→inventory, reportes→reports, configuracion→settings, compartir→sharing, dashboard→dashboard}`
- Rename: componentes dentro de features (`ClienteFormModal`→`CustomerFormModal`, `FacturaEditModal`→`InvoiceEditModal`, `GastoFormModal`→`ExpenseFormModal`, …), `EspejoContext`→`MirrorContext`, `HistorialAbonos`→`PaymentHistory`, `VentaRapidaModal`→`QuickSaleModal`, `NominaModal`→`PayrollModal`, `MovimientoModal`→`MovementModal`, `CuentasPorCobrar`→`Receivables`, `AlmacenamientoCard`→`StorageCard`.

**Interfaces:**
- Consumes: mapa de archivos/dirs en glosario.
- Produces: estructura de archivos 100% inglés, imports actualizados por el codemod (paths relativos incluyen los nombres de dir/archivo → el reemplazo de tokens también los edita).

- [ ] **Step 1: Listar todos los archivos** en `packages/shared/src`, `apps/web/src`, `apps/extension/src`, `apps/backend`, `apps/script`, `packages/shared/tests`, `apps/backend/tests` con token español en el nombre: `git ls-files | rg "espejo|Cliente|Factura|Gasto|Proveedor|Empleado|Nomina|Asistencia|Cxp|Movimiento|Inventario|Reporte|Configuracion|Compartir|Abonos|VentaRapida|cobro|cxc"`. Volcar a `files`/`dirs` del mapa con los `to` en inglés.
- [ ] **Step 2: Aplicar codemod** (mueve con `git mv` + actualiza imports)
- [ ] **Step 3: Verificación** — `pnpm build && pnpm test && pnpm lint`; `git ls-files | rg "(clente|actura|asto|roveedor|mpleado|omina|sistencia|xp|ovimiento|nventario|eporte|onfiguracion|spejo|bono)"` → sin match.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: english file and directory names"
```

---

## Task 7: Acciones wire (frontend + AMBOS backends) + deploy coordinado

**Files:**
- Modify: `packages/shared/src/data/remoteRepository.ts`
- Modify: `apps/backend/src/actions.ts`
- Modify: `apps/script/src/backend.ts`
- Modify: `packages/shared/tests/**`, `apps/backend/tests/**` (fixtures con nombres de acción)

**Interfaces:**
- Consumes: tabla «Acciones wire» del glosario.
- Produces: TODAS las acciones en inglés (`saveCustomer`, `createInvoice`, …). Regla: el payload y la firma tipada del `Repository` NO cambian en este task (ya inglés); solo el string literal del protocolo.

- [ ] **Step 1: Construir el mapa de acciones** a partir del glosario (tabla exacta). Forma (`strings`: son literales citados en `call('…')`/`case '…'`):

```json
{
  "strings": {
    "listClientes": "listCustomers",
    "saveCliente": "saveCustomer",
    "deleteCliente": "deleteCustomer",
    "createFactura": "createInvoice",
    "updateFactura": "updateInvoice",
    "listFacturas": "listInvoices",
    "listFacturasItems": "listInvoiceItems",
    "getFactura": "getInvoice",
    "deleteFactura": "deleteInvoice",
    "listGastos": "listExpenses",
    "saveGasto": "saveExpense",
    "deleteGasto": "deleteExpense",
    "registerNomina": "registerPayroll",
    "listNominaDetalles": "listPayrollDetails",
    "registerNominaAvanzada": "registerAdvancedPayroll",
    "createCxp": "createPayable",
    "listCxp": "listPayables",
    "deleteCxp": "deletePayable",
    "registerPago": "registerPayment",
    "listPagos": "listPayments",
    "getReportes": "getReports",
    "getReporteFinanciero": "getFinancialReport",
    "getReportesInventario": "getInventoryReports",
    "getVentasProducto": "getProductSales",
    "getMetasVsLogros": "getGoalsVsAchievements",
    "getCategorias": "getCategories",
    "listProductos": "listProducts",
    "saveProducto": "saveProduct",
    "deleteProducto": "deleteProduct",
    "registrarMovimiento": "registerMovement",
    "listMovimientos": "listMovements",
    "listGastosFijos": "listFixedExpenses",
    "saveGastoFijo": "saveFixedExpense",
    "deleteGastoFijo": "deleteFixedExpense",
    "listTasasHistorial": "listRatesHistory",
    "registrarTasa": "registerRate",
    "listUsuarios": "listUsers",
    "saveUsuario": "saveUser",
    "deleteUsuario": "deleteUser",
    "listCodigos": "listCodes",
    "saveCodigo": "saveCode",
    "renovarCodigo": "renewCode",
    "deleteCodigo": "deleteCode",
    "listDispositivos": "listDevices",
    "registrarDispositivo": "registerDevice",
    "removerDispositivo": "removeDevice",
    "getPerms": "getPermissions",
    "uploadImagen": "uploadImage",
    "saveConfig": "saveConfig",
    "getConfig": "getConfig"
  }
}
```

- [ ] **Step 2: Aplicar codemod** sobre `remoteRepository.ts`, `actions.ts`, `backend.ts` y tests. Antes de aplicar, verificar que NO hay un `getVentasProducto`/`listFacturasItems` huérfano en `apps/backend/actions.ts` (bug preexistente): el fichero Hono NO despacha `getVentasProducto`; nota en README/issue. No corregir aquí.
- [ ] **Step 3: Verificación local** — `pnpm build && pnpm test && pnpm lint`. Verificar paridad de nombres entre frontend y backend: extraer strings de `call('`/`case '` de los 3 ficheros y diff: `rg -o "call(?:Post)?\('[a-zA-Z]+'" apps scripts` vs `rg -o "case '[a-zA-Z]+'" apps` → deben ser exactamente iguales. **Confirmar que `Apps Script` compila**: `pnpm build:script`.
- [ ] **Step 4: Registro manual de despliegue coordinado en verificación** (ambiente de pruebas):
  1. `apps/backend`: `pnpm --filter @ft/backend deploy` (Vercel).
  2. `apps/script`: `pnpm build:script` → subir `apps/script/dist/Code.js` a Apps Script (release).
  3. `apps/web`: build + deploy; `apps/extension`: build y recargar.
  4. Smoke test completo (web + popup extension) contra el spreadsheet migrado: CRUD clientes, crear factura + pago, gasto, reporte mensual, inventario + movimiento, empleado + nómina + asistencia, cuentas por pagar, usuarios/códigos/dispositivos (admin).
- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: english wire action names across frontend and both backends"
```

---

## Task 8: Módulos de permiso + roles + claims JWT + valores en Sheets (migración II)

**Files:**
- Modify: `packages/shared/src/roles/roles.ts`
- Modify: `packages/shared/src/store/perms.tsx`
- Modify: `apps/backend/src/roles.ts`, `apps/backend/src/actions.ts`, `apps/backend/src/auth/codigos.ts`, `apps/backend/src/index.ts`
- Modify: `apps/script/src/backend.ts`
- Modify: `packages/shared/src/taxid.ts`, `packages/shared/src/types/entities.ts` (enums)
- Modify: `scripts/rename-map.json`
- Test: `apps/backend/tests/{roles,actions,codigos,auth-flujo}.test.ts`

**Interfaces:**
- Consumes: glosario «Módulos/permisos», «Enumerados», «Claims JWT».
- Produces: `canView('customers')`, roles `assistant`, `read_only`, `view_invoices`…; claims JWT `role`, `permissions_view`, `permissions_edit`. **Datos persistidos** (columnas `modulos_ver`/`modulos_editar` en Users/AccessCodes, `tipo`, `estado`, `pay_schedule`, roles) se migran con script.

- [ ] **Step 1: Agregar tokens a `strings`** — valores de módulo contiguos como `canView('clientes')` y claves de categorías (`cxp→ap`) : (`clientes→customers`, `facturas→invoices`, `gastos→expenses`, `proveedores→suppliers`, `empleados→employees`, `cuentas→payables`, `inventario→inventory`, `reportes→reports`, `configuracion→settings`, `dashboard→dashboard`), valores enum (`cobro→payment`, `abono→partial`, `pendiente→pending`, `parcial→partial`, `pagada→paid`, `entrada→in`, `salida→out`, `ajuste→adjustment`, `semanal→weekly`, `quincenal→biweekly`, `mensual→monthly`, roles `asistente→assistant`, `solo_lectura→read_only`, `ver_facturas→view_invoices`, `ver_reportes→view_reports`, `ver_gastos→view_expenses`, `ver_empleados→view_employees`, `ver_cuentas→view_payables`, `personalizado→custom`). Y a **`idents`** los claims de sesión (`rol→role`, `modulos_ver→permissions_view`, `modulos_editar→permissions_edit`) y los nombres de tipo/constante de roles (`UserRole`, `RolModulo`…) — son identificadores TS.
- [ ] **Step 2: Aplicar codemod** y corregir a mano: `remoteRepository` stubs (visitante) que usan módulos, `uploadImagen` modulo del backend, `getCategorias` kind.
- [ ] **Step 3: Extender migration script** para valores de datos (no solo headers): reemplazar en las columnas `modulos_ver`, `modulos_editar`, `rol` de `Users`/`Access_Codes`, y en `Payments.tipo`, `Invoices.estado`/`Accounts_Payable.estado`, `Employees.pay_schedule`, `Stock_Movements.tipo`. Idempotente, mismo patrón que Task 3.
- [ ] **Step 4: Verificación** — `pnpm build && pnpm test && pnpm lint`, tests de backend verdes. Smoke: inicia sesión con código de acceso (rol asistente) y con cuenta dueño; verifica vistas/edición por rol (`customers` vs `invoices`).
- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: english permission modules, roles, and JWT claims with data migration"
```

---

## Task 9: Storage keys (sesiones/cache) + restos de contrato

**Files:**
- Modify: `packages/shared/src/data/storage.ts`, `packages/shared/src/sync/colaEscrituras.ts`, `packages/shared/src/auth/sesionOffline.ts`, `packages/shared/src/auth/popupOAuth.ts`, `packages/shared/src/store/appStore.ts`, `apps/web/src/mode.ts`
- Modify: `docs/INGLES_GLOSARIO.md`

**Interfaces:**
- Consumes: glosario «Storage keys».
- Produces: `ft_write_queue`, `ft_local_session`, `ft_offline_unlocked`; `ft_spreadsheet_id`, `ft_config_cache`, `ft_web_oauth_nonce`, `ft_code_session` sin cambio. Variable `KEY_COLA` → nuevo valor.

- [ ] **Step 1: Mapa para storage** — `idents` para el nombre de la constante (`KEY_COLA`→`QUEUE_KEY`) y `strings` para los valores (`ft_cola_escrituras→ft_write_queue`, `ft_sesion_local→ft_local_session`, `ft_offline_desbloqueada→ft_offline_unlocked`). Aplicar codemod minor.
- [ ] **Step 2: Verificación** — `pnpm build && pnpm test`. **Consecuencia esperada**: sesiones/cache locales se invalidan (keys nuevas) → re-login/re-conexión en pruebas. Documentar en glosario el cambio de keys.
- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: english storage keys (session cache invalidation accepted)"
```

---

## Task 10: Docs y sweep final

**Files:**
- Modify: `README.md`, `FUNCIONALIDADES.md`
- Modify: `docs/**` (ARQUITECTURA, DEPLOY_BACKEND, PLAN_EJECUCION, OPTIMIZACION_CUOTA_SHEETS, REFACTOR_PLAN, PROMPT_FASE5_*)
- Modify: `.opencode/**` si referencian nombres de módulos

**Interfaces:**
- Consumes: glosario.
- Produces: docs 100% consistentes con el nuevo vocabulario (tablas de módulos → inglés, nombres de hoja → `Customers`, `Invoices`…).

- [ ] **Step 1:** Actualizar menciones de módulos/hojas/acciones en la documentación al vocabulario inglés (dejar copy funcional en español solo como separación de producto/UI; en docs técnicos usar identificadores reales).
- [ ] **Step 2: Verificación** — `git grep -iE "(listClientes|createFactura|Cuentas_Pagar|modulos_ver|GastoFijo|espejo)"` sobre `docs` y repo → sin match.
- [ ] **Step 3: Sweep final** — `pnpm build && pnpm test && pnpm lint && pnpm build:script`. Smoke web+extension completo (CRUD + reporte + visita). 
- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: align identifiers with new english schema"
```

---

## Self-Review (checklist)

1. **Cobertura de spec:** glosario Task 1 cubre entidades/acciones/tablas/módulos/estados/claims/storage. Tasks 2-9 aplican cada categoría. Task 10 docs. Sin espacios en blanco: cada ISO de identificación tiene su task (Tipos: 2 y 4; archivos: 6; wire: 7; módulos/claims/datos: 8; storage: 9; i18n: 5; sheets heads: 3).
2. **Placeholder scan:** sin "implementar luego"; solo referencias al glosario (fuente de verdad definida en Task 1) y comandos concretos.
3. **Consistencia de tipos/nombres:** mismo token `customer_id` en Task 2 y Task 3; `listCustomers` en Task 4 (nombre de método) y Task 7 (acción wire) — coherencia única por token; `payables` (no `ap`) para módulo de permisos `cuentas` y `ap` solo como abreviación de categoría/columna `_ap`/`ap_id`. Claims `permissions_view/editar` => `permissions_view/edit`. Verificado.

## Ejecución handoff

Plan completo y guardado en `docs/superpowers/plans/2026-09-17-unificar-idioma-ingles.md`. Dos opciones:

1. **Subagent-Driven (recommended)** — despacho un subagente por task, reviso entre tasks, iteración rápida.
2. **Inline** — ejecuto los tasks en esta sesión.

**¿Cuál usamos?**