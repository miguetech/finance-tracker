export const MODULE_KEYS = ['dashboard', 'facturas', 'clientes', 'gastos', 'empleados', 'proveedores', 'cuentas', 'cxc', 'reportes', 'inventario'] as const
export type ModuleKey = (typeof MODULE_KEYS)[number]

export type UserRole = 'admin' | 'asistente' | 'solo_lectura' | 'ver_facturas' | 'ver_reportes' | 'ver_gastos' | 'ver_empleados' | 'ver_cuentas' | 'personalizado'

export interface Usuario {
  email: string
  rol: UserRole
  modulos_ver: string
  modulos_editar: string
}

export interface Perms {
  isAdmin: boolean
  rol: UserRole | null
  canView(m: ModuleKey): boolean
  canEdit(m: ModuleKey): boolean
}

export interface PermsInfo {
  isAdmin: boolean
  rol: UserRole | null
  view: ModuleKey[]
  edit: ModuleKey[]
}

export const ROLE_PRESETS: Record<'solo_lectura' | 'ver_facturas' | 'ver_reportes' | 'ver_gastos' | 'ver_empleados' | 'ver_cuentas', ModuleKey[]> = {
  solo_lectura: [...MODULE_KEYS],
  ver_facturas: ['dashboard', 'facturas', 'clientes', 'cxc'],
  ver_reportes: ['dashboard', 'reportes'],
  ver_gastos: ['dashboard', 'gastos'],
  ver_empleados: ['dashboard', 'empleados'],
  ver_cuentas: ['dashboard', 'proveedores', 'cuentas']
}

export function parseModules(csv: string): ModuleKey[] {
  return csv.split(',').map(s => s.trim()).filter((m): m is ModuleKey => (MODULE_KEYS as readonly string[]).includes(m))
}

export function viewModulesOf(u: Usuario): ModuleKey[] {
  if (u.rol === 'admin') return [...MODULE_KEYS]
  if (u.rol === 'personalizado') return parseModules(u.modulos_ver)
  if (u.rol === 'asistente') {
    const ver = parseModules(u.modulos_ver)
    const editar = parseModules(u.modulos_editar)
    return Array.from(new Set([...ver, ...editar]))
  }
  return ROLE_PRESETS[u.rol] ?? []
}

export function editModulesOf(u: Usuario): ModuleKey[] {
  if (u.rol === 'admin') return [...MODULE_KEYS]
  if (u.rol === 'asistente') return parseModules(u.modulos_editar)
  return []
}

export function permsFor(email: string, ownerEmail: string, u: Usuario | null): Perms {
  const e = email.toLowerCase()
  if (e && e === ownerEmail.toLowerCase()) {
    return { isAdmin: true, rol: 'admin', canView: () => true, canEdit: () => true }
  }
  if (!u) return { isAdmin: false, rol: null, canView: () => false, canEdit: () => false }
  const view = new Set(viewModulesOf(u))
  const edit = new Set(editModulesOf(u))
  return {
    isAdmin: false,
    rol: u.rol,
    canView: m => view.has(m),
    canEdit: m => edit.has(m)
  }
}

export function permsFromInfo(info: PermsInfo): Perms {
  const view = new Set(info.view)
  const edit = new Set(info.edit)
  return {
    isAdmin: info.isAdmin,
    rol: info.rol,
    canView: m => view.has(m),
    canEdit: m => edit.has(m)
  }
}
