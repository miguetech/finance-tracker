# Design Spec — Mejoras a Configuración (folio con plantilla, categorías pills, tooltips, previews)

**Fecha:** 2026-08-13
**Estado:** Aprobado por usuario
**Base:** `Configuracion.tsx` actual (estado tras feature taxid-ui), `components.tsx`, `InvoicePrint.tsx`, `FacturaDetail.tsx`

---

## 1. Contexto

La sección Configuración quedó visualmente atrás del refactor fintech (labels `text-gray-500`, categorías como texto con comas, sin tooltips, sin validación). El usuario quiere: estilos fintech, tooltips explicativos, categorías como pills con modal de agregar, preview del folio con **plantilla de fecha configurable**, preview del logo, validación en vivo, campos emisor adicionales y preview de PDF.

### 1.1 Objetivos

1. Estilos fintech en Configuración (labels `text-muted-foreground`, consistencia).
2. Componente `Tooltip` reutilizable + tooltips en Contador, IVA %, Prefijo folio y Moneda.
3. Categorías (gastos y CXP) como pills con X para quitar + botón `+` que abre modal de agregar.
4. Folio configurable por plantilla con tokens de fecha `{YYYY} {YY} {MM} {DD}`, expandida con la fecha de emisión de cada factura. Ayuda desplegable con tokens + ejemplos.
5. Preview en vivo del próximo folio (plantilla expandida con fecha de hoy).
6. Preview del logo (thumbnail desde URL).
7. Validación en vivo (prop `error` en `Input`).
8. Campos emisor adicionales: `empresa_cp`, `empresa_ciudad`, `empresa_pais` (en Config, schema y PDF).
9. Preview de PDF con factura de ejemplo (Dialog + imprimir).

### 1.2 Alcance

- **Dentro:** los 9 puntos.
- **Fuera (YAGNI):** dark mode, multi-tema, padding configurable del contador, tokens más allá de fecha, cambios de lógica de folio atómico, migración de hojas (solo claves de Config nuevas, defaults cubren).

---

## 2. Folio con plantilla de fecha

### 2.1 Helper `packages/shared/src/calc/folio.ts`

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
  // tokens malformados: {...} con contenido distinto a los 4 válidos
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

### 2.2 Integración en `createFactura`

En `repository.ts` (`createFactura`, dentro del mutex, línea ~126):

```ts
return `${expandFolioTemplate(c.prefijo_folio, parsed.fecha_emision)}${String(folioN).padStart(3, '0')}`
```

### 2.3 Ejemplos de configuración (documentación y ayuda UI)

| Prefijo | Folio |
|---|---|
| `FAC-` | `FAC-001` |
| `FAC-{YYYY}-` | `FAC-2026-001` |
| `FAC-{YYYY}-{MM}-` | `FAC-2026-08-001` |
| `INV{YY}{MM}-` | `INV2608-001` |
| `{YYYY}/{MM}/FAC-` | `2026/08/FAC-001` |

### 2.4 Validación

`invalidFolioTokens` → si devuelve tokens, mostrar error en vivo: `Token no válido: {HOLA}`. El guardado se permite igual (el token se deja literal en el folio), solo es advertencia visual + mensaje.

---

## 3. Nuevos primitivos en `components.tsx`

### 3.1 `Tooltip`

Componente CSS puro (sin dependencias), `group`/`group-hover` de Tailwind:

```tsx
export function Tooltip({ text, children, side = 'top' }: { text: string; children: ReactNode; side?: 'top' | 'bottom' }) {
  return (
    <span className="relative inline-flex group">
      {children}
      <span className={cx(
        'pointer-events-none absolute z-50 w-max max-w-56 rounded-lg bg-gray-900 text-white text-xs px-2.5 py-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity',
        side === 'top' ? 'bottom-full left-1/2 -translate-x-1/2 mb-1.5' : 'top-full left-1/2 -translate-x-1/2 mt-1.5'
      )}>{text}</span>
    </span>
  )
}
```

### 3.2 `Input` con prop `error`

Añadir `error?: string` a `Input`. Cuando `error`, borde `border-danger` + mensaje bajo el input:

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

`Select` igual con `error`.

---

## 4. Modelo Config — campos emisor adicionales

- `entities.ts` `Config`: `empresa_cp: string`, `empresa_ciudad: string`, `empresa_pais: string`.
- `schemas.ts` `ConfigSchema`: las 3 con `z.string().default('')`.
- `createSpreadsheet.ts` `DEFAULT_CONFIG`: `empresa_cp: ''`, `empresa_ciudad: ''`, `empresa_pais: ''`; `configFromRows` extrae las 3 (fallback `''`).
- `InvoicePrint.tsx`: tras `empresa_direccion`, mostrar `{config.empresa_direccion} {config.empresa_cp}` y una línea `{config.empresa_ciudad}, {config.empresa_pais}` (solo si no vacías).

Retrocompatible: hojas existentes sin las claves caen a `''`.

---

## 5. Configuración — UI completa

### 5.1 Estilos

- Todos los `<label className="text-xs text-gray-500">` → `text-xs text-muted-foreground`.
- Loading `p-8 text-gray-500` → `text-muted-foreground`.
- Botón guardar: mantener `Button`, centrado o `w-full sm:w-auto`.

### 5.2 Card Datos de la empresa

- Nombre, tipo documento, doc, etiqueta (condicional), teléfono, email, dirección, **CP / ciudad / país** (grid 3-col en sm), logo con **preview thumbnail**:

```tsx
{form.empresa_logo && (
  <img src={form.empresa_logo} alt="Logo" className="h-12 mt-1 rounded-lg border border-gray-200 object-contain bg-white"
    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
)}
```

### 5.3 Card Facturación

- **Prefijo folio** con tooltip + botón "¿Cómo configurar?" que despliega ayuda (accordion/simple `<details>` o toggle state) mostrando tabla de tokens (`FOLIO_TOKENS`) + los ejemplos de §2.3 + preview en vivo.
- **Preview próxima factura** (en vivo, fecha de hoy):

```tsx
<div className="text-xs text-muted-foreground">Próxima factura: <b className="text-primary">{expandFolioTemplate(form.prefijo_folio, hoy)}{String(Math.max(1, Number(form.contador_folio))).padStart(3, '0')}</b></div>
```

- **Contador actual** con tooltip: "Número del próximo folio. Se incrementa automáticamente al crear una factura. Ej: con contador 42 y prefijo FAC-{YYYY}-{MM}-, el folio será FAC-2026-08-042".
- **IVA %** con tooltip: "Porcentaje de impuesto aplicado al subtotal de cada factura."
- **Moneda** con tooltip: "Moneda usada para mostrar montos y folios en toda la app."

### 5.4 Card Categorías — pills + modal

Nuevo componente local `CategoriasEditor` (en `Configuracion.tsx`):

- Props: `title`, `value` (string coma-separada), `onChange` (string).
- Render: pills `bg-primary-soft text-primary` con label + botón `IconX` (w-3.5 h-3.5) para quitar; botón `+ Agregar` (outline, `IconPlus`) que abre `Dialog` con `Input` + botón "Agregar".
- Validación del modal: no agregar vacío ni duplicado (case-insensitive).
- `onChange` serializa de vuelta a coma-string.

Uso en Configuracion: dos instancias (Gastos y Cuentas por pagar). El `submit` actual ya guarda `form.categorias_gastos` / `categorias_cxp`.

### 5.5 Preview de PDF

- Botón "Vista previa PDF" (outline) en la card Facturación (o footer de la sección).
- Estado `previewOpen`. Al abrir, construir `sampleFactura` y `sampleItems` desde el `form` actual (sin guardar):

```ts
function sampleFromConfig(c: Config): { factura: Factura; items: FacturaItem[] } {
  const items = [{ descripcion: 'Concepto de ejemplo', cantidad: 1, precio_unitario: 100, importe: 100 }]
  const subtotal = 100, iva = Math.round(subtotal * c.iva_porcentaje) / 100
  return {
    factura: {
      id_factura: 'preview', folio: expandFolioTemplate(c.prefijo_folio, hoy) + String(c.contador_folio).padStart(3, '0'),
      id_cliente: '', nombre_cliente: 'Cliente de ejemplo', fecha_emision: hoy, fecha_vencimiento: '',
      subtotal, iva, total: subtotal + iva, saldo: subtotal + iva, fecha_pago: '', notas: 'Factura de ejemplo'
    },
    items
  }
}
```

- Dialog muestra `<InvoicePrint factura items config={form} />` + footer con botón "Imprimir / Descargar PDF" que llama a `printInvoice` (refactor para aceptar título) y "Cerrar".

### 5.6 Refactor `printInvoice` (en `FacturaDetail.tsx`)

Firma actual `printInvoice(det)` usa `det.factura.folio` como título y lee `#invoice-print`. Generalizar:

```ts
export function printInvoice(title: string) {
  const w = window.open('', '_blank', 'width=900,height=700')
  if (!w) return
  const node = document.getElementById('invoice-print')
  if (!node) return
  w.document.write('<html><head><title>' + title + '</title>...')
  ...
}
```

Y actualizar la llamada en `FacturaDetail` a `printInvoice('Factura ' + factura.folio)`.

---

## 6. Verificación

- `pnpm test` verde (50 + nuevos de folio/validación/modelo).
- `pnpm exec tsc --noEmit -p packages/shared` limpio.
- `pnpm -F web build && pnpm -F extension build` OK.
- Visual: Configuración con pills, tooltips, preview folio con plantilla, ayuda desplegable, preview logo, preview PDF, validación en vivo.

---

## 7. Fuera de alcance

- Dark mode, multi-tema, padding del contador configurable, tokens adicionales, migración de hojas.
