# Design Spec — Tipo de documento fiscal configurable + Mejora UI/UX

**Fecha:** 2026-08-13
**Estado:** Aprobado por usuario
**Base:** `docs/superpowers/specs/2026-08-11-finance-tracker-design.md` y código actual

---

## 1. Contexto

FinanceTracker es una app de facturación personal (single-user) con Google Sheets como DB, monorepo pnpm (`apps/extension` WXT, `apps/web` Vite, `packages/shared` núcleo). Hoy la app está enfocada a México: etiqueta **RFC** hardcodeada en 6 puntos de la UI y campo interno `rfc`.

Además, la UI actual es funcional pero básica: botones planos sin foco/transición, sin tokens de diseño, algunos grids rompen en móvil.

### 1.1 Objetivos

1. Permitir configurar el tipo de documento fiscal del emisor (RFC / NIF / Cédula / Otro con etiqueta personalizada) de forma **global**, con labels dinámicos en toda la UI.
2. Mejorar el diseño: botones elegantes y bien formados, tokens de diseño consistentes, y responsive correcto en móvil.

### 1.2 Alcance

- **Dentro:** Config global de tipo de documento + etiqueta custom; labels dinámicos; overhaul del componente `Button`; tokens de diseño; responsive en formularios, dialog y dashboard.
- **Fuera (YAGNI):** tipo de documento por cliente (rechazado), dark mode, PWA, iconos SVG de navegación, cambios de lógica de negocio, multi-moneda con tipo de cambio, timbrado CFDI.

---

## 2. Diseño Parte 1 — Tipo de documento fiscal configurable

### 2.1 Modelo de datos

`Config` (entidad y schema) gana dos claves:

| Clave | Tipo | Default | Validación |
|---|---|---|---|
| `tipo_doc` | string | `'RFC'` | enum `['RFC','NIF','Cedula','Otro']` |
| `tipo_doc_etiqueta` | string | `''` | string libre (usada solo si `tipo_doc === 'Otro'`) |

**Retrocompatibilidad:** hojas existentes sin estas claves caen a los defaults vía `configFromRows` (que ya hace merge con `DEFAULT_CONFIG`). Sin migración. Las hojas nuevas (`createInitialSpreadsheet`) serializan las claves automáticamente porque `configToRows` itera `Object.entries(config)`.

### 2.2 Nuevo helper `packages/shared/src/taxid.ts`

```ts
export const TIPO_DOC_OPTIONS: { value: TipoDoc; label: string }[] = [
  { value: 'RFC', label: 'RFC' },
  { value: 'NIF', label: 'NIF' },
  { value: 'Cedula', label: 'Cédula' },
  { value: 'Otro', label: 'Otro' }
]

export function getDocLabel(tipo: TipoDoc, etiqueta: string): string {
  switch (tipo) {
    case 'RFC': return 'RFC'
    case 'NIF': return 'NIF'
    case 'Cedula': return 'Cédula'
    case 'Otro': return etiqueta.trim() || 'Documento fiscal'
  }
}
```

`TipoDoc` = `'RFC' | 'NIF' | 'Cedula' | 'Otro'` (exportado desde `taxid.ts`).

### 2.3 Cambios de UI (labels hoy "RFC")

El campo interno de las entidades **sigue llamándose `rfc`** (sin cambio de esquema de hojas, sin tocar búsqueda ni cliente rápido). Solo cambia la etiqueta mostrada, derivada con `getDocLabel(config.tipo_doc, config.tipo_doc_etiqueta)`:

| Archivo | Línea | Cambio |
|---|---|---|
| `Configuracion.tsx` | 36 | Label del campo emisor dinámico + nuevo `Select` "Tipo de documento" (tipo_doc) + `Input` "Etiqueta personalizada" condicional si `Otro` |
| `ClienteFormModal.tsx` | 21 | Label dinámico vía `useConfig()` |
| `ProveedorFormModal.tsx` | 17 | Label dinámico vía `useConfig()` |
| `Clientes.tsx` | 23, 31 | Placeholder búsqueda + header tabla dinámicos |
| `Proveedores.tsx` | 24 | Header tabla dinámico |
| `InvoicePrint.tsx` | — | Sin cambios (PDF muestra valores, no labels) |

### 2.4 Validación

- `tipo_doc` y `tipo_doc_etiqueta` sin obligatoriedad extra: el campo `rfc`/`empresa_rfc` **sigue opcional** (decisión de usuario).
- Al elegir `Otro` sin etiqueta, `getDocLabel` devuelve `'Documento fiscal'` como fallback visual.

---

## 3. Diseño Parte 2 — Mejora UI/UX

### 3.1 Tokens de diseño (Tailwind 4 `@theme`)

Nuevo archivo `packages/shared/src/ui/theme.css` con `@theme`:

```css
@theme {
  --color-primary: oklch(0.55 0.22 262);        /* azul primario */
  --color-primary-hover: oklch(0.50 0.22 262);
  --color-primary-soft: oklch(0.95 0.03 262);   /* fondo activo nav */
  --color-danger: oklch(0.62 0.24 25);
  --shadow-card: 0 1px 3px rgb(0 0 0 / 0.08);
  --shadow-card-hover: 0 4px 12px rgb(0 0 0 / 0.10);
  --shadow-btn: 0 1px 2px rgb(0 0 0 / 0.10);
  --radius-lg: 0.75rem;
}
```

Importado en `apps/web/src/index.css` y `apps/extension/entrypoints/dashboard/dashboard.css` (después de `@import 'tailwindcss'`). Reemplaza el azul hardcodeado (`bg-blue-600`, `border-blue-600`, etc.) por los tokens.

### 3.2 Overhaul del componente `Button`

API ampliada en `packages/shared/src/ui/components.tsx`:

```ts
type ButtonVariant = 'primary' | 'outline' | 'danger' | 'ghost' | 'success'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode          // icono al inicio
  iconAfter?: ReactNode     // icono al final
  iconOnly?: boolean        // botón cuadrado solo icono
}
```

Estilos base: `inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none`.

| Variant | Clases |
|---|---|
| `primary` | `bg-primary text-white shadow-btn hover:bg-primary-hover` |
| `outline` | `border border-gray-300 bg-white text-gray-700 hover:bg-gray-50` |
| `danger` | `bg-danger text-white hover:opacity-90` |
| `ghost` | `text-gray-700 hover:bg-gray-100` |
| `success` | `bg-green-600 text-white hover:bg-green-700` |

| Size | Padding |
|---|---|
| `sm` | `px-2.5 py-1.5 text-xs` |
| `md` | `px-3.5 py-2 text-sm` |
| `lg` | `px-5 py-2.5 text-base` |
| `iconOnly` | `p-2` (y `w-9 h-9` para sm) |

Se mantiene compatibilidad total: los usos actuales (`variant`, `className`) siguen funcionando sin cambios.

### 3.3 Form controls (`Input`, `Select`)

- `Input`: `border-gray-300 rounded-lg` + `focus:border-primary focus:ring-2 focus:ring-primary/30 focus:outline-none`, `h-9 sm:h-10` para consistencia.
- `Select`: mismo tratamiento de foco.
- Nueva prop `error?: string` en `Input`/`Select` → borde `border-danger` + texto de error bajo el campo (se usa solo si algún form lo necesita).

### 3.4 Card / StatCard / Badge / Table

- `Card`: `rounded-xl shadow-card` (reemplaza `rounded-lg shadow-sm`).
- `StatCard`: `rounded-xl shadow-card hover:shadow-card-hover transition-shadow`.
- `Badge`: mapea tonos a tokens (mantiene API actual).
- `Table`: `rounded-xl border border-gray-200 overflow-hidden` contenedor + header alineado a tokens.

### 3.5 `Dialog` responsive (bottom-sheet en móvil)

- Contenedor: `fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4`.
- Panel: `w-full sm:max-w-lg max-h-[90vh] overflow-auto rounded-t-2xl sm:rounded-xl bg-white` + `onClick stopPropagation` (ya existe).
- `ConfirmDialog` hereda automáticamente.

### 3.6 Responsive específico

| Archivo | Problema | Fix |
|---|---|---|
| `Configuracion.tsx:45` | `grid grid-cols-2` rompe en móvil | `grid-cols-1 sm:grid-cols-2` |
| `Dashboard.tsx:28` | KPIs 1 col en móvil | `grid-cols-2 md:grid-cols-4` |
| Formularios modal con grid 2-col | facturas/gastos/cxp | `grid-cols-1 sm:grid-cols-2` (revisar cada uno) |
| `Table` | celdas largas | `min-w-full` + truncado con `whitespace-nowrap` en celdas texto |

---

## 4. Archivos a modificar

**Nuevos:**
- `packages/shared/src/taxid.ts`
- `packages/shared/src/ui/theme.css`
- `packages/shared/tests/taxid.test.ts`

**Modificados:**
- `packages/shared/src/types/entities.ts` (Config + TipoDoc)
- `packages/shared/src/types/schemas.ts` (ConfigSchema)
- `packages/shared/src/sheets/createSpreadsheet.ts` (DEFAULT_CONFIG, configFromRows)
- `packages/shared/src/ui/components.tsx` (Button, Input, Select, Card, StatCard, Badge, Table, Dialog)
- `packages/shared/src/ui/layout/Layout.tsx` (tokens nav activo)
- `packages/shared/src/features/configuracion/Configuracion.tsx`
- `packages/shared/src/features/clientes/ClienteFormModal.tsx`, `Clientes.tsx`
- `packages/shared/src/features/proveedores/ProveedorFormModal.tsx`, `Proveedores.tsx`
- `packages/shared/src/features/dashboard/Dashboard.tsx`
- `apps/web/src/index.css`, `apps/extension/entrypoints/dashboard/dashboard.css`

## 5. Tests

- `taxid.test.ts`: `getDocLabel` para los 4 tipos + fallback `Otro` sin etiqueta + `Otro` con etiqueta; defaults de `ConfigSchema` (`tipo_doc='RFC'`, `tipo_doc_etiqueta=''`).
- Suite existente (38 tests) debe seguir verde; los tests UI que tocan labels de botones/forms se verifican sin romper selectores.

## 6. Verificación

- `pnpm test` (vitest shared) verde.
- `pnpm dev:web` y `pnpm dev:extension` compilan; revisión visual manual en viewport móvil (<640px) y desktop de: config (nuevo select + etiqueta), formularios cliente/proveedor, dashboard KPIs, dialogs, botones en todos los estados (hover/focus/active/disabled).
