# Refactor Visual Fintech (Identidad Corporativa) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactorizar la identidad visual de FinanceTracker a un look fintech moderno: paleta índigo/violeta, tipografía Inter, botones premium con gradiente, sidebar claro con pills, sistema de iconos SVG y wordmark tipográfico.

**Architecture:** Todo el cambio es de presentación sobre `packages/shared` (tokens en `theme.css`, primitivos en `components.tsx`, nav en `Layout.tsx`, nuevo `icons.tsx`), más imports de fuente en las 3 hojas CSS de las apps. Sin cambios de lógica ni esquema.

**Tech Stack:** React 19 · TypeScript 5 (strict) · Tailwind CSS 4 (`@theme`) · Vitest 3 · WXT 0.20 · Vite 6

## Global Constraints

- TypeScript `strict: true`. Sin `any` en tipos públicos.
- **No cambiar lógica de negocio, entidades, ni componentes de datos.** Solo presentación.
- Mantener API de primitivos (`Button` variant/className, `Card`, `StatCard`, `Table`, `Dialog`, `Badge`, `Tabs`, `Input`, `Select`) — los usos existentes no deben cambiar.
- Los tokens usan `@theme` de Tailwind 4 en `packages/shared/src/ui/theme.css`. Mantener nombres de tokens existentes que ya usan los componentes (`primary`, `primary-hover`, `primary-soft`, `danger`, `shadow-card`, `shadow-card-hover`, `shadow-btn`) y añadir los nuevos del spec (`accent`, `success`, `warning`, `surface`, `muted`, `muted-foreground`, `shadow-btn-primary`, `shadow-dialog`, `primary-foreground`, `success-soft`, `danger-soft`, `accent-soft`).
- Iconos: `stroke="currentColor"`, `strokeWidth={1.8}`, viewBox 24x24, `fill="none"`, `aria-hidden`, `className` pasable.
- Font Inter vía `@import url(...)` de Google Fonts en las 3 hojas CSS, tras `@import 'tailwindcss'`.
- Tests: `pnpm test` (50), typecheck `pnpm exec tsc --noEmit -p packages/shared`, builds `pnpm -F web build` y `pnpm -F extension build`.
- Commits convencionales (`style:`, `feat:`).

---

### Task 1: Tokens fintech + tipografía Inter

**Files:**
- Modify: `packages/shared/src/ui/theme.css` (reemplazar bloque `@theme`)
- Modify: `apps/web/src/index.css`
- Modify: `apps/extension/entrypoints/dashboard/dashboard.css`
- Modify: `apps/extension/entrypoints/popup/popup.css`

**Interfaces:**
- Produces: tokens Tailwind utilizables en tasks 3-5: `bg-primary`, `text-primary-foreground`, `bg-accent`, `text-accent`, `bg-success`, `bg-success-soft`, `text-emerald-700`, `bg-danger-soft`, `bg-muted`, `bg-surface`, `text-muted-foreground`, `shadow-btn-primary`, `shadow-dialog`, `from-primary`, `to-accent`.

- [ ] **Step 1: Reemplazar `packages/shared/src/ui/theme.css`**

```css
@theme {
  --font-sans: 'Inter', ui-sans-serif, system-ui, sans-serif;

  --color-primary: oklch(0.55 0.23 262);
  --color-primary-hover: oklch(0.49 0.23 264);
  --color-primary-soft: oklch(0.965 0.02 262);
  --color-primary-foreground: oklch(0.99 0 0);

  --color-accent: oklch(0.58 0.24 305);
  --color-accent-soft: oklch(0.97 0.02 305);

  --color-success: oklch(0.58 0.15 165);
  --color-success-soft: oklch(0.97 0.02 165);
  --color-danger: oklch(0.577 0.245 27.325);
  --color-danger-soft: oklch(0.965 0.02 25);
  --color-warning: oklch(0.7 0.16 70);

  --color-surface: oklch(0.99 0 0);
  --color-muted: oklch(0.965 0.005 260);
  --color-muted-foreground: oklch(0.55 0.01 260);

  --shadow-card: 0 1px 2px rgb(0 0 0 / 0.05), 0 4px 12px rgb(0 0 0 / 0.05);
  --shadow-card-hover: 0 8px 24px rgb(79 70 229 / 0.10);
  --shadow-btn: 0 1px 2px rgb(0 0 0 / 0.10);
  --shadow-btn-primary: 0 4px 14px rgb(79 70 229 / 0.35);
  --shadow-dialog: 0 20px 50px rgb(0 0 0 / 0.20);
}
```

- [ ] **Step 2: Añadir import de Inter en las 3 hojas CSS**

`apps/web/src/index.css` — tras `@import 'tailwindcss';`:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
```

`apps/extension/entrypoints/dashboard/dashboard.css` — idem (misma línea).

`apps/extension/entrypoints/popup/popup.css` — idem (misma línea).

Nota: el orden queda `@import 'tailwindcss';` → `@import url(...Inter...)` → `@import theme.css` → `@source` (los @import deben ir juntos al inicio).

- [ ] **Step 3: Verificar builds**

Run: `pnpm -F web build && pnpm -F extension build`
Expected: ambos OK (confirma que los tokens nuevos y el font resuelven)

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/ui/theme.css apps/web/src/index.css apps/extension/entrypoints/dashboard/dashboard.css apps/extension/entrypoints/popup/popup.css
git commit -m "style: tokens fintech y tipografía Inter"
```

---

### Task 2: Sistema de iconos SVG `icons.tsx`

**Files:**
- Create: `packages/shared/src/ui/icons.tsx`
- Modify: `packages/shared/src/index.ts` (exportar iconos)

**Interfaces:**
- Produces: componente `Icon({ className? })` genérico + 17 iconos nombrados:
  `IconDashboard, IconInvoice, IconClient, IconExpense, IconProvider, IconPayables, IconReport, IconSettings, IconPlus, IconSearch, IconEdit, IconTrash, IconX, IconCheck, IconAlert, IconMenu, IconLogo`.
  Cada uno acepta `className?: string` opcional y renderiza `<svg>`. `Icon` interno: `{ size?: string; children; className? }` con `aria-hidden`.

- [ ] **Step 1: Crear `packages/shared/src/ui/icons.tsx`**

```tsx
import React from 'react'
import type { ReactNode } from 'react'

function Icon({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" className={className}
      aria-hidden="true" width="1em" height="1em">
      {children}
    </svg>
  )
}

export function IconDashboard({ className }: { className?: string }) {
  return <Icon className={className}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></Icon>
}
export function IconInvoice({ className }: { className?: string }) {
  return <Icon className={className}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 13h6M9 17h6" /></Icon>
}
export function IconClient({ className }: { className?: string }) {
  return <Icon className={className}><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17.5" cy="9" r="2.5" /><path d="M21 20c0-2.8-1.8-5-4.5-5.4" /></Icon>
}
export function IconExpense({ className }: { className?: string }) {
  return <Icon className={className}><path d="M12 3v18" /><path d="M17 7c-1-2-5-2-5 0s4 1.5 4 3.5S11.5 14 10 14" /><path d="M7 16c1 2 5 2 5 0" /></Icon>
}
export function IconProvider({ className }: { className?: string }) {
  return <Icon className={className}><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 9h1M9 13h1M14 9h1M14 13h1M9 17h6" /></Icon>
}
export function IconPayables({ className }: { className?: string }) {
  return <Icon className={className}><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18" /><circle cx="7" cy="14" r="1" /></Icon>
}
export function IconReport({ className }: { className?: string }) {
  return <Icon className={className}><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></Icon>
}
export function IconSettings({ className }: { className?: string }) {
  return <Icon className={className}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></Icon>
}
export function IconPlus({ className }: { className?: string }) {
  return <Icon className={className}><path d="M12 5v14M5 12h14" /></Icon>
}
export function IconSearch({ className }: { className?: string }) {
  return <Icon className={className}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Icon>
}
export function IconEdit({ className }: { className?: string }) {
  return <Icon className={className}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></Icon>
}
export function IconTrash({ className }: { className?: string }) {
  return <Icon className={className}><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M10 11v6M14 11v6" /></Icon>
}
export function IconX({ className }: { className?: string }) {
  return <Icon className={className}><path d="M18 6 6 18M6 6l12 12" /></Icon>
}
export function IconCheck({ className }: { className?: string }) {
  return <Icon className={className}><path d="M20 6 9 17l-5-5" /></Icon>
}
export function IconAlert({ className }: { className?: string }) {
  return <Icon className={className}><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0z" /></Icon>
}
export function IconMenu({ className }: { className?: string }) {
  return <Icon className={className}><path d="M4 6h16M4 12h16M4 18h16" /></Icon>
}
export function IconLogo({ className }: { className?: string }) {
  return <Icon className={className}><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /><path d="M12 8v4M10 10h4" /></Icon>
}
```

- [ ] **Step 2: Exportar desde `packages/shared/src/index.ts`**

Añadir al archivo `packages/shared/src/index.ts`:

```ts
export { IconDashboard, IconInvoice, IconClient, IconExpense, IconProvider, IconPayables, IconReport, IconSettings, IconPlus, IconSearch, IconEdit, IconTrash, IconX, IconCheck, IconAlert, IconMenu, IconLogo } from './ui/icons'
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit -p packages/shared`
Expected: limpio

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/ui/icons.tsx packages/shared/src/index.ts
git commit -m "feat: sistema de iconos SVG (icons.tsx)"
```

---

### Task 3: Primitivos fintech (`components.tsx`)

**Files:**
- Modify: `packages/shared/src/ui/components.tsx`

**Interfaces:**
- Consumes: tokens de Task 1 (`primary`, `accent`, `success`, `muted`, `surface`, `muted-foreground`, `shadow-btn-primary`, `shadow-dialog`, `primary-foreground`, `success-soft`, `danger-soft`)
- Consumes: `IconX` de Task 2 (dialog close)
- Produces: mismos componentes con la misma API, nueva apariencia. Sin cambios de firmas.

- [ ] **Step 1: Reemplazar estilos de `Button` (líneas ~28-49)**

```tsx
export type ButtonVariant = 'primary' | 'outline' | 'danger' | 'ghost' | 'success'
export type ButtonSize = 'sm' | 'md' | 'lg'

export function Button({ variant = 'primary', size = 'md', icon, iconAfter, iconOnly, className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode; iconAfter?: ReactNode; iconOnly?: boolean }) {
  const styles: Record<ButtonVariant, string> = {
    primary: 'bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-btn-primary hover:shadow-btn-primary hover:brightness-110',
    outline: 'border border-gray-200 bg-surface text-gray-700 shadow-sm hover:bg-muted',
    danger: 'bg-danger text-white hover:opacity-90',
    ghost: 'text-gray-600 hover:bg-muted',
    success: 'bg-success text-white hover:opacity-90'
  }
  const sizes: Record<ButtonSize, string> = {
    sm: iconOnly ? 'p-2' : 'px-3 py-1.5 text-xs',
    md: iconOnly ? 'p-2.5' : 'px-4 py-2 text-sm',
    lg: iconOnly ? 'p-3' : 'px-6 py-3 text-base'
  }
  return (
    <button
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2',
        'active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none',
        styles[variant], sizes[size], className
      )}
    >
      {icon && <span className="inline-flex">{icon}</span>}
      {!iconOnly && children}
      {iconAfter && <span className="inline-flex">{iconAfter}</span>}
    </button>
  )
}
```

- [ ] **Step 2: `Card` y `StatCard`**

`Card` (línea ~221):

```tsx
export function Card({ title, children, footer }: { title?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="bg-surface border border-gray-100 rounded-2xl shadow-card">
      {title && <div className="px-5 py-4 border-b border-gray-100 font-semibold">{title}</div>}
      <div className="p-5">{children}</div>
      {footer && <div className="px-5 py-4 border-t border-gray-100">{footer}</div>}
    </div>
  )
}
```

`StatCard` (línea ~233):

```tsx
export function StatCard({ label, value, tone }: { label: string; value: string; tone?: 'default' | 'positive' | 'negative' }) {
  const color = tone === 'positive' ? 'text-success' : tone === 'negative' ? 'text-danger' : 'text-gray-900'
  return (
    <div className="bg-surface border border-gray-100 rounded-2xl p-5 shadow-card hover:shadow-card-hover transition-shadow duration-200">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cx('text-2xl font-bold mt-1', color)}>{value}</div>
    </div>
  )
}
```

- [ ] **Step 3: `Input` y `Select`**

`Input`:

```tsx
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx('w-full h-10 px-3.5 border border-gray-200 rounded-xl text-sm bg-surface transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25', props.className)} />
}
```

`Select` (className del `<select>`):

```tsx
    <select value={value} onChange={e => onChange(e.target.value)} className="w-full h-10 px-3.5 border border-gray-200 rounded-xl text-sm bg-surface transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25">
```

- [ ] **Step 4: `Table` y `Badge`**

`Table` wrapper y clases:

```tsx
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-card">
      <table className="min-w-full text-sm">
        <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
          <tr>{columns.map(c => <th key={c.key} className="px-4 py-3 whitespace-nowrap">{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-gray-100 hover:bg-muted/50">
              {columns.map(c => <td key={c.key} className="px-4 py-3 whitespace-nowrap">{c.render ? c.render(r) : String(r[c.key] ?? '')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
```

`Badge` estilos:

```ts
  const styles = {
    gray: 'bg-muted text-gray-600',
    green: 'bg-success-soft text-emerald-700',
    yellow: 'bg-amber-50 text-amber-700',
    red: 'bg-danger-soft text-red-700',
    blue: 'bg-primary-soft text-primary',
    success: 'bg-success-soft text-emerald-700'
  }
```

- [ ] **Step 5: `Dialog` (close con `IconX` + sombra dialog)**

Reemplazar el bloque del close (línea ~110) e importar `IconX`:

```tsx
import { IconX } from './icons'
```

Close button:

```tsx
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-muted transition-colors"><IconX /></button>
```

Contenedor y panel:

```tsx
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-surface w-full sm:max-w-lg max-h-[90vh] overflow-auto rounded-t-2xl sm:rounded-2xl shadow-dialog" onClick={e => e.stopPropagation()}>
```

- [ ] **Step 6: `Tabs`**

Línea ~135 — activo:

```tsx
            className={cx('px-3 py-2 text-sm border-b-2', active === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground')}>
```

- [ ] **Step 7: Typecheck + suite**

Run: `pnpm exec tsc --noEmit -p packages/shared && pnpm test`
Expected: typecheck limpio, 50 tests verdes

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/ui/components.tsx
git commit -m "style: primitivos fintech (botones gradiente, cards, tablas, dialogs)"
```

---

### Task 4: Sidebar con pills + wordmark (`Layout.tsx`)

**Files:**
- Modify: `packages/shared/src/ui/layout/Layout.tsx`

**Interfaces:**
- Consumes: `IconDashboard, IconInvoice, IconClient, IconPayables, IconProvider, IconExpense, IconReport, IconSettings, IconMenu, IconLogo` (Task 2), tokens (Task 1)
- Produces: mismo contrato `Layout({ current, onNavigate, children, headerExtra })`, nueva apariencia.

- [ ] **Step 1: Reescribir `NAV` con componentes de icono**

```tsx
import React, { useState } from 'react'
import type { ReactNode } from 'react'
import { cx } from '../components'
import { IconDashboard, IconInvoice, IconClient, IconPayables, IconProvider, IconExpense, IconReport, IconSettings, IconMenu, IconLogo } from '../icons'

export type NavKey = 'dashboard' | 'facturas' | 'clientes' | 'cuentas' | 'proveedores' | 'gastos' | 'reportes' | 'configuracion'

const NAV: { key: NavKey; label: string; Icon: (p: { className?: string }) => ReactNode }[] = [
  { key: 'dashboard', label: 'Dashboard', Icon: IconDashboard },
  { key: 'facturas', label: 'Facturas', Icon: IconInvoice },
  { key: 'clientes', label: 'Clientes', Icon: IconClient },
  { key: 'cuentas', label: 'Cuentas por Pagar', Icon: IconPayables },
  { key: 'proveedores', label: 'Proveedores', Icon: IconProvider },
  { key: 'gastos', label: 'Gastos', Icon: IconExpense },
  { key: 'reportes', label: 'Reportes', Icon: IconReport },
  { key: 'configuracion', label: 'Configuración', Icon: IconSettings }
]
```

- [ ] **Step 2: Reemplazar el render de nav (item como pill) y el layout**

```tsx
  const nav = (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
      <div className="flex items-center gap-2.5 px-3 pb-5">
        <IconLogo className="text-primary w-7 h-7" />
        <div>
          <div className="font-bold text-lg tracking-tight text-gray-900 leading-none">FinanceTracker</div>
          <div className="text-xs text-muted-foreground mt-0.5">Facturación personal</div>
        </div>
      </div>
      {NAV.map(n => (
        <button key={n.key} onClick={() => { onNavigate(n.key); setMobileOpen(false) }}
          className={cx(
            'w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors',
            current === n.key ? 'bg-primary-soft text-primary font-semibold' : 'text-gray-600 hover:bg-muted'
          )}>
          <n.Icon className="w-5 h-5" />{n.label}
        </button>
      ))}
    </nav>
  )
```

Layout container y header móvil:

```tsx
  return (
    <div className="min-h-screen bg-muted md:flex">
      <aside className="hidden md:flex md:flex-col md:w-60 md:min-h-screen bg-surface border-r border-gray-100">{nav}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden bg-black/40" onClick={() => setMobileOpen(false)}>
          <div className="w-64 h-full bg-surface" onClick={e => e.stopPropagation()}>{nav}</div>
        </div>
      )}
      <div className="flex-1 flex flex-col">
        <header className="md:hidden sticky top-0 z-30 bg-surface border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <button className="p-1 rounded-lg text-gray-600 hover:bg-muted" onClick={() => setMobileOpen(true)}><IconMenu className="w-6 h-6" /></button>
          <div className="font-semibold">FinanceTracker</div>
          <div className="w-6">{headerExtra}</div>
        </header>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  )
```

- [ ] **Step 3: Typecheck + suite**

Run: `pnpm exec tsc --noEmit -p packages/shared && pnpm test`
Expected: limpio, 50 verdes

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/ui/layout/Layout.tsx
git commit -m "style: sidebar con pills, iconos SVG y wordmark"
```

---

### Task 5: Iconos en features, dialogs y popup

**Files:**
- Modify: `packages/shared/src/ui/components.tsx` (ya hecho en Task 3 el `IconX` del dialog)
- Modify: `packages/shared/src/features/facturas/FacturaFormModal.tsx:64` (✕ → IconX)
- Modify: `packages/shared/src/features/facturas/Facturas.tsx`, `gastos/Gastos.tsx`, `clientes/Clientes.tsx`, `proveedores/Proveedores.tsx`, `cuentasPagar/CuentasPagar.tsx` (iconos en botones de acción)
- Modify: `apps/extension/entrypoints/popup/App.tsx` (bg-muted si aplica, botón "Abrir dashboard")

**Interfaces:**
- Consumes: `IconPlus, IconEdit, IconTrash, IconX, IconSearch` (Task 2)

- [ ] **Step 1: Botones de acción con iconos en features**

Patrón a aplicar (mantener texto, añadir `icon`):

`FacturaFormModal.tsx:64` — reemplazar el `<button>✕</button>`:

```tsx
              <button className="col-span-1 inline-flex items-center justify-center text-red-500 hover:text-red-700" aria-label="Eliminar concepto" onClick={() => setItems(l => l.filter((_, idx) => idx !== i))}><IconX /></button>
```

Importar `IconX` desde `../../../ui/icons` (según profundidad del archivo: en features/facturas es `../../ui/icons`).

En cada feature con acciones de tabla (`Facturas.tsx`, `Gastos.tsx`, `Clientes.tsx`, `Proveedores.tsx`, `CuentasPagar.tsx`), añadir iconos a los botones:

- Botón "Editar": `variant="ghost" icon={<IconEdit className="w-4 h-4" />}`
- Botón "Eliminar": `variant="danger" icon={<IconTrash className="w-4 h-4" />}`
- Botón "Ver": `variant="ghost" icon={<IconSearch className="w-4 h-4" />}` (o sin icono — mantener texto "Ver")
- Botón "Nueva factura"/"Nuevo cliente"/"Nuevo proveedor"/"Nueva CXP"/"Registrar gasto": `icon={<IconPlus className="w-4 h-4" />}` y quitar el "+" del texto (dejar "Nueva factura", etc.)

Importar los iconos usados en cada archivo con ruta correcta (`../../ui/icons` desde features/*/).

- [ ] **Step 2: Popup**

`apps/extension/entrypoints/popup/popup.css` — la regla `body` actual:

```css
body { width: 320px; }
```

→ reemplazar por (fondo con token y fuente Inter):

```css
body { width: 320px; background-color: var(--color-muted); }
```

`apps/extension/entrypoints/popup/App.tsx` — añadir icono al botón "Abrir dashboard". Importar `IconDashboard` (ya exportado desde `@ft/shared`) y usarlo:

```tsx
import { IconDashboard } from '@ft/shared'
...
      <Button className="w-full" icon={<IconDashboard className="w-4 h-4" />} onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('/dashboard.html') })}>Abrir dashboard</Button>
```

- [ ] **Step 3: Verificación**

Run: `pnpm exec tsc --noEmit -p packages/shared && pnpm test && pnpm -F web build && pnpm -F extension build`
Expected: todo verde/OK

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/features apps/extension/entrypoints/popup/App.tsx
git commit -m "style: iconos SVG en acciones y popup"
```

---

### Task 6: Verificación final + docs

**Files:**
- Modify: `FUNCIONALIDADES.md` (sección 7 Comportamiento frontend — mención del estilo)
- Modify: `docs/superpowers/specs/2026-08-13-fintech-ui-design.md` (estado → implementado, si aplica)

- [ ] **Step 1: Actualizar docs**

En `FUNCIONALIDADES.md` sección 7, tras el bullet de formato de moneda, añadir:

```md
- Interfaz con identidad fintech: paleta índigo/violeta, tipografía Inter, botones con gradiente, sidebar con iconos SVG y wordmark.
```

- [ ] **Step 2: Verificación completa**

Run: `pnpm test` → 50 verdes
Run: `pnpm -F web build && pnpm -F extension build` → ambos OK

- [ ] **Step 3: Verificación manual**

1. Web + extensión: sidebar con pills y wordmark, iconos SVG en nav y acciones.
2. Botones: gradiente índigo→violeta en primary, hover/active/focus correctos.
3. Dashboard/Reportes: StatCards con hover lift, KPIs 2/4 col.
4. Dialogs: bottom-sheet móvil, sombra grande, close con icono X.
5. Popup de extensión: botones con tokens, tipografía Inter.

- [ ] **Step 4: Commit**

```bash
git add FUNCIONALIDADES.md docs/superpowers/specs/2026-08-13-fintech-ui-design.md
git commit -m "docs: actualiza FUNCIONALIDADES con identidad fintech"
```
