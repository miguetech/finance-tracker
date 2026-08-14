# Mejoras a Configuración (folio plantilla, pills, tooltips, previews) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mejorar la sección Configuración: estilos fintech, tooltips, categorías como pills con modal de agregar, folio configurable por plantilla de fecha, previews de folio/logo/PDF, validación en vivo y campos emisor adicionales.

**Architecture:** Helper puro `calc/folio.ts` para la plantilla (usado por `repository.createFactura` y el preview de UI). Modelo `Config` gana 3 campos emisor. Primitivos `Tooltip` y `Input/Select` con `error`. Editor de categorías local en `Configuracion.tsx`. `printInvoice` se generaliza para el preview de PDF.

**Tech Stack:** React 19 · TypeScript 5 (strict) · Tailwind CSS 4 · Vitest 3 · Zod 4

## Global Constraints

- TypeScript `strict: true`. Sin `any` en tipos públicos.
- Tokens de folio: `{YYYY}` (2026), `{YY}` (26), `{MM}` (08), `{DD}` (13). Expansión con la **fecha de emisión** de la factura. `FOLIO_TOKENS` es la fuente de verdad (token + descripcion + ejemplo).
- `expandFolioTemplate(template, fecha)`: fecha ISO `YYYY-MM-DD`; si fecha inválida devuelve el template sin expandir. `invalidFolioTokens(template)`: tokens `{...}` no reconocidos.
- Folio final = `expandFolioTemplate(prefijo, fecha_emision)` + `contador` con `padStart(3,'0')`.
- Config nuevo: `empresa_cp`, `empresa_ciudad`, `empresa_pais` (string, default `''`), sin migración (configFromRows fallback).
- `Tooltip`: CSS puro con `group`/`group-hover`, `pointer-events-none`, z-50. `Input`/`Select` ganan `error?: string` (borde `border-danger` + texto `text-danger` bajo el campo) — API existente intacta.
- `printInvoice(title: string)` generalizado; lee `#invoice-print`.
- Categorías: la serialización sigue siendo coma-string en `Config` (`categorias_gastos`/`categorias_cxp`). No duplicados (case-insensitive), no vacío.
- Tests: `pnpm test` (suite + nuevos), typecheck `pnpm exec tsc --noEmit -p packages/shared`, builds `pnpm -F web build && pnpm -F extension build`.
- Commits convencionales (`feat:`, `style:`, `fix:`).

---

### Task 1: Helper de folio con plantilla (`calc/folio.ts`) + tests

**Files:**
- Create: `packages/shared/src/calc/folio.ts`
- Test: `packages/shared/tests/folio.test.ts`

**Interfaces:**
- Produces: `FOLIO_TOKENS: { token: FolioToken; descripcion: string; ejemplo: string }[]`, `expandFolioTemplate(template: string, fecha: string): string`, `invalidFolioTokens(template: string): string[]`, `type FolioToken`.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/tests/folio.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { expandFolioTemplate, invalidFolioTokens, FOLIO_TOKENS } from '../src/calc/folio'

describe('folio template', () => {
  it('FOLIO_TOKENS expone los 4 tokens', () => {
    expect(FOLIO_TOKENS.map(t => t.token)).toEqual(['{YYYY}', '{YY}', '{MM}', '{DD}'])
  })
  it('expande sin tokens = template literal', () => {
    expect(expandFolioTemplate('FAC-', '2026-08-13')).toBe('FAC-')
  })
  it('expande año completo y corto', () => {
    expect(expandFolioTemplate('FAC-{YYYY}-', '2026-08-13')).toBe('FAC-2026-')
    expect(expandFolioTemplate('INV{YY}{MM}-', '2026-08-13')).toBe('INV2608-')
  })
  it('expande mes y día con pad 2', () => {
    expect(expandFolioTemplate('{YYYY}/{MM}/FAC-', '2026-08-05')).toBe('2026/08/FAC-')
    expect(expandFolioTemplate('{YYYY}-{MM}-{DD}-', '2026-08-13')).toBe('2026-08-13-')
  })
  it('fecha inválida devuelve template sin expandir', () => {
    expect(expandFolioTemplate('FAC-{YYYY}-', '')).toBe('FAC-{YYYY}-')
    expect(expandFolioTemplate('FAC-{YYYY}-', 'no-es-fecha')).toBe('FAC-{YYYY}-')
  })
  it('invalidFolioTokens detecta tokens no reconocidos', () => {
    expect(invalidFolioTokens('FAC-{HOLA}-')).toEqual(['{HOLA}'])
    expect(invalidFolioTokens('FAC-{YYYY}-{MM}-')).toEqual([])
    expect(invalidFolioTokens('FAC-{YY}-{BANANA}')).toEqual(['{BANANA}'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F shared test -- tests/folio.test.ts`
Expected: FAIL — `Cannot find module '../src/calc/folio'`

- [ ] **Step 3: Write minimal implementation**

Create `packages/shared/src/calc/folio.ts`:

```ts
export type FolioToken = '{YYYY}' | '{YY}' | '{MM}' | '{DD}'

export const FOLIO_TOKENS: { token: FolioToken; descripcion: string; ejemplo: string }[] = [
  { token: '{YYYY}', descripcion: 'Año completo', ejemplo: '2026' },
  { token: '{YY}', descripcion: 'Año corto', ejemplo: '26' },
  { token: '{MM}', descripcion: 'Mes (2 dígitos)', ejemplo: '08' },
  { token: '{DD}', descripcion: 'Día', ejemplo: '13' }
]

export function expandFolioTemplate(template: string, fecha: string): string {
  const d = new Date(fecha + 'T00:00:00')
  if (isNaN(d.getTime())) return template
  const yyyy = String(d.getFullYear())
  const yy = yyyy.slice(-2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return template
    .replaceAll('{YYYY}', yyyy)
    .replaceAll('{YY}', yy)
    .replaceAll('{MM}', mm)
    .replaceAll('{DD}', dd)
}

export function invalidFolioTokens(template: string): string[] {
  const invalidos: string[] = []
  const re = /\{([^}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(template)) !== null) {
    const token = m[0]
    if (!FOLIO_TOKENS.some(t => t.token === token)) invalidos.push(token)
  }
  return invalidos
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F shared test -- tests/folio.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/calc/folio.ts packages/shared/tests/folio.test.ts
git commit -m "feat: plantilla de folio con tokens de fecha"
```

---

### Task 2: Modelo Config campos emisor + integración en createFactura + PDF

**Files:**
- Modify: `packages/shared/src/types/entities.ts` (Config)
- Modify: `packages/shared/src/types/schemas.ts` (ConfigSchema)
- Modify: `packages/shared/src/sheets/createSpreadsheet.ts` (DEFAULT_CONFIG, configFromRows)
- Modify: `packages/shared/src/data/repository.ts` (createFactura folio)
- Modify: `packages/shared/src/ui/print/InvoicePrint.tsx` (CP/ciudad/país)
- Test: `packages/shared/tests/folio.test.ts` (append) + `packages/shared/tests/repository.test.ts` (verificar folio expandido)

**Interfaces:**
- Consumes: `expandFolioTemplate` (Task 1)
- Produces: `Config` con `empresa_cp`, `empresa_ciudad`, `empresa_pais`.

- [ ] **Step 1: Write the failing tests**

Append a `describe` a `packages/shared/tests/folio.test.ts`:

```ts
import { ConfigSchema } from '../src/types/schemas'
import { configFromRows } from '../src/sheets/createSpreadsheet'

describe('config emisor', () => {
  it('ConfigSchema defaults de campos emisor vacíos', () => {
    const c = ConfigSchema.parse({ empresa_nombre: 'X', prefijo_folio: 'FAC-' })
    expect(c.empresa_cp).toBe('')
    expect(c.empresa_ciudad).toBe('')
    expect(c.empresa_pais).toBe('')
  })
  it('configFromRows lee CP, ciudad y país', () => {
    const c = configFromRows([['empresa_cp', '45010'], ['empresa_ciudad', 'Guadalajara'], ['empresa_pais', 'México']])
    expect(c.empresa_cp).toBe('45010')
    expect(c.empresa_ciudad).toBe('Guadalajara')
    expect(c.empresa_pais).toBe('México')
  })
})
```

Verificar en `packages/shared/tests/repository.test.ts` que `createFactura` usa la plantilla: añadir un test que cree una factura con `prefijo_folio: 'FAC-{YYYY}-'`, fecha emisión fija, y aserte `folio === 'FAC-2026-001'`. Lee primero el archivo `repository.test.ts` para seguir su patrón de mock (fetch stub + repo). Si el patrón del archivo lo permite, añade el test; si requiere setup complejo, documéntalo y salta (lo cubrirá el reviewer).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F shared test -- tests/folio.test.ts`
Expected: FAIL — `empresa_cp is undefined`

- [ ] **Step 3: Implement**

`entities.ts` — tras `empresa_logo` en `Config`:

```ts
  empresa_cp: string
  empresa_ciudad: string
  empresa_pais: string
```

`schemas.ts` — tras `empresa_logo` en `ConfigSchema`:

```ts
  empresa_cp: z.string().default(''),
  empresa_ciudad: z.string().default(''),
  empresa_pais: z.string().default(''),
```

`createSpreadsheet.ts` — en `DEFAULT_CONFIG` tras `empresa_logo`:

```ts
  empresa_cp: '',
  empresa_ciudad: '',
  empresa_pais: '',
```

En `configFromRows` tras la línea de `empresa_logo`:

```ts
    empresa_cp: map.get('empresa_cp') ?? '',
    empresa_ciudad: map.get('empresa_ciudad') ?? '',
    empresa_pais: map.get('empresa_pais') ?? '',
```

`repository.ts` — en `createFactura`, dentro del callback del mutex (línea ~126), reemplazar:

```ts
          return `${c.prefijo_folio}${String(folioN).padStart(3, '0')}`
```

por:

```ts
          return `${expandFolioTemplate(c.prefijo_folio, parsed.fecha_emision)}${String(folioN).padStart(3, '0')}`
```

Añadir import al inicio:

```ts
import { expandFolioTemplate } from '../calc/folio'
```

`InvoicePrint.tsx` — en el bloque del emisor (líneas 11-13), reemplazar:

```tsx
          <p>{config.empresa_rfc}</p>
          <p>{config.empresa_direccion}</p>
          <p>{config.empresa_telefono} {config.empresa_email}</p>
```

por:

```tsx
          <p>{config.empresa_rfc}</p>
          <p>{[config.empresa_direccion, config.empresa_cp].filter(Boolean).join(', ')}</p>
          <p>{[config.empresa_ciudad, config.empresa_pais].filter(Boolean).join(', ')}</p>
          <p>{config.empresa_telefono} {config.empresa_email}</p>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F shared test -- tests/folio.test.ts`
Expected: PASS (6 + 2)

- [ ] **Step 5: Run full suite + typecheck**

Run: `pnpm test && pnpm exec tsc --noEmit -p packages/shared`
Expected: verde + limpio

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types/entities.ts packages/shared/src/types/schemas.ts packages/shared/src/sheets/createSpreadsheet.ts packages/shared/src/data/repository.ts packages/shared/src/ui/print/InvoicePrint.tsx packages/shared/tests/folio.test.ts packages/shared/tests/repository.test.ts
git commit -m "feat: campos emisor (CP/ciudad/país) y folio con plantilla en createFactura"
```

---

### Task 3: Primitivos `Tooltip` + `Input`/`Select` con `error`

**Files:**
- Modify: `packages/shared/src/ui/components.tsx`

**Interfaces:**
- Produces: `Tooltip({ text: string; children: ReactNode; side?: 'top' | 'bottom' })`, `Input` con `error?: string`, `Select` con `error?: string`. APIs previas intactas.

- [ ] **Step 1: Implement**

`components.tsx`:

Añadir `Tooltip` (tras `Tabs`):

```tsx
export function Tooltip({ text, children, side = 'top' }: { text: string; children: ReactNode; side?: 'top' | 'bottom' }) {
  return (
    <span className="relative inline-flex group">
      {children}
      <span className={cx(
        'pointer-events-none absolute z-50 w-max max-w-56 rounded-lg bg-gray-900 text-white text-xs px-2.5 py-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150',
        side === 'top' ? 'bottom-full left-1/2 -translate-x-1/2 mb-1.5' : 'top-full left-1/2 -translate-x-1/2 mt-1.5'
      )}>{text}</span>
    </span>
  )
}
```

Reemplazar `Input` (líneas ~16-18 del bloque actual) por:

```tsx
export function Input({ error, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { error?: string }) {
  return (
    <div>
      <input {...props} className={cx('w-full h-10 px-3.5 border rounded-xl text-sm bg-surface transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-2', error ? 'border-danger focus:ring-danger/25' : 'border-gray-200 focus:border-primary focus:ring-primary/25', className)} />
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  )
}
```

Reemplazar `Select` por:

```tsx
export function Select({ value, onChange, options, placeholder, error }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string; error?: string }) {
  return (
    <div>
      <select value={value} onChange={e => onChange(e.target.value)} className={cx('w-full h-10 px-3.5 border rounded-xl text-sm bg-surface transition-colors focus:outline-none focus:ring-2', error ? 'border-danger focus:ring-danger/25' : 'border-gray-200 focus:border-primary focus:ring-primary/25')}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck + suite**

Run: `pnpm exec tsc --noEmit -p packages/shared && pnpm test`
Expected: limpio, 50 verdes

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/ui/components.tsx
git commit -m "feat: Tooltip y prop error en Input/Select"
```

---

### Task 4: Editor de categorías como pills con modal

**Files:**
- Modify: `packages/shared/src/features/configuracion/Configuracion.tsx` (añadir componente local `CategoriasEditor` + usarlo)

**Interfaces:**
- Consumes: `Dialog`, `Button`, `Input`, `IconPlus`, `IconX` (de `../../ui/icons`)
- Produces: `CategoriasEditor({ title: string; value: string; onChange: (s: string) => void })`

- [ ] **Step 1: Implement `CategoriasEditor`**

Añadir al final de `packages/shared/src/features/configuracion/Configuracion.tsx`:

```tsx
function CategoriasEditor({ title, value, onChange }: { title: string; value: string; onChange: (s: string) => void }) {
  const [open, setOpen] = useState(false)
  const [nueva, setNueva] = useState('')
  const [error, setError] = useState('')
  const items = value.split(',').map(s => s.trim()).filter(Boolean)

  const add = () => {
    const v = nueva.trim()
    if (!v) { setError('Escribe una categoría'); return }
    if (items.some(i => i.toLowerCase() === v.toLowerCase())) { setError('Ya existe esa categoría'); return }
    onChange([...items, v].join(','))
    setNueva(''); setError(''); setOpen(false)
  }

  return (
    <div>
      <div className="text-xs text-muted-foreground mb-2">{title}</div>
      <div className="flex flex-wrap gap-2">
        {items.map(c => (
          <span key={c} className="inline-flex items-center gap-1.5 bg-primary-soft text-primary rounded-full pl-3 pr-1.5 py-1 text-sm font-medium">
            {c}
            <button type="button" onClick={() => onChange(items.filter(x => x !== c).join(','))}
              className="p-0.5 rounded-full hover:bg-primary/15 text-primary" aria-label={`Quitar ${c}`}>
              <IconX className="w-3.5 h-3.5" />
            </button>
          </span>
        ))}
        <Button variant="outline" size="sm" icon={<IconPlus className="w-4 h-4" />} onClick={() => setOpen(true)}>Agregar</Button>
      </div>
      <Dialog open={open} onClose={() => { setOpen(false); setError(''); setNueva('') }} title={`Agregar categoría (${title})`}
        footer={<>
          <Button variant="outline" onClick={() => { setOpen(false); setError(''); setNueva('') }}>Cancelar</Button>
          <Button onClick={add}>Agregar</Button>
        </>}>
        <Input value={nueva} onChange={e => { setNueva(e.target.value); setError('') }} placeholder="Nueva categoría…" error={error || undefined} autoFocus />
      </Dialog>
    </div>
  )
}
```

Añadir imports al inicio de `Configuracion.tsx`:

```tsx
import { IconPlus, IconX } from '../../ui/icons'
```

- [ ] **Step 2: Usar en la Card Categorías**

Reemplazar la card (líneas 69-72) por:

```tsx
      <Card title="Categorías">
        <div className="space-y-5">
          <CategoriasEditor title="Gastos" value={form.categorias_gastos} onChange={v => setForm(f => f && ({ ...f, categorias_gastos: v }))} />
          <CategoriasEditor title="Cuentas por pagar" value={form.categorias_cxp} onChange={v => setForm(f => f && ({ ...f, categorias_cxp: v }))} />
        </div>
      </Card>
```

- [ ] **Step 3: Typecheck + suite**

Run: `pnpm exec tsc --noEmit -p packages/shared && pnpm test`
Expected: limpio, verdes (configuracion.test.tsx sigue pasando — renderiza título de card)

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/features/configuracion/Configuracion.tsx
git commit -m "feat: categorías como pills con modal de agregar"
```

---

### Task 5: Configuración completa — estilos, tooltips, previews, validación, PDF preview

**Files:**
- Modify: `packages/shared/src/features/configuracion/Configuracion.tsx`
- Modify: `packages/shared/src/features/facturas/FacturaDetail.tsx` (printInvoice refactor)
- Modify: `packages/shared/tests/configuracion.test.tsx` (si aplica)

**Interfaces:**
- Consumes: `Tooltip`, `Input error`, `CategoriasEditor` (Tasks 3-4), `expandFolioTemplate`, `FOLIO_TOKENS`, `invalidFolioTokens` (Task 1), `InvoicePrint` (de `../../ui/print/InvoicePrint`)

- [ ] **Step 1: Refactor `printInvoice` en `FacturaDetail.tsx`**

Reemplazar la función (líneas 8-19) por:

```ts
export function printInvoice(title: string) {
  const w = window.open('', '_blank', 'width=900,height=700')
  if (!w) return
  const node = document.getElementById('invoice-print')
  if (!node) return
  w.document.write('<html><head><title>' + title + '</title><style>body{font-family:system-ui,sans-serif;padding:2rem;color:#111}table{width:100%;border-collapse:collapse}th,td{padding:.5rem;text-align:left;border-bottom:1px solid #ddd}@media print{body{padding:0}}</style></head><body>')
  w.document.write(node.innerHTML)
  w.document.write('</body></html>')
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 200)
}
```

Actualizar la llamada (línea 33) `onClick={() => printInvoice(det)}` → `onClick={() => printInvoice('Factura ' + factura.folio)}`.

- [ ] **Step 2: Construir helpers y estado en `Configuracion.tsx`**

Añadir imports:

```tsx
import { FOLIO_TOKENS, expandFolioTemplate, invalidFolioTokens } from '../../calc/folio'
import { Tooltip } from '../../ui/components'
import { IconAlert } from '../../ui/icons'
import { InvoicePrint } from '../../ui/print/InvoicePrint'
import type { Factura, FacturaItem } from '../../types/entities'
```

Dentro del componente, tras `const set = ...`:

```tsx
  const hoy = new Date().toISOString().slice(0, 10)
  const folioPreview = expandFolioTemplate(String(form.prefijo_folio), hoy) + String(Math.max(1, Number(form.contador_folio) || 1)).padStart(3, '0')
  const tokensInvalidos = invalidFolioTokens(String(form.prefijo_folio))
  const numIva = Number(form.iva_porcentaje)
  const numContador = Number(form.contador_folio)
  const errors: Record<string, string> = {}
  if (!form.empresa_nombre.trim()) errors.nombre = 'Nombre obligatorio'
  if (!String(form.prefijo_folio).trim()) errors.prefijo = 'Prefijo obligatorio'
  if (isNaN(numIva) || numIva < 0 || numIva > 100) errors.iva = 'IVA debe ser un número entre 0 y 100'
  if (!Number.isInteger(numContador) || numContador < 0) errors.contador = 'Contador debe ser un entero ≥ 0'
  const [previewOpen, setPreviewOpen] = useState(false)

  const sampleFactura = (): { factura: Factura; items: FacturaItem[] } => {
    const items = [{ descripcion: 'Concepto de ejemplo', cantidad: 1, precio_unitario: 100, importe: 100 }]
    const subtotal = 100
    const iva = Math.round(subtotal * (numIva || 0)) / 100
    return {
      factura: {
        id_factura: 'preview', folio: folioPreview, id_cliente: '', nombre_cliente: 'Cliente de ejemplo',
        fecha_emision: hoy, fecha_vencimiento: '', subtotal, iva, total: subtotal + iva,
        saldo: subtotal + iva, fecha_pago: '', notas: 'Factura de ejemplo'
      },
      items
    }
  }

  const [ayudaFolio, setAyudaFolio] = useState(false)
```

Nota: `previewOpen`, `ayudaFolio` son hooks — deben declararse en orden estable junto a los demás `useState` del componente. Decláralos junto a los hooks existentes (tras `const [form, setForm]`), no dentro del render condicional.

- [ ] **Step 3: Submit con validación**

Reemplazar `submit` (líneas 20-30) por:

```tsx
  const submit = async () => {
    if (Object.keys(errors).length > 0) { toast('Revisa los campos marcados', 'error'); return }
    try {
      const fresh = await qc.fetchQuery({ queryKey: ['config'], queryFn: () => repo.getConfig() })
      await saveConfig.mutateAsync({
        ...form,
        contador_folio: Math.max(fresh.contador_folio, numContador),
        iva_porcentaje: numIva
      })
      toast('Configuración guardada')
    } catch (e) { toast((e as Error).message, 'error') }
  }
```

- [ ] **Step 4: Estilos fintech — labels y loading**

Reemplazar todos los `<label className="text-xs text-gray-500">` por `<label className="text-xs text-muted-foreground">` (todo el archivo). Reemplazar el loading (línea 17) `text-gray-500` → `text-muted-foreground`.

- [ ] **Step 5: Card Datos de la empresa — CP/ciudad/país + preview logo**

Después del input de Logo (línea 56), añadir grid de CP/ciudad/país y el preview:

```tsx
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label className="text-xs text-muted-foreground">Código postal</label><Input value={form.empresa_cp} onChange={set('empresa_cp')} /></div>
            <div><label className="text-xs text-muted-foreground">Ciudad</label><Input value={form.empresa_ciudad} onChange={set('empresa_ciudad')} /></div>
            <div><label className="text-xs text-muted-foreground">País</label><Input value={form.empresa_pais} onChange={set('empresa_pais')} /></div>
          </div>
          {form.empresa_logo && (
            <img src={form.empresa_logo} alt="Logo" className="h-12 mt-1 rounded-lg border border-gray-200 object-contain bg-white"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          )}
```

- [ ] **Step 6: Card Facturación — tooltips, preview folio, ayuda desplegable**

Reemplazar la card (líneas 59-68) por:

```tsx
      <Card title="Facturación">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <label className="text-xs text-muted-foreground">Prefijo folio *</label>
                <Tooltip text={'Tokens: ' + FOLIO_TOKENS.map(t => t.token).join(' ') + '. Ej: FAC-{YYYY}-{MM}- → FAC-2026-08-001.'}>
                  <IconAlert className="w-3.5 h-3.5 text-muted-foreground" />
                </Tooltip>
                <button type="button" onClick={() => setAyudaFolio(a => !a)} className="text-xs text-primary underline decoration-dotted underline-offset-2 hover:text-primary-hover">¿Cómo configurar?</button>
              </div>
              <Input value={form.prefijo_folio} onChange={set('prefijo_folio')} error={errors.prefijo} />
              {ayudaFolio && (
                <div className="mt-2 rounded-lg border border-gray-100 bg-muted/50 p-3 text-xs text-muted-foreground space-y-1.5">
                  {FOLIO_TOKENS.map(t => (
                    <div key={t.token} className="flex justify-between gap-3"><span className="font-mono text-gray-700">{t.token}</span><span>{t.descripcion} — ej. {t.ejemplo}</span></div>
                  ))}
                  <div className="pt-1.5 border-t border-gray-100 text-muted-foreground">
                    Ejemplos: <code className="font-mono">FAC-</code> → FAC-001 · <code className="font-mono">FAC-{'{YYYY}'}-</code> → FAC-2026-001 · <code className="font-mono">FAC-{'{YYYY}'}-{'{MM}'}-</code> → FAC-2026-08-001
                  </div>
                </div>
              )}
              {tokensInvalidos.length > 0 && <p className="mt-1 text-xs text-amber-600">Token no válido: {tokensInvalidos.join(', ')}</p>}
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <label className="text-xs text-muted-foreground">Contador actual</label>
                <Tooltip text="Número del próximo folio. Se incrementa automáticamente al crear una factura.">
                  <IconAlert className="w-3.5 h-3.5 text-muted-foreground" />
                </Tooltip>
              </div>
              <Input type="number" min={0} value={form.contador_folio} onChange={set('contador_folio')} error={errors.contador} />
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <label className="text-xs text-muted-foreground">IVA %</label>
                <Tooltip text="Porcentaje de impuesto aplicado al subtotal de cada factura.">
                  <IconAlert className="w-3.5 h-3.5 text-muted-foreground" />
                </Tooltip>
              </div>
              <Input type="number" min={0} max={100} step="any" value={form.iva_porcentaje} onChange={set('iva_porcentaje')} error={errors.iva} />
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <label className="text-xs text-muted-foreground">Moneda</label>
                <Tooltip text="Moneda usada para mostrar montos en toda la app.">
                  <IconAlert className="w-3.5 h-3.5 text-muted-foreground" />
                </Tooltip>
              </div>
              <Select value={form.moneda} onChange={v => setForm(f => f && ({ ...f, moneda: v }))} options={CURRENCIES.map(c => ({ value: c.code, label: `${c.code} · ${c.name}` }))} />
            </div>
          </div>
          <div className="text-sm text-muted-foreground">Próxima factura: <b className="text-primary font-mono">{folioPreview}</b></div>
          <Button variant="outline" icon={<IconAlert className="w-4 h-4" />} onClick={() => setPreviewOpen(true)}>Vista previa PDF</Button>
        </div>
      </Card>
```

- [ ] **Step 7: Dialog de preview PDF**

Antes del cierre del `return` (tras el `Button` de guardar):

```tsx
      {previewOpen && (
        <Dialog open onClose={() => setPreviewOpen(false)} title="Vista previa PDF"
          footer={<>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Cerrar</Button>
            <Button onClick={() => printInvoice('Factura ' + folioPreview)}>Imprimir / Descargar PDF</Button>
          </>}>
          <InvoicePrint factura={sampleFactura().factura} items={sampleFactura().items} config={form} />
        </Dialog>
      )}
```

Añadir import `printInvoice` de `../../features/facturas/FacturaDetail`:

```tsx
import { printInvoice } from '../facturas/FacturaDetail'
```

- [ ] **Step 8: Verificación**

Run: `pnpm exec tsc --noEmit -p packages/shared && pnpm test && pnpm -F web build && pnpm -F extension build`
Expected: todo verde/OK

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src/features/configuracion/Configuracion.tsx packages/shared/src/features/facturas/FacturaDetail.tsx
git commit -m "feat: Configuración con tooltips, previews, validación en vivo y PDF preview"
```

---

### Task 6: Verificación final + docs

**Files:**
- Modify: `FUNCIONALIDADES.md`
- Modify: `docs/superpowers/specs/2026-08-13-configuracion-improvements-design.md` (estado → implementado, si aplica)

- [ ] **Step 1: Actualizar docs**

En `FUNCIONALIDADES.md` sección 2.6 Configuración, añadir tras el bullet de "Validación":

```md
- **Prefijo de folio con plantilla de fecha**: tokens `{YYYY}` (2026), `{YY}` (26), `{MM}` (08), `{DD}` (13) expandidos con la fecha de emisión (ej. `FAC-{YYYY}-{MM}-` → `FAC-2026-08-001`). Ayuda desplegable con ejemplos y preview de la próxima factura.
- **Categorías** editables como chips con botón para quitar y modal para agregar (sin duplicados).
- **Campos del emisor**: código postal, ciudad y país (mostrados en el PDF).
- **Vista previa de PDF** con una factura de ejemplo usando los datos actuales.
```

- [ ] **Step 2: Verificación completa**

Run: `pnpm test` → verde (suite + nuevos)
Run: `pnpm exec tsc --noEmit -p packages/shared` → limpio
Run: `pnpm -F web build && pnpm -F extension build` → OK

- [ ] **Step 3: Verificación manual**

1. Configuración: pills de categorías con X, modal de agregar, sin duplicados.
2. Tooltips en contador/IVA/prefijo/moneda al hover.
3. "¿Cómo configurar?" despliega tokens + ejemplos.
4. Preview próxima factura con plantilla (fecha de hoy).
5. Preview logo si hay URL.
6. Validación en vivo: vaciar nombre/prefijo, IVA 200, contador 1.5 → errores rojos y bloqueo de guardado.
7. Vista previa PDF → dialog con factura de ejemplo → Imprimir abre ventana.
8. CP/ciudad/país en PDF.

- [ ] **Step 4: Commit**

```bash
git add FUNCIONALIDADES.md docs/superpowers/specs/2026-08-13-configuracion-improvements-design.md
git commit -m "docs: actualiza FUNCIONALIDADES con mejoras de configuración"
```
