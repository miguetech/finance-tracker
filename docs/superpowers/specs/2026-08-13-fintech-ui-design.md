# Design Spec — Refactor Visual Fintech (identidad profesional corporativa)

**Fecha:** 2026-08-13
**Estado:** Aprobado por usuario
**Base:** `packages/shared/src/ui/theme.css`, `components.tsx`, `Layout.tsx` (estado tras feature taxid-ui)

---

## 1. Contexto

FinanceTracker ya tiene tokens básicos (`theme.css`), primitivos pulidos y responsive (feature previa). El usuario quiere una **identidad visual fintech moderna** que refleje nivel profesional/corporativo: botones premium, sidebar claro con pills, iconos SVG, tipografía Inter, paleta índigo/violeta.

### 1.1 Objetivos

1. Paleta y tokens fintech (índigo primario, violeta acento, verde éxito, grises neutros).
2. Tipografía Inter (Google Fonts) con fallback system-ui, aplicada global.
3. Botones premium: gradiente índigo→violeta, sombra coloreada, hover elevación, focus ring.
4. Sidebar claro con pills e iconos SVG (reemplazar emojis).
5. Sistema de iconos SVG inline (sin dependencia externa).
6. Cards/StatCards/tablas/dialogs consistentes con la identidad.
7. Wordmark tipográfico "FinanceTracker".

### 1.2 Alcance

- **Dentro:** tokens, tipografía, `Button`, `Card`/`StatCard`, `Input`/`Select`, `Table`, `Dialog`, `Badge`, `Tabs`, sidebar/nav (Layout), iconos SVG, wordmark, popup de extensión.
- **Fuera (YAGNI):** logo generado vía skill design, dark mode, PWA, cambios de lógica, multi-tema.

---

## 2. Tokens de diseño (`theme.css`)

Sustituir el bloque `@theme` actual por la paleta fintech. Mantener los nombres de token existentes (`primary`, `primary-hover`, `primary-soft`, `danger`, `shadow-card`, `shadow-card-hover`, `shadow-btn`) y añadir nuevos:

```css
@theme {
  --font-sans: 'Inter', ui-sans-serif, system-ui, sans-serif;

  --color-primary: oklch(0.55 0.23 262);        /* índigo-600 fintech */
  --color-primary-hover: oklch(0.49 0.23 264);  /* índigo-700 */
  --color-primary-soft: oklch(0.965 0.02 262);  /* índigo-50 */
  --color-primary-foreground: oklch(0.99 0 0);  /* blanco sobre primary */

  --color-accent: oklch(0.58 0.24 305);         /* violeta acento */
  --color-accent-soft: oklch(0.97 0.02 305);

  --color-success: oklch(0.58 0.15 165);        /* verde éxito */
  --color-success-soft: oklch(0.97 0.02 165);
  --color-danger: oklch(0.577 0.245 27.325);    /* rojo (mantener) */
  --color-danger-soft: oklch(0.965 0.02 25);
  --color-warning: oklch(0.7 0.16 70);          /* ámbar */

  --color-surface: oklch(0.99 0 0);             /* blanco cards */
  --color-muted: oklch(0.965 0.005 260);        /* gris-50 fondos */
  --color-muted-foreground: oklch(0.55 0.01 260); /* gris texto secundario */

  --shadow-card: 0 1px 2px rgb(0 0 0 / 0.05), 0 4px 12px rgb(0 0 0 / 0.05);
  --shadow-card-hover: 0 8px 24px rgb(79 70 229 / 0.10);
  --shadow-btn: 0 1px 2px rgb(0 0 0 / 0.10);
  --shadow-btn-primary: 0 4px 14px rgb(79 70 229 / 0.35); /* índigo glow */
  --shadow-dialog: 0 20px 50px rgb(0 0 0 / 0.20);
}
```

**Tipografía:** en `apps/web/src/index.css` y `apps/extension/entrypoints/dashboard/dashboard.css` y `popup.css` añadir tras `@import 'tailwindcss'`:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
```

(El popup de extensión carga el font vía la misma regla; con display=swap el fallback system-ui cubre mientras carga. El font ya se usa en plantillas PDF/brand — consistente.)

**Body:** `--color-muted` como fondo de página (`bg-muted` en el contenedor Layout actual `bg-gray-50`).

---

## 3. Sistema de iconos SVG (`packages/shared/src/ui/icons.tsx`)

Nuevo archivo, componentes funcionales de 24x24, `stroke="currentColor"`, `strokeWidth={1.8}`, sin dependencias. Exportar:

`IconDashboard, IconInvoice, IconClient, IconExpense, IconProvider, IconPayables, IconReport, IconSettings, IconPlus, IconSearch, IconEdit, IconTrash, IconX, IconCheck, IconAlert, IconMenu, IconLogo`

Cada una: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">{paths}</svg>` con `className` pasable y `aria-hidden`.

Ruta base: paths estándar Lucide (diseño público MIT) simplificados a ~1-2 paths por icono.

---

## 4. Primitivos (`components.tsx`)

### 4.1 Button (overhaul sobre el actual)

```tsx
const styles: Record<ButtonVariant, string> = {
  primary: 'bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-btn-primary hover:shadow-btn-primary hover:brightness-110',
  outline: 'border border-gray-200 bg-surface text-gray-700 shadow-sm hover:bg-muted',
  danger: 'bg-danger text-white hover:opacity-90',
  ghost: 'text-gray-600 hover:bg-muted',
  success: 'bg-success text-white hover:opacity-90'
}
```

- Base: `inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none`.
- Sizes: `sm` `px-3 py-1.5 text-xs`, `md` `px-4 py-2 text-sm`, `lg` `px-6 py-3 text-base`; `iconOnly` `p-2`/`p-2.5`/`p-3`.

### 4.2 Card

`bg-surface border border-gray-100 rounded-2xl shadow-card` (título: `px-5 py-4 border-b border-gray-100 font-semibold`).

### 4.3 StatCard

`bg-surface border border-gray-100 rounded-2xl p-5 shadow-card hover:shadow-card-hover transition-shadow duration-200`; label `text-xs uppercase tracking-wide text-muted-foreground`; value `text-2xl font-bold mt-1` con tonos (`text-success`/`text-danger`/`text-gray-900`).

### 4.4 Input / Select

`w-full h-10 px-3.5 border border-gray-200 rounded-xl text-sm bg-surface transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25`.

### 4.5 Table

Contenedor `overflow-x-auto rounded-xl border border-gray-100 shadow-card`; thead `bg-muted text-xs uppercase text-muted-foreground`; th/td `px-4 py-3 whitespace-nowrap`; filas `border-t border-gray-100 hover:bg-muted/50`.

### 4.6 Dialog

Contenedor `fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 p-0 sm:p-4`; panel `bg-surface w-full sm:max-w-lg max-h-[90vh] overflow-auto rounded-t-2xl sm:rounded-2xl shadow-dialog`.

### 4.7 Badge

Tonos: `gray`→`bg-muted text-gray-600`, `green`/`success`→`bg-success-soft text-emerald-700`, `yellow`→`bg-amber-50 text-amber-700`, `red`→`bg-danger-soft text-red-700`, `blue`→`bg-primary-soft text-primary`.

### 4.8 Tabs

Activo `border-primary text-primary`, inactivo `text-muted-foreground`.

---

## 5. Layout / navegación (`Layout.tsx`)

- `NAV` con `icon: ReactNode` (instancias de `icons.tsx`) en vez de emoji.
- Sidebar desktop: `w-60 bg-surface border-r border-gray-100`; encabezado con wordmark `FinanceTracker` (bold, `text-lg tracking-tight text-gray-900`) + subtexto `text-xs text-muted-foreground`.
- Item nav:
  - Inactivo: `text-gray-600 hover:bg-muted rounded-lg`
  - Activo: `bg-primary-soft text-primary font-semibold rounded-lg` (pill, sin borde-l).
- Contenedor página: `bg-muted` (antes `bg-gray-50`).
- Mobile drawer: misma nav, `bg-surface`.
- Header móvil: `bg-surface border-b border-gray-100`, botón menú = `IconMenu`.

---

## 6. Features / popup

- Reemplazar emojis/íconos de acción en features por componentes de `icons.tsx` donde haya botones de acción con texto (`IconPlus`, `IconEdit`, `IconTrash`, `IconSearch`, `IconX` en dialog close, `IconCheck`).
- Toast: mantener, `rounded-lg shadow-card`.
- Popup (`apps/extension/entrypoints/popup`): añadir `@import url(...Inter...)`, `theme.css` ya importado (fix previo). Body `bg-muted`. Botones/StatCards ya heredan primitivos.
- `InvoicePrint` (PDF): sin cambio visual (solo datos).

---

## 7. Verificación

- `pnpm test` verde (50).
- `pnpm exec tsc --noEmit -p packages/shared` limpio.
- `pnpm -F web build && pnpm -F extension build` OK.
- Visual manual: dashboard KPIs, sidebar pills + wordmark, botones (gradiente/focus/hover), dialogs, popup.

---

## 8. Fuera de alcance

- Logo generado (skill design), dark mode, PWA, multi-tema, cambiar lógica de negocio.
