# Design Spec — Sección Empleados con nómina integrada

**Fecha:** 2026-08-13
**Estado:** Aprobado por usuario
**Base:** esquema de 9 hojas existente (`tables.ts`), `repository.ts`, `Gastos` feature, `Layout` nav, `icons.tsx`

---

## 1. Contexto

FinanceTracker gestiona facturas, clientes, gastos, proveedores y cuentas por pagar. El usuario quiere una sección **Empleados** con **nómina integrada**: registrar empleados y pagar su salario, donde cada pago genera un **Gasto automático** con categoría `Nómina` (así los reportes y el dashboard ya lo contabilizan sin cambios de KPIs).

### 1.1 Objetivos

1. Nueva hoja `Empleados` (CRUD) en el esquema de tablas.
2. Página "Empleados" en la app (nav, tabla, formularios).
3. **Nómina**: registrar pago de salario por empleado → crea Gasto con `categoria: 'Nómina'`.
4. Total pagado por empleado (suma de gastos de nómina).
5. Bloqueo de borrado si el empleado tiene nómina registrada.
6. Icono de nav nuevo `IconUsers`.

### 1.2 Alcance

- **Dentro:** hoja Empleados, entities/schema, repository (list/save/delete/registerNomina), feature UI (tabla + modal empleado + modal nómina), nav + icono, tests.
- **Fuera (YAGNI):** impuestos/prestaciones/IMSS, aguinaldo, asistencias, KPI separado de nómina, vacaciones, hoja de nómina independiente (la nómina ES un gasto).

---

## 2. Modelo de datos

### 2.1 Hoja `Empleados` (nueva, en `tables.ts`)

| Columna key | header | type |
|---|---|---|
| `id_empleado` | id_empleado | string |
| `nombre` | nombre | string |
| `rfc` | rfc | string |
| `puesto` | puesto | string |
| `salario` | salario | number |
| `fecha_ingreso` | fecha_ingreso | date |
| `activo` | activo | string |

- `HEADER_ROWS('Empleados') = 1` (default).
- Se añade al objeto `TABLES`. `createInitialSpreadsheet` lo incluye automáticamente (`Object.keys(TABLES)` + loop de headers). Sin migración para hojas nuevas.
- **Hojas existentes:** el mecanismo actual no detecta hojas faltantes (ver §5 nota); la hoja `Empleados` no existirá en spreadsheets viejos hasta que se decida un path de migración. Documentar como limitación.

### 2.2 Entities (`entities.ts`)

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

### 2.3 Schemas (`schemas.ts`)

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

---

## 3. Repository (`repository.ts`)

```ts
async listEmpleados(): Promise<Empleado[]>            // readTable('Empleados')
async saveEmpleado(e: Empleado): Promise<Empleado>    // parse; sin id → uid('emp_') + append; con id → replace
async deleteEmpleado(id: string): Promise<void>       // bloquea si gastos de nómina del empleado; si no, replace
async registerNomina(input): Promise<Gasto>           // crea Gasto categoria Nómina
```

### 3.1 `deleteEmpleado`

```ts
async deleteEmpleado(id: string): Promise<void> {
  const gastos = await readTable('Gastos')
  const emp = (await readTable('Empleados')).find(r => r.id_empleado === id)
  const nombre = String(emp?.nombre ?? '')
  if (gastos.some(g => g.categoria === 'Nómina' && String(g.proveedor) === nombre && String(g.descripcion).includes(nombre))) {
    throw new Error('Empleado tiene nómina registrada')
  }
  await replaceTable('Empleados', (await readTable('Empleados')).filter(r => r.id_empleado !== id))
}
```

### 3.2 `registerNomina` → Gasto

```ts
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
}
```

---

## 4. UI

### 4.1 Nav + icono

- `icons.tsx`: nuevo `IconUsers` (dos personas):

```tsx
export function IconUsers({ className }: { className?: string }) {
  return <Icon className={className}><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 3.5a3.5 3.5 0 0 1 0 7" /><path d="M18 14c2 1 3 2.7 3 4.5" /></Icon>
}
```

- `Layout.tsx` `NavKey`: añadir `'empleados'`. `NAV` item: `{ key: 'empleados', label: 'Empleados', Icon: IconUsers }` (entre `clientes` y `cuentas`).

### 4.2 Página `features/empleados/Empleados.tsx`

- Título "Empleados" + subtítulo: `Personas que trabajan contigo. Su salario se registra como gasto de nómina.`
- Botón "+ Nuevo empleado".
- Tabla: Nombre, `{docLabel}` (dinámico vía `getDocLabel`), Puesto, Salario (`formatMoney`), Ingreso, Estado (badge Activo/Inactivo), **Total pagado** (suma gastos Nómina cuyo proveedor = nombre), Acciones (Editar, Nómina, Eliminar).
- Total pagado: hook `useGastos({})` filtra `categoria === 'Nómina' && proveedor === nombre`.
- Modal empleado: `EmpleadoFormModal.tsx` (nombre*, doc dinámico, puesto, salario, fecha ingreso, activo checkbox → 'true'/'false').
- Modal nómina: `NominaModal.tsx` (mes `YYYY-MM`, monto prefilled salario, método de pago, fecha, notas) → `registerNomina`.
- ConfirmDialog para borrar (mensaje: bloqueado si tiene nómina).

### 4.3 Hooks (`queries.tsx`)

```ts
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

### 4.4 App wiring

- `apps/web/src/App.tsx` y `apps/extension/entrypoints/dashboard/DashboardApp.tsx`: importar `Empleados` de `@ft/shared`, agregar `{nav === 'empleados' && <Empleados />}`.

---

## 5. Notas y limitaciones

- **Hojas existentes sin hoja Empleados:** el código actual crea la hoja solo en `createInitialSpreadsheet` (spreadsheet nuevo). No hay migrador de hojas faltantes; para un spreadsheet existente habrá que crear la hoja manualmente o implementar un check de hojas en arranque (fuera de alcance). Documentar en FUNCIONALIDADES.
- Nómina = Gasto (categoria 'Nómina'). Reportes/dashboard no requieren cambios (ya suman gastos). `gastosPorCategoria` mostrará 'Nómina' automáticamente.
- Renombrar un empleado rompe el match por nombre con su nómina histórica (gastos previos conservan el nombre antiguo). Aceptado para uso personal; documentar.
- `activo` se guarda como string `'true'/'false'`.

## 6. Verificación

- `pnpm test` verde (suite + nuevos tests de schema/repository).
- `pnpm exec tsc --noEmit -p packages/shared` limpio.
- `pnpm -F web build && pnpm -F extension build` OK.
- Manual: crear empleado, registrar nómina → aparece como Gasto en Gastos (categoría Nómina) y en Reportes; borrar empleado con nómina → bloqueado.
