export function assertClienteSinFacturas(facturas: { id_cliente?: string }[], id: string): void {
  if (facturas.some(f => f.id_cliente === id)) throw new Error('Cliente tiene facturas asociadas')
}

export function assertProveedorSinCxp(cxps: { id_proveedor?: string }[], id: string): void {
  if (cxps.some(c => c.id_proveedor === id)) throw new Error('Proveedor tiene cuentas por pagar asociadas')
}

export function enrichNombreProveedor<T extends { id_proveedor?: string; nombre_proveedor?: string }>(
  rows: T[],
  provs: Record<string, string>
): (T & { nombre_proveedor: string })[] {
  return rows.map(p => ({
    ...p,
    nombre_proveedor: p.nombre_proveedor || provs[String(p.id_proveedor ?? '')] || ''
  }))
}

export function emailIgual(a: unknown, b: unknown): boolean {
  return String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase()
}
