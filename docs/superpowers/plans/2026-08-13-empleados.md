# Sección Empleados con Nómina Integrada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nueva sección Empleados con nómina integrada: CRUD de empleados y pagos de salario que generan gastos automáticos con categoría 'Nómina'.

**Architecture:** Hoja `Empleados` nueva en `tables.ts` (createInitialSpreadsheet la crea automáticamente). Repository gana `listEmpleados/saveEmpleado/deleteEmpleado/registerNomina` (esta última escribe un Gasto). UI: página + modales en `features/empleados/`, hooks `useEmpleados`/`useRegisterNomina`, nav + `IconUsers`, wiring en las 2 apps.

**Tech Stack:** React 19 · TypeScript 5 (strict) · Tailwind CSS 4 · Vitest 3 · Zod 4

## Global Constraints

- TypeScript `strict: true`. Sin `any` en tipos públicos.
- Hoja `Empleados` columnas (string/number/date): id_empleado, nombre, rfc, puesto, salario, fecha_ingreso, activo. `activo` = string `'true'/'false'`.
- `deleteEmpleado` bloquea si el empleado tiene gastos con `categoria === 'Nómina' && proveedor === nombre`.
- `registerNomina` crea Gasto: `categoria: 'Nómina'`, `descripcion: "Nómina {mes} — {nombre}"`, `proveedor: nombre`, `monto: round2(parsed.monto)`.
- Documento del empleado usa label dinámico `getDocLabel` (de `../../taxid`).
- No hay migrador de hojas existentes (fuera de alcance) — la hoja Empleados solo se crea en spreadsheets nuevos vía `createInitialSpreadsheet`.
- Tests: `pnpm test` (suite + nuevos), typecheck `pnpm exec tsc --noEmit -p packages/shared`, builds `pnpm -F web build && pnpm -F extension build`.
- Commits convencionales.

---

### Task 1: Modelo — hoja Empleados + entities + schemas

**Files:**
- Modify: `packages/shared/src/sheets/tables.ts` (TABLES + TableName)
- Modify: `packages/shared/src/types/entities.ts` (Empleado)
- Modify: `packages/shared/src/types/schemas.ts` (EmpleadoSchema, NominaInputSchema)
- Test: `packages/shared/tests/types.test.ts` o nuevo `tests/empleados.test.ts`

**Interfaces:**
- Produces: `Empleado` entity, `EmpleadoSchema`, `NominaInputSchema`, tabla `'Empleados'` en `TABLES` y `TableName`.

- [ ] **Step 1: Write the failing test**

Crear `packages/shared/tests/empleados.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { TABLES } from '../src/sheets/tables'
import { EmpleadoSchema, NominaInputSchema } from '../src/types/schemas'

describe('empleados schema', () => {
  it('TABLES incluye la hoja Empleados con 7 columnas', () => {
    const spec = TABLES.Empleados
    expect(spec.map(c => c.key)).toEqual(['id_empleado', 'nombre', 'rfc', 'puesto', 'salario', 'fecha_ingreso', 'activo'])
  })
  it('EmpleadoSchema requiere nombre y default salario 0', () => {
    const e = EmpleadoSchema.parse({ nombre: 'Ana' })
    expect(e.salario).toBe(0)
    expect(e.activo).toBe('true')
    expect(() => EmpleadoSchema.parse({ nombre: '' })).toThrow()
  })
  it('NominaInputSchema valida mes YYYY-MM', () => {
    expect(() => NominaInputSchema.parse({ id_empleado: 'emp_1', mes: '2026-08', monto: 100 })).not.toThrow()
    expect(() => NominaInputSchema.parse({ id_empleado: 'emp_1', mes: 'ago', monto: 100 })).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F shared test -- tests/empleados.test.ts`
Expected: FAIL — `TABLES.Empleados` undefined / module errors

- [ ] **Step 3: Implement**

`tables.ts` — añadir `'Empleados'` al union type `TableName` y al objeto `TABLES` (tras `Clientes`):

```ts
  Empleados: [
    { key: 'id_empleado', header: 'id_empleado', type: S },
    { key: 'nombre', header: 'nombre', type: S },
    { key: 'rfc', header: 'rfc', type: S },
    { key: 'puesto', header: 'puesto', type: S },
    { key: 'salario', header: 'salario', type: N },
    { key: 'fecha_ingreso', header: 'fecha_ingreso', type: D },
    { key: 'activo', header: 'activo', type: S }
  ],
```

`entities.ts` — añadir interfaz:

```ts
export interface Empleado {
  id_empleado: string
  nombre: string
  rfc: string
  puesto: string
  salario: number
  fecha_ingreso: string
  activo: string
}
```

`schemas.ts` — añadir (tras `ProveedorSchema`):

```ts
export const EmpleadoSchema = z.object({
  id_empleado: z.string().optional(),
  nombre: z.string().min(1, 'Nombre obligatorio'),
  rfc: z.string().default(''),
  puesto: z.string().default(''),
  salario: z.number().nonnegative('Salario >= 0').default(0),
  fecha_ingreso: z.string().default(''),
  activo: z.string().default('true')
})

export const NominaInputSchema = z.object({
  id_empleado: z.string().min(1, 'Empleado obligatorio'),
  mes: z.string().regex(/^\d{4}-\d{2}$/, 'Mes con formato YYYY-MM'),
  monto: z.number().positive('Monto > 0'),
  metodo_pago: MetodoPagoSchema.default('Transferencia'),
  fecha: z.string().default(() => new Date().toISOString().slice(0, 10)),
  notas: z.string().default('')
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F shared test -- tests/empleados.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Full suite + typecheck**

Run: `pnpm test && pnpm exec tsc --noEmit -p packages/shared`
Expected: verde + limpio

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/sheets/tables.ts packages/shared/src/types/entities.ts packages/shared/src/types/schemas.ts packages/shared/tests/empleados.test.ts
git commit -m "feat: modelo Empleados y schemas de nómina"
```

---

### Task 2: Repository — CRUD empleados + registerNomina + hooks

**Files:**
- Modify: `packages/shared/src/data/repository.ts`
- Modify: `packages/shared/src/store/queries.tsx`
- Test: `packages/shared/tests/empleados.test.ts` (append repository tests)

**Interfaces:**
- Consumes: `Empleado`, `EmpleadoSchema`, `NominaInputSchema` (Task 1)
- Produces: `listEmpleados()`, `saveEmpleado(e)`, `deleteEmpleado(id)`, `registerNomina(input)`, hooks `useEmpleados()` y `useRegisterNomina()`.

- [ ] **Step 1: Write the failing test**

Append a `describe` a `packages/shared/tests/empleados.test.ts`:

```ts
import { createRepository } from '../src/data/repository'
import { SheetsApi } from '../src/sheets/api'
import { vi } from 'vitest'

// stub fetch como en repository.test.ts
function makeRepo() {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ valueRanges: [] }) }))
  vi.stubGlobal('fetch', fetchMock)
  const api = new SheetsApi(async () => 'T')
  const storage = { get: async () => null, set: async () => {}, remove: async () => {} }
  return createRepository({ api, storage, getSpreadsheetId: async () => 'S' })
}
```

Lee primero `packages/shared/tests/repository.test.ts` para reutilizar su patrón de stub de `fetch`/`batchGet` si aporta más fidelidad (el stub simple `{ valueRanges: [] }` hace que las tablas se lean vacías y `saveEmpleado` haga append). Añade los tests:

```ts
describe('empleados repository', () => {
  it('saveEmpleado sin id asigna uid emp_ y hace append', async () => {
    const repo = makeRepo()
    const saved = await repo.saveEmpleado({ nombre: 'Ana', rfc: '', puesto: '', salario: 5000, fecha_ingreso: '2026-01-01', activo: 'true' } as never)
    expect(saved.id_empleado).toMatch(/^emp_/)
  })
  it('registerNomina crea un gasto categoría Nómina', async () => {
    const repo = makeRepo()
    const g = await repo.registerNomina({ id_empleado: 'emp_1', mes: '2026-08', monto: 5000, metodo_pago: 'Transferencia', fecha: '2026-08-05', notas: '' })
    expect(g.categoria).toBe('Nómina')
    expect(g.descripcion).toContain('Nómina 2026-08')
  })
})
```

Nota: `registerNomina` lee `Empleados` (stub devuelve vacío → `throw 'Empleado no existe'`). Para que el test del gasto pase con el stub simple, consulta `repository.test.ts` y reusa su setup de lectura de tablas si existe (busca cómo mockea `batchGet` para devolver filas). Si el stub simple no alcanza, mockea `batchGet` para que `Empleados` devuelva `[['emp_1','Ana','','',5000,'2026-01-01','true']]`. Documenta lo que hiciste.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F shared test -- tests/empleados.test.ts`
Expected: FAIL — `saveEmpleado is not a function`

- [ ] **Step 3: Implement repository**

`repository.ts` — importar:

```ts
import { EmpleadoSchema, NominaInputSchema } from '../types/schemas'
```

Dentro del objeto retornado (tras `saveProveedor`/`deleteProveedor`):

```ts
    async listEmpleados(): Promise<Empleado[]> { return readTable('Empleados') as unknown as Empleado[] },

    async saveEmpleado(emp: Empleado): Promise<Empleado> {
      const parsed = EmpleadoSchema.parse(emp)
      if (!parsed.id_empleado) {
        const saved = { ...parsed, id_empleado: uid('emp_'), fecha_ingreso: parsed.fecha_ingreso || new Date().toISOString().slice(0, 10) } as unknown as Empleado
        await appendRows('Empleados', [saved as unknown as Record<string, string | number>])
        return saved
      }
      const all = await readTable('Empleados')
      await replaceTable('Empleados', all.map(r => (r.id_empleado === parsed.id_empleado ? { ...parsed } : r)))
      return parsed as unknown as Empleado
    },

    async deleteEmpleado(id: string): Promise<void> {
      const gastos = await readTable('Gastos')
      const emp = (await readTable('Empleados')).find(r => r.id_empleado === id)
      const nombre = String(emp?.nombre ?? '')
      if (gastos.some(g => g.categoria === 'Nómina' && String(g.proveedor) === nombre)) {
        throw new Error('Empleado tiene nómina registrada')
      }
      await replaceTable('Empleados', (await readTable('Empleados')).filter(r => r.id_empleado !== id))
    },

    async registerNomina(input: { id_empleado: string; mes: string; monto: number; metodo_pago: MetodoPago; fecha: string; notas: string }): Promise<Gasto> {
      const parsed = NominaInputSchema.parse(input)
      const emp = (await readTable('Empleados')).find(r => r.id_empleado === parsed.id_empleado)
      if (!emp) throw new Error('Empleado no existe')
      const gasto: Gasto = {
        id_gasto: uid('gas_'),
        fecha: parsed.fecha,
        categoria: 'Nómina',
        descripcion: `Nómina ${parsed.mes} — ${String(emp.nombre)}`,
        monto: round2(parsed.monto),
        metodo_pago: parsed.metodo_pago,
        proveedor: String(emp.nombre)
      }
      await appendRows('Gastos', [gasto as unknown as Record<string, string | number>])
      return gasto
    },
```

Importar `Empleado` en el import de tipos existente (`import type { ..., Empleado }`).

- [ ] **Step 4: Implement hooks en `queries.tsx`**

Añadir (imports: `Empleado` type; `MetodoPago` ya importado):

```tsx
export function useEmpleados() {
  const repo = useRepo()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['empleados'], queryFn: () => repo.listEmpleados() })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['empleados'] })
  const save = useMutation({ mutationFn: (e: Empleado) => repo.saveEmpleado(e), onSuccess: invalidate })
  const del = useMutation({ mutationFn: (id: string) => repo.deleteEmpleado(id), onSuccess: invalidate })
  return { empleados: q.data ?? [], isLoading: q.isLoading, saveEmpleado: save, deleteEmpleado: del }
}

export function useRegisterNomina() {
  const repo = useRepo()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (i: { id_empleado: string; mes: string; monto: number; metodo_pago: MetodoPago; fecha: string; notas: string }) => repo.registerNomina(i),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gastos'] }); qc.invalidateQueries({ queryKey: ['reportes'] }) }
  })
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm -F shared test -- tests/empleados.test.ts`
Expected: PASS (3 + 2)

- [ ] **Step 6: Full suite + typecheck**

Run: `pnpm test && pnpm exec tsc --noEmit -p packages/shared`
Expected: verde + limpio

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/data/repository.ts packages/shared/src/store/queries.tsx packages/shared/tests/empleados.test.ts
git commit -m "feat: repository y hooks de empleados + registro de nómina"
```

---

### Task 3: IconUsers + nav + exports

**Files:**
- Modify: `packages/shared/src/ui/icons.tsx`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/features/index.ts`
- Modify: `packages/shared/src/ui/layout/Layout.tsx`

**Interfaces:**
- Produces: `IconUsers` exportado; `NavKey` incluye `'empleados'`; NAV item Empleados; feature `Empleados` exportado desde `./features` (se exporta en Task 4, aquí solo import lo que exista — el import del nav apunta a `IconUsers`).

- [ ] **Step 1: Add `IconUsers` a `icons.tsx`**

Tras `IconClient`:

```tsx
export function IconUsers({ className }: { className?: string }) {
  return <Icon className={className}><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 3.5a3.5 3.5 0 0 1 0 7" /><path d="M18 14c2 1 3 2.7 3 4.5" /></Icon>
}
```

- [ ] **Step 2: Export en `index.ts`**

Añadir `IconUsers` a la línea de export de icons:

```ts
export { IconDashboard, IconInvoice, IconClient, IconUsers, IconExpense, IconProvider, IconPayables, IconReport, IconSettings, IconPlus, IconSearch, IconEdit, IconTrash, IconX, IconCheck, IconAlert, IconMenu, IconLogo } from './ui/icons'
```

- [ ] **Step 3: Nav en `Layout.tsx`**

- Import: añadir `IconUsers` al import de `../icons`.
- `NavKey`: añadir `'empleados'` (tras `'clientes'`):

```ts
export type NavKey = 'dashboard' | 'facturas' | 'clientes' | 'empleados' | 'cuentas' | 'proveedores' | 'gastos' | 'reportes' | 'configuracion'
```

- `NAV`: añadir item tras Clientes:

```ts
  { key: 'empleados', label: 'Empleados', Icon: IconUsers },
```

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit -p packages/shared`
Expected: limpio

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/ui/icons.tsx packages/shared/src/index.ts packages/shared/src/ui/layout/Layout.tsx
git commit -m "feat: IconUsers y nav de Empleados"
```

---

### Task 4: Feature UI — página Empleados + modales

**Files:**
- Create: `packages/shared/src/features/empleados/Empleados.tsx`
- Create: `packages/shared/src/features/empleados/EmpleadoFormModal.tsx`
- Create: `packages/shared/src/features/empleados/NominaModal.tsx`
- Modify: `packages/shared/src/features/index.ts`
- Test: `packages/shared/tests/empleados.test.tsx`

**Interfaces:**
- Consumes: `useEmpleados`, `useRegisterNomina`, `useGastos`, `useConfig` (queries), `getDocLabel` (taxid), `formatMoney` (currency), primitives (`Table/Button/Dialog/Input/Select/Badge/ConfirmDialog`), icons (`IconPlus/IconEdit/IconTrash`).
- Produces: `Empleados` exportado desde `@ft/shared`.

- [ ] **Step 1: `EmpleadoFormModal.tsx`**

Sigue el patrón de `ProveedorFormModal`:

```tsx
import React, { useEffect, useState } from 'react'
import { Dialog, Button, Input, Select } from '../../ui/components'
import { useConfig } from '../../store/queries'
import { getDocLabel } from '../../taxid'
import type { Empleado } from '../../types/entities'

export function EmpleadoFormModal({ open, onClose, initial, onSave }: { open: boolean; onClose: () => void; initial: Empleado | null; onSave: (e: Empleado) => void }) {
  const { config } = useConfig()
  const docLabel = getDocLabel(config?.tipo_doc ?? 'RFC', config?.tipo_doc_etiqueta ?? '')
  const [form, setForm] = useState({ nombre: '', rfc: '', puesto: '', salario: '', fecha_ingreso: '', activo: 'true' })
  useEffect(() => {
    if (open) setForm(initial
      ? { nombre: initial.nombre, rfc: initial.rfc, puesto: initial.puesto, salario: String(initial.salario), fecha_ingreso: initial.fecha_ingreso, activo: initial.activo }
      : { nombre: '', rfc: '', puesto: '', salario: '', fecha_ingreso: '', activo: 'true' })
  }, [open, initial])
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  const submit = () => {
    if (!form.nombre.trim()) return
    onSave({ ...initial, ...form, salario: Number(form.salario) || 0 } as Empleado)
    onClose()
  }
  return (
    <Dialog open={open} onClose={onClose} title={initial ? 'Editar empleado' : 'Nuevo empleado'}
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit}>Guardar</Button></>}>
      <div className="space-y-3">
        <div><label className="text-xs text-muted-foreground">Nombre *</label><Input value={form.nombre} onChange={set('nombre')} /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-muted-foreground">{docLabel}</label><Input value={form.rfc} onChange={set('rfc')} /></div>
          <div><label className="text-xs text-muted-foreground">Puesto</label><Input value={form.puesto} onChange={set('puesto')} /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-muted-foreground">Salario mensual</label><Input type="number" min={0} value={form.salario} onChange={set('salario')} /></div>
          <div><label className="text-xs text-muted-foreground">Fecha ingreso</label><Input type="date" value={form.fecha_ingreso} onChange={set('fecha_ingreso')} /></div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Estado</label>
          <Select value={form.activo} onChange={v => setForm(f => ({ ...f, activo: v }))} options={[{ value: 'true', label: 'Activo' }, { value: 'false', label: 'Inactivo' }]} />
        </div>
      </div>
    </Dialog>
  )
}
```

- [ ] **Step 2: `NominaModal.tsx`**

```tsx
import React, { useEffect, useState } from 'react'
import { Dialog, Button, Input, Select } from '../../ui/components'
import type { Empleado } from '../../types/entities'

export function NominaModal({ empleado, onClose, onSave }: { empleado: Empleado; onClose: () => void; onSave: (i: { mes: string; monto: number; metodo_pago: string; fecha: string; notas: string }) => void }) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({ mes: hoy.slice(0, 7), monto: String(empleado.salario), metodo_pago: 'Transferencia', fecha: hoy, notas: '' })
  useEffect(() => { setForm({ mes: hoy.slice(0, 7), monto: String(empleado.salario), metodo_pago: 'Transferencia', fecha: hoy, notas: '' }) }, [empleado])
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  const submit = () => {
    if (!form.mes || Number(form.monto) <= 0) return
    onSave({ mes: form.mes, monto: Number(form.monto), metodo_pago: form.metodo_pago, fecha: form.fecha, notas: form.notas })
    onClose()
  }
  return (
    <Dialog open onClose={onClose} title={`Nómina — ${empleado.nombre}`}
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit}>Registrar pago</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-muted-foreground">Mes *</label><Input type="month" value={form.mes} onChange={set('mes')} /></div>
          <div><label className="text-xs text-muted-foreground">Monto *</label><Input type="number" min={0} value={form.monto} onChange={set('monto')} /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-muted-foreground">Método</label>
            <Select value={form.metodo_pago} onChange={v => setForm(f => ({ ...f, metodo_pago: v }))} options={['Efectivo', 'Transferencia', 'Tarjeta'].map(v => ({ value: v, label: v }))} />
          </div>
          <div><label className="text-xs text-muted-foreground">Fecha</label><Input type="date" value={form.fecha} onChange={set('fecha')} /></div>
        </div>
        <div><label className="text-xs text-muted-foreground">Notas</label><Input value={form.notas} onChange={set('notas')} /></div>
        <p className="text-xs text-muted-foreground">Este pago se registra como un gasto con categoría "Nómina".</p>
      </div>
    </Dialog>
  )
}
```

- [ ] **Step 3: `Empleados.tsx`**

```tsx
import React, { useState } from 'react'
import { useEmpleados, useRegisterNomina, useGastos, useConfig } from '../../store/queries'
import { Table, Button, Badge, ConfirmDialog } from '../../ui/components'
import { useToast } from '../../ui/components'
import { formatMoney } from '../../currency'
import { getDocLabel } from '../../taxid'
import { IconPlus, IconEdit, IconTrash } from '../../ui/icons'
import { EmpleadoFormModal } from './EmpleadoFormModal'
import { NominaModal } from './NominaModal'
import type { Empleado } from '../../types/entities'

export function Empleados() {
  const { empleados, saveEmpleado, deleteEmpleado } = useEmpleados()
  const registerNomina = useRegisterNomina()
  const { gastos } = useGastos({})
  const { config } = useConfig()
  const toast = useToast()
  const [formOpen, setFormOpen] = useState(false)
  const [editando, setEditando] = useState<Empleado | null>(null)
  const [nominaDe, setNominaDe] = useState<Empleado | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const docLabel = getDocLabel(config?.tipo_doc ?? 'RFC', config?.tipo_doc_etiqueta ?? '')
  const moneda = config?.moneda ?? 'USD'

  const totalPagado = (nombre: string) =>
    gastos.filter(g => g.categoria === 'Nómina' && g.proveedor === nombre).reduce((s, g) => s + Number(g.monto), 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Empleados</h1>
          <p className="text-sm text-muted-foreground">Personas que trabajan contigo. Su salario se registra como gasto de nómina.</p>
        </div>
        <Button icon={<IconPlus className="w-4 h-4" />} onClick={() => { setEditando(null); setFormOpen(true) }}>Nuevo empleado</Button>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl shadow-card overflow-hidden">
        <Table columns={[
          { key: 'nombre', header: 'Nombre', render: r => String(r.nombre) },
          { key: 'rfc', header: docLabel, render: r => String(r.rfc) },
          { key: 'puesto', header: 'Puesto', render: r => String(r.puesto) },
          { key: 'salario', header: 'Salario', render: r => formatMoney(Number(r.salario), moneda) },
          { key: 'ingreso', header: 'Ingreso', render: r => String(r.fecha_ingreso) },
          { key: 'activo', header: 'Estado', render: r => <Badge tone={String(r.activo) === 'true' ? 'green' : 'gray'}>{String(r.activo) === 'true' ? 'Activo' : 'Inactivo'}</Badge> },
          { key: 'total', header: 'Total pagado', render: r => formatMoney(totalPagado(String(r.nombre)), moneda) },
          { key: 'acciones', header: '', render: r => (
            <div className="flex gap-2">
              <Button variant="ghost" icon={<IconEdit className="w-4 h-4" />} onClick={() => { setEditando(r as unknown as Empleado); setFormOpen(true) }}>Editar</Button>
              <Button variant="outline" onClick={() => setNominaDe(r as unknown as Empleado)}>Nómina</Button>
              <Button variant="danger" icon={<IconTrash className="w-4 h-4" />} onClick={() => setDeleteId(String(r.id_empleado))}>Eliminar</Button>
            </div>
          ) }
        ]} rows={empleados as unknown as Record<string, unknown>[]} />
        {empleados.length === 0 && <p className="p-4 text-sm text-muted-foreground">Sin empleados</p>}
      </div>
      <EmpleadoFormModal open={formOpen} onClose={() => setFormOpen(false)} initial={editando}
        onSave={async e => { try { await saveEmpleado.mutateAsync(e); toast('Empleado guardado') } catch (err) { toast((err as Error).message, 'error') } }} />
      {nominaDe && (
        <NominaModal empleado={nominaDe} onClose={() => setNominaDe(null)}
          onSave={async i => {
            try {
              await registerNomina.mutateAsync({ id_empleado: nominaDe.id_empleado, ...i } as never)
              toast('Nómina registrada como gasto')
            } catch (err) { toast((err as Error).message, 'error') }
          }} />
      )}
      <ConfirmDialog open={deleteId !== null} title="Eliminar empleado" message="Bloqueado si tiene nómina registrada. ¿Continuar?"
        onConfirm={async () => { if (deleteId) { try { await deleteEmpleado.mutateAsync(deleteId); toast('Empleado eliminado') } catch (err) { toast((err as Error).message, 'error') } } setDeleteId(null) }}
        onClose={() => setDeleteId(null)} />
    </div>
  )
}
```

- [ ] **Step 4: Export en `features/index.ts`**

```ts
export { Empleados } from './empleados/Empleados'
```

- [ ] **Step 5: Test de feature**

Crear `packages/shared/tests/empleados.test.tsx` (patrón de `clientes.test.tsx` — stub fetch + AppProvider):

```tsx
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { Empleados } from '../src/features/empleados/Empleados'
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

describe('Empleados', () => {
  it('renderiza botón nuevo empleado', () => {
    render(<Empleados />, { wrapper })
    expect(screen.getByText(/nuevo empleado/i)).toBeTruthy()
  })
})
```

- [ ] **Step 6: Verify**

Run: `pnpm exec tsc --noEmit -p packages/shared && pnpm test`
Expected: limpio, verde

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/features/empleados packages/shared/src/features/index.ts packages/shared/tests/empleados.test.tsx
git commit -m "feat: página Empleados con formulario y modal de nómina"
```

---

### Task 5: Wiring en apps (web + extensión)

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/extension/entrypoints/dashboard/DashboardApp.tsx`

**Interfaces:**
- Consumes: `Empleados` de `@ft/shared` (Task 4)

- [ ] **Step 1: Web — `apps/web/src/App.tsx`**

Añadir `Empleados` al import de `@ft/shared` y el render:

```tsx
          {nav === 'empleados' && <Empleados />}
```

(entre `clientes` y `cuentas`).

- [ ] **Step 2: Extensión — `apps/extension/entrypoints/dashboard/DashboardApp.tsx`**

Mismo cambio (import + `{nav === 'empleados' && <Empleados />}`).

- [ ] **Step 3: Verify builds**

Run: `pnpm -F web build && pnpm -F extension build`
Expected: ambos OK

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/App.tsx apps/extension/entrypoints/dashboard/DashboardApp.tsx
git commit -m "feat: Empleados disponible en web y extensión"
```

---

### Task 6: Verificación final + docs

**Files:**
- Modify: `FUNCIONALIDADES.md`
- Modify: `docs/superpowers/specs/2026-08-13-empleados-design.md` (estado → implementado, si aplica)

- [ ] **Step 1: Actualizar docs**

En `FUNCIONALIDADES.md` — añadir sección tras la 2.4 Gastos (renumerar no es necesario; insertar como `### 2.4bis` o reubicar):

```md
### 2.5 Empleados y nómina
- **CRUD de empleados**: nombre (obligatorio), documento fiscal, puesto, salario mensual, fecha de ingreso y estado activo/inactivo.
- **Nómina**: registrar el pago de salario por mes → se genera automáticamente un **gasto** con categoría `Nómina` (descripción `Nómina {mes} — {nombre}`).
- La nómina se suma a los gastos del mes y aparece en Reportes dentro de "Gastos por categoría".
- Total pagado por empleado visible en la tabla de Empleados.
- **Borrado**: bloqueado si el empleado tiene nómina registrada.
- **Limitación**: la hoja `Empleados` solo se crea en spreadsheets nuevos; para hojas existentes hay que crear la hoja manualmente.
```

- [ ] **Step 2: Verificación completa**

Run: `pnpm test` → verde
Run: `pnpm exec tsc --noEmit -p packages/shared` → limpio
Run: `pnpm -F web build && pnpm -F extension build` → OK

- [ ] **Step 3: Verificación manual**

1. Nav muestra "Empleados" con icono.
2. Crear empleado (nombre, salario, activo).
3. Registrar nómina → aparece en Gastos con categoría Nómina; en Reportes "Gastos por categoría" sale Nómina; el total pagado del empleado sube.
4. Eliminar empleado con nómina → bloqueado con mensaje.
5. Contenido no se expande (max-w-6xl) en todas las páginas.

- [ ] **Step 4: Commit**

```bash
git add FUNCIONALIDADES.md docs/superpowers/specs/2026-08-13-empleados-design.md
git commit -m "docs: documenta sección Empleados y nómina"
```
