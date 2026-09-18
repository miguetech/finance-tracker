export function assertClienteSinFacturas(facturas: { customer_id?: string }[], id: string): void {
  if (facturas.some(f => f.customer_id === id)) throw new Error('Cliente tiene facturas asociadas')
}

export function assertProveedorSinCxp(cxps: { supplier_id?: string }[], id: string): void {
  if (cxps.some(c => c.supplier_id === id)) throw new Error('Proveedor tiene cuentas por pagar asociadas')
}

export function enrichNombreProveedor<T extends { supplier_id?: string; supplier_name?: string }>(
  rows: T[],
  provs: Record<string, string>
): (T & { supplier_name: string })[] {
  return rows.map(p => ({
    ...p,
    supplier_name: p.supplier_name || provs[String(p.supplier_id ?? '')] || ''
  }))
}

export function emailIgual(a: unknown, b: unknown): boolean {
  return String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase()
}
