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
