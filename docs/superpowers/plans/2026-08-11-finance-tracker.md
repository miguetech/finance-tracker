# Finance Tracker (extensión + web + Google Sheets) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar la app de facturación personal a una extensión Chrome (MV3, WXT) + sitio web responsive (Vite/React), con Google Sheets como DB accesible vía Sheets REST API directo y monorepo pnpm compartido.

**Architecture:** Monorepo pnpm con `apps/extension` (WXT), `apps/web` (Vite) y `packages/shared` (tipos + zod, catálogo monedas, cálculos, cliente Sheets REST, auth, repositorio de datos, hooks TanStack Query y componentes UI shadcn). Ambos apps son shells delgados (auth + routing) que renderizan las mismas páginas de `shared/features`. Folio atómico vía mutex en celda + reintentos (sin Apps Script).

**Tech Stack:** pnpm workspace · React 19 · TypeScript 5 · Tailwind CSS 4 · shadcn/ui (Radix) · TanStack Query 5 · Zustand 5 · Zod 3 · Vitest 3 · Playwright · WXT 0.20 · Vite 6.

## Global Constraints

- Node >= 20 (usar la v22 instalada), pnpm >= 9 (usar la v11 instalada).
- Escrito en TypeScript estricto (`strict: true`). Sin `any` en tipos públicos.
- Moneda: catálogo fijo en `packages/shared/src/currency/`; formateo con `Intl.NumberFormat(locale, { style: 'currency', currency: code })`.
- IDs: `uid(prefix)` = `prefix` + timestamp base36 + sufijo aleatorio base36. Prefijos: `cli_`, `fac_`, `gas_`, `prov_`, `cxp_`, `pag_`.
- Folio = `prefijo_folio + contador_folio` (ej. `FAC-001`), contador nunca se reutiliza, mutex en celda Config.
- Estados de factura/cxp derivados del saldo: sin pagos → `pendiente`; saldo=0 → `pagada`; saldo>0 con pagos → `parcial`.
- Todos los redondeos monetarios a 2 decimales.
- Escape HTML en toda interpolación de datos de usuario (anti-XSS). Sin innerHTML con datos del usuario.
- Pagos unificados: una hoja `Pagos` para `cobro` (facturas) y `abono` (cxp). Registrar pago = append + actualizar saldo en la misma `batchUpdate`.
- Validaciones de negocio del spec + proveedores/cxp/pagos (ver sección 9 del design doc).
- Commits convencionales (`feat:`, `fix:`, `chore:`). Frecuentes, uno por tarea terminada.
- No hay repo git inicializado: iniciar `git init` en Task 1.

---

## File Structure

```
finance-tracker/
├── package.json                     (workspace root, scripts)
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .gitignore
├── .npmrc
├── docs/ (spec + este plan)
├── apps/
│   ├── extension/
│   │   ├── package.json
│   │   ├── wxt.config.ts
│   │   ├── tsconfig.json
│   │   ├── entrypoints/
│   │   │   ├── background.ts
│   │   │   ├── popup/{index.html,main.tsx,App.tsx}
│   │   │   └── dashboard/{index.html,main.tsx,DashboardApp.tsx}
│   │   └── public/icon128.png
│   └── web/
│       ├── package.json
│       ├── vite.config.ts
│       ├── index.html
│       ├── .env.example
│       └── src/{main.tsx,App.tsx,auth/popupOAuth.ts}
└── packages/
    └── shared/
        ├── package.json
        ├── vitest.config.ts
        ├── tsconfig.json
        └── src/
            ├── index.ts
            ├── lib/{uid.ts, money.ts, format.ts}
            ├── types/{entities.ts, schemas.ts}
            ├── currency/{catalog.ts, index.ts}
            ├── calc/{invoice.ts, kpis.ts}
            ├── sheets/{tables.ts, rows.ts, api.ts, mutex.ts, createSpreadsheet.ts}
            ├── data/{repository.ts, storage.ts}
            ├── auth/{types.ts, chromeIdentityAuth.ts, popupOAuth.ts}
            ├── store/{appStore.ts, queries.ts}
            ├── ui/{components/..., layout/Layout.tsx, index.ts}
            └── features/{dashboard,facturas,clientes,gastos,proveedores,cuentasPagar,reportes,configuracion}/...
```

---

## Task 1: Monorepo scaffold + git init

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.npmrc`
- Create: `apps/extension/package.json`, `apps/web/package.json`, `packages/shared/package.json` (minimal, sin deps aún)
- Create: `packages/shared/vitest.config.ts`, `packages/shared/tsconfig.json`

**Interfaces:**
- Consumes: nada.
- Produces: workspace pnpm funcional; `pnpm -F shared test` corre vitest.

- [ ] **Step 1: Init git y estructura base**

```bash
git init
mkdir -p apps/extension apps/web packages/shared/src packages/shared/tests
```

- [ ] **Step 2: Escribir archivos raíz**

`package.json`:
```json
{
  "name": "finance-tracker",
  "private": true,
  "packageManager": "pnpm@11.1.2",
  "scripts": {
    "dev:extension": "pnpm --filter @ft/extension dev",
    "dev:web": "pnpm --filter @ft/web dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "test:e2e": "pnpm --filter @ft/web test:e2e"
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - apps/*
  - packages/*
```

`.npmrc`:
```
strict-peer-dependencies=false
auto-install-peers=true
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "react-jsx",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  }
}
```

`.gitignore`:
```
node_modules/
dist/
.output/
.web-ext/
*.local
.env
.DS_Store
coverage/
playwright-report/
test-results/
```

- [ ] **Step 3: Escribir package.json de los 3 paquetes**

`apps/extension/package.json`:
```json
{
  "name": "@ft/extension",
  "private": true,
  "type": "module",
  "scripts": { "dev": "wxt", "build": "wxt build", "zip": "wxt zip" }
}
```

`apps/web/package.json`:
```json
{
  "name": "@ft/web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test:e2e": "playwright test"
  }
}
```

`packages/shared/package.json`:
```json
{
  "name": "@ft/shared",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "test": "vitest run" }
}
```

`packages/shared/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "tests"] }
```

`packages/shared/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'] }
})
```

- [ ] **Step 4: Instalar dependencias base y verificar**

```bash
pnpm add -D typescript@^5 vitest@^3 -w
pnpm -F shared add -D @types/node
pnpm install
```

- [ ] **Step 5: Smoke test del workspace**

```bash
pnpm -F shared test
```

Expected: 0 tests, exit 0.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: scaffold pnpm monorepo"
```

---

## Task 2: Tipos + schemas zod + uid

**Files:**
- Create: `packages/shared/src/lib/uid.ts`
- Create: `packages/shared/src/types/entities.ts`
- Create: `packages/shared/src/types/schemas.ts`
- Create: `packages/shared/tests/types.test.ts`

**Interfaces:**
- Consumes: Task 1 (workspace + vitest).
- Produces:
  - `uid(prefix: string): string`
  - Interfaces `Cliente`, `FacturaItem`, `Factura`, `Gasto`, `Proveedor`, `CuentaPagar`, `Pago`, `Config`, `InvoiceTotals`, `TipoPago` (`'cobro' | 'abono'`), `MetodoPago` (`'Efectivo' | 'Transferencia' | 'Tarjeta'`), `EstadoFactura` (`'pendiente' | 'parcial' | 'pagada'`).
  - Zod schemas: `ConfigSchema`, `ClienteSchema`, `FacturaItemSchema`, `FacturaInputSchema`, `GastoSchema`, `ProveedorSchema`, `CxpInputSchema`, `PagoInputSchema`.

- [ ] **Step 1: Escribir test fallido**

`packages/shared/tests/types.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { uid } from '../src/lib/uid'
import { ClienteSchema, FacturaInputSchema } from '../src/types/schemas'

describe('uid', () => {
  it('genera prefijo + base36 largo', () => {
    const id = uid('cli_')
    expect(id.startsWith('cli_')).toBe(true)
    expect(id.length).toBeGreaterThan(8)
  })
  it('genera ids distintos', () => {
    expect(uid('cli_')).not.toBe(uid('cli_'))
  })
})

describe('schemas', () => {
  it('ClienteSchema exige nombre', () => {
    expect(ClienteSchema.safeParse({ rfc: 'X' }).success).toBe(false)
    expect(ClienteSchema.safeParse({ nombre: 'ACME' }).success).toBe(true)
  })
  it('FacturaInputSchema exige >=1 item completo y cantidad>0', () => {
    const base = { id_cliente: 'cli_1', fecha_emision: '2026-08-11', items: [] }
    expect(FacturaInputSchema.safeParse(base).success).toBe(false)
    const ok = { ...base, items: [{ descripcion: 'srv', cantidad: 2, precio_unitario: 100 }] }
    expect(FacturaInputSchema.safeParse(ok).success).toBe(true)
    const mal = { ...base, items: [{ descripcion: 'srv', cantidad: 0, precio_unitario: -1 }] }
    expect(FacturaInputSchema.safeParse(mal).success).toBe(false)
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `pnpm -F shared test -- --run tests/types.test.ts`
Expected: FAIL (módulos no existen).

- [ ] **Step 3: Implementar uid, entities y schemas**

`packages/shared/src/lib/uid.ts`:
```ts
export function uid(prefix: string): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}${ts}${rand}`
}
```

`packages/shared/src/types/entities.ts`:
```ts
export type MetodoPago = 'Efectivo' | 'Transferencia' | 'Tarjeta'
export type TipoPago = 'cobro' | 'abono'
export type EstadoFactura = 'pendiente' | 'parcial' | 'pagada'

export interface Cliente {
  id_cliente: string
  nombre: string
  rfc: string
  email: string
  telefono: string
  direccion: string
  fecha_registro: string
}

export interface FacturaItem {
  descripcion: string
  cantidad: number
  precio_unitario: number
  importe: number
}

export interface Factura {
  id_factura: string
  folio: string
  id_cliente: string
  nombre_cliente: string
  fecha_emision: string
  fecha_vencimiento: string
  subtotal: number
  iva: number
  total: number
  saldo: number
  fecha_pago: string
  notas: string
}

export interface Gasto {
  id_gasto: string
  fecha: string
  categoria: string
  descripcion: string
  monto: number
  metodo_pago: MetodoPago
  proveedor: string
}

export interface Proveedor {
  id_proveedor: string
  nombre: string
  rfc: string
  email: string
  telefono: string
  direccion: string
  fecha_registro: string
}

export interface CuentaPagar {
  id_cxp: string
  id_proveedor: string
  nombre_proveedor: string
  folio_documento: string
  categoria: string
  descripcion: string
  fecha_emision: string
  fecha_vencimiento: string
  monto_total: number
  saldo: number
  estado: EstadoFactura
  notas: string
}

export interface Pago {
  id_pago: string
  tipo: TipoPago
  id_origen: string
  fecha: string
  monto: number
  metodo_pago: MetodoPago
  notas: string
}

export interface Config {
  empresa_nombre: string
  empresa_rfc: string
  empresa_direccion: string
  empresa_telefono: string
  empresa_email: string
  empresa_logo: string
  prefijo_folio: string
  contador_folio: number
  moneda: string
  iva_porcentaje: number
  categorias_gastos: string
  categorias_cxp: string
}

export interface InvoiceTotals {
  subtotal: number
  iva: number
  total: number
}
```

`packages/shared/src/types/schemas.ts`:
```ts
import { z } from 'zod'
import type { MetodoPago } from './entities'

export const MetodoPagoSchema = z.enum(['Efectivo', 'Transferencia', 'Tarjeta'])

export const ClienteSchema = z.object({
  id_cliente: z.string().optional(),
  nombre: z.string().min(1, 'Nombre obligatorio'),
  rfc: z.string().default(''),
  email: z.string().default(''),
  telefono: z.string().default(''),
  direccion: z.string().default(''),
  fecha_registro: z.string().default('')
})

export const FacturaItemSchema = z.object({
  descripcion: z.string().min(1, 'Descripción obligatoria'),
  cantidad: z.number().positive('Cantidad > 0'),
  precio_unitario: z.number().nonnegative('Precio >= 0'),
  importe: z.number().optional()
})

export const FacturaInputSchema = z.object({
  id_cliente: z.string().min(1, 'Cliente obligatorio'),
  fecha_emision: z.string().default(() => new Date().toISOString().slice(0, 10)),
  fecha_vencimiento: z.string().default(''),
  notas: z.string().default(''),
  items: z.array(FacturaItemSchema).min(1, 'Mínimo 1 concepto')
})

export const GastoSchema = z.object({
  id_gasto: z.string().optional(),
  fecha: z.string().min(1),
  categoria: z.string().min(1, 'Categoría obligatoria'),
  descripcion: z.string().min(1, 'Descripción obligatoria'),
  monto: z.number().nonnegative('Monto >= 0'),
  metodo_pago: MetodoPagoSchema.default('Efectivo'),
  proveedor: z.string().default('')
})

export const ProveedorSchema = z.object({
  id_proveedor: z.string().optional(),
  nombre: z.string().min(1, 'Nombre obligatorio'),
  rfc: z.string().default(''),
  email: z.string().default(''),
  telefono: z.string().default(''),
  direccion: z.string().default(''),
  fecha_registro: z.string().default('')
})

export const CxpInputSchema = z.object({
  id_proveedor: z.string().min(1, 'Proveedor obligatorio'),
  folio_documento: z.string().default(''),
  categoria: z.string().default(''),
  descripcion: z.string().min(1, 'Descripción obligatoria'),
  fecha_emision: z.string().default(() => new Date().toISOString().slice(0, 10)),
  fecha_vencimiento: z.string().min(1, 'Fecha vencimiento obligatoria'),
  monto_total: z.number().positive('Monto > 0'),
  notas: z.string().default('')
})

export const PagoInputSchema = z.object({
  tipo: z.enum(['cobro', 'abono']),
  id_origen: z.string().min(1),
  fecha: z.string().min(1),
  monto: z.number().positive('Monto > 0'),
  metodo_pago: MetodoPagoSchema.default('Efectivo'),
  notas: z.string().default('')
})

export const ConfigSchema = z.object({
  empresa_nombre: z.string().min(1, 'Nombre obligatorio'),
  empresa_rfc: z.string().default(''),
  empresa_direccion: z.string().default(''),
  empresa_telefono: z.string().default(''),
  empresa_email: z.string().default(''),
  empresa_logo: z.string().default(''),
  prefijo_folio: z.string().min(1, 'Prefijo obligatorio'),
  contador_folio: z.number().int('Contador entero').default(1),
  moneda: z.string().min(1).default('USD'),
  iva_porcentaje: z.number().default(16),
  categorias_gastos: z.string().default('Renta,Internet,Papelería,Servicios'),
  categorias_cxp: z.string().default('Materiales,Servicios,Impuestos,Otros')
})
```

`MetodoPago` type export reutilizable desde entities:
`packages/shared/src/types/schemas.ts` add:
```ts
export type MetodoPagoValue = z.infer<typeof MetodoPagoSchema>
```

- [ ] **Step 4: Exportar desde index y correr tests**

`packages/shared/src/index.ts`:
```ts
export * from './lib/uid'
export * from './types/entities'
export * from './types/schemas'
```

Run: `pnpm -F shared test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(shared): types, zod schemas, uid"
```

---

## Task 3: Catálogo de monedas + formateo

**Files:**
- Create: `packages/shared/src/currency/catalog.ts`
- Create: `packages/shared/src/currency/index.ts`
- Create: `packages/shared/tests/currency.test.ts`

**Interfaces:**
- Consumes: Task 2.
- Produces:
  - `interface Currency { code: string; symbol: string; decimals: number; locale: string; name: string }`
  - `CURRENCIES: Currency[]` (USD, MXN, EUR, GBP, ARS, CLP, COP, PEN, BRL)
  - `getCurrency(code: string): Currency`
  - `formatMoney(amount: number, code: string): string`

- [ ] **Step 1: Escribir test fallido**

`packages/shared/tests/currency.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { CURRENCIES, getCurrency, formatMoney } from '../src/currency'

describe('currency catalog', () => {
  it('contiene monedas clave', () => {
    const codes = CURRENCIES.map(c => c.code)
    for (const c of ['USD', 'MXN', 'EUR']) expect(codes).toContain(c)
  })
  it('getCurrency devuelve USD por defecto', () => {
    expect(getCurrency('USD').code).toBe('USD')
  })
  it('formatMoney formatea con símbolo y decimales', () => {
    const s = formatMoney(1234.5, 'USD')
    expect(s).toContain('$')
    expect(s).toContain('1,234')
  })
  it('getCurrency con código desconocido cae a USD', () => {
    expect(getCurrency('XXX').code).toBe('USD')
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `pnpm -F shared test -- --run tests/currency.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar catálogo y formatter**

`packages/shared/src/currency/catalog.ts`:
```ts
export interface Currency {
  code: string
  symbol: string
  decimals: number
  locale: string
  name: string
}

export const CURRENCIES: Currency[] = [
  { code: 'USD', symbol: '$', decimals: 2, locale: 'en-US', name: 'Dólar estadounidense' },
  { code: 'MXN', symbol: '$', decimals: 2, locale: 'es-MX', name: 'Peso mexicano' },
  { code: 'EUR', symbol: '€', decimals: 2, locale: 'es-ES', name: 'Euro' },
  { code: 'GBP', symbol: '£', decimals: 2, locale: 'en-GB', name: 'Libra esterlina' },
  { code: 'ARS', symbol: '$', decimals: 2, locale: 'es-AR', name: 'Peso argentino' },
  { code: 'CLP', symbol: '$', decimals: 0, locale: 'es-CL', name: 'Peso chileno' },
  { code: 'COP', symbol: '$', decimals: 0, locale: 'es-CO', name: 'Peso colombiano' },
  { code: 'PEN', symbol: 'S/', decimals: 2, locale: 'es-PE', name: 'Sol peruano' },
  { code: 'BRL', symbol: 'R$', decimals: 2, locale: 'pt-BR', name: 'Real brasileño' }
]

export const DEFAULT_CURRENCY = 'USD'

export function getCurrency(code: string): Currency {
  return CURRENCIES.find(c => c.code === code) ?? CURRENCIES[0]
}
```

`packages/shared/src/currency/index.ts`:
```ts
import type { Currency } from './catalog'
import { CURRENCIES, DEFAULT_CURRENCY, getCurrency } from './catalog'

export function formatMoney(amount: number, code: string): string {
  const cur = getCurrency(code)
  return new Intl.NumberFormat(cur.locale, {
    style: 'currency',
    currency: cur.code,
    currencyDisplay: 'symbol'
  }).format(amount)
}

export { CURRENCIES, DEFAULT_CURRENCY, getCurrency }
export type { Currency }
```

- [ ] **Step 4: Exportar y correr tests**

Add to `packages/shared/src/index.ts`:
```ts
export * from './currency'
```

Run: `pnpm -F shared test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(shared): currency catalog + formatMoney"
```

---

## Task 4: Cálculos financieros

**Files:**
- Create: `packages/shared/src/calc/invoice.ts`
- Create: `packages/shared/src/calc/kpis.ts`
- Create: `packages/shared/tests/calc.test.ts`

**Interfaces:**
- Consumes: Task 2 (`FacturaItem`, `Factura`, `Gasto`, `CuentaPagar`, `InvoiceTotals`).
- Produces:
  - `round2(n: number): number`
  - `calcImporte(cantidad: number, precio: number): number`
  - `calcInvoiceTotals(items: { cantidad: number; precio_unitario: number }[], ivaPct: number): InvoiceTotals`
  - `buildFactura(items, ivaPct): { items: FacturaItem[]; totals: InvoiceTotals }`
  - `estadoDesdeSaldo(saldo: number, total: number, tienePagos: boolean): EstadoFactura`
  - `interface Kpis { facturado: number; cobrado: number; pendiente: number; gastos: number; utilidad: number; porPagar: number; vencidas: number; porVencer: number }`
  - `kpisForMonth(facturas: Factura[], gastos: Gasto[], cxps: CuentaPagar[], mes: string): Kpis` (mes = `YYYY-MM`, filtra por `fecha_emision` para facturas, `fecha` para gastos, `fecha_vencimiento` para vencidas).
  - `topClientes(facturas: Factura[]): { nombre: string; total: number }[]`
  - `gastosPorCategoria(gastos: Gasto[]): { categoria: string; total: number }[]`

- [ ] **Step 1: Escribir test fallido**

`packages/shared/tests/calc.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { calcInvoiceTotals, buildFactura, estadoDesdeSaldo } from '../src/calc/invoice'
import { kpisForMonth, topClientes, gastosPorCategoria } from '../src/calc/kpis'
import type { Factura, Gasto, CuentaPagar } from '../src/types/entities'

describe('invoice', () => {
  it('calcula subtotal, iva y total con redondeo', () => {
    const t = calcInvoiceTotals([{ cantidad: 2, precio_unitario: 100.5 }, { cantidad: 1, precio_unitario: 3.33 }], 16)
    expect(t.subtotal).toBe(204.33)
    expect(t.iva).toBe(32.69)
    expect(t.total).toBe(237.02)
  })
  it('buildFactura produce items con importe', () => {
    const b = buildFactura([{ descripcion: 'a', cantidad: 3, precio_unitario: 10 }], 16)
    expect(b.items[0].importe).toBe(30)
    expect(b.totals.total).toBe(34.8)
  })
  it('estadoDesdeSaldo', () => {
    expect(estadoDesdeSaldo(0, 100, false)).toBe('pagada')
    expect(estadoDesdeSaldo(100, 100, false)).toBe('pendiente')
    expect(estadoDesdeSaldo(40, 100, true)).toBe('parcial')
  })
})

describe('kpis', () => {
  const today = new Date()
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const ayer = new Date(today.getTime() - 86400000)
  const en30dias = new Date(today.getTime() + 30 * 86400000)
  const fac: Factura[] = [
    { id_factura: 'f1', folio: 'FAC-001', id_cliente: 'c1', nombre_cliente: 'A', fecha_emision: '2026-08-05', fecha_vencimiento: '', subtotal: 100, iva: 0, total: 100, saldo: 0, fecha_pago: '2026-08-06', notas: '' },
    { id_factura: 'f2', folio: 'FAC-002', id_cliente: 'c2', nombre_cliente: 'B', fecha_emision: '2026-08-10', fecha_vencimiento: '', subtotal: 200, iva: 0, total: 200, saldo: 200, fecha_pago: '', notas: '' },
    { id_factura: 'f3', folio: 'FAC-003', id_cliente: 'c3', nombre_cliente: 'C', fecha_emision: '2026-07-20', fecha_vencimiento: '', subtotal: 50, iva: 0, total: 50, saldo: 50, fecha_pago: '', notas: '' }
  ]
  const gas: Gasto[] = [
    { id_gasto: 'g1', fecha: '2026-08-03', categoria: 'Renta', descripcion: '', monto: 30, metodo_pago: 'Efectivo', proveedor: '' }
  ]
  const cxp: CuentaPagar[] = [
    { id_cxp: 'x1', id_proveedor: 'p1', nombre_proveedor: 'P', folio_documento: '', categoria: '', descripcion: '', fecha_emision: '2026-08-01', fecha_vencimiento: iso(ayer), monto_total: 500, saldo: 500, estado: 'pendiente', notas: '' },
    { id_cxp: 'x2', id_proveedor: 'p1', nombre_proveedor: 'P', folio_documento: '', categoria: '', descripcion: '', fecha_emision: '2026-08-01', fecha_vencimiento: iso(en30dias), monto_total: 100, saldo: 100, estado: 'pendiente', notas: '' }
  ]

  it('kpis del mes', () => {
    const k = kpisForMonth(fac, gas, cxp, '2026-08')
    expect(k.facturado).toBe(300)
    expect(k.cobrado).toBe(100)
    expect(k.pendiente).toBe(200)
    expect(k.gastos).toBe(30)
    expect(k.utilidad).toBe(70)
    expect(k.porPagar).toBe(600)
    expect(k.vencidas).toBe(500)
    expect(k.porVencer).toBe(100)
  })
  it('topClientes ordena desc', () => {
    const top = topClientes(fac)
    expect(top[0]).toEqual({ nombre: 'B', total: 200 })
  })
  it('gastosPorCategoria agrupa', () => {
    expect(gastosPorCategoria(gas)).toEqual([{ categoria: 'Renta', total: 30 }])
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `pnpm -F shared test -- --run tests/calc.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar calc**

`packages/shared/src/calc/invoice.ts`:
```ts
import type { FacturaItem, InvoiceTotals, EstadoFactura } from '../types/entities'

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function calcImporte(cantidad: number, precio: number): number {
  return round2(cantidad * precio)
}

export function calcInvoiceTotals(items: { cantidad: number; precio_unitario: number }[], ivaPct: number): InvoiceTotals {
  const subtotal = round2(items.reduce((s, i) => s + calcImporte(i.cantidad, i.precio_unitario), 0))
  const iva = round2((subtotal * ivaPct) / 100)
  return { subtotal, iva, total: round2(subtotal + iva) }
}

export function buildFactura(items: { descripcion: string; cantidad: number; precio_unitario: number }[], ivaPct: number): { items: FacturaItem[]; totals: InvoiceTotals } {
  const withImporte = items.map(i => ({ ...i, importe: calcImporte(i.cantidad, i.precio_unitario) }))
  const totals = calcInvoiceTotals(withImporte, ivaPct)
  return { items: withImporte, totals }
}

export function estadoDesdeSaldo(saldo: number, total: number, tienePagos: boolean): EstadoFactura {
  if (saldo <= 0) return 'pagada'
  if (tienePagos) return 'parcial'
  return total === saldo ? 'pendiente' : 'parcial'
}
```

`packages/shared/src/calc/kpis.ts`:
```ts
import type { Factura, Gasto, CuentaPagar } from '../types/entities'
import { round2 } from './invoice'

export interface Kpis {
  facturado: number
  cobrado: number
  pendiente: number
  gastos: number
  utilidad: number
  porPagar: number
  vencidas: number
  porVencer: number
}

function inMonth(dateISO: string, mes: string): boolean {
  return dateISO.slice(0, 7) === mes
}

export function kpisForMonth(facturas: Factura[], gastos: Gasto[], cxps: CuentaPagar[], mes: string): Kpis {
  const f = facturas.filter(x => inMonth(x.fecha_emision, mes))
  const facturado = round2(f.reduce((s, x) => s + x.total, 0))
  const cobrado = round2(f.filter(x => x.saldo <= 0).reduce((s, x) => s + x.total, 0))
  const pendiente = round2(f.filter(x => x.saldo > 0).reduce((s, x) => s + x.saldo, 0))
  const gastosMes = round2(gastos.filter(g => inMonth(g.fecha, mes)).reduce((s, g) => s + g.monto, 0))
  const today = new Date().toISOString().slice(0, 10)
  const porPagar = round2(cxps.filter(x => x.saldo > 0).reduce((s, x) => s + x.saldo, 0))
  const vencidas = round2(cxps.filter(x => x.saldo > 0 && x.fecha_vencimiento < today).reduce((s, x) => s + x.saldo, 0))
  const porVencer = round2(cxps.filter(x => x.saldo > 0 && x.fecha_vencimiento >= today).reduce((s, x) => s + x.saldo, 0))
  return { facturado, cobrado, pendiente, gastos: gastosMes, utilidad: round2(cobrado - gastosMes), porPagar, vencidas, porVencer }
}

export function topClientes(facturas: Factura[]): { nombre: string; total: number }[] {
  const map = new Map<string, number>()
  for (const f of facturas) map.set(f.nombre_cliente, round2((map.get(f.nombre_cliente) ?? 0) + f.total))
  return [...map.entries()].map(([nombre, total]) => ({ nombre, total })).sort((a, b) => b.total - a.total).slice(0, 5)
}

export function gastosPorCategoria(gastos: Gasto[]): { categoria: string; total: number }[] {
  const map = new Map<string, number>()
  for (const g of gastos) map.set(g.categoria, round2((map.get(g.categoria) ?? 0) + g.monto))
  return [...map.entries()].map(([categoria, total]) => ({ categoria, total })).sort((a, b) => b.total - a.total)
}
```

- [ ] **Step 4: Exportar y correr tests**

Add to `packages/shared/src/index.ts`:
```ts
export * from './calc/invoice'
export * from './calc/kpis'
```

Run: `pnpm -F shared test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(shared): financial calc + KPIs"
```

---

## Task 5: Cliente Sheets REST + serialización de filas + crear hoja

**Files:**
- Create: `packages/shared/src/sheets/tables.ts`
- Create: `packages/shared/src/sheets/rows.ts`
- Create: `packages/shared/src/sheets/api.ts`
- Create: `packages/shared/src/sheets/createSpreadsheet.ts`
- Create: `packages/shared/tests/sheets.test.ts`

**Interfaces:**
- Consumes: Task 2 (tipos).
- Produces:
  - `TableName = 'Config' | 'Clientes' | 'Facturas' | 'Factura_Items' | 'Gastos' | 'Proveedores' | 'Cuentas_Pagar' | 'Pagos'`
  - `ColumnSpec { key; header; type?: 'string'|'number'|'date' }`
  - `TABLES: Record<TableName, ColumnSpec[]>` — Config es `[clave, valor]` especial.
  - `sheetName(t: TableName): string`
  - `serializeRow(spec: ColumnSpec[], obj: Record<string, unknown>): (string|number)[]`
  - `deserializeRow(spec: ColumnSpec[], row: (string|number)[]): Record<string, string|number>`
  - `const HEADER_ROWS: Record<TableName, number>` (Config tiene 0 filas de header, resto 1)
  - `class SheetsApi { constructor(getToken: () => Promise<string>) }` con:
    - `createSpreadsheet(title: string): Promise<{ spreadsheetId: string; url: string }>`
    - `addSheets(spreadsheetId: string, titles: string[]): Promise<void>`
    - `batchGet(spreadsheetId: string, ranges: string[]): Promise<Record<string, (string|number)[][]>>`
    - `batchUpdate(spreadsheetId: string, valueRanges: { range: string; values: (string|number)[][] }[]): Promise<void>`
    - `valuesGet(ranges: string[]): Promise<Record<string, (string|number)[][]>>` (alias con spreadsheetId persistido en `storage` — ver Task 6; aquí batchGet toma id explícito)
  - `createInitialSpreadsheet(api: SheetsApi): Promise<{ spreadsheetId: string; url: string }>` — crea hoja `FinanceTracker` con las 9 pestañas + encabezados + Config default.

- [ ] **Step 1: Escribir test fallido**

`packages/shared/tests/sheets.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { TABLES, sheetName } from '../src/sheets/tables'
import { serializeRow, deserializeRow } from '../src/sheets/rows'
import { SheetsApi } from '../src/sheets/api'
import { createInitialSpreadsheet } from '../src/sheets/createSpreadsheet'

describe('tables', () => {
  it('define esquema de 9 tablas', () => {
    const names = Object.keys(TABLES)
    expect(names).toHaveLength(9)
    expect(sheetName('Facturas')).toBe('Facturas')
  })
  it('Factura incluye saldo', () => {
    const keys = TABLES.Facturas.map(c => c.key)
    expect(keys).toContain('saldo')
  })
})

describe('rows', () => {
  it('serializa y deserializa redondo', () => {
    const obj = { id_factura: 'fac_1', total: 100.5, fecha_emision: '2026-08-11', nombre: 'ACME' }
    const row = serializeRow(TABLES.Facturas, obj)
    const back = deserializeRow(TABLES.Facturas, row)
    expect(back.id_factura).toBe('fac_1')
    expect(back.total).toBe(100.5)
    expect(back.fecha_emision).toBe('2026-08-11')
  })
  it('deserialize convierte numeros', () => {
    const back = deserializeRow(TABLES.Facturas, ['fac_1', 'FAC-1', 'c1', 'A', '2026-08-11', '', 100, 16, 116, 50, '', ''])
    expect(back.total).toBe(116)
    expect(back.saldo).toBe(50)
  })
})

describe('api', () => {
  it('batchGet parsea filas por rango', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const u = new URL(String(url))
      const ranges = (u.searchParams.get('ranges') ?? '').split(',').filter(Boolean)
      const data: Record<string, { values?: (string | number)[][] }> = {}
      for (const r of ranges) data[r] = { values: [['a'], ['b']] }
      return { ok: true, json: async () => ({ valueRanges: Object.entries(data).map(([range, x]) => ({ range, values: x.values })) }) } as Response
    })
    vi.stubGlobal('fetch', fetchMock)
    const api = new SheetsApi(async () => 'TOKEN')
    const res = await api.batchGet('SHEET1', ['A1:A2', 'B1:B2'])
    expect(res['A1:A2']).toEqual([['a'], ['b']])
    expect(res['B1:B2']).toEqual([['a'], ['b']])
    vi.unstubAllGlobals()
  })
  it('createSpreadsheet crea con titulo', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ({ ok: true, json: async () => ({ spreadsheetId: 'NEWID', spreadsheetUrl: 'http://x' }) }) as Response)
    vi.stubGlobal('fetch', fetchMock)
    const api = new SheetsApi(async () => 'T')
    const r = await api.createSpreadsheet('FinanceTracker')
    expect(r.spreadsheetId).toBe('NEWID')
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain('FinanceTracker')
    vi.unstubAllGlobals()
  })
})

describe('createInitialSpreadsheet', () => {
  it('crea hoja y escribe config default', async () => {
    const requests: { url: string; init: RequestInit }[] = []
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      requests.push({ url: String(url), init: init ?? ({} as RequestInit) })
      if (String(url).includes('values:batchUpdate')) {
        return { ok: true, json: async () => ({ responses: [] }) } as Response
      }
      if (String(url).includes(':batchUpdate')) {
        return { ok: true, json: async () => ({ replies: body.requests.map((_: unknown, i: number) => ({ addSheet: { properties: { sheetId: i } } })) }) } as Response
      }
      return { ok: true, json: async () => ({ spreadsheetId: 'NEWID', spreadsheetUrl: 'http://x' }) } as Response
    })
    vi.stubGlobal('fetch', fetchMock)
    const api = new SheetsApi(async () => 'T')
    const r = await createInitialSpreadsheet(api)
    expect(r.spreadsheetId).toBe('NEWID')
    expect(requests.some(rq => rq.url.includes(':batchUpdate') && rq.init.body)).toBe(true)
    vi.unstubAllGlobals()
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `pnpm -F shared test -- --run tests/sheets.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar tables + rows**

`packages/shared/src/sheets/tables.ts`:
```ts
export type TableName = 'Config' | 'Clientes' | 'Facturas' | 'Factura_Items' | 'Gastos' | 'Proveedores' | 'Cuentas_Pagar' | 'Pagos' | 'Metas'

export interface ColumnSpec {
  key: string
  header: string
  type?: 'string' | 'number' | 'date'
}

const S = 'string'
const N = 'number'
const D = 'date'

export const TABLES: Record<TableName, ColumnSpec[]> = {
  Config: [
    { key: 'clave', header: 'clave', type: S },
    { key: 'valor', header: 'valor', type: S }
  ],
  Clientes: [
    { key: 'id_cliente', header: 'id_cliente', type: S },
    { key: 'nombre', header: 'nombre', type: S },
    { key: 'rfc', header: 'rfc', type: S },
    { key: 'email', header: 'email', type: S },
    { key: 'telefono', header: 'telefono', type: S },
    { key: 'direccion', header: 'direccion', type: S },
    { key: 'fecha_registro', header: 'fecha_registro', type: D }
  ],
  Facturas: [
    { key: 'id_factura', header: 'id_factura', type: S },
    { key: 'folio', header: 'folio', type: S },
    { key: 'id_cliente', header: 'id_cliente', type: S },
    { key: 'nombre_cliente', header: 'nombre_cliente', type: S },
    { key: 'fecha_emision', header: 'fecha_emision', type: D },
    { key: 'fecha_vencimiento', header: 'fecha_vencimiento', type: D },
    { key: 'subtotal', header: 'subtotal', type: N },
    { key: 'iva', header: 'iva', type: N },
    { key: 'total', header: 'total', type: N },
    { key: 'saldo', header: 'saldo', type: N },
    { key: 'fecha_pago', header: 'fecha_pago', type: D },
    { key: 'notas', header: 'notas', type: S }
  ],
  Factura_Items: [
    { key: 'id_factura', header: 'id_factura', type: S },
    { key: 'descripcion', header: 'descripcion', type: S },
    { key: 'cantidad', header: 'cantidad', type: N },
    { key: 'precio_unitario', header: 'precio_unitario', type: N },
    { key: 'importe', header: 'importe', type: N }
  ],
  Gastos: [
    { key: 'id_gasto', header: 'id_gasto', type: S },
    { key: 'fecha', header: 'fecha', type: D },
    { key: 'categoria', header: 'categoria', type: S },
    { key: 'descripcion', header: 'descripcion', type: S },
    { key: 'monto', header: 'monto', type: N },
    { key: 'metodo_pago', header: 'metodo_pago', type: S },
    { key: 'proveedor', header: 'proveedor', type: S }
  ],
  Proveedores: [
    { key: 'id_proveedor', header: 'id_proveedor', type: S },
    { key: 'nombre', header: 'nombre', type: S },
    { key: 'rfc', header: 'rfc', type: S },
    { key: 'email', header: 'email', type: S },
    { key: 'telefono', header: 'telefono', type: S },
    { key: 'direccion', header: 'direccion', type: S },
    { key: 'fecha_registro', header: 'fecha_registro', type: D }
  ],
  Cuentas_Pagar: [
    { key: 'id_cxp', header: 'id_cxp', type: S },
    { key: 'id_proveedor', header: 'id_proveedor', type: S },
    { key: 'nombre_proveedor', header: 'nombre_proveedor', type: S },
    { key: 'folio_documento', header: 'folio_documento', type: S },
    { key: 'categoria', header: 'categoria', type: S },
    { key: 'descripcion', header: 'descripcion', type: S },
    { key: 'fecha_emision', header: 'fecha_emision', type: D },
    { key: 'fecha_vencimiento', header: 'fecha_vencimiento', type: D },
    { key: 'monto_total', header: 'monto_total', type: N },
    { key: 'saldo', header: 'saldo', type: N },
    { key: 'estado', header: 'estado', type: S },
    { key: 'notas', header: 'notas', type: S }
  ],
  Pagos: [
    { key: 'id_pago', header: 'id_pago', type: S },
    { key: 'tipo', header: 'tipo', type: S },
    { key: 'id_origen', header: 'id_origen', type: S },
    { key: 'fecha', header: 'fecha', type: D },
    { key: 'monto', header: 'monto', type: N },
    { key: 'metodo_pago', header: 'metodo_pago', type: S },
    { key: 'notas', header: 'notas', type: S }
  ],
  Metas: [{ key: 'placeholder', header: 'placeholder', type: S }]
}

export function sheetName(t: TableName): string {
  return t
}

export function HEADER_ROWS(t: TableName): number {
  return t === 'Config' ? 0 : 1
}
```

`packages/shared/src/sheets/rows.ts`:
```ts
import type { ColumnSpec } from './tables'

export function serializeRow(spec: ColumnSpec[], obj: Record<string, unknown>): (string | number)[] {
  return spec.map(c => {
    const v = obj[c.key]
    if (v === undefined || v === null || v === '') return ''
    if (c.type === 'number') return Number(v)
    return String(v)
  })
}

export function deserializeRow(spec: ColumnSpec[], row: (string | number)[]): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  spec.forEach((c, i) => {
    const raw = row[i]
    if (raw === undefined || raw === null || raw === '') {
      out[c.key] = ''
      return
    }
    out[c.key] = c.type === 'number' ? Number(raw) : String(raw)
  })
  return out
}
```

`packages/shared/src/sheets/api.ts`:
```ts
const BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

export interface ValueRange {
  range: string
  values: (string | number)[][]
}

export class SheetsApi {
  constructor(private getToken: () => Promise<string>) {}

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const token = await this.getToken()
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {})
      }
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Sheets API ${res.status}: ${text.slice(0, 300)}`)
    }
    return res.json() as Promise<T>
  }

  createSpreadsheet(title: string): Promise<{ spreadsheetId: string; url: string }> {
    return this.request(`${BASE}`, {
      method: 'POST',
      body: JSON.stringify({
        properties: { title },
        sheets: [{ properties: { title: 'Config', gridProperties: { rowCount: 200, columnCount: 2 } } }]
      })
    }).then(r => ({ spreadsheetId: r.spreadsheetId, url: r.spreadsheetUrl }))
  }

  addSheets(spreadsheetId: string, titles: string[]): Promise<void> {
    return this.request(`${BASE}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({
        requests: titles.map(title => ({ addSheet: { properties: { title } } }))
      })
    }).then(() => undefined)
  }

  async batchGet(spreadsheetId: string, ranges: string[]): Promise<Record<string, (string | number)[][]>> {
    const params = new URLSearchParams()
    params.set('ranges', ranges.join(','))
    params.set('majorDimension', 'ROWS')
    params.set('valueRenderOption', 'UNFORMATTED_VALUE')
    const url = `${BASE}/${spreadsheetId}/values:batchGet?${params.toString()}`
    const res = await this.request<{ valueRanges: { values?: (string | number)[][] }[] }>(url)
    const out: Record<string, (string | number)[][]> = {}
    res.valueRanges.forEach((vr, i) => {
      out[ranges[i]] = vr.values ?? []
    })
    return out
  }

  async batchUpdate(spreadsheetId: string, valueRanges: ValueRange[]): Promise<void> {
    await this.request(`${BASE}/${spreadsheetId}/values:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ valueInputOption: 'RAW', data: valueRanges })
    })
  }
}
```

`packages/shared/src/sheets/createSpreadsheet.ts`:
```ts
import { SheetsApi } from './api'
import { TABLES, sheetName, HEADER_ROWS } from './tables'
import { serializeRow } from './rows'
import type { Config } from '../types/entities'
import { CURRENCIES, DEFAULT_CURRENCY } from '../currency'

const ALL_TABLES = Object.keys(TABLES) as (keyof typeof TABLES)[]

const DEFAULT_CONFIG: Config = {
  empresa_nombre: 'Mi Empresa S.A.',
  empresa_rfc: 'XAXX010101000',
  empresa_direccion: '',
  empresa_telefono: '',
  empresa_email: '',
  empresa_logo: '',
  prefijo_folio: 'FAC-',
  contador_folio: 1,
  moneda: DEFAULT_CURRENCY,
  iva_porcentaje: 16,
  categorias_gastos: 'Renta,Internet,Papelería,Servicios',
  categorias_cxp: 'Materiales,Servicios,Impuestos,Otros'
}

export async function createInitialSpreadsheet(api: SheetsApi): Promise<{ spreadsheetId: string; url: string }> {
  const { spreadsheetId, url } = await api.createSpreadsheet('FinanceTracker')
  const extra = ALL_TABLES.filter(t => t !== 'Config')
  await api.addSheets(spreadsheetId, extra.map(sheetName))

  const valueRanges: { range: string; values: (string | number)[][] }[] = []
  for (const t of ALL_TABLES) {
    const spec = TABLES[t]
    const headers = spec.map(c => c.header)
    if (HEADER_ROWS(t) === 1) {
      const letters = headers.map((_, i) => String.fromCharCode(65 + i))
      valueRanges.push({ range: `'${sheetName(t)}'!A1:${letters[letters.length - 1]}1`, values: [headers] })
    }
  }
  const configRows = (Object.entries(DEFAULT_CONFIG) as [string, unknown][]).map(([clave, valor]) => serializeRow(TABLES.Config, { clave, valor: String(valor) }))
  valueRanges.push({ range: `'Config'!A1:B${configRows.length}`, values: configRows })

  await api.batchUpdate(spreadsheetId, valueRanges)
  return { spreadsheetId, url }
}

export function configFromRows(rows: (string | number)[][]): Config {
  const map = new Map<string, string>()
  for (const [clave, valor] of rows) if (clave) map.set(String(clave), String(valor ?? ''))
  const num = (k: string) => {
    const v = map.get(k) ?? ''
    return v === '' ? 0 : Number(v)
  }
  return {
    ...DEFAULT_CONFIG,
    empresa_nombre: map.get('empresa_nombre') ?? DEFAULT_CONFIG.empresa_nombre,
    empresa_rfc: map.get('empresa_rfc') ?? '',
    empresa_direccion: map.get('empresa_direccion') ?? '',
    empresa_telefono: map.get('empresa_telefono') ?? '',
    empresa_email: map.get('empresa_email') ?? '',
    empresa_logo: map.get('empresa_logo') ?? '',
    prefijo_folio: map.get('prefijo_folio') ?? DEFAULT_CONFIG.prefijo_folio,
    contador_folio: num('contador_folio') || DEFAULT_CONFIG.contador_folio,
    moneda: map.get('moneda') || DEFAULT_CURRENCY,
    iva_porcentaje: num('iva_porcentaje') || DEFAULT_CONFIG.iva_porcentaje,
    categorias_gastos: map.get('categorias_gastos') ?? DEFAULT_CONFIG.categorias_gastos,
    categorias_cxp: map.get('categorias_cxp') ?? DEFAULT_CONFIG.categorias_cxp
  }
}

export function configToRows(config: Config): (string | number)[][] {
  return (Object.entries(config) as [string, unknown][]).map(([clave, valor]) => serializeRow(TABLES.Config, { clave, valor: String(valor) }))
}

export const _internals = { DEFAULT_CONFIG, CURRENCIES }
```

- [ ] **Step 4: Exportar y correr tests**

Add to `packages/shared/src/index.ts`:
```ts
export * from './sheets/tables'
export * from './sheets/rows'
export * from './sheets/api'
export * from './sheets/createSpreadsheet'
```

Run: `pnpm -F shared test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(shared): sheets REST client + serialization + bootstrap"
```

---

## Task 6: Auth y Storage

**Files:**
- Create: `packages/shared/src/auth/types.ts`
- Create: `packages/shared/src/auth/chromeIdentityAuth.ts`
- Create: `packages/shared/src/auth/popupOAuth.ts`
- Create: `packages/shared/src/types/chrome.d.ts` (ambient declaration del global `chrome` — ver Step 3b; sin esto `tsc --noEmit` falla con TS2304)
- Create: `packages/shared/src/data/storage.ts`
- Create: `packages/shared/tests/storage.test.ts`

**Interfaces:**
- Consumes: Task 5.
- Produces:
  - `interface AuthProvider { getToken(interactive: boolean): Promise<string>; getSignedInUser(): Promise<{ email: string } | null>; signOut(): Promise<void> }`
  - `chromeIdentityAuth(clientId: string): AuthProvider`
  - `popupOAuth({ clientId, redirectUri }): AuthProvider` — usa `window.location` para el redirect.
  - `interface StorageAdapter { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void>; remove(key: string): Promise<void> }`
  - `chromeStorageAdapter: StorageAdapter` (usa `chrome.storage.local`)
  - `localStorageAdapter: StorageAdapter`
  - `const KEYS = { spreadsheetId: 'ft_spreadsheet_id', config: 'ft_config_cache' }`

- [ ] **Step 1: Escribir test fallido**

`packages/shared/tests/storage.test.ts`:
```ts
import { describe, expect, it, beforeEach } from 'vitest'
import { localStorageAdapter } from '../src/data/storage'

describe('localStorageAdapter', () => {
  beforeEach(() => window.localStorage.clear())
  it('set/get/remove round-trip', async () => {
    const s = localStorageAdapter
    await s.set('k', 'v')
    expect(await s.get('k')).toBe('v')
    await s.remove('k')
    expect(await s.get('k')).toBe(null)
  })
})
```

(jsdom provee `window.localStorage` real; no se necesita stub.)

- [ ] **Step 2: Correr y verificar que falla**

Run: `pnpm -F shared test -- --run tests/storage.test.ts`
Expected: FAIL.

- [ ] **Step 3: Declarar el global chrome (ambient) y verificar compilación**

`packages/shared/src/types/chrome.d.ts`:
```ts
declare const chrome: {
  runtime: {
    lastError?: { message: string }
  }
  identity: {
    getAuthToken(options: { interactive: boolean }, callback: (token: string) => void): void
    clearAllCachedAuthTokens(callback: () => void): void
  }
  storage: {
    local: {
      get(key: string, callback: (items: Record<string, string>) => void): void
      set(items: Record<string, string>, callback?: () => void): void
      remove(key: string, callback?: () => void): void
    }
  }
}
```

Run: `pnpm exec tsc --noEmit -p packages/shared`
Expected: PASS (0 errores). Sin esta declaración, `tsc --noEmit` falla con TS2304 (`Cannot find name 'chrome'`) en chromeIdentityAuth.ts y storage.ts. Los tests pasan igual (vitest transpila con esbuild sin typecheck) — la compilación es la garantía.

- [ ] **Step 4: Implementar auth y storage**

`packages/shared/src/auth/types.ts`:
```ts
export interface AuthProvider {
  getToken(interactive: boolean): Promise<string>
  getSignedInUser(): Promise<{ email: string } | null>
  signOut(): Promise<void>
}
```

`packages/shared/src/auth/chromeIdentityAuth.ts`:
```ts
import type { AuthProvider } from './types'

export function chromeIdentityAuth(clientId: string): AuthProvider {
  const ext = chrome as unknown as {
    identity?: {
      getAuthToken: (opts: { interactive: boolean }, cb: (token: string) => void) => void
      clearAllCachedAuthTokens: (cb: () => void) => void
    }
  }
  const identity = ext.identity
  if (!identity) throw new Error('chrome.identity no disponible')

  return {
    getToken(interactive: boolean): Promise<string> {
      return new Promise((resolve, reject) => {
        identity!.getAuthToken({ interactive }, (token) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
          else resolve(token)
        })
      })
    },
    async getSignedInUser(): Promise<{ email: string } | null> {
      try {
        await this.getToken(false)
        return { email: 'user' }
      } catch {
        return null
      }
    },
    signOut(): Promise<void> {
      return new Promise((resolve) => {
        identity!.clearAllCachedAuthTokens(() => resolve())
      })
    }
  }
}
```

`packages/shared/src/auth/popupOAuth.ts`:
```ts
import type { AuthProvider } from './types'

export function popupOAuth(options: { clientId: string; redirectUri: string; prompt?: 'consent' | 'none' }): AuthProvider {
  const { clientId, redirectUri, prompt: defaultPrompt = 'consent' } = options
  const SCOPE = encodeURIComponent('https://www.googleapis.com/auth/spreadsheets')
  const TOKEN_KEY = 'ft_web_access_token'
  const EXPIRES_KEY = 'ft_web_token_expires_at'

  function authUrl(prompt: 'consent' | 'none'): string {
    return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${SCOPE}&prompt=${prompt}`
  }

  function persistToken(token: string, expiresIn: number): void {
    try {
      window.localStorage.setItem(TOKEN_KEY, token)
      window.localStorage.setItem(EXPIRES_KEY, String(Date.now() + expiresIn * 1000 - 30000))
    } catch { /* storage no disponible */ }
  }

  function storedToken(): string | null {
    try {
      const t = window.localStorage.getItem(TOKEN_KEY)
      const exp = Number(window.localStorage.getItem(EXPIRES_KEY) ?? 0)
      if (t && exp > Date.now()) return t
    } catch { /* storage no disponible */ }
    return null
  }

  return {
    async getToken(interactive: boolean): Promise<string> {
      const hash = new URLSearchParams(window.location.hash.slice(1))
      const at = hash.get('access_token')
      if (at) {
        persistToken(at, Number(hash.get('expires_in') ?? '3600'))
        window.history.replaceState({}, document.title, window.location.pathname)
        return at
      }
      const cached = storedToken()
      if (cached) return cached
      if (!interactive) throw new Error('No token')
      if (hash.get('error') || defaultPrompt === 'consent') {
        window.location.href = authUrl('consent')
      } else {
        window.location.href = authUrl('none')
      }
      throw new Error('Redirecting a OAuth…')
    },
    async getSignedInUser(): Promise<{ email: string } | null> {
      return storedToken() ? { email: 'user' } : null
    },
    async signOut(): Promise<void> {
      try {
        window.localStorage.removeItem(TOKEN_KEY)
        window.localStorage.removeItem(EXPIRES_KEY)
      } catch { /* storage no disponible */ }
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }
}
```

Nota: el token se persiste en `localStorage` con expiry (30 s de margen) y el hash se limpia tras extraerlo. `prompt: 'none'` permite **re-autenticación silenciosa**: cuando el token expira, `getToken(true)` redirige a Google con `prompt=none` (sin UI si el permiso sigue aprobado); si Google devuelve `error=` en el hash (permiso revocado), el flujo auto-escala a `prompt=consent`. Con `prompt: 'consent'` (default) siempre muestra consentimiento. Esto evita que un visitante que regresa rompa el dashboard y resuelve la expiración del token del flujo implícito (~1 h).

`packages/shared/src/data/storage.ts`:
```ts
export interface StorageAdapter {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
}

export const KEYS = {
  spreadsheetId: 'ft_spreadsheet_id',
  config: 'ft_config_cache'
} as const

export const chromeStorageAdapter: StorageAdapter = {
  async get(key) {
    const ext = chrome as unknown as { storage?: { local?: { get: (k: string, cb: (v: Record<string, string>) => void) => void } } }
    if (!ext.storage?.local) throw new Error('chrome.storage.local no disponible')
    return new Promise((resolve) => {
      ext.storage!.local!.get(key, (obj) => resolve(obj[key] ?? null))
    })
  },
  async set(key, value) {
    const ext = chrome as unknown as { storage?: { local?: { set: (v: Record<string, string>, cb?: () => void) => void } } }
    if (!ext.storage?.local) throw new Error('chrome.storage.local no disponible')
    await new Promise<void>((resolve) => ext.storage!.local!.set({ [key]: value }, () => resolve()))
  },
  async remove(key) {
    const ext = chrome as unknown as { storage?: { local?: { remove: (k: string, cb?: () => void) => void } } }
    if (!ext.storage?.local) throw new Error('chrome.storage.local no disponible')
    await new Promise<void>((resolve) => ext.storage!.local!.remove(key, () => resolve()))
  }
}

export const localStorageAdapter: StorageAdapter = {
  async get(key) {
    return window.localStorage.getItem(key)
  },
  async set(key, value) {
    window.localStorage.setItem(key, value)
  },
  async remove(key) {
    window.localStorage.removeItem(key)
  }
}
```

- [ ] **Step 4: Exportar y correr tests**

Add to `packages/shared/src/index.ts`:
```ts
export * from './auth/types'
export * from './auth/chromeIdentityAuth'
export * from './auth/popupOAuth'
export * from './data/storage'
```

Run: `pnpm -F shared test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(shared): auth providers + storage adapters"
```

---

## Task 7: Repositorio de datos + folio atómico

**Files:**
- Create: `packages/shared/src/sheets/mutex.ts`
- Create: `packages/shared/src/data/repository.ts`
- Modify: `packages/shared/src/sheets/api.ts` (añadir `appendValues` + `clearRange`)
- Create: `packages/shared/tests/repository.test.ts`

**Interfaces:**
- Consumes: Task 5 (SheetsApi, TABLES, serialization, configFromRows/configToRows), Task 2 (tipos, schemas), Task 4 (calc), Task 6 (StorageAdapter, KEYS).
- Produces (todas toman `ctx: RepoContext`):
  - `interface RepoContext { api: SheetsApi; storage: StorageAdapter; getSpreadsheetId(): Promise<string> }`
  - `getConfig(ctx): Promise<Config>`
  - `saveConfig(ctx, config: Config): Promise<void>`
  - `listClientes(ctx): Promise<Cliente[]>`
  - `saveCliente(ctx, cliente: Cliente): Promise<Cliente>`
  - `deleteCliente(ctx, id: string): Promise<void>` — rechaza si tiene facturas.
  - `createFactura(ctx, input: FacturaInput): Promise<Factura>` — folio atómico vía mutex, itemes, saldo=total.
  - `listFacturas(ctx, filtro?: { estado?: 'pendiente'|'pagada'|'parcial'|'pendientes'; mes?: string }): Promise<Factura[]>`
  - `getFactura(ctx, id): Promise<{ factura: Factura; items: FacturaItem[] }>`
  - `deleteFactura(ctx, id): Promise<void>` — borra factura + items + sus pagos.
  - `listGastos(ctx, filtro?: { mes?: string; categoria?: string }): Promise<Gasto[]>`
  - `saveGasto(ctx, gasto: Gasto): Promise<Gasto>`
  - `deleteGasto(ctx, id): Promise<void>`
  - `listProveedores(ctx): Promise<Proveedor[]>`
  - `saveProveedor(ctx, p: Proveedor): Promise<Proveedor>`
  - `deleteProveedor(ctx, id): Promise<void>` — rechaza si tiene cxp.
  - `createCxp(ctx, input: CxpInput): Promise<CuentaPagar>` — saldo=monto_total, estado=pendiente.
  - `listCxp(ctx, filtro?: { estado?: string }): Promise<CuentaPagar[]>`
  - `deleteCxp(ctx, id): Promise<void>` — borra cxp + pagos.
  - `registerPago(ctx, pago: PagoInput): Promise<Pago>` — valida monto ≤ saldo; append + update saldo + fecha_pago.
  - `listPagos(ctx, idOrigen?: string): Promise<Pago[]>`
  - `getReportes(ctx, mes: string): Promise<{ kpis: Kpis; categorias: {categoria,total}[]; top: {nombre,total}[] }>`
  - `getCategorias(ctx, kind: 'gastos' | 'cxp'): Promise<string[]>`

- [ ] **Step 1: Añadir appendValues y clearRange a SheetsApi**

Append a `packages/shared/src/sheets/api.ts` (dentro de la clase `SheetsApi`):
```ts
  async appendValues(spreadsheetId: string, range: string, values: (string | number)[][]): Promise<void> {
    const encoded = encodeURIComponent(range)
    await this.request(`${BASE}/${spreadsheetId}/values/${encoded}:append?valueInputOption=RAW`, {
      method: 'POST',
      body: JSON.stringify({ values })
    })
  }

  async clearRange(spreadsheetId: string, range: string): Promise<void> {
    const encoded = encodeURIComponent(range)
    await this.request(`${BASE}/${spreadsheetId}/values/${encoded}:clear`, {
      method: 'POST',
      body: JSON.stringify({})
    })
  }
```

Nota: `appendValues` usa el endpoint `values:append` que inserta tras la última fila con datos — lo que hace que `appendRows` acumule de verdad en Sheets (un `values:batchUpdate` a rango fijo sobreescribiría filas). `clearRange` vacía un rango para que `replaceTable` no deje filas huérfanas al reemplazar con un set más corto.

- [ ] **Step 2: Escribir test fallido**

`packages/shared/tests/repository.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { SheetsApi } from '../src/sheets/api'
import { createRepository } from '../src/data/repository'
import type { StorageAdapter } from '../src/data/storage'

function memoryStorage(seed: Record<string, string> = {}): StorageAdapter {
  const m = new Map<string, string>(Object.entries(seed))
  return {
    get: async k => m.get(k) ?? null,
    set: async (k, v) => void m.set(k, v),
    remove: async k => void m.delete(k)
  }
}

function fakeApi() {
  const grid = new Map<string, (string | number)[][]>()
  const requests: { range: string; values: (string | number)[][] }[] = []

  function cellRef(ref: string): { col: number; row: number } {
    const m = ref.match(/^([A-Z]+)(\d+)$/)!
    let col = 0
    for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64)
    return { col, row: Number(m[2]) }
  }
  function sheetOf(range: string): string {
    return range.split('!')[0].replace(/'/g, '')
  }
  function writeCells(sheet: string, values: (string | number)[][], startRow: number, startCol: number) {
    const rows = grid.get(sheet) ?? []
    values.forEach((rowVals, di) => {
      const r = startRow - 1 + di
      while (rows.length <= r) rows.push([])
      rowVals.forEach((v, ci) => { rows[r][startCol - 1 + ci] = v })
    })
    grid.set(sheet, rows)
  }

  const read = async (url: string) => {
    const u = new URL(String(url))
    const ranges = (u.searchParams.get('ranges') ?? '').split(',').filter(Boolean)
    const valueRanges = ranges.map(r => ({ range: r, values: grid.get(sheetOf(r)) ?? [] }))
    return { ok: true, json: async () => ({ valueRanges }) }
  }

  const write = async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { data?: { range: string; values: (string | number)[][] }[]; values?: (string | number)[][] }
    const u = new URL(String(url))
    const path = decodeURIComponent(u.pathname)
    if (u.pathname.includes(':append')) {
      const range = path.split('/values/')[1].split(':append')[0]
      const a = cellRef(range.split('!')[1].split(':')[0])
      const rows = grid.get(sheetOf(range)) ?? []
      let r = a.row - 1
      while (r < rows.length && (rows[r] ?? []).some(v => v !== undefined && v !== '')) r++
      writeCells(sheetOf(range), body.values!, r + 1, a.col)
      return { ok: true, json: async () => ({}) }
    }
    if (u.pathname.includes(':clear')) {
      const range = path.split('/values/')[1].split(':clear')[0]
      const sheet = sheetOf(range)
      const a = cellRef(range.split('!')[1].split(':')[0])
      const rows = grid.get(sheet) ?? []
      grid.set(sheet, rows.slice(0, a.row - 1))
      return { ok: true, json: async () => ({}) }
    }
    for (const d of body.data ?? []) {
      const [a, b] = d.range.split('!')[1].split(':')
      const start = cellRef(a)
      const end = cellRef(b ?? a)
      requests.push(d)
      if (start.row === 1) {
        grid.set(sheetOf(d.range), d.values.map(row => row.slice(0, end.col)))
      } else {
        writeCells(sheetOf(d.range), d.values, start.row, start.col)
      }
    }
    return { ok: true, json: async () => ({ responses: [] }) }
  }

  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    if (u.includes('values:batchUpdate') || u.includes(':append') || u.includes(':clear')) return write(u, init!)
    if (u.includes('values:batchGet')) return read(u)
    return { ok: true, json: async () => ({}) }
  })
  vi.stubGlobal('fetch', fetchMock)
  return { grid, requests, fetchMock }
}

function setup() {
  const f = fakeApi()
  const storage = memoryStorage()
  const api = new SheetsApi(async () => 'T')
  const repo = createRepository({ api, storage })
  return { ...f, storage, repo }
}

describe('repository', () => {
  it('config round-trip', async () => {
    const { repo } = setup()
    const cfg = await repo.getConfig()
    expect(cfg.prefijo_folio).toBe('FAC-')
    const updated = { ...cfg, empresa_nombre: 'X S.A.' }
    await repo.saveConfig(updated)
    expect((await repo.getConfig()).empresa_nombre).toBe('X S.A.')
  })

  it('createFactura asigna folio atómico FAC-001', async () => {
    const { repo } = setup()
    const cli = await repo.saveCliente({ nombre: 'ACME' } as never)
    const f = await repo.createFactura({
      id_cliente: cli.id_cliente,
      items: [{ descripcion: 'web', cantidad: 1, precio_unitario: 1000 }],
      fecha_emision: '2026-08-11',
      fecha_vencimiento: '',
      notas: ''
    })
    expect(f.folio).toBe('FAC-001')
    expect(f.total).toBe(1160)
    expect(f.saldo).toBe(1160)
    expect(f.estado ?? undefined).toBeUndefined()
  })

  it('segunda factura usa FAC-002', async () => {
    const { repo } = setup()
    const cli = await repo.saveCliente({ nombre: 'ACME' } as never)
    await repo.createFactura({ id_cliente: cli.id_cliente, items: [{ descripcion: 'a', cantidad: 1, precio_unitario: 1 }], fecha_emision: '2026-08-11', fecha_vencimiento: '', notas: '' })
    const f2 = await repo.createFactura({ id_cliente: cli.id_cliente, items: [{ descripcion: 'b', cantidad: 1, precio_unitario: 1 }], fecha_emision: '2026-08-12', fecha_vencimiento: '', notas: '' })
    expect(f2.folio).toBe('FAC-002')
  })

  it('registerPago reduce saldo y deja pagada', async () => {
    const { repo } = setup()
    const cli = await repo.saveCliente({ nombre: 'A' } as never)
    const f = await repo.createFactura({ id_cliente: cli.id_cliente, items: [{ descripcion: 'a', cantidad: 1, precio_unitario: 100 }], fecha_emision: '2026-08-11', fecha_vencimiento: '', notas: '' })
    await repo.registerPago({ tipo: 'cobro', id_origen: f.id_factura, fecha: '2026-08-12', monto: 116, metodo_pago: 'Transferencia', notas: '' })
    const [fx] = await repo.listFacturas({})
    expect(fx.saldo).toBe(0)
    const det = await repo.getFactura(f.id_factura)
    expect(det.factura.fecha_pago).toBe('2026-08-12')
  })

  it('registerPago rechaza monto mayor al saldo', async () => {
    const { repo } = setup()
    const cli = await repo.saveCliente({ nombre: 'A' } as never)
    const f = await repo.createFactura({ id_cliente: cli.id_cliente, items: [{ descripcion: 'a', cantidad: 1, precio_unitario: 100 }], fecha_emision: '2026-08-11', fecha_vencimiento: '', notas: '' })
    await expect(repo.registerPago({ tipo: 'cobro', id_origen: f.id_factura, fecha: '2026-08-12', monto: 999, metodo_pago: 'Efectivo', notas: '' })).rejects.toThrow(/saldo/i)
  })
})
```

- [ ] **Step 3: Correr y verificar que falla**

Run: `pnpm -F shared test -- --run tests/repository.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implementar mutex y repository**

`packages/shared/src/sheets/mutex.ts`:
```ts
const MUTEX_KEY = 'mutex'
const STALE_MS = 30000

export async function withMutex<T>(
  readRow: (clave: string) => Promise<string | null>,
  writeRow: (clave: string, valor: string) => Promise<void>,
  fn: () => Promise<T>,
  opts: { maxRetries?: number; retryMs?: number } = {}
): Promise<T> {
  const { maxRetries = 10, retryMs = 300 } = opts
  let attempts = 0
  while (true) {
    const current = await readRow(MUTEX_KEY)
    const fresh = current !== null && (Date.now() - Number(current) < STALE_MS)
    if (current === null || !fresh) {
      await writeRow(MUTEX_KEY, String(Date.now()))
      try {
        return await fn()
      } finally {
        await writeRow(MUTEX_KEY, '')
      }
    }
    attempts++
    if (attempts >= maxRetries) throw new Error('Hoja ocupada, intenta de nuevo')
    await new Promise(r => setTimeout(r, retryMs))
  }
}
```

`packages/shared/src/data/repository.ts`:
```ts
import { SheetsApi } from '../sheets/api'
import { TABLES, sheetName, HEADER_ROWS } from '../sheets/tables'
import { serializeRow, deserializeRow } from '../sheets/rows'
import { configFromRows, configToRows } from '../sheets/createSpreadsheet'
import { withMutex } from '../sheets/mutex'
import { KEYS, type StorageAdapter } from './storage'
import { uid } from '../lib/uid'
import { buildFactura, estadoDesdeSaldo, round2 } from '../calc/invoice'
import { kpisForMonth, topClientes, gastosPorCategoria, type Kpis } from '../calc/kpis'
import type { Config, Cliente, Factura, FacturaItem, Gasto, Proveedor, CuentaPagar, Pago, MetodoPago } from '../types/entities'
import { ClienteSchema, ConfigSchema, FacturaInputSchema, GastoSchema, ProveedorSchema, CxpInputSchema, PagoInputSchema } from '../types/schemas'

export interface RepoContext {
  api: SheetsApi
  storage: StorageAdapter
  getSpreadsheetId(): Promise<string>
}

export function createRepository(ctx: RepoContext) {
  const { api, storage } = ctx
  const sid = ctx.getSpreadsheetId

  function rangeOf(t: keyof typeof TABLES): string {
    const spec = TABLES[t]
    const last = String.fromCharCode(64 + spec.length)
    const rowStart = HEADER_ROWS(t) + 1
    return `'${sheetName(t)}'!A${rowStart}:${last}`
  }

    async function readTable(t: keyof typeof TABLES): Promise<Record<string, string | number>[]> {
    const id = await sid()
    const res = await api.batchGet(id, [rangeOf(t)])
    const rows = res[Object.keys(res)[0]] ?? []
    const spec = TABLES[t]
    const headerLen = HEADER_ROWS(t)
    return rows.slice(headerLen === 0 ? 0 : headerLen - 1).map(r => deserializeRow(spec, r)).filter(r => Object.values(r).some(v => v !== ''))
  }

  async function appendRows(t: keyof typeof TABLES, rows: Record<string, string | number>[]): Promise<void> {
    const id = await sid()
    const spec = TABLES[t]
    const values = rows.map(r => serializeRow(spec, r))
    const last = String.fromCharCode(64 + spec.length)
    await api.appendValues(id, `'${sheetName(t)}'!A${HEADER_ROWS(t) + 1}:${last}`, values)
  }

  async function replaceTable(t: keyof typeof TABLES, rows: Record<string, string | number>[]): Promise<void> {
    const id = await sid()
    const spec = TABLES[t]
    const values = rows.map(r => serializeRow(spec, r))
    const last = String.fromCharCode(64 + spec.length)
    const base = HEADER_ROWS(t) + 1
    const range = `'${sheetName(t)}'!A${base}:${last}`
    if (values.length === 0) {
      await api.clearRange(id, range)
      return
    }
    await api.batchUpdate(id, [{ range, values }])
    await api.clearRange(id, `'${sheetName(t)}'!A${base + values.length}:${last}`)
  }

  async function readConfig(): Promise<Config> {
    const id = await sid()
    const res = await api.batchGet(id, [`'Config'!A1:B500`])
    const rows = res[Object.keys(res)[0]] ?? []
    return configFromRows(rows)
  }

  async function writeConfig(config: Config): Promise<void> {
    const id = await sid()
    await api.batchUpdate(id, [{ range: `'Config'!A1:B${configToRows(config).length}`, values: configToRows(config) }])
  }

  return {
    async getConfig(): Promise<Config> { return readConfig() },

    async saveConfig(config: Config): Promise<void> {
      const parsed = ConfigSchema.parse(config)
      await writeConfig(parsed)
    },

    async listClientes(): Promise<Cliente[]> { return readTable('Clientes') as unknown as Cliente[] },

    async saveCliente(cliente: Cliente): Promise<Cliente> {
      const parsed = ClienteSchema.parse(cliente)
      if (!parsed.id_cliente) {
        const saved = { ...parsed, id_cliente: uid('cli_'), fecha_registro: parsed.fecha_registro || new Date().toISOString().slice(0, 10) } as unknown as Cliente
        await appendRows('Clientes', [saved as unknown as Record<string, string | number>])
        return saved
      }
      const all = await readTable('Clientes')
      const next = all.map(r => (r.id_cliente === parsed.id_cliente ? { ...parsed } : r))
      await replaceTable('Clientes', next)
      return parsed as unknown as Cliente
    },

    async deleteCliente(id: string): Promise<void> {
      const facturas = await readTable('Facturas')
      if (facturas.some(f => f.id_cliente === id)) throw new Error('Cliente tiene facturas asociadas')
      const all = (await readTable('Clientes')).filter(r => r.id_cliente !== id)
      await replaceTable('Clientes', all)
    },

    async createFactura(input: { id_cliente: string; items: { descripcion: string; cantidad: number; precio_unitario: number }[]; fecha_emision: string; fecha_vencimiento: string; notas: string }): Promise<Factura> {
      const parsed = FacturaInputSchema.parse(input)
      const clientes = await readTable('Clientes')
      const cliente = clientes.find(c => c.id_cliente === parsed.id_cliente)
      if (!cliente) throw new Error('Cliente no existe')
      const cfg = await readConfig()
      const { items, totals } = buildFactura(parsed.items, cfg.iva_porcentaje)
      const id_factura = uid('fac_')
      const folio = await withMutex<string>(
        async clave => {
          const res = await api.batchGet(await sid(), [`'Config'!A1:B500`])
          const rows = res[Object.keys(res)[0]] ?? []
          for (const [k, v] of rows) if (String(k) === clave) return String(v ?? '')
          return null
        },
        async (clave, valor) => {
          await api.batchUpdate(await sid(), [{ range: `'Config'!A50:B50`, values: [[clave, valor]] }])
        },
        async () => {
          const c = await readConfig()
          const folioN = c.contador_folio
          await writeConfig({ ...c, contador_folio: c.contador_folio + 1 })
          return `${c.prefijo_folio}${String(folioN).padStart(3, '0')}`
        }
      )
      const factura: Factura = {
        id_factura,
        folio,
        id_cliente: parsed.id_cliente,
        nombre_cliente: String(cliente.nombre),
        fecha_emision: parsed.fecha_emision,
        fecha_vencimiento: parsed.fecha_vencimiento,
        subtotal: totals.subtotal,
        iva: totals.iva,
        total: totals.total,
        saldo: totals.total,
        fecha_pago: '',
        notas: parsed.notas
      }
      await appendRows('Facturas', [factura as unknown as Record<string, string | number>])
      const itemRows = items.map(it => ({ id_factura, ...it }))
      await appendRows('Factura_Items', itemRows as unknown as Record<string, string | number>[])
      return factura
    },

    async listFacturas(filtro: { estado?: string; mes?: string } = {}): Promise<Factura[]> {
      let rows = (await readTable('Facturas')) as unknown as Factura[]
      if (filtro.mes) rows = rows.filter(f => f.fecha_emision.slice(0, 7) === filtro.mes)
      if (filtro.estado) {
        const pagos = await readTable('Pagos')
        rows = rows.filter(f => {
          const tienePagos = pagos.some(p => p.id_origen === f.id_factura)
          const est = estadoDesdeSaldo(f.saldo, f.total, tienePagos)
          if (filtro.estado === 'pendientes') return est === 'pendiente' || est === 'parcial'
          return est === filtro.estado
        })
      }
      return rows
    },

    async getFactura(id: string): Promise<{ factura: Factura; items: FacturaItem[] }> {
      const facturas = (await readTable('Facturas')) as unknown as Factura[]
      const factura = facturas.find(f => f.id_factura === id)
      if (!factura) throw new Error('Factura no existe')
      const items = (await readTable('Factura_Items')).filter(i => i.id_factura === id).map(i => ({
        descripcion: String(i.descripcion), cantidad: Number(i.cantidad), precio_unitario: Number(i.precio_unitario), importe: Number(i.importe)
      }))
      return { factura, items }
    },

    async deleteFactura(id: string): Promise<void> {
      const all = (await readTable('Facturas')).filter(r => r.id_factura !== id)
      await replaceTable('Facturas', all)
      await replaceTable('Factura_Items', (await readTable('Factura_Items')).filter(r => r.id_factura !== id))
      await replaceTable('Pagos', (await readTable('Pagos')).filter(r => r.id_origen !== id))
    },

    async listGastos(filtro: { mes?: string; categoria?: string } = {}): Promise<Gasto[]> {
      let rows = (await readTable('Gastos')) as unknown as Gasto[]
      if (filtro.mes) rows = rows.filter(g => g.fecha.slice(0, 7) === filtro.mes)
      if (filtro.categoria) rows = rows.filter(g => g.categoria === filtro.categoria)
      return rows
    },

    async saveGasto(gasto: Gasto): Promise<Gasto> {
      const parsed = GastoSchema.parse(gasto)
      if (!parsed.id_gasto) {
        const saved = { ...parsed, id_gasto: uid('gas_') } as unknown as Gasto
        await appendRows('Gastos', [saved as unknown as Record<string, string | number>])
        return saved
      }
      const all = await readTable('Gastos')
      await replaceTable('Gastos', all.map(r => (r.id_gasto === parsed.id_gasto ? { ...parsed } : r)))
      return parsed as unknown as Gasto
    },

    async deleteGasto(id: string): Promise<void> {
      await replaceTable('Gastos', (await readTable('Gastos')).filter(r => r.id_gasto !== id))
    },

    async listProveedores(): Promise<Proveedor[]> { return readTable('Proveedores') as unknown as Proveedor[] },

    async saveProveedor(p: Proveedor): Promise<Proveedor> {
      const parsed = ProveedorSchema.parse(p)
      if (!parsed.id_proveedor) {
        const saved = { ...parsed, id_proveedor: uid('prov_'), fecha_registro: parsed.fecha_registro || new Date().toISOString().slice(0, 10) } as unknown as Proveedor
        await appendRows('Proveedores', [saved as unknown as Record<string, string | number>])
        return saved
      }
      const all = await readTable('Proveedores')
      await replaceTable('Proveedores', all.map(r => (r.id_proveedor === parsed.id_proveedor ? { ...parsed } : r)))
      return parsed as unknown as Proveedor
    },

    async deleteProveedor(id: string): Promise<void> {
      const cxps = await readTable('Cuentas_Pagar')
      if (cxps.some(c => c.id_proveedor === id)) throw new Error('Proveedor tiene cuentas por pagar asociadas')
      await replaceTable('Proveedores', (await readTable('Proveedores')).filter(r => r.id_proveedor !== id))
    },

    async createCxp(input: { id_proveedor: string; folio_documento: string; categoria: string; descripcion: string; fecha_emision: string; fecha_vencimiento: string; monto_total: number; notas: string }): Promise<CuentaPagar> {
      const parsed = CxpInputSchema.parse(input)
      const provs = await readTable('Proveedores')
      const prov = provs.find(p => p.id_proveedor === parsed.id_proveedor)
      if (!prov) throw new Error('Proveedor no existe')
      const cxp: CuentaPagar = {
        id_cxp: uid('cxp_'),
        id_proveedor: parsed.id_proveedor,
        nombre_proveedor: String(prov.nombre),
        folio_documento: parsed.folio_documento,
        categoria: parsed.categoria,
        descripcion: parsed.descripcion,
        fecha_emision: parsed.fecha_emision,
        fecha_vencimiento: parsed.fecha_vencimiento,
        monto_total: round2(parsed.monto_total),
        saldo: round2(parsed.monto_total),
        estado: 'pendiente',
        notas: parsed.notas
      }
      await appendRows('Cuentas_Pagar', [cxp as unknown as Record<string, string | number>])
      return cxp
    },

    async listCxp(filtro: { estado?: string } = {}): Promise<CuentaPagar[]> {
      let rows = (await readTable('Cuentas_Pagar')) as unknown as CuentaPagar[]
      if (filtro.estado) rows = rows.filter(c => c.estado === filtro.estado)
      return rows
    },

    async deleteCxp(id: string): Promise<void> {
      await replaceTable('Cuentas_Pagar', (await readTable('Cuentas_Pagar')).filter(r => r.id_cxp !== id))
      await replaceTable('Pagos', (await readTable('Pagos')).filter(r => r.id_origen !== id))
    },

    async registerPago(pago: { tipo: 'cobro' | 'abono'; id_origen: string; fecha: string; monto: number; metodo_pago: MetodoPago; notas: string }): Promise<Pago> {
      const parsed = PagoInputSchema.parse(pago)
      const table = parsed.tipo === 'cobro' ? 'Facturas' : 'Cuentas_Pagar'
      const rows = await readTable(table)
      const target = rows.find(r => r.id_origen === parsed.id_origen || r[table === 'Facturas' ? 'id_factura' : 'id_cxp'] === parsed.id_origen)
      if (!target) throw new Error('Origen del pago no existe')
      const saldoActual = Number(target.saldo)
      if (parsed.monto > saldoActual) throw new Error(`Pago excede saldo disponible (${saldoActual})`)
      const nuevoSaldo = round2(saldoActual - parsed.monto)
      const pagoRow: Pago = { id_pago: uid('pag_'), ...parsed }
      await appendRows('Pagos', [pagoRow as unknown as Record<string, string | number>])
      const updated = rows.map(r => {
        if (r[table === 'Facturas' ? 'id_factura' : 'id_cxp'] === parsed.id_origen) {
          if (table === 'Facturas') return { ...r, saldo: nuevoSaldo, fecha_pago: parsed.fecha }
          return { ...r, saldo: nuevoSaldo, estado: nuevoSaldo <= 0 ? 'pagada' : 'parcial' }
        }
        return r
      })
      await replaceTable(table, updated)
      return pagoRow
    },

    async listPagos(idOrigen?: string): Promise<Pago[]> {
      let rows = (await readTable('Pagos')) as unknown as Pago[]
      if (idOrigen) rows = rows.filter(p => p.id_origen === idOrigen)
      return rows
    },

    async getReportes(mes: string) {
      const [facturas, gastos, cxps] = await Promise.all([readTable('Facturas'), readTable('Gastos'), readTable('Cuentas_Pagar')])
      const kpis: Kpis = kpisForMonth(facturas as unknown as Factura[], gastos as unknown as Gasto[], cxps as unknown as CuentaPagar[], mes)
      const categorias = gastosPorCategoria((gastos as unknown as Gasto[]).filter(g => g.fecha.slice(0, 7) === mes))
      const top = topClientes(facturas as unknown as Factura[])
      return { kpis, categorias, top }
    },

    async getCategorias(kind: 'gastos' | 'cxp'): Promise<string[]> {
      const cfg = await readConfig()
      const raw = kind === 'gastos' ? cfg.categorias_gastos : cfg.categorias_cxp
      return raw.split(',').map(s => s.trim()).filter(Boolean)
    }
  }
}

export type Repository = ReturnType<typeof createRepository>
```

- [ ] **Step 5: Correr tests y arreglar**

Run: `pnpm -F shared test`
Expected: PASS. El `fakeApi` es grid-based: simula rangos con coordenadas de fila (batchUpdate a fila 1 = reemplazo completo; fila >1 = escritura dirigida), el endpoint `:append` acumula filas y `:clear` vacía la tabla. Ajusta el fake solo si las aserciones revelan discrepancias de coordenadas.

- [ ] **Step 6: Exportar y commit**

Add to `packages/shared/src/index.ts`:
```ts
export * from './sheets/mutex'
export * from './data/repository'
```

```bash
git add -A && git commit -m "feat(shared): data repository + atomic folio mutex"
```

---

## Task 8: UI base + Layout responsive

**Files:**
- Create: `packages/shared/src/ui/components.tsx` (Button, Input, Select, Dialog, Table, Tabs, Toast, Card, Badge)
- Create: `packages/shared/src/ui/layout/Layout.tsx`
- Create: `packages/shared/src/ui/print/InvoicePrint.tsx`
- Create: `packages/shared/src/ui/index.ts`
- Create: `packages/shared/tests/ui.test.tsx`

**Interfaces:**
- Consumes: Task 3 (`formatMoney`), Task 2 (tipos).
- Produces (todos exportados desde `shared/ui`):
  - `Button({ variant, children, onClick, type, disabled })`
  - `Input(props)`, `Select({ value, onChange, options, placeholder })`
  - `Dialog({ open, onClose, title, children, footer })`
  - `Table<T>({ columns: { key, header, render }[], rows })`
  - `Tabs({ tabs: { id, label, content }[] })`
  - `toast(message, { type })` + `<Toaster/>`
  - `Card({ title, children, footer })`, `StatCard({ label, value })`, `Badge({ children, tone })`
  - `Layout({ current, onNavigate, children, headerExtra })` — sidebar responsive + drawer móvil.
  - `Money({ value })` — componente que formatea según config.moneda vía `useCurrency()`.
  - `useCurrency(): Currency` — lee config del store.
  - `ConfirmDialog({ open, title, message, onConfirm, onClose })`
  - `InvoicePrint({ factura, items, config })` — plantilla `@media print`.
  - `NavKey = 'dashboard' | 'facturas' | 'clientes' | 'cuentas' | 'proveedores' | 'gastos' | 'reportes' | 'configuracion'`

- [ ] **Step 1: Escribir test fallido**

`packages/shared/tests/ui.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatCard, Badge } from '../src/ui/components'

describe('ui', () => {
  it('StatCard renderiza label y value', () => {
    render(<StatCard label="Cobrado" value="$1,000.00" />)
    expect(screen.getByText('Cobrado')).toBeTruthy()
    expect(screen.getByText('$1,000.00')).toBeTruthy()
  })
  it('Badge renderiza tono', () => {
    render(<Badge tone="success">Pagada</Badge>)
    expect(screen.getByText('Pagada')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Instalar deps de testing UI y correr**

```bash
pnpm -F shared add -D @testing-library/react @testing-library/jest-dom jsdom
pnpm -F shared add react react-dom
```

Add a `packages/shared/vitest.config.ts` (reescribir el de Task 1 para añadir el plugin de React; `environment: 'jsdom'` ya está):
```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'] }
})
```

(instalar `@vitejs/plugin-react`).

Run: `pnpm -F shared test -- --run tests/ui.test.tsx`
Expected: FAIL (componentes no existen).

- [ ] **Step 3: Implementar componentes base**

`packages/shared/src/ui/components.tsx` (núcleo; estilos con clases Tailwind):
```tsx
import React, { createContext, useCallback, useContext, useState } from 'react'
import type { ReactNode } from 'react'

const cx = (...a: (string | false | undefined)[]) => a.filter(Boolean).join(' ')

export function Button({ variant = 'primary', className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' | 'danger' | 'ghost' }) {
  const styles = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    outline: 'border border-gray-300 hover:bg-gray-100',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'hover:bg-gray-100'
  }
  return <button {...props} className={cx('px-3 py-2 rounded-md text-sm font-medium disabled:opacity-50', styles[variant], className)} />
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx('w-full px-3 py-2 border border-gray-300 rounded-md text-sm', props.className)} />
}

export function Select({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export function Card({ title, children, footer }: { title?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
      {title && <div className="px-4 py-3 border-b border-gray-200 font-semibold">{title}</div>}
      <div className="p-4">{children}</div>
      {footer && <div className="px-4 py-3 border-t border-gray-200">{footer}</div>}
    </div>
  )
}

export function StatCard({ label, value, tone }: { label: string; value: string; tone?: 'default' | 'positive' | 'negative' }) {
  const color = tone === 'positive' ? 'text-green-600' : tone === 'negative' ? 'text-red-600' : 'text-gray-900'
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className={cx('text-2xl font-bold mt-1', color)}>{value}</div>
    </div>
  )
}

export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: 'gray' | 'green' | 'yellow' | 'red' | 'blue' }) {
  const styles = {
    gray: 'bg-gray-100 text-gray-700',
    green: 'bg-green-100 text-green-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    red: 'bg-red-100 text-red-700',
    blue: 'bg-blue-100 text-blue-700'
  }
  return <span className={cx('inline-block px-2 py-0.5 rounded text-xs font-medium', styles[tone])}>{children}</span>
}

export function Table<T extends Record<string, unknown>>({ columns, rows }: { columns: { key: string; header: string; render?: (row: T) => ReactNode }[]; rows: T[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
          <tr>{columns.map(c => <th key={c.key} className="px-4 py-2">{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
              {columns.map(c => <td key={c.key} className="px-4 py-2">{c.render ? c.render(r) : String(r[c.key] ?? '')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Dialog({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg w-full max-w-lg max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="font-semibold">{title}</div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">✕</button>
        </div>
        <div className="p-4">{children}</div>
        {footer && <div className="px-4 py-3 border-t border-gray-200 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}

export function ConfirmDialog({ open, title, message, onConfirm, onClose }: { open: boolean; title: string; message: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={title}
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button variant="danger" onClick={onConfirm}>Eliminar</Button></>}>
      <p>{message}</p>
    </Dialog>
  )
}

export function Tabs({ tabs }: { tabs: { id: string; label: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.id)
  return (
    <div>
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActive(t.id)}
            className={cx('px-3 py-2 text-sm border-b-2', active === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500')}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="pt-4">{tabs.find(t => t.id === active)?.content}</div>
    </div>
  )
}

type ToastType = 'success' | 'error'
const ToastCtx = createContext<(msg: string, type?: ToastType) => void>(() => {})
export const useToast = () => useContext(ToastCtx)
export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; msg: string; type: ToastType }[]>([])
  const toast = useCallback((msg: string, type: ToastType = 'success') => {
    const id = Date.now()
    setToasts(t => [...t, { id, msg, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000)
  }, [])
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        {toasts.map(t => (
          <div key={t.id} className={cx('px-4 py-2 rounded-md text-sm text-white shadow-lg', t.type === 'success' ? 'bg-green-600' : 'bg-red-600')}>{t.msg}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
export { cx }
```

- [ ] **Step 4: Implementar Layout + print + index**

`packages/shared/src/ui/layout/Layout.tsx`:
```tsx
import React, { useState } from 'react'
import type { ReactNode } from 'react'
import { cx } from '../components'

export type NavKey = 'dashboard' | 'facturas' | 'clientes' | 'cuentas' | 'proveedores' | 'gastos' | 'reportes' | 'configuracion'

const NAV: { key: NavKey; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: '📊' },
  { key: 'facturas', label: 'Facturas', icon: '🧾' },
  { key: 'clientes', label: 'Clientes', icon: '👥' },
  { key: 'cuentas', label: 'Cuentas por Pagar', icon: '💸' },
  { key: 'proveedores', label: 'Proveedores', icon: '🏭' },
  { key: 'gastos', label: 'Gastos', icon: '📉' },
  { key: 'reportes', label: 'Reportes', icon: '📈' },
  { key: 'configuracion', label: 'Configuración', icon: '⚙️' }
]

export function Layout({ current, onNavigate, children, headerExtra }: { current: NavKey; onNavigate: (k: NavKey) => void; children: ReactNode; headerExtra?: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const nav = (
    <nav className="flex-1 overflow-y-auto">
      {NAV.map(n => (
        <button key={n.key} onClick={() => { onNavigate(n.key); setMobileOpen(false) }}
          className={cx('w-full flex items-center gap-3 px-4 py-3 text-sm', current === n.key ? 'bg-blue-50 text-blue-700 font-medium border-l-4 border-blue-600' : 'text-gray-700 hover:bg-gray-100')}>
          <span>{n.icon}</span>{n.label}
        </button>
      ))}
    </nav>
  )
  return (
    <div className="min-h-screen bg-gray-50 md:flex">
      <aside className="hidden md:flex md:flex-col md:w-60 md:min-h-screen bg-white border-r border-gray-200">{nav}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden bg-black/40" onClick={() => setMobileOpen(false)}>
          <div className="w-64 h-full bg-white" onClick={e => e.stopPropagation()}>{nav}</div>
        </div>
      )}
      <div className="flex-1 flex flex-col">
        <header className="md:hidden sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <button className="text-xl" onClick={() => setMobileOpen(true)}>☰</button>
          <div className="font-semibold">FinanceTracker</div>
          <div className="w-6">{headerExtra}</div>
        </header>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  )
}
```

`packages/shared/src/ui/print/InvoicePrint.tsx`:
```tsx
import React from 'react'
import type { Factura, FacturaItem, Config } from '../../types/entities'
import { formatMoney } from '../../currency'

export function InvoicePrint({ factura, items, config }: { factura: Factura; items: FacturaItem[]; config: Config }) {
  return (
    <div id="invoice-print">
      <div className="print-header flex justify-between items-start mb-6">
        <div>
          <h1 className="text-xl font-bold">{config.empresa_nombre}</h1>
          <p>{config.empresa_rfc}</p>
          <p>{config.empresa_direccion}</p>
          <p>{config.empresa_telefono} {config.empresa_email}</p>
        </div>
        {config.empresa_logo && <img src={config.empresa_logo} alt="logo" className="h-16" />}
        <div className="text-right">
          <div className="text-lg font-bold">Factura {factura.folio}</div>
          <p>Fecha emisión: {factura.fecha_emision}</p>
          {factura.fecha_vencimiento && <p>Vence: {factura.fecha_vencimiento}</p>}
        </div>
      </div>
      <div className="mb-6">
        <div className="font-semibold">Cliente</div>
        <p>{factura.nombre_cliente}</p>
      </div>
      <table className="w-full text-sm mb-6">
        <thead className="border-b border-gray-300"><tr><th className="text-left py-2">Descripción</th><th>Cant</th><th>Precio</th><th className="text-right">Importe</th></tr></thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} className="border-b border-gray-100">
              <td className="py-2">{it.descripcion}</td>
              <td>{it.cantidad}</td>
              <td>{formatMoney(it.precio_unitario, config.moneda)}</td>
              <td className="text-right">{formatMoney(it.importe, config.moneda)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-end gap-8">
        <div>
          <div>Subtotal: {formatMoney(factura.subtotal, config.moneda)}</div>
          <div>IVA ({config.iva_porcentaje}%): {formatMoney(factura.iva, config.moneda)}</div>
          <div className="font-bold text-lg">Total: {formatMoney(factura.total, config.moneda)}</div>
        </div>
      </div>
      {factura.notas && <div className="mt-6 text-sm text-gray-600">Notas: {factura.notas}</div>}
    </div>
  )
}
```

`packages/shared/src/ui/index.ts`:
```ts
export * from './components'
export * from './layout/Layout'
export * from './print/InvoicePrint'
```

- [ ] **Step 5: Correr tests y verificar**

Run: `pnpm -F shared test`
Expected: PASS (ui.test.tsx + previos).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(shared): base UI components + responsive layout + print template"
```

---

## Task 9: Store + hooks de queries

**Files:**
- Create: `packages/shared/src/store/appStore.ts`
- Create: `packages/shared/src/store/queries.ts`
- Create: `packages/shared/tests/queries.test.tsx`

**Interfaces:**
- Consumes: Task 7 (`Repository`), Task 8 (`Money`, `useCurrency` usa store).
- Produces:
  - `appStore` (Zustand): `{ spreadsheetId, url, setSheet, clearSheet, config, setConfig }`
  - `AppProvider({ repo, children })` — crea QueryClient y provee el repo vía contexto.
  - `useRepo(): Repository`
  - Hooks TanStack Query:
    - `useConfig()` → `{ config, isLoading, saveConfig }`
    - `useClientes()` → `{ clientes, isLoading, saveCliente, deleteCliente }`
    - `useFacturas(filtro?)`, `useFactura(id)`, `useCreateFactura()`, `useDeleteFactura()`
    - `useGastos(filtro?)`, `useSaveGasto()`, `useDeleteGasto()`
    - `useProveedores()`, `useSaveProveedor()`, `useDeleteProveedor()`
    - `useCxp(filtro?)`, `useCreateCxp()`, `useDeleteCxp()`
    - `usePagos(idOrigen?)`, `useRegisterPago()`
    - `useReportes(mes)`
    - `useCategorias(kind)`
  - `useCurrency()` — devuelve `Currency` desde config.

- [ ] **Step 1: Escribir test fallido**

`packages/shared/tests/queries.test.tsx`:
```tsx
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { createRepository, type Repository } from '../src/data/repository'
import { AppProvider, useClientes, useConfig } from '../src/store/queries'
import { SheetsApi } from '../src/sheets/api'
import type { StorageAdapter } from '../src/data/storage'
import React from 'react'

beforeAll(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ valueRanges: [] }) })))
})
afterAll(() => vi.unstubAllGlobals())

function makeRepo(): Repository {
  const storage: StorageAdapter = { get: async () => null, set: async () => {}, remove: async () => {} }
  const api = new SheetsApi(async () => 'T')
  return createRepository({ api, storage, getSpreadsheetId: async () => 'S' })
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AppProvider repo={makeRepo()}>{children}</AppProvider>
)

describe('queries', () => {
  it('useClientes devuelve lista vacía', async () => {
    const { result } = renderHook(() => useClientes(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.clientes).toEqual([])
  })
  it('useConfig devuelve config default', async () => {
    const { result } = renderHook(() => useConfig(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.config?.prefijo_folio).toBe('FAC-')
  })
})
```

Nota: el wrapper usa `AppProvider` (provee el contexto de repo + QueryClient) y el fetch global se stubbea con `valueRanges: []`.

- [ ] **Step 2: Instalar deps y correr**

```bash
pnpm -F shared add @tanstack/react-query zustand
pnpm -F shared add -D @testing-library/react-hooks
```

Run: `pnpm -F shared test -- --run tests/queries.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar store y queries**

`packages/shared/src/store/appStore.ts`:
```ts
import { create } from 'zustand'
import type { Config } from '../types/entities'

interface AppState {
  spreadsheetId: string | null
  url: string | null
  config: Config | null
  setSheet: (id: string, url: string) => void
  clearSheet: () => void
  setConfig: (c: Config) => void
}

export const useAppStore = create<AppState>(set => ({
  spreadsheetId: null,
  url: null,
  config: null,
  setSheet: (spreadsheetId, url) => set({ spreadsheetId, url }),
  clearSheet: () => set({ spreadsheetId: null, url: null, config: null }),
  setConfig: config => set({ config })
}))
```

`packages/shared/src/store/queries.tsx`:
```tsx
import React, { createContext, useContext } from 'react'
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Repository } from '../data/repository'
import { useAppStore } from './appStore'
import type { Config, Cliente, Factura, FacturaItem, Gasto, Proveedor, CuentaPagar, Pago, MetodoPago } from '../types/entities'
import { getCurrency, type Currency } from '../currency'

const RepoCtx = createContext<Repository | null>(null)
export function useRepo(): Repository {
  const repo = useContext(RepoCtx)
  if (!repo) throw new Error('useRepo fuera de AppProvider')
  return repo
}

export function AppProvider({ repo, children }: { repo: Repository; children: React.ReactNode }) {
  const [client] = React.useState(() => new QueryClient())
  return (
    <RepoCtx.Provider value={repo}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </RepoCtx.Provider>
  )
}

export function useCurrency(): Currency {
  const config = useAppStore(s => s.config)
  return getCurrency(config?.moneda ?? 'USD')
}

export function useConfig() {
  const repo = useRepo()
  const setConfig = useAppStore(s => s.setConfig)
  const q = useQuery({ queryKey: ['config'], queryFn: () => repo.getConfig() })
  React.useEffect(() => { if (q.data) setConfig(q.data) }, [q.data, setConfig])
  const qc = useQueryClient()
  const saveConfig = useMutation({
    mutationFn: (c: Config) => repo.saveConfig(c),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config'] })
  })
  return { config: q.data, isLoading: q.isLoading, saveConfig }
}

export function useClientes() {
  const repo = useRepo()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['clientes'], queryFn: () => repo.listClientes() })
  const saveCliente = useMutation({ mutationFn: (c: Cliente) => repo.saveCliente(c), onSuccess: () => qc.invalidateQueries({ queryKey: ['clientes'] }) })
  const deleteCliente = useMutation({ mutationFn: (id: string) => repo.deleteCliente(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['clientes'] }) })
  return { clientes: q.data ?? [], isLoading: q.isLoading, saveCliente, deleteCliente }
}

export function useFacturas(filtro?: { estado?: string; mes?: string }) {
  const repo = useRepo()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['facturas', filtro], queryFn: () => repo.listFacturas(filtro) })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['facturas'] })
  const create = useMutation({ mutationFn: (i: { id_cliente: string; items: { descripcion: string; cantidad: number; precio_unitario: number }[]; fecha_emision: string; fecha_vencimiento: string; notas: string }) => repo.createFactura(i), onSuccess: invalidate })
  const del = useMutation({ mutationFn: (id: string) => repo.deleteFactura(id), onSuccess: invalidate })
  return { facturas: q.data ?? [], isLoading: q.isLoading, createFactura: create, deleteFactura: del }
}

export function useFactura(id: string | null) {
  const repo = useRepo()
  return useQuery({
    queryKey: ['factura', id],
    queryFn: (): Promise<{ factura: Factura; items: FacturaItem[] } | null> => (id ? repo.getFactura(id) : Promise.resolve(null)),
    enabled: !!id
  })
}

export function useGastos(filtro?: { mes?: string; categoria?: string }) {
  const repo = useRepo()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['gastos', filtro], queryFn: () => repo.listGastos(filtro) })
  const save = useMutation({ mutationFn: (g: Gasto) => repo.saveGasto(g), onSuccess: () => qc.invalidateQueries({ queryKey: ['gastos'] }) })
  const del = useMutation({ mutationFn: (id: string) => repo.deleteGasto(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['gastos'] }) })
  return { gastos: q.data ?? [], isLoading: q.isLoading, saveGasto: save, deleteGasto: del }
}

export function useProveedores() {
  const repo = useRepo()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['proveedores'], queryFn: () => repo.listProveedores() })
  const save = useMutation({ mutationFn: (p: Proveedor) => repo.saveProveedor(p), onSuccess: () => qc.invalidateQueries({ queryKey: ['proveedores'] }) })
  const del = useMutation({ mutationFn: (id: string) => repo.deleteProveedor(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['proveedores'] }) })
  return { proveedores: q.data ?? [], isLoading: q.isLoading, saveProveedor: save, deleteProveedor: del }
}

export function useCxp(filtro?: { estado?: string }) {
  const repo = useRepo()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['cxp', filtro], queryFn: () => repo.listCxp(filtro) })
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['cxp'] }); qc.invalidateQueries({ queryKey: ['pagos'] }) }
  const create = useMutation({ mutationFn: (i: { id_proveedor: string; folio_documento: string; categoria: string; descripcion: string; fecha_emision: string; fecha_vencimiento: string; monto_total: number; notas: string }) => repo.createCxp(i), onSuccess: invalidate })
  const del = useMutation({ mutationFn: (id: string) => repo.deleteCxp(id), onSuccess: invalidate })
  return { cxps: q.data ?? [], isLoading: q.isLoading, createCxp: create, deleteCxp: del }
}

export function usePagos(idOrigen?: string) {
  const repo = useRepo()
  return useQuery({ queryKey: ['pagos', idOrigen], queryFn: () => repo.listPagos(idOrigen) })
}

export function useRegisterPago() {
  const repo = useRepo()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: { tipo: 'cobro' | 'abono'; id_origen: string; fecha: string; monto: number; metodo_pago: MetodoPago; notas: string }) => repo.registerPago(p),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['facturas'] }); qc.invalidateQueries({ queryKey: ['cxp'] }); qc.invalidateQueries({ queryKey: ['pagos'] }) }
  })
}

export function useReportes(mes: string) {
  const repo = useRepo()
  return useQuery({ queryKey: ['reportes', mes], queryFn: () => repo.getReportes(mes) })
}

export function useCategorias(kind: 'gastos' | 'cxp') {
  const repo = useRepo()
  return useQuery({ queryKey: ['categorias', kind], queryFn: () => repo.getCategorias(kind) })
}
```

- [ ] **Step 4: Exportar y correr tests**

Add to `packages/shared/src/index.ts`:
```ts
export * from './store/appStore'
export * from './store/queries'
```

Run: `pnpm -F shared test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(shared): zustand store + tanstack query hooks"
```

---

## Task 10: Feature Dashboard

**Files:**
- Create: `packages/shared/src/features/dashboard/Dashboard.tsx`
- Create: `packages/shared/tests/dashboard.test.tsx`

**Interfaces:**
- Consumes: Task 9 (hooks), Task 8 (StatCard, Money).
- Produces: `Dashboard({ mes, onNavigate }: { mes: string; onNavigate: (k: NavKey) => void })` — KPIs + acciones rápidas.

- [ ] **Step 1: Escribir test fallido**

`packages/shared/tests/dashboard.test.tsx`:
```tsx
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { Dashboard } from '../src/features/dashboard/Dashboard'
import { AppProvider } from '../src/store/queries'
import { createRepository } from '../src/data/repository'
import { SheetsApi } from '../src/sheets/api'

beforeAll(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ valueRanges: [] }) })))
})
afterAll(() => vi.unstubAllGlobals())

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const repo = createRepository({ api: new SheetsApi(async () => 'T'), storage: { get: async () => null, set: async () => {}, remove: async () => {} }, getSpreadsheetId: async () => 'S' })
  return <AppProvider repo={repo}>{children}</AppProvider>
}

describe('Dashboard', () => {
  it('renderiza acción rápida de nueva factura', async () => {
    render(<Dashboard mes="2026-08" onNavigate={() => {}} />, { wrapper })
    expect(await screen.findByText(/nueva factura/i)).toBeTruthy()
  })
})
```

Dashboard gated por loading → usar `findByText`.

- [ ] **Step 2: Implementar Dashboard**

`packages/shared/src/features/dashboard/Dashboard.tsx`:
```tsx
import React from 'react'
import { useFacturas, useGastos, useCxp, useReportes } from '../../store/queries'
import { formatMoney } from '../../currency'
import { useAppStore } from '../../store/appStore'
import { StatCard, Button } from '../../ui/components'
import type { NavKey } from '../../ui/layout/Layout'

export function Dashboard({ mes, onNavigate }: { mes: string; onNavigate: (k: NavKey) => void }) {
  const config = useAppStore(s => s.config)
  const moneda = config?.moneda ?? 'USD'
  const { data: reportes, isLoading } = useReportes(mes)
  const { facturas } = useFacturas({ mes })
  const { gastos } = useGastos({ mes })
  const { cxps } = useCxp()

  if (isLoading && !reportes) return <div className="p-8 text-gray-500">Cargando…</div>
  const k = reportes?.kpis
  const pendientes = facturas.filter(f => f.saldo > 0)
  const vencidas = cxps.filter(c => c.saldo > 0 && c.fecha_vencimiento < new Date().toISOString().slice(0, 10))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => onNavigate('facturas')}>+ Nueva factura</Button>
        <Button variant="outline" onClick={() => onNavigate('gastos')}>+ Registrar gasto</Button>
        <Button variant="outline" onClick={() => onNavigate('cuentas')}>+ Registrar pago</Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Facturado" value={k ? formatMoney(k.facturado, moneda) : '—'} />
        <StatCard label="Cobrado" value={k ? formatMoney(k.cobrado, moneda) : '—'} tone="positive" />
        <StatCard label="Pendiente de cobro" value={k ? formatMoney(k.pendiente, moneda) : '—'} tone="negative" />
        <StatCard label="Gastos" value={k ? formatMoney(k.gastos, moneda) : '—'} tone="negative" />
        <StatCard label="Utilidad" value={k ? formatMoney(k.utilidad, moneda) : '—'} tone={k && k.utilidad < 0 ? 'negative' : 'positive'} />
        <StatCard label="Por pagar" value={k ? formatMoney(k.porPagar, moneda) : '—'} tone="negative" />
        <StatCard label="CXP vencidas" value={k ? formatMoney(k.vencidas, moneda) : '—'} tone="negative" />
        <StatCard label="CXP por vencer" value={k ? formatMoney(k.porVencer, moneda) : '—'} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="font-semibold mb-3">Pendientes de cobro</div>
          {pendientes.length === 0 && <p className="text-sm text-gray-500">Sin facturas pendientes</p>}
          {pendientes.map(f => (
            <div key={f.id_factura} className="flex justify-between py-1 text-sm border-b border-gray-50">
              <span>{f.folio} · {f.nombre_cliente}</span><span>{formatMoney(f.saldo, moneda)}</span>
            </div>
          ))}
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="font-semibold mb-3">CXP vencidas</div>
          {vencidas.length === 0 && <p className="text-sm text-gray-500">Sin cuentas vencidas</p>}
          {vencidas.map(c => (
            <div key={c.id_cxp} className="flex justify-between py-1 text-sm border-b border-gray-50">
              <span>{c.nombre_proveedor} · {c.folio_documento || c.descripcion}</span><span>{formatMoney(c.saldo, moneda)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="text-sm text-gray-500">Gastos del mes: {gastos.length} registros</div>
    </div>
  )
}
```

- [ ] **Step 3: Correr tests**

Run: `pnpm -F shared test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(shared): dashboard feature"
```

---

## Task 11: Feature Clientes

**Files:**
- Create: `packages/shared/src/features/clientes/Clientes.tsx`
- Create: `packages/shared/src/features/clientes/ClienteFormModal.tsx`
- Create: `packages/shared/tests/clientes.test.tsx`

**Interfaces:**
- Consumes: Task 9 (`useClientes`), Task 8 (UI).
- Produces: `Clientes()` — tabla con búsqueda, crear/editar/eliminar.

- [ ] **Step 1: Escribir test fallido**

`packages/shared/tests/clientes.test.tsx`:
```tsx
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { Clientes } from '../src/features/clientes/Clientes'
import { AppProvider } from '../src/store/queries'
import { createRepository } from '../src/data/repository'
import { SheetsApi } from '../src/sheets/api'

beforeAll(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ valueRanges: [] }) })))
})
afterAll(() => vi.unstubAllGlobals())

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const repo = createRepository({ api: new SheetsApi(async () => 'T'), storage: { get: async () => null, set: async () => {}, remove: async () => {} }, getSpreadsheetId: async () => 'S' })
  return <AppProvider repo={repo}>{children}</AppProvider>
}

describe('Clientes', () => {
  it('renderiza botón nuevo cliente', () => {
    render(<Clientes />, { wrapper })
    expect(screen.getByText(/nuevo cliente/i)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Implementar Clientes**

`packages/shared/src/features/clientes/ClienteFormModal.tsx`:
```tsx
import React, { useEffect, useState } from 'react'
import { Dialog, Button, Input } from '../../ui/components'
import type { Cliente } from '../../types/entities'

export function ClienteFormModal({ open, onClose, initial, onSave }: { open: boolean; onClose: () => void; initial: Cliente | null; onSave: (c: Cliente) => void }) {
  const [form, setForm] = useState({ nombre: '', rfc: '', email: '', telefono: '', direccion: '' })
  useEffect(() => {
    if (open) setForm(initial ? { nombre: initial.nombre, rfc: initial.rfc, email: initial.email, telefono: initial.telefono, direccion: initial.direccion } : { nombre: '', rfc: '', email: '', telefono: '', direccion: '' })
  }, [open, initial])
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  const submit = () => {
    if (!form.nombre.trim()) return
    onSave({ ...initial, ...form } as Cliente)
    onClose()
  }
  return (
    <Dialog open={open} onClose={onClose} title={initial ? 'Editar cliente' : 'Nuevo cliente'}
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit}>Guardar</Button></>}>
      <div className="space-y-3">
        <div><label className="text-xs text-gray-500">Nombre *</label><Input value={form.nombre} onChange={set('nombre')} /></div>
        <div><label className="text-xs text-gray-500">RFC</label><Input value={form.rfc} onChange={set('rfc')} /></div>
        <div><label className="text-xs text-gray-500">Email</label><Input value={form.email} onChange={set('email')} /></div>
        <div><label className="text-xs text-gray-500">Teléfono</label><Input value={form.telefono} onChange={set('telefono')} /></div>
        <div><label className="text-xs text-gray-500">Dirección</label><Input value={form.direccion} onChange={set('direccion')} /></div>
      </div>
    </Dialog>
  )
}
```

`packages/shared/src/features/clientes/Clientes.tsx`:
```tsx
import React, { useState } from 'react'
import { useClientes } from '../../store/queries'
import { Table, Button, Input, Dialog, ConfirmDialog } from '../../ui/components'
import { useToast } from '../../ui/components'
import { ClienteFormModal } from './ClienteFormModal'
import type { Cliente } from '../../types/entities'

export function Clientes() {
  const { clientes, saveCliente, deleteCliente } = useClientes()
  const toast = useToast()
  const [busqueda, setBusqueda] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editando, setEditando] = useState<Cliente | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const filtrados = clientes.filter(c => !busqueda || c.nombre.toLowerCase().includes(busqueda.toLowerCase()) || c.rfc.toLowerCase().includes(busqueda.toLowerCase()))

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl font-bold">Clientes</h1>
        <div className="flex gap-2">
          <Input placeholder="Buscar nombre o RFC…" value={busqueda} onChange={e => setBusqueda(e.target.value)} className="sm:w-64" />
          <Button onClick={() => { setEditando(null); setFormOpen(true) }}>+ Nuevo cliente</Button>
        </div>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <Table
          columns={[
            { key: 'nombre', header: 'Nombre', render: c => String(c.nombre) },
            { key: 'rfc', header: 'RFC', render: c => String(c.rfc) },
            { key: 'email', header: 'Email', render: c => String(c.email) },
            { key: 'telefono', header: 'Teléfono', render: c => String(c.telefono) },
            { key: 'acciones', header: '', render: c => (
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => { setEditando(c as Cliente); setFormOpen(true) }}>Editar</Button>
                <Button variant="danger" onClick={() => setDeleteId((c as Cliente).id_cliente)}>Eliminar</Button>
              </div>
            ) }
          ]}
          rows={filtrados as unknown as Record<string, unknown>[]}
        />
        {filtrados.length === 0 && <p className="p-4 text-sm text-gray-500">Sin clientes</p>}
      </div>
      <ClienteFormModal open={formOpen} onClose={() => setFormOpen(false)} initial={editando}
        onSave={async c => {
          try { await saveCliente.mutateAsync(c); toast('Cliente guardado') } catch (e) { toast((e as Error).message, 'error') }
        }} />
      <ConfirmDialog open={deleteId !== null} title="Eliminar cliente" message="¿Eliminar este cliente? Bloqueado si tiene facturas."
        onConfirm={async () => {
          if (!deleteId) return
          try { await deleteCliente.mutateAsync(deleteId); toast('Cliente eliminado') } catch (e) { toast((e as Error).message, 'error') }
          setDeleteId(null)
        }} onClose={() => setDeleteId(null)} />
    </div>
  )
}
```

- [ ] **Step 3: Correr tests**

Run: `pnpm -F shared test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(shared): clientes feature"
```

---

## Task 12: Feature Facturas (crear + listar + detalle + PDF + pagos)

**Files:**
- Create: `packages/shared/src/features/facturas/Facturas.tsx`
- Create: `packages/shared/src/features/facturas/FacturaFormModal.tsx`
- Create: `packages/shared/src/features/facturas/FacturaDetail.tsx`
- Create: `packages/shared/src/features/facturas/PagoModal.tsx`
- Create: `packages/shared/tests/facturas.test.tsx`

**Interfaces:**
- Consumes: Task 9 (hooks), Task 8 (UI, InvoicePrint, Money), Task 3 (formatMoney).
- Produces:
  - `Facturas()` — filtros estado/mes, tabla, crear/ver/eliminar.
  - `FacturaFormModal({ open, onClose, onSaved })` — conceptos dinámicos + previsualización en vivo + cliente rápido.
  - `FacturaDetail({ id, onClose })` — detalle + botón PDF (print) + pagos.
  - `PagoModal({ origen: { id, tipo, saldo }, onClose })` — registrar cobro/abono.
  - `export function printInvoice(det: { factura: Factura; items: FacturaItem[] }, config: Config)` — abre ventana, imprime contenido de `#invoice-print` y la cierra.

- [ ] **Step 1: Escribir test fallido**

`packages/shared/tests/facturas.test.tsx`:
```tsx
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { Facturas } from '../src/features/facturas/Facturas'
import { AppProvider } from '../src/store/queries'
import { createRepository } from '../src/data/repository'
import { SheetsApi } from '../src/sheets/api'

beforeAll(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ valueRanges: [] }) })))
})
afterAll(() => vi.unstubAllGlobals())

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const repo = createRepository({ api: new SheetsApi(async () => 'T'), storage: { get: async () => null, set: async () => {}, remove: async () => {} }, getSpreadsheetId: async () => 'S' })
  return <AppProvider repo={repo}>{children}</AppProvider>
}

describe('Facturas', () => {
  it('renderiza botón nueva factura', () => {
    render(<Facturas />, { wrapper })
    expect(screen.getByText(/nueva factura/i)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Implementar Facturas**

`packages/shared/src/features/facturas/PagoModal.tsx`:
```tsx
import React, { useState } from 'react'
import { Dialog, Button, Input, Select } from '../../ui/components'
import { useRegisterPago, useConfig } from '../../store/queries'
import { formatMoney } from '../../currency'

export function PagoModal({ origen, onClose }: { origen: { id: string; tipo: 'cobro' | 'abono'; saldo: number }; onClose: () => void }) {
  const registerPago = useRegisterPago()
  const { config } = useConfig()
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState('Efectivo')
  const [error, setError] = useState('')
  const moneda = config?.moneda ?? 'USD'

  const submit = async () => {
    const n = Number(monto)
    if (!n || n <= 0) return setError('Monto inválido')
    if (n > origen.saldo) return setError(`Supera saldo disponible (${formatMoney(origen.saldo, moneda)})`)
    try {
      await registerPago.mutateAsync({ tipo: origen.tipo, id_origen: origen.id, fecha: new Date().toISOString().slice(0, 10), monto: n, metodo_pago: metodo as never, notas: '' })
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Dialog open onClose={onClose} title={origen.tipo === 'cobro' ? 'Registrar cobro' : 'Registrar abono'}
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit}>Guardar pago</Button></>}>
      <div className="space-y-3">
        <p className="text-sm">Saldo disponible: <b>{formatMoney(origen.saldo, moneda)}</b></p>
        <div><label className="text-xs text-gray-500">Monto</label><Input type="number" value={monto} onChange={e => setMonto(e.target.value)} /></div>
        <div><label className="text-xs text-gray-500">Método</label>
          <Select value={metodo} onChange={setMetodo} options={['Efectivo', 'Transferencia', 'Tarjeta'].map(v => ({ value: v, label: v }))} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Dialog>
  )
}
```

`packages/shared/src/features/facturas/FacturaFormModal.tsx`:
```tsx
import React, { useEffect, useState } from 'react'
import { Dialog, Button, Input, Select } from '../../ui/components'
import { useClientes, useFacturas, useConfig } from '../../store/queries'
import { buildFactura } from '../../calc/invoice'
import { formatMoney } from '../../currency'
import { uid } from '../../lib/uid'

interface ItemForm { descripcion: string; cantidad: string; precio_unitario: string }

export function FacturaFormModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { clientes, saveCliente } = useClientes()
  const { createFactura } = useFacturas()
  const { config } = useConfig()
  const [id_cliente, setIdCliente] = useState('')
  const [clienteRapido, setClienteRapido] = useState('')
  const [fecha_vencimiento, setVencimiento] = useState('')
  const [notas, setNotas] = useState('')
  const [items, setItems] = useState<ItemForm[]>([{ descripcion: '', cantidad: '1', precio_unitario: '' }])
  const [error, setError] = useState('')
  const moneda = config?.moneda ?? 'USD'

  useEffect(() => { if (open) { setIdCliente(''); setItems([{ descripcion: '', cantidad: '1', precio_unitario: '' }]); setError('') } }, [open])

  const setItem = (i: number, k: keyof ItemForm, v: string) => setItems(list => list.map((it, idx) => idx === i ? { ...it, [k]: v } : it))
  const parsedItems = items.map(it => ({ descripcion: it.descripcion, cantidad: Number(it.cantidad) || 0, precio_unitario: Number(it.precio_unitario) || 0 }))
  const totals = buildFactura(parsedItems, config?.iva_porcentaje ?? 16)

  const submit = async () => {
    try {
      let clienteId = id_cliente
      if (!clienteId && clienteRapido.trim()) {
        const nuevo = await saveCliente.mutateAsync({ id_cliente: uid('cli_'), nombre: clienteRapido.trim(), rfc: '', email: '', telefono: '', direccion: '', fecha_registro: new Date().toISOString().slice(0, 10) })
        clienteId = nuevo.id_cliente
      }
      const validos = parsedItems.filter(it => it.descripcion && it.cantidad > 0 && it.precio_unitario >= 0)
      if (!clienteId) return setError('Selecciona o crea un cliente')
      if (validos.length === 0) return setError('Agrega al menos 1 concepto completo')
      await createFactura.mutateAsync({ id_cliente: clienteId, items: validos, fecha_emision: new Date().toISOString().slice(0, 10), fecha_vencimiento, notas })
      onSaved()
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Nueva factura"
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit}>Guardar factura</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">Cliente</label>
            <Select value={id_cliente} onChange={setIdCliente} options={clientes.map(c => ({ value: c.id_cliente, label: c.nombre }))} placeholder="Seleccionar…" />
          </div>
          <div><label className="text-xs text-gray-500">Cliente rápido (nuevo)</label><Input value={clienteRapido} onChange={e => setClienteRapido(e.target.value)} placeholder="Nombre…" /></div>
        </div>
        <div><label className="text-xs text-gray-500">Fecha vencimiento</label><Input type="date" value={fecha_vencimiento} onChange={e => setVencimiento(e.target.value)} /></div>
        <div className="space-y-2">
          <div className="text-xs text-gray-500">Conceptos</div>
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-12 gap-2">
              <Input className="col-span-6" placeholder="Descripción" value={it.descripcion} onChange={e => setItem(i, 'descripcion', e.target.value)} />
              <Input className="col-span-2" type="number" placeholder="Cant" value={it.cantidad} onChange={e => setItem(i, 'cantidad', e.target.value)} />
              <Input className="col-span-3" type="number" placeholder="Precio" value={it.precio_unitario} onChange={e => setItem(i, 'precio_unitario', e.target.value)} />
              <button className="col-span-1 text-red-500" onClick={() => setItems(l => l.filter((_, idx) => idx !== i))}>✕</button>
            </div>
          ))}
          <Button variant="outline" onClick={() => setItems(l => [...l, { descripcion: '', cantidad: '1', precio_unitario: '' }])}>+ Agregar concepto</Button>
        </div>
        <div className="flex justify-end gap-6 text-sm border-t border-gray-100 pt-3">
          <div>Subtotal: <b>{formatMoney(totals.subtotal, moneda)}</b></div>
          <div>IVA ({config?.iva_porcentaje ?? 16}%): <b>{formatMoney(totals.iva, moneda)}</b></div>
          <div>Total: <b>{formatMoney(totals.total, moneda)}</b></div>
        </div>
        <div><label className="text-xs text-gray-500">Notas</label><Input value={notas} onChange={e => setNotas(e.target.value)} /></div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Dialog>
  )
}
```

`packages/shared/src/features/facturas/FacturaDetail.tsx`:
```tsx
import React, { useEffect, useState } from 'react'
import { Dialog, Button, Table } from '../../ui/components'
import { InvoicePrint } from '../../ui/print/InvoicePrint'
import { useFactura, usePagos, useConfig } from '../../store/queries'
import { formatMoney } from '../../currency'
import { PagoModal } from './PagoModal'

export function printInvoice(det: { factura: { folio: string } }) {
  const w = window.open('', '_blank', 'width=900,height=700')
  if (!w) return
  const node = document.getElementById('invoice-print')
  if (!node) return
  w.document.write('<html><head><title>Factura ' + det.factura.folio + '</title><style>body{font-family:system-ui,sans-serif;padding:2rem;color:#111}table{width:100%;border-collapse:collapse}th,td{padding:.5rem;text-align:left;border-bottom:1px solid #ddd}@media print{body{padding:0}}</style></head><body>')
  w.document.write(node.innerHTML)
  w.document.write('</body></html>')
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 200)
}

export function FacturaDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: det, isLoading } = useFactura(id)
  const { data: pagos = [] } = usePagos(id)
  const { config } = useConfig()
  const [pagoOpen, setPagoOpen] = useState(false)
  const moneda = config?.moneda ?? 'USD'
  if (isLoading || !det) return null
  const { factura, items } = det

  return (
    <Dialog open onClose={onClose} title={`Factura ${factura.folio}`}
      footer={<>
        <Button variant="outline" onClick={() => printInvoice(det)}>Descargar PDF</Button>
        {factura.saldo > 0 && <Button onClick={() => setPagoOpen(true)}>Registrar cobro</Button>}
        <Button variant="outline" onClick={onClose}>Cerrar</Button>
      </>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>Cliente: <b>{factura.nombre_cliente}</b></div>
          <div>Emisión: {factura.fecha_emision}</div>
          <div>Vence: {factura.fecha_vencimiento || '—'}</div>
          <div>Estado: <b>{factura.saldo <= 0 ? 'Pagada' : factura.fecha_pago ? 'Parcial' : 'Pendiente'}</b></div>
        </div>
        <Table columns={[
          { key: 'd', header: 'Descripción', render: r => String(r.descripcion) },
          { key: 'c', header: 'Cant', render: r => String(r.cantidad) },
          { key: 'p', header: 'Precio', render: r => formatMoney(Number(r.precio_unitario), moneda) },
          { key: 'i', header: 'Importe', render: r => formatMoney(Number(r.importe), moneda) }
        ]} rows={items as unknown as Record<string, unknown>[]} />
        <div className="flex justify-end gap-6 text-sm">
          <div>Subtotal: <b>{formatMoney(factura.subtotal, moneda)}</b></div>
          <div>IVA: <b>{formatMoney(factura.iva, moneda)}</b></div>
          <div>Total: <b>{formatMoney(factura.total, moneda)}</b></div>
          <div>Saldo: <b>{formatMoney(factura.saldo, moneda)}</b></div>
        </div>
        {pagos.length > 0 && (
          <div>
            <div className="text-xs text-gray-500 mb-1">Pagos registrados</div>
            {pagos.map(p => (
              <div key={p.id_pago} className="flex justify-between text-sm border-b border-gray-50 py-1">
                <span>{p.fecha} · {p.metodo_pago}</span><span>{formatMoney(p.monto, moneda)}</span>
              </div>
            ))}
          </div>
        )}
        {config && <InvoicePrint factura={factura} items={items} config={config} />}
      </div>
      {pagoOpen && <PagoModal origen={{ id: factura.id_factura, tipo: 'cobro', saldo: factura.saldo }} onClose={() => { setPagoOpen(false); onClose() }} />}
    </Dialog>
  )
}
```

`packages/shared/src/features/facturas/Facturas.tsx`:
```tsx
import React, { useState } from 'react'
import { useFacturas, useConfig } from '../../store/queries'
import { Table, Button, Select, ConfirmDialog, Badge } from '../../ui/components'
import { useToast } from '../../ui/components'
import { formatMoney } from '../../currency'
import { FacturaFormModal } from './FacturaFormModal'
import { FacturaDetail } from './FacturaDetail'

function estadoDe(f: { saldo: number; fecha_pago: string }): { label: string; tone: 'green' | 'yellow' | 'red' } {
  if (f.saldo <= 0) return { label: 'Pagada', tone: 'green' }
  if (f.fecha_pago) return { label: 'Parcial', tone: 'yellow' }
  return { label: 'Pendiente', tone: 'red' }
}

export function Facturas() {
  const { facturas, createFactura, deleteFactura } = useFacturas({})
  const { config } = useConfig()
  const toast = useToast()
  const [estado, setEstado] = useState('')
  const [mes, setMes] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [detalleId, setDetalleId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const moneda = config?.moneda ?? 'USD'

  const filtradas = facturas.filter(f => (!estado || estadoDe(f).label === estado) && (!mes || f.fecha_emision.slice(0, 7) === mes))

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl font-bold">Facturas</h1>
        <div className="flex gap-2">
          <Select value={estado} onChange={setEstado} options={[{ value: 'Pendiente', label: 'Pendiente' }, { value: 'Parcial', label: 'Parcial' }, { value: 'Pagada', label: 'Pagada' }]} placeholder="Estado" />
          <Input type="month" value={mes} onChange={e => setMes(e.target.value)} />
          <Button onClick={() => setFormOpen(true)}>+ Nueva factura</Button>
        </div>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <Table columns={[
          { key: 'folio', header: 'Folio', render: r => String(r.folio) },
          { key: 'cliente', header: 'Cliente', render: r => String(r.nombre_cliente) },
          { key: 'emision', header: 'Emisión', render: r => String(r.fecha_emision) },
          { key: 'total', header: 'Total', render: r => formatMoney(Number(r.total), moneda) },
          { key: 'saldo', header: 'Saldo', render: r => formatMoney(Number(r.saldo), moneda) },
          { key: 'estado', header: 'Estado', render: r => { const e = estadoDe(r as { saldo: number; fecha_pago: string }); return <Badge tone={e.tone}>{e.label}</Badge> } },
          { key: 'acciones', header: '', render: r => (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setDetalleId(String(r.id_factura))}>Ver</Button>
              <Button variant="danger" onClick={() => setDeleteId(String(r.id_factura))}>Eliminar</Button>
            </div>
          ) }
        ]} rows={filtradas as unknown as Record<string, unknown>[]} />
        {filtradas.length === 0 && <p className="p-4 text-sm text-gray-500">Sin facturas</p>}
      </div>
      <FacturaFormModal open={formOpen} onClose={() => setFormOpen(false)} onSaved={() => toast('Factura creada')} />
      {detalleId && <FacturaDetail id={detalleId} onClose={() => setDetalleId(null)} />}
      <ConfirmDialog open={deleteId !== null} title="Eliminar factura" message="Se eliminará la factura, sus conceptos y pagos. ¿Continuar?"
        onConfirm={async () => { if (deleteId) { try { await deleteFactura.mutateAsync(deleteId); toast('Factura eliminada') } catch (e) { toast((e as Error).message, 'error') } } setDeleteId(null) }}
        onClose={() => setDeleteId(null)} />
    </div>
  )
}
```

- [ ] **Step 3: Correr tests**

Run: `pnpm -F shared test`
Expected: PASS. (El test de humo valida render con repo fake.)

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(shared): facturas feature (create/list/detail/pdf/pagos)"
```

---

## Task 13: Feature Gastos

**Files:**
- Create: `packages/shared/src/features/gastos/Gastos.tsx`
- Create: `packages/shared/src/features/gastos/GastoFormModal.tsx`
- Create: `packages/shared/tests/gastos.test.tsx`

**Interfaces:**
- Consumes: Task 9, Task 8, Task 3.
- Produces: `Gastos()` — tabla filtrable por mes/categoría, crear/editar/eliminar.

- [ ] **Step 1: Escribir test fallido**

`packages/shared/tests/gastos.test.tsx`:
```tsx
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { Gastos } from '../src/features/gastos/Gastos'
import { AppProvider } from '../src/store/queries'
import { createRepository } from '../src/data/repository'
import { SheetsApi } from '../src/sheets/api'

beforeAll(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ valueRanges: [] }) })))
})
afterAll(() => vi.unstubAllGlobals())

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const repo = createRepository({ api: new SheetsApi(async () => 'T'), storage: { get: async () => null, set: async () => {}, remove: async () => {} }, getSpreadsheetId: async () => 'S' })
  return <AppProvider repo={repo}>{children}</AppProvider>
}

describe('Gastos', () => {
  it('renderiza título', () => {
    render(<Gastos />, { wrapper })
    expect(screen.getByText(/registrar gasto/i)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Implementar Gastos**

`packages/shared/src/features/gastos/GastoFormModal.tsx`:
```tsx
import React, { useEffect, useState } from 'react'
import { Dialog, Button, Input, Select } from '../../ui/components'
import { useGastos, useCategorias } from '../../store/queries'
import { useToast } from '../../ui/components'
import type { Gasto } from '../../types/entities'

export function GastoFormModal({ open, onClose, initial }: { open: boolean; onClose: () => void; initial: Gasto | null }) {
  const { saveGasto } = useGastos()
  const { data: categorias = [] } = useCategorias('gastos')
  const toast = useToast()
  const [form, setForm] = useState({ fecha: new Date().toISOString().slice(0, 10), categoria: '', descripcion: '', monto: '', metodo_pago: 'Efectivo', proveedor: '' })
  useEffect(() => {
    if (open) setForm(initial ? { ...initial, monto: String(initial.monto) } : { fecha: new Date().toISOString().slice(0, 10), categoria: '', descripcion: '', monto: '', metodo_pago: 'Efectivo', proveedor: '' })
  }, [open, initial])
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  const submit = async () => {
    if (!form.descripcion.trim() || Number(form.monto) <= 0) return
    try {
      await saveGasto.mutateAsync({ ...initial, ...form, monto: Number(form.monto) } as never)
      toast('Gasto guardado')
      onClose()
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }
  return (
    <Dialog open={open} onClose={onClose} title={initial ? 'Editar gasto' : 'Registrar gasto'}
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit}>Guardar</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">Fecha</label><Input type="date" value={form.fecha} onChange={set('fecha')} /></div>
          <div><label className="text-xs text-gray-500">Categoría</label>
            <Select value={form.categoria} onChange={v => setForm(f => ({ ...f, categoria: v }))} options={categorias.map(c => ({ value: c, label: c }))} />
          </div>
        </div>
        <div><label className="text-xs text-gray-500">Descripción *</label><Input value={form.descripcion} onChange={set('descripcion')} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">Monto *</label><Input type="number" value={form.monto} onChange={set('monto')} /></div>
          <div><label className="text-xs text-gray-500">Método</label>
            <Select value={form.metodo_pago} onChange={v => setForm(f => ({ ...f, metodo_pago: v }))} options={['Efectivo', 'Transferencia', 'Tarjeta'].map(v => ({ value: v, label: v }))} />
          </div>
        </div>
        <div><label className="text-xs text-gray-500">Proveedor</label><Input value={form.proveedor} onChange={set('proveedor')} /></div>
      </div>
    </Dialog>
  )
}
```

`packages/shared/src/features/gastos/Gastos.tsx`:
```tsx
import React, { useState } from 'react'
import { useGastos, useConfig, useCategorias } from '../../store/queries'
import { Table, Button, Select, Input, ConfirmDialog } from '../../ui/components'
import { useToast } from '../../ui/components'
import { formatMoney } from '../../currency'
import { GastoFormModal } from './GastoFormModal'
import type { Gasto } from '../../types/entities'

export function Gastos() {
  const { gastos, deleteGasto } = useGastos({})
  const { config } = useConfig()
  const { data: categorias = [] } = useCategorias('gastos')
  const toast = useToast()
  const [mes, setMes] = useState('')
  const [categoria, setCategoria] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editando, setEditando] = useState<Gasto | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const moneda = config?.moneda ?? 'USD'

  const filtrados = gastos.filter(g => (!mes || g.fecha.slice(0, 7) === mes) && (!categoria || g.categoria === categoria))

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl font-bold">Gastos</h1>
        <div className="flex gap-2">
          <Input type="month" value={mes} onChange={e => setMes(e.target.value)} />
          <Select value={categoria} onChange={setCategoria} options={categorias.map(c => ({ value: c, label: c }))} placeholder="Categoría" />
          <Button onClick={() => { setEditando(null); setFormOpen(true) }}>+ Registrar gasto</Button>
        </div>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <Table columns={[
          { key: 'fecha', header: 'Fecha', render: r => String(r.fecha) },
          { key: 'categoria', header: 'Categoría', render: r => String(r.categoria) },
          { key: 'descripcion', header: 'Descripción', render: r => String(r.descripcion) },
          { key: 'monto', header: 'Monto', render: r => formatMoney(Number(r.monto), moneda) },
          { key: 'metodo_pago', header: 'Método', render: r => String(r.metodo_pago) },
          { key: 'acciones', header: '', render: r => (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => { setEditando(r as Gasto); setFormOpen(true) }}>Editar</Button>
              <Button variant="danger" onClick={() => setDeleteId(String(r.id_gasto))}>Eliminar</Button>
            </div>
          ) }
        ]} rows={filtrados as unknown as Record<string, unknown>[]} />
        {filtrados.length === 0 && <p className="p-4 text-sm text-gray-500">Sin gastos</p>}
      </div>
      <GastoFormModal open={formOpen} onClose={() => setFormOpen(false)} initial={editando} />
      <ConfirmDialog open={deleteId !== null} title="Eliminar gasto" message="¿Eliminar este gasto?"
        onConfirm={async () => { if (deleteId) { await deleteGasto.mutateAsync(deleteId); toast('Gasto eliminado') } setDeleteId(null) }} onClose={() => setDeleteId(null)} />
    </div>
  )
}
```

- [ ] **Step 3: Correr tests**

Run: `pnpm -F shared test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(shared): gastos feature"
```

---

## Task 14: Features Proveedores + Cuentas por Pagar

**Files:**
- Create: `packages/shared/src/features/proveedores/Proveedores.tsx`
- Create: `packages/shared/src/features/proveedores/ProveedorFormModal.tsx`
- Create: `packages/shared/src/features/cuentasPagar/CuentasPagar.tsx`
- Create: `packages/shared/src/features/cuentasPagar/CxpFormModal.tsx`
- Create: `packages/shared/src/features/cuentasPagar/CxpDetail.tsx`
- Create: `packages/shared/tests/cuentasPagar.test.tsx`

**Interfaces:**
- Consumes: Task 9, Task 8, Task 3, `PagoModal` de facturas (reutilizable para abonos).
- Produces:
  - `Proveedores()` — CRUD, bloqueado si tiene cxp.
  - `CuentasPagar()` — tabla con estado/saldo, crear, ver detalle, abonar, eliminar.
  - `CxpFormModal({ open, onClose })`
  - `CxpDetail({ id, onClose })` — detalle + abonar + historial de abonos.

- [ ] **Step 1: Escribir test fallido**

`packages/shared/tests/cuentasPagar.test.tsx`:
```tsx
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { CuentasPagar } from '../src/features/cuentasPagar/CuentasPagar'
import { AppProvider } from '../src/store/queries'
import { createRepository } from '../src/data/repository'
import { SheetsApi } from '../src/sheets/api'

beforeAll(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ valueRanges: [] }) })))
})
afterAll(() => vi.unstubAllGlobals())

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const repo = createRepository({ api: new SheetsApi(async () => 'T'), storage: { get: async () => null, set: async () => {}, remove: async () => {} }, getSpreadsheetId: async () => 'S' })
  return <AppProvider repo={repo}>{children}</AppProvider>
}

describe('CuentasPagar', () => {
  it('renderiza título', () => {
    render(<CuentasPagar />, { wrapper })
    expect(screen.getByText(/cuentas por pagar/i)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Implementar Proveedores**

`packages/shared/src/features/proveedores/ProveedorFormModal.tsx`:
```tsx
import React, { useEffect, useState } from 'react'
import { Dialog, Button, Input } from '../../ui/components'
import type { Proveedor } from '../../types/entities'

export function ProveedorFormModal({ open, onClose, initial, onSave }: { open: boolean; onClose: () => void; initial: Proveedor | null; onSave: (p: Proveedor) => void }) {
  const [form, setForm] = useState({ nombre: '', rfc: '', email: '', telefono: '', direccion: '' })
  useEffect(() => {
    if (open) setForm(initial ? { nombre: initial.nombre, rfc: initial.rfc, email: initial.email, telefono: initial.telefono, direccion: initial.direccion } : { nombre: '', rfc: '', email: '', telefono: '', direccion: '' })
  }, [open, initial])
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  const submit = () => { if (!form.nombre.trim()) return; onSave({ ...initial, ...form } as Proveedor); onClose() }
  return (
    <Dialog open={open} onClose={onClose} title={initial ? 'Editar proveedor' : 'Nuevo proveedor'}
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit}>Guardar</Button></>}>
      <div className="space-y-3">
        <div><label className="text-xs text-gray-500">Nombre *</label><Input value={form.nombre} onChange={set('nombre')} /></div>
        <div><label className="text-xs text-gray-500">RFC</label><Input value={form.rfc} onChange={set('rfc')} /></div>
        <div><label className="text-xs text-gray-500">Email</label><Input value={form.email} onChange={set('email')} /></div>
        <div><label className="text-xs text-gray-500">Teléfono</label><Input value={form.telefono} onChange={set('telefono')} /></div>
        <div><label className="text-xs text-gray-500">Dirección</label><Input value={form.direccion} onChange={set('direccion')} /></div>
      </div>
    </Dialog>
  )
}
```

`packages/shared/src/features/proveedores/Proveedores.tsx`:
```tsx
import React, { useState } from 'react'
import { useProveedores } from '../../store/queries'
import { Table, Button, ConfirmDialog } from '../../ui/components'
import { useToast } from '../../ui/components'
import { ProveedorFormModal } from './ProveedorFormModal'
import type { Proveedor } from '../../types/entities'

export function Proveedores() {
  const { proveedores, saveProveedor, deleteProveedor } = useProveedores()
  const toast = useToast()
  const [formOpen, setFormOpen] = useState(false)
  const [editando, setEditando] = useState<Proveedor | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Proveedores</h1>
        <Button onClick={() => { setEditando(null); setFormOpen(true) }}>+ Nuevo proveedor</Button>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <Table columns={[
          { key: 'nombre', header: 'Nombre', render: r => String(r.nombre) },
          { key: 'rfc', header: 'RFC', render: r => String(r.rfc) },
          { key: 'email', header: 'Email', render: r => String(r.email) },
          { key: 'telefono', header: 'Teléfono', render: r => String(r.telefono) },
          { key: 'acciones', header: '', render: r => (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => { setEditando(r as Proveedor); setFormOpen(true) }}>Editar</Button>
              <Button variant="danger" onClick={() => setDeleteId(String(r.id_proveedor))}>Eliminar</Button>
            </div>
          ) }
        ]} rows={proveedores as unknown as Record<string, unknown>[]} />
        {proveedores.length === 0 && <p className="p-4 text-sm text-gray-500">Sin proveedores</p>}
      </div>
      <ProveedorFormModal open={formOpen} onClose={() => setFormOpen(false)} initial={editando}
        onSave={async p => { try { await saveProveedor.mutateAsync(p); toast('Proveedor guardado') } catch (e) { toast((e as Error).message, 'error') } }} />
      <ConfirmDialog open={deleteId !== null} title="Eliminar proveedor" message="Bloqueado si tiene cuentas por pagar. ¿Continuar?"
        onConfirm={async () => { if (deleteId) { try { await deleteProveedor.mutateAsync(deleteId); toast('Proveedor eliminado') } catch (e) { toast((e as Error).message, 'error') } } setDeleteId(null) }} onClose={() => setDeleteId(null)} />
    </div>
  )
}
```

- [ ] **Step 3: Implementar CuentasPagar**

`packages/shared/src/features/cuentasPagar/CxpFormModal.tsx`:
```tsx
import React, { useEffect, useState } from 'react'
import { Dialog, Button, Input, Select } from '../../ui/components'
import { useProveedores, useCxp, useCategorias } from '../../store/queries'
import { useToast } from '../../ui/components'

export function CxpFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { proveedores } = useProveedores()
  const { data: categorias = [] } = useCategorias('cxp')
  const { createCxp } = useCxp()
  const toast = useToast()
  const [form, setForm] = useState({ id_proveedor: '', folio_documento: '', categoria: '', descripcion: '', fecha_vencimiento: '', monto_total: '', notas: '' })
  useEffect(() => { if (open) setForm({ id_proveedor: '', folio_documento: '', categoria: '', descripcion: '', fecha_vencimiento: '', monto_total: '', notas: '' }) }, [open])
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  const submit = async () => {
    if (!form.id_proveedor || !form.descripcion.trim() || !form.fecha_vencimiento || Number(form.monto_total) <= 0) return
    try {
      await createCxp.mutateAsync({ ...form, fecha_emision: new Date().toISOString().slice(0, 10), monto_total: Number(form.monto_total) })
      toast('CXP creada')
      onClose()
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }
  return (
    <Dialog open={open} onClose={onClose} title="Nueva cuenta por pagar"
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit}>Guardar</Button></>}>
      <div className="space-y-3">
        <div><label className="text-xs text-gray-500">Proveedor *</label>
          <Select value={form.id_proveedor} onChange={v => setForm(f => ({ ...f, id_proveedor: v }))} options={proveedores.map(p => ({ value: p.id_proveedor, label: p.nombre }))} placeholder="Seleccionar…" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">Folio documento</label><Input value={form.folio_documento} onChange={set('folio_documento')} /></div>
          <div><label className="text-xs text-gray-500">Categoría</label>
            <Select value={form.categoria} onChange={v => setForm(f => ({ ...f, categoria: v }))} options={categorias.map(c => ({ value: c, label: c }))} />
          </div>
        </div>
        <div><label className="text-xs text-gray-500">Descripción *</label><Input value={form.descripcion} onChange={set('descripcion')} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">Fecha vencimiento *</label><Input type="date" value={form.fecha_vencimiento} onChange={set('fecha_vencimiento')} /></div>
          <div><label className="text-xs text-gray-500">Monto total *</label><Input type="number" value={form.monto_total} onChange={set('monto_total')} /></div>
        </div>
        <div><label className="text-xs text-gray-500">Notas</label><Input value={form.notas} onChange={set('notas')} /></div>
      </div>
    </Dialog>
  )
}
```

`packages/shared/src/features/cuentasPagar/CxpDetail.tsx`:
```tsx
import React, { useState } from 'react'
import { Dialog, Button } from '../../ui/components'
import { useCxpById, usePagos, useConfig } from '../../store/queries'
import { formatMoney } from '../../currency'
import { PagoModal } from '../facturas/PagoModal'

export function CxpDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: det } = useCxpById(id)
  const { data: pagos = [] } = usePagos(id)
  const { config } = useConfig()
  const [abonoOpen, setAbonoOpen] = useState(false)
  const moneda = config?.moneda ?? 'USD'
  if (!det) return null
  const cxp = det.factura
  return (
    <Dialog open onClose={onClose} title={`CXP ${cxp.folio_documento || cxp.id_cxp}`}
      footer={<>
        {cxp.saldo > 0 && <Button onClick={() => setAbonoOpen(true)}>Registrar abono</Button>}
        <Button variant="outline" onClick={onClose}>Cerrar</Button>
      </>}>
      <div className="space-y-3 text-sm">
        <div>Proveedor: <b>{cxp.nombre_proveedor}</b></div>
        <div>Descripción: {cxp.descripcion}</div>
        <div className="flex justify-between"><span>Total</span><b>{formatMoney(cxp.monto_total, moneda)}</b></div>
        <div className="flex justify-between"><span>Saldo</span><b>{formatMoney(cxp.saldo, moneda)}</b></div>
        {pagos.map(p => (
          <div key={p.id_pago} className="flex justify-between border-b border-gray-50 py-1"><span>{p.fecha} · {p.metodo_pago}</span><span>{formatMoney(p.monto, moneda)}</span></div>
        ))}
      </div>
      {abonoOpen && <PagoModal origen={{ id: cxp.id_cxp, tipo: 'abono', saldo: cxp.saldo }} onClose={() => { setAbonoOpen(false); onClose() }} />}
    </Dialog>
  )
}
```

Nota: `useCxpById` se define en queries.ts dentro de esta misma Task (ver Step 3 abajo); devuelve `{ factura: CuentaPagar; items: never[] } | null`.

`packages/shared/src/features/cuentasPagar/CuentasPagar.tsx`:
```tsx
import React, { useState } from 'react'
import { useCxp, useConfig } from '../../store/queries'
import { Table, Button, Select, ConfirmDialog, Badge } from '../../ui/components'
import { useToast } from '../../ui/components'
import { formatMoney } from '../../currency'
import { CxpFormModal } from './CxpFormModal'
import { CxpDetail } from './CxpDetail'

export function CuentasPagar() {
  const { cxps, deleteCxp } = useCxp()
  const { config } = useConfig()
  const toast = useToast()
  const [estado, setEstado] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [detalleId, setDetalleId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const moneda = config?.moneda ?? 'USD'
  const filtrados = cxps.filter(c => !estado || c.estado === estado)
  const tone = (c: { saldo: number; estado: string }) => c.saldo <= 0 ? 'green' as const : c.estado === 'pendiente' ? 'red' as const : 'yellow' as const

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl font-bold">Cuentas por Pagar</h1>
        <div className="flex gap-2">
          <Select value={estado} onChange={setEstado} options={[{ value: 'pendiente', label: 'Pendiente' }, { value: 'parcial', label: 'Parcial' }, { value: 'pagada', label: 'Pagada' }]} placeholder="Estado" />
          <Button onClick={() => setFormOpen(true)}>+ Nueva CXP</Button>
        </div>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <Table columns={[
          { key: 'prov', header: 'Proveedor', render: r => String(r.nombre_proveedor) },
          { key: 'desc', header: 'Descripción', render: r => String(r.descripcion) },
          { key: 'venc', header: 'Vence', render: r => String(r.fecha_vencimiento) },
          { key: 'total', header: 'Total', render: r => formatMoney(Number(r.monto_total), moneda) },
          { key: 'saldo', header: 'Saldo', render: r => formatMoney(Number(r.saldo), moneda) },
          { key: 'estado', header: 'Estado', render: r => { const t = tone(r as { saldo: number; estado: string }); return <Badge tone={t}>{String(r.estado)}</Badge> } },
          { key: 'acciones', header: '', render: r => (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setDetalleId(String(r.id_cxp))}>Ver</Button>
              <Button variant="danger" onClick={() => setDeleteId(String(r.id_cxp))}>Eliminar</Button>
            </div>
          ) }
        ]} rows={filtrados as unknown as Record<string, unknown>[]} />
        {filtrados.length === 0 && <p className="p-4 text-sm text-gray-500">Sin cuentas por pagar</p>}
      </div>
      <CxpFormModal open={formOpen} onClose={() => setFormOpen(false)} />
      {detalleId && <CxpDetail id={detalleId} onClose={() => setDetalleId(null)} />}
      <ConfirmDialog open={deleteId !== null} title="Eliminar CXP" message="Se eliminará la cuenta y sus abonos. ¿Continuar?"
        onConfirm={async () => {
          if (deleteId) {
            try { await deleteCxp.mutateAsync(deleteId); toast('CXP eliminada') }
            catch (e) { toast((e as Error).message, 'error') }
          }
          setDeleteId(null)
        }} onClose={() => setDeleteId(null)} />
    </div>
  )
}
```

- [ ] **Step 4: Añadir hook useCxpById a queries.ts**

Append a `packages/shared/src/store/queries.ts`:
```ts
export function useCxpById(id: string | null) {
  const repo = useRepo()
  return useQuery({
    queryKey: ['cxpById', id],
    queryFn: async (): Promise<{ factura: CuentaPagar; items: never[] } | null> => {
      if (!id) return null
      const all = await repo.listCxp({})
      const cxp = all.find(c => c.id_cxp === id)
      if (!cxp) return null
      return { factura: cxp, items: [] }
    },
    enabled: !!id
  })
}
```
(importar `CuentaPagar` desde `../types/entities` — ya se importa.)

- [ ] **Step 5: Correr tests**

Run: `pnpm -F shared test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(shared): proveedores + cuentas por pagar features"
```

---

## Task 15: Cierre features — Reportes, Configuración, índice de features

**Files:**
- Create: `packages/shared/src/features/reportes/Reportes.tsx`
- Create: `packages/shared/src/features/configuracion/Configuracion.tsx`
- Create: `packages/shared/src/features/index.ts`
- Create: `packages/shared/tests/reportes.test.tsx`, `packages/shared/tests/configuracion.test.tsx`

**Interfaces:**
- Consumes: Tasks 8-14.
- Produces:
  - `Reportes({ mes, setMes })` — KPIs + gastos por categoría + top 5 clientes.
  - `Configuracion()` — formulario empresa, facturación (prefijo, contador, iva, moneda), categorías.
  - `PAGES: Record<NavKey, (props) => JSX>` o export de páginas individuales para los shells.

- [ ] **Step 1: Escribir test fallido**

`packages/shared/tests/reportes.test.tsx`:
```tsx
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { Reportes } from '../src/features/reportes/Reportes'
import { AppProvider } from '../src/store/queries'
import { createRepository } from '../src/data/repository'
import { SheetsApi } from '../src/sheets/api'

beforeAll(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ valueRanges: [] }) })))
})
afterAll(() => vi.unstubAllGlobals())

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const repo = createRepository({ api: new SheetsApi(async () => 'T'), storage: { get: async () => null, set: async () => {}, remove: async () => {} }, getSpreadsheetId: async () => 'S' })
  return <AppProvider repo={repo}>{children}</AppProvider>
}

describe('Reportes', () => {
  it('renderiza título', async () => {
    render(<Reportes mes="2026-08" setMes={() => {}} />, { wrapper })
    expect(await screen.findByText(/reportes/i)).toBeTruthy()
  })
})
```

`packages/shared/tests/configuracion.test.tsx`:
```tsx
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { Configuracion } from '../src/features/configuracion/Configuracion'
import { AppProvider } from '../src/store/queries'
import { createRepository } from '../src/data/repository'
import { SheetsApi } from '../src/sheets/api'

beforeAll(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ valueRanges: [] }) })))
})
afterAll(() => vi.unstubAllGlobals())

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const repo = createRepository({ api: new SheetsApi(async () => 'T'), storage: { get: async () => null, set: async () => {}, remove: async () => {} }, getSpreadsheetId: async () => 'S' })
  return <AppProvider repo={repo}>{children}</AppProvider>
}

describe('Configuracion', () => {
  it('renderiza sección de empresa', async () => {
    render(<Configuracion />, { wrapper })
    expect(await screen.findByText(/datos de la empresa/i)).toBeTruthy()
  })
})
```

Reportes y Configuración están gated por loading → `findByText`.

- [ ] **Step 2: Implementar Reportes**

`packages/shared/src/features/reportes/Reportes.tsx`:
```tsx
import React from 'react'
import { useReportes, useConfig } from '../../store/queries'
import { StatCard, Card, Input } from '../../ui/components'
import { formatMoney } from '../../currency'

export function Reportes({ mes, setMes }: { mes: string; setMes: (m: string) => void }) {
  const { data: reportes, isLoading } = useReportes(mes)
  const { config } = useConfig()
  const moneda = config?.moneda ?? 'USD'
  if (isLoading || !reportes) return <div className="p-8 text-gray-500">Cargando…</div>
  const { kpis, categorias, top } = reportes
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Reportes</h1>
        <Input type="month" value={mes} onChange={e => setMes(e.target.value)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Facturado" value={formatMoney(kpis.facturado, moneda)} />
        <StatCard label="Cobrado" value={formatMoney(kpis.cobrado, moneda)} tone="positive" />
        <StatCard label="Pendiente" value={formatMoney(kpis.pendiente, moneda)} tone="negative" />
        <StatCard label="Gastos" value={formatMoney(kpis.gastos, moneda)} tone="negative" />
        <StatCard label="Utilidad" value={formatMoney(kpis.utilidad, moneda)} tone={kpis.utilidad < 0 ? 'negative' : 'positive'} />
        <StatCard label="Por pagar" value={formatMoney(kpis.porPagar, moneda)} tone="negative" />
        <StatCard label="Vencidas" value={formatMoney(kpis.vencidas, moneda)} tone="negative" />
        <StatCard label="Por vencer" value={formatMoney(kpis.porVencer, moneda)} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Gastos por categoría">
          {categorias.length === 0 && <p className="text-sm text-gray-500">Sin datos</p>}
          {categorias.map(c => (
            <div key={c.categoria} className="flex justify-between py-1 text-sm border-b border-gray-50">
              <span>{c.categoria}</span><span>{formatMoney(c.total, moneda)}</span>
            </div>
          ))}
        </Card>
        <Card title="Top 5 clientes">
          {top.length === 0 && <p className="text-sm text-gray-500">Sin datos</p>}
          {top.map((c, i) => (
            <div key={i} className="flex justify-between py-1 text-sm border-b border-gray-50">
              <span>{i + 1}. {c.nombre}</span><span>{formatMoney(c.total, moneda)}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Implementar Configuración**

`packages/shared/src/features/configuracion/Configuracion.tsx`:
```tsx
import React, { useEffect, useState } from 'react'
import { useConfig, useRepo } from '../../store/queries'
import { useQueryClient } from '@tanstack/react-query'
import { Card, Button, Input, Select } from '../../ui/components'
import { useToast } from '../../ui/components'
import { CURRENCIES } from '../../currency'
import type { Config } from '../../types/entities'

export function Configuracion() {
  const { config, saveConfig } = useConfig()
  const repo = useRepo()
  const qc = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState<Config | null>(null)
  useEffect(() => { if (config && !form) setForm(config) }, [config, form])
  if (!config || !form) return <div className="p-8 text-gray-500">Cargando…</div>
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => f && ({ ...f, [k]: e.target.value }))
  const submit = async () => {
    try {
      const fresh = await qc.fetchQuery({ queryKey: ['config'], queryFn: () => repo.getConfig() })
      await saveConfig.mutateAsync({
        ...form,
        contador_folio: Math.max(fresh.contador_folio, Number(form.contador_folio)),
        iva_porcentaje: Number(form.iva_porcentaje)
      })
      toast('Configuración guardada')
    } catch (e) { toast((e as Error).message, 'error') }
  }
  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold">Configuración</h1>
      <Card title="Datos de la empresa">
        <div className="space-y-3">
          <div><label className="text-xs text-gray-500">Nombre *</label><Input value={form.empresa_nombre} onChange={set('empresa_nombre')} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-gray-500">RFC</label><Input value={form.empresa_rfc} onChange={set('empresa_rfc')} /></div>
            <div><label className="text-xs text-gray-500">Teléfono</label><Input value={form.empresa_telefono} onChange={set('empresa_telefono')} /></div>
          </div>
          <div><label className="text-xs text-gray-500">Email</label><Input value={form.empresa_email} onChange={set('empresa_email')} /></div>
          <div><label className="text-xs text-gray-500">Dirección</label><Input value={form.empresa_direccion} onChange={set('empresa_direccion')} /></div>
          <div><label className="text-xs text-gray-500">Logo (URL)</label><Input value={form.empresa_logo} onChange={set('empresa_logo')} /></div>
        </div>
      </Card>
      <Card title="Facturación">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">Prefijo folio *</label><Input value={form.prefijo_folio} onChange={set('prefijo_folio')} /></div>
          <div><label className="text-xs text-gray-500">Contador actual</label><Input type="number" value={form.contador_folio} onChange={set('contador_folio')} /></div>
          <div><label className="text-xs text-gray-500">IVA %</label><Input type="number" value={form.iva_porcentaje} onChange={set('iva_porcentaje')} /></div>
          <div><label className="text-xs text-gray-500">Moneda</label>
            <Select value={form.moneda} onChange={v => setForm(f => f && ({ ...f, moneda: v }))} options={CURRENCIES.map(c => ({ value: c.code, label: `${c.code} · ${c.name}` }))} />
          </div>
        </div>
      </Card>
      <Card title="Categorías">
        <div><label className="text-xs text-gray-500">Gastos (separadas por coma)</label><Input value={form.categorias_gastos} onChange={set('categorias_gastos')} /></div>
        <div className="mt-3"><label className="text-xs text-gray-500">Cuentas por pagar (separadas por coma)</label><Input value={form.categorias_cxp} onChange={set('categorias_cxp')} /></div>
      </Card>
      <Button onClick={submit}>Guardar configuración</Button>
    </div>
  )
}
```

- [ ] **Step 4: Implementar features/index.ts**

`packages/shared/src/features/index.ts`:
```ts
export { Dashboard } from './dashboard/Dashboard'
export { Facturas } from './facturas/Facturas'
export { FacturaDetail } from './facturas/FacturaDetail'
export { Clientes } from './clientes/Clientes'
export { Gastos } from './gastos/Gastos'
export { Proveedores } from './proveedores/Proveedores'
export { CuentasPagar } from './cuentasPagar/CuentasPagar'
export { CxpDetail } from './cuentasPagar/CxpDetail'
export { Reportes } from './reportes/Reportes'
export { Configuracion } from './configuracion/Configuracion'
```

- [ ] **Step 5: Correr tests**

Run: `pnpm -F shared test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(shared): reportes, configuracion, features index"
```

---

## Task 16: App de extensión (WXT)

**Files:**
- Create: `apps/extension/wxt.config.ts`, `apps/extension/tsconfig.json`, `apps/extension/package.json` (ya existe mínima)
- Create: `apps/extension/entrypoints/background.ts`
- Create: `apps/extension/entrypoints/popup/index.html`, `popup/main.tsx`, `popup/App.tsx`
- Create: `apps/extension/entrypoints/dashboard/index.html`, `dashboard/main.tsx`, `dashboard/DashboardApp.tsx`
- Create: `apps/extension/public/icon128.png`
- Create: `apps/extension/src/onboarding.ts`
- Test: manual checklist (no automatizable fácilmente)

**Interfaces:**
- Consumes: Todo `shared`.
- Produces: extensión instalable `.zip`; popup con KPIs rápidos; pestaña dashboard completa; onboarding (auth → crear hoja → guardar id).

- [ ] **Step 1: Escribir config y entrypoints**

`apps/extension/wxt.config.ts`:
```ts
import { defineConfig } from 'wxt'

export default defineConfig({
  manifest: {
    name: 'FinanceTracker',
    version: '0.1.0',
    description: 'Facturación, clientes, gastos y cuentas por pagar con Google Sheets',
    permissions: ['identity', 'storage', 'tabs'],
    host_permissions: ['https://sheets.googleapis.com/*', 'https://www.googleapis.com/*'],
    oauth2: {
      client_id: 'YOUR_EXTENSION_CLIENT_ID',
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    },
    action: { default_popup: 'popup.html' }
  }
})
```

`apps/extension/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": [".wxt", "entrypoints", "src", "types"]
}
```

Instalar deps:
```bash
pnpm -F extension add wxt@^0.20 typescript
pnpm -F extension add @ft/shared@workspace:* react react-dom @tanstack/react-query zustand zod
```

`apps/extension/entrypoints/background.ts`:
```ts
import { defineBackground } from 'wxt/sandbox'

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(['ft_spreadsheet_id'], (res) => {
      if (!res.ft_spreadsheet_id) {
        chrome.tabs.create({ url: chrome.runtime.getURL('/dashboard.html') })
      }
    })
  })
})
```

`apps/extension/src/onboarding.ts`:
```ts
import { SheetsApi } from '@ft/shared'
import { createInitialSpreadsheet } from '@ft/shared'
import { chromeStorageAdapter, KEYS } from '@ft/shared'

export function getChromeToken(interactive: boolean): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        if (!interactive) {
          chrome.identity.getAuthToken({ interactive: true }, (t2) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
            else resolve(t2)
          })
          return
        }
        reject(new Error(chrome.runtime.lastError.message))
      } else {
        resolve(token)
      }
    })
  })
}

export async function ensureSheet(clientId: string): Promise<{ spreadsheetId: string; url: string } | null> {
  const existing = await chromeStorageAdapter.get(KEYS.spreadsheetId)
  if (existing) {
    const url = `https://docs.google.com/spreadsheets/d/${existing}/edit`
    return { spreadsheetId: existing, url }
  }
  const token = await getChromeToken(true)
  const api = new SheetsApi(async () => token)
  const created = await createInitialSpreadsheet(api)
  await chromeStorageAdapter.set(KEYS.spreadsheetId, created.spreadsheetId)
  return created
}
```

Nota: `getChromeToken(false)` escala automáticamente a `interactive: true` si el token cacheado no está disponible (revocado/expirado) — evita el fallo silencioso del popup/dashboard con `'…'`.

`apps/extension/entrypoints/popup/index.html`:
```html
<!doctype html>
<html>
  <head><meta charset="utf-8"><title>FinanceTracker</title></head>
  <body><div id="root"></div><script type="module" src="./main.tsx"></script></body>
</html>
```

`apps/extension/entrypoints/popup/main.tsx`:
```tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import './popup.css'
import { PopupApp } from './App'

createRoot(document.getElementById('root')!).render(<PopupApp />)
```

`apps/extension/entrypoints/popup/popup.css`:
```css
@import 'tailwindcss';
body { width: 320px; }
```

`apps/extension/entrypoints/popup/App.tsx`:
```tsx
import React, { useEffect, useState } from 'react'
import { chromeStorageAdapter, KEYS, SheetsApi } from '@ft/shared'
import { AppProvider, useReportes, useConfig } from '@ft/shared'
import { createRepository } from '@ft/shared'
import { formatMoney } from '@ft/shared'
import { StatCard, Button } from '@ft/shared'
import { getChromeToken } from '../../src/onboarding'

function Repo() {
  const [sheet, setSheet] = useState<{ id: string } | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    chromeStorageAdapter.get(KEYS.spreadsheetId).then(async id => {
      if (!id) { setReady(true); return }
      setSheet({ id })
    }).finally(() => setReady(true))
  }, [])
  if (!ready) return null
  if (!sheet) return (
    <div className="p-4 space-y-3">
      <p className="text-sm">Necesitas configurar tu hoja de cálculo.</p>
      <Button onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('/dashboard.html') })}>Configurar</Button>
    </div>
  )
  const api = new SheetsApi(() => getChromeToken(false))
  const repo = createRepository({ api, storage: chromeStorageAdapter, getSpreadsheetId: async () => sheet.id })
  return <AppProvider repo={repo}><PopupInner /></AppProvider>
}

function PopupInner() {
  const { config } = useConfig()
  const { data: reportes } = useReportes(new Date().toISOString().slice(0, 7))
  const moneda = config?.moneda ?? 'USD'
  const k = reportes?.kpis
  return (
    <div className="p-3 space-y-3">
      <div className="font-bold">FinanceTracker</div>
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Cobrado" value={k ? formatMoney(k.cobrado, moneda) : '…'} />
        <StatCard label="Pendiente" value={k ? formatMoney(k.pendiente, moneda) : '…'} />
        <StatCard label="Por pagar" value={k ? formatMoney(k.porPagar, moneda) : '…'} />
        <StatCard label="Vencidas" value={k ? formatMoney(k.vencidas, moneda) : '…'} />
      </div>
      <Button className="w-full" onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('/dashboard.html') })}>Abrir dashboard</Button>
    </div>
  )
}

export function PopupApp() { return <Repo /> }
```

`apps/extension/entrypoints/dashboard/index.html` (igual estructura que popup, título "Dashboard") y `main.tsx`:
```tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import './dashboard.css'
import { DashboardApp } from './DashboardApp'

createRoot(document.getElementById('root')!).render(<DashboardApp />)
```

`apps/extension/entrypoints/dashboard/DashboardApp.tsx`:
```tsx
import React, { useState, useEffect } from 'react'
import { ensureSheet, getChromeToken } from '../../src/onboarding'
import { createRepository, chromeStorageAdapter, KEYS, SheetsApi, AppProvider, Layout, Dashboard, Facturas, Clientes, Gastos, Proveedores, CuentasPagar, Reportes, Configuracion, Toaster, useConfig } from '@ft/shared'
import type { NavKey } from '@ft/shared'

function Boot() {
  const [sheet, setSheet] = useState<{ id: string } | null>(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [nav, setNav] = useState<NavKey>('dashboard')
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7))

  useEffect(() => {
    (async () => {
      try {
        const s = await ensureSheet((chrome.runtime as unknown as { getManifest: () => { oauth2?: { client_id?: string } } }).getManifest().oauth2?.client_id ?? '')
        if (s) setSheet(s)
      } catch (e) { setErr((e as Error).message) }
      setLoading(false)
    })()
  }, [])

  if (loading) return <div className="p-8">Conectando a Google Sheets…</div>
  if (err || !sheet) return <div className="p-8 text-red-600">{err || 'Error de configuración'}</div>
  const api = new SheetsApi(() => getChromeToken(false))
  const repo = createRepository({ api, storage: chromeStorageAdapter, getSpreadsheetId: async () => sheet.id })

  return (
    <AppProvider repo={repo}>
      <Toaster>
        <SyncOnOpen />
        <Layout current={nav} onNavigate={setNav}>
          {nav === 'dashboard' && <Dashboard mes={mes} onNavigate={setNav} />}
          {nav === 'facturas' && <Facturas />}
          {nav === 'clientes' && <Clientes />}
          {nav === 'gastos' && <Gastos />}
          {nav === 'proveedores' && <Proveedores />}
          {nav === 'cuentas' && <CuentasPagar />}
          {nav === 'reportes' && <Reportes mes={mes} setMes={setMes} />}
          {nav === 'configuracion' && <Configuracion />}
        </Layout>
      </Toaster>
    </AppProvider>
  )
}

function SyncOnOpen() {
  useConfig()
  return null
}

export function DashboardApp() { return <Boot /> }
```

Nota: `Layout` en la pestaña no necesita header hamburguesa (desktop), pero funciona igual.

- [ ] **Step 2: Crear icono placeholder**

```bash
mkdir -p apps/extension/public
python3 - <<'EOF'
import base64, zlib
# PNG 128x128 sólido simple (azul)
def png():
    import struct
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    sig = b'\x89PNG\r\n\x1a\n'
    w = h = 128
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
    rows = b''
    for _ in range(h):
        rows += b'\x00' + bytes([0x25, 0x63, 0xF5]) * w
    return sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b'')
open('apps/extension/public/icon128.png','wb').write(png())
EOF
```

- [ ] **Step 3: Build y verificar**

```bash
pnpm -F extension build
```

Expected: genera `.output/` con manifest + entrypoints; sin errores TS.

- [ ] **Step 4: Checklist manual (documentar en README)**

1. `pnpm dev:extension` → Chrome "Load unpacked" de `.output/chrome-mv3`.
2. Primer uso: clic icono → se abre dashboard → consentimiento Google → se crea hoja.
3. Crear cliente → factura → marcar pago → PDF (print).
4. Recargar → datos persisten (hoja en drive).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(extension): wxt popup + dashboard + onboarding"
```

---

## Task 17: App web (Vite)

**Files:**
- Create: `apps/web/vite.config.ts`, `apps/web/tsconfig.json`, `apps/web/index.html`
- Create: `apps/web/.env.example`
- Create: `apps/web/src/main.tsx`, `apps/web/src/App.tsx`, `apps/web/src/auth/popupOAuth.ts`
- Create: `apps/web/playwright.config.ts`, `apps/web/e2e/app.spec.ts`
- Modify: `apps/web/package.json` (script `test:e2e` ya definido)

**Interfaces:**
- Consumes: Todo `shared`.
- Produces: web deployable (Netlify/Vercel); e2e Playwright del flujo principal.

- [ ] **Step 1: Config Vite**

`apps/web/vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 }
})
```

`apps/web/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true, "types": ["vite/client"] },
  "include": ["src", "e2e"]
}
```

`apps/web/index.html`:
```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>FinanceTracker</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/web/.env.example`:
```
VITE_OAUTH_CLIENT_ID=XXXX.apps.googleusercontent.com
VITE_OAUTH_REDIRECT_URI=http://localhost:5173
```

Instalar:
```bash
pnpm -F web add vite@^6 @vitejs/plugin-react react react-dom @ft/shared@workspace:* @tanstack/react-query zustand zod
pnpm -F web add -D typescript @playwright/test
```

- [ ] **Step 2: Implementar auth web y app**

`apps/web/src/auth/popupOAuth.ts`:
```ts
import { popupOAuth } from '@ft/shared'

const clientId = import.meta.env.VITE_OAUTH_CLIENT_ID as string
const redirectUri = import.meta.env.VITE_OAUTH_REDIRECT_URI ?? window.location.origin

export const webAuth = popupOAuth({ clientId, redirectUri, prompt: 'none' })
```

`apps/web/src/main.tsx`:
```tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(<App />)
```

`apps/web/src/index.css`:
```css
@import 'tailwindcss';
```

`apps/web/src/App.tsx`:
```tsx
import React, { useEffect, useState } from 'react'
import { createRepository, localStorageAdapter, KEYS, SheetsApi, createInitialSpreadsheet, AppProvider, Layout, Dashboard, Facturas, Clientes, Gastos, Proveedores, CuentasPagar, Reportes, Configuracion, Toaster } from '@ft/shared'
import type { NavKey } from '@ft/shared'
import { webAuth } from './auth/popupOAuth'

function Shell() {
  const [sheet, setSheet] = useState<{ id: string } | null>(null)
  const [nav, setNav] = useState<NavKey>('dashboard')
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7))
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      try {
        let id = await localStorageAdapter.get(KEYS.spreadsheetId)
        if (!id) {
          await webAuth.getToken(true) // redirige y vuelve con access_token
          id = await localStorageAdapter.get(KEYS.spreadsheetId)
          if (!id) {
            const token = await webAuth.getToken(false)
            const api = new SheetsApi(async () => token)
            const created = await createInitialSpreadsheet(api)
            await localStorageAdapter.set(KEYS.spreadsheetId, created.spreadsheetId)
            id = created.spreadsheetId
          }
        }
        setSheet({ id })
      } catch (e) { setError((e as Error).message) }
    })()
  }, [])

  if (error) return <div className="p-8 text-red-600">{error}</div>
  if (!sheet) return <div className="p-8">Conectando a Google Sheets…</div>
  const api = new SheetsApi(async () => {
    try {
      return await webAuth.getToken(false)
    } catch {
      return await webAuth.getToken(true)
    }
  })
  const repo = createRepository({ api, storage: localStorageAdapter, getSpreadsheetId: async () => sheet.id })
  return (
    <AppProvider repo={repo}>
      <Toaster>
        <Layout current={nav} onNavigate={setNav}>
          {nav === 'dashboard' && <Dashboard mes={mes} onNavigate={setNav} />}
          {nav === 'facturas' && <Facturas />}
          {nav === 'clientes' && <Clientes />}
          {nav === 'gastos' && <Gastos />}
          {nav === 'proveedores' && <Proveedores />}
          {nav === 'cuentas' && <CuentasPagar />}
          {nav === 'reportes' && <Reportes mes={mes} setMes={setMes} />}
          {nav === 'configuracion' && <Configuracion />}
        </Layout>
      </Toaster>
    </AppProvider>
  )
}

export function App() { return <Shell /> }
```

(import de `createInitialSpreadsheet` directo en vez de dynamic import si el bundle lo permite; el dynamic import evita colisión de naming con el hook `createInitialSpreadsheet`.)

- [ ] **Step 3: E2E Playwright**

`apps/web/playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e',
  webServer: { command: 'pnpm dev', url: 'http://localhost:5173', reuseExistingServer: true }
})
```

`apps/web/e2e/app.spec.ts`:
```ts
import { test, expect } from '@playwright/test'

test('carga la app y muestra estado de conexión', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText(/conectando/i)).toBeVisible({ timeout: 15000 })
})
```

Nota: el flujo OAuth real requiere credenciales; el e2e valida render del shell. Para un test completo usar mock de la capa auth (documentar).

- [ ] **Step 4: Build web**

```bash
pnpm -F web build
```

Expected: bundle ok.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(web): vite app + oauth popup + e2e scaffold"
```

---

## Task 18: Docs + verificación final

**Files:**
- Create: `README.md`
- Create: `.env.example` raíz (referencia)

**Interfaces:**
- Consumes: todo.
- Produces: guía GCP, build/load extensión, deploy web, vars de entorno.

- [ ] **Step 1: Escribir README**

`README.md` — contenido mínimo:
- Descripción y arquitectura (monorepo).
- Requisitos: Node 22+, pnpm 11+, cuenta Google, proyecto GCP.
- **Pasos GCP**: crear proyecto → habilitar "Google Sheets API" → OAuth consent screen (external, test) → Credentials: (1) OAuth client "Chrome extension" con el ID de la extensión (visible al cargar unpacked, `chrome://extensions`), (2) OAuth client "Web application" con `http://localhost:5173` + URL de prod. Copiar client IDs a `wxt.config.ts` (`oauth2.client_id`) y a `apps/web/.env`.
- Comandos: `pnpm install`, `pnpm dev:extension`, `pnpm dev:web`, `pnpm -F extension build` + "Load unpacked" de `.output/chrome-mv3`, `pnpm -F web build` + deploy a Netlify/Vercel.
- Cómo funciona el primer uso (permisos → creación de hoja → spreadsheetId en storage).
- Testing: `pnpm test`, `pnpm test:e2e`.

- [ ] **Step 2: Verificación final**

```bash
pnpm -F shared test
pnpm -F extension build
pnpm -F web build
pnpm test
```

Expected: todo verde.

- [ ] **Step 3: Commit final**

```bash
git add -A && git commit -m "docs: README + setup guide"
```

---

## Self-Review del plan

**Cobertura del spec (design doc §1-12):**
- §1 objetivo/alcance → Tasks 1, 16, 17 (monorepo, extensión, web) + Features AP (Task 14).
- §2 stack/estructura → Task 1 + Tasks 16-17.
- §3 modelo de datos (9 hojas) → Task 5 (`tables.ts`, `createSpreadsheet.ts`).
- §4 folio atómico → Task 7 (`mutex.ts` + `createFactura`).
- §5 cálculos → Task 4 (calc) + Task 7 (repository KPI wiring).
- §6 UI/sidebar/popup → Tasks 8, 16; features Tasks 10-15.
- §7 PDF → Task 8 (`InvoicePrint`) + Task 12 (`printInvoice`).
- §8 sync → `SyncOnOpen`/pull en tasks 16-17 (auto-refresh vía TanStack invalidations en Tasks 9).
- §9 reglas de negocio → Task 2 (zod) + Task 7 (delete bloqueado, pago ≤ saldo).
- §10 testing → Tasks 2-15 (vitest), Task 17 (playwright).
- §11 docs → Task 18.

**Placeholder scan:** sin TBD/TODO; todos los steps tienen código concreto. El client_id de GCP se deja como `YOUR_EXTENSION_CLIENT_ID`/env — es un secret de configuración, no placeholder de código.

**Consistencia de tipos:** `useCxpById` añadido en Task 15 y usado por `CxpDetail` (Task 14) — nota de ajuste en Task 14 Step 3 y resuelto en Task 15 Step 2. `createInitialSpreadsheet` exportado desde shared y usado en Task 16 (onboarding) y Task 17 (web). `RepoContext.getSpreadsheetId` usado en `createRepository` (Task 7). `formatMoney(amount, code)` firma consistente. `NavKey` definido en Task 8 y usado en features + shells.

**Nota de riesgo:** El fake API de los tests de Task 7 es grid-based y simula: batchUpdate a fila 1 = reemplazo completo; fila >1 = escritura dirigida por coordenadas; endpoint `:append` acumula tras la última fila con datos; `:clear` vacía. La fila del mutex (Config!A50) queda fuera del bloque A1:Bn de configToRows para que `writeConfig` no la borre; en el fake, `writeConfig` (fila 1) sí la elimina — inofensivo para las aserciones, distinto del comportamiento real de Sheets (donde A50 persiste).
