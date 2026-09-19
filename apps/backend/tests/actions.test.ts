import { describe, expect, it, vi } from 'vitest'
import { permsFor, MODULE_KEYS, type Repository, type Usuario, type Gasto, type Config, type Kpis } from '@ft/shared'
import { route } from '../src/actions'

const OWNER = 'owner@ft.com'

const defaultConfig: Config = {
  company_name: 'X',
  company_tax_id: '',
  company_address: '',
  company_phone: '',
  company_email: '',
  company_logo: '',
  company_zip: '',
  company_city: '',
  company_country: '',
  serial_prefix: 'FAC-',
  serial_counter: 1,
  moneda: 'MXN',
  vat_percent: 16,
  expense_categories: 'Renta,Sueldos',
  ap_categories: '',
  inventory_categories: '',
  active_currencies: 'MXN',
  custom_currencies: '',
  exchange_rates: '',
  payment_methods: '',
  tipo_doc: 'RFC',
  doc_type_label: 'RFC',
  share_backend_url: '',
  monthly_goals: '',
  transaction_fees: '',
  daily_rate_active: '',
  google_permissions: '',
  notifications_expense_active: '',
  notifications_ar_active: '',
  method_fees: '',
  measure_units: 'pieza,kg',
  baseSheetName: ''
}

function fakeRepo(overrides: Partial<Repository> = {}): Repository {
  const clientes: never[] = []
  const gastos: Gasto[] = []
  const usuarios: Usuario[] = []
  return {
    listClientes: async () => clientes,
    listGastos: async () => gastos,
    listUsuarios: async () => usuarios,
    getConfig: async () => defaultConfig,
    saveGasto: async (g: Gasto) => {
      gastos.push(g)
      return g
    },
    ...overrides
  } as unknown as Repository
}

function usuario(overrides: Partial<Usuario> = {}): Usuario {
  return { email: 'user@ft.com', rol: 'solo_lectura', modulos_ver: '', modulos_editar: '', ...overrides }
}

describe('route', () => {
  it('getPerms devuelve perms del dueño (admin)', async () => {
    const p = permsFor('OWNER@FT.COM', OWNER, null)
    const res = await route(fakeRepo(), 'getPerms', {}, p)
    expect(res).toEqual({ isAdmin: true, rol: 'admin', view: [...MODULE_KEYS], edit: [...MODULE_KEYS] })
  })

  it('getPerms devuelve perms de un usuario con rol', async () => {
    const p = permsFor('user@ft.com', OWNER, usuario({ rol: 'asistente', modulos_ver: 'facturas,clientes', modulos_editar: 'facturas' }))
    const res = await route(fakeRepo(), 'getPerms', {}, p) as { isAdmin: boolean; rol: string; view: string[]; edit: string[] }
    expect(res.isAdmin).toBe(false)
    expect(res.rol).toBe('asistente')
    expect(res.view).toContain('facturas')
    expect(res.view).toContain('clientes')
    expect(res.edit).toContain('facturas')
    expect(res.edit).not.toContain('clientes')
  })

  it('getConfig admin devuelve config completa, no-admin sanitizada', async () => {
    const full = await route(fakeRepo(), 'getConfig', {}, permsFor(OWNER, OWNER, null)) as Record<string, unknown>
    expect(full.serial_counter).toBe(1)
    expect(full.serial_prefix).toBe('FAC-')
    const sanitized = await route(fakeRepo(), 'getConfig', {}, permsFor('user@ft.com', OWNER, usuario())) as Record<string, unknown>
    expect(sanitized).not.toHaveProperty('contador_folio')
    expect(sanitized).not.toHaveProperty('prefijo_folio')
    expect(sanitized.company_name).toBe('X')
  })

  it('listClientes denegado sin canView(clientes)', async () => {
    const p = permsFor('user@ft.com', OWNER, usuario({ rol: 'ver_gastos', modulos_ver: 'gastos', modulos_editar: '' }))
    await expect(route(fakeRepo(), 'listClientes', {}, p)).rejects.toThrow('No tienes permiso')
  })

  it('saveGasto permitido con canEdit(gastos)', async () => {
    const p = permsFor('user@ft.com', OWNER, usuario({ rol: 'asistente', modulos_ver: 'gastos', modulos_editar: 'gastos' }))
    const res = await route(fakeRepo(), 'saveGasto', { descripcion: 'renta', monto: 1000, fecha: '2026-08-01' } as never, p)
    expect(res).toMatchObject({ descripcion: 'renta', monto: 1000 })
  })

  it('saveGasto denegado sin canEdit(gastos)', async () => {
    const p = permsFor('user@ft.com', OWNER, usuario({ rol: 'ver_gastos', modulos_ver: 'gastos', modulos_editar: '' }))
    await expect(route(fakeRepo(), 'saveGasto', {} as never, p)).rejects.toThrow('No tienes permiso')
  })

  it('listUsuarios solo admin', async () => {
    const p = permsFor('user@ft.com', OWNER, usuario({ rol: 'asistente', modulos_ver: '', modulos_editar: '' }))
    await expect(route(fakeRepo(), 'listUsuarios', {}, p)).rejects.toThrow('No tienes permiso')
    const res = await route(fakeRepo(), 'listUsuarios', {}, permsFor(OWNER, OWNER, null))
    expect(res).toEqual([])
  })

  it('acciones de códigos solo admin', async () => {
    const noAdmin = permsFor('user@ft.com', OWNER, usuario({ rol: 'asistente', modulos_ver: '', modulos_editar: '' }))
    await expect(route(fakeRepo(), 'listCodigos', {}, noAdmin)).rejects.toThrow('No tienes permiso')
    await expect(route(fakeRepo(), 'saveCodigo', {}, noAdmin)).rejects.toThrow('No tienes permiso')
    await expect(route(fakeRepo(), 'renovarCodigo', {}, noAdmin)).rejects.toThrow('No tienes permiso')
    await expect(route(fakeRepo(), 'deleteCodigo', 'FT-2026-ABCD', noAdmin)).rejects.toThrow('No tienes permiso')

    const admin = permsFor(OWNER, OWNER, null)
    const listCodigos = vi.fn(async () => [])
    const saveCodigo = vi.fn(async (c: never) => c)
    const renovarCodigo = vi.fn(async () => ({} as never))
    const deleteCodigo = vi.fn(async () => {})
    const repo = fakeRepo({ listCodigos, saveCodigo, renovarCodigo, deleteCodigo })

    await route(repo, 'listCodigos', {}, admin)
    expect(listCodigos).toHaveBeenCalled()

    await route(repo, 'saveCodigo', { codigo: 'FT-2026-ABCD' }, admin)
    expect(saveCodigo).toHaveBeenCalledWith({ codigo: 'FT-2026-ABCD' })

    await route(repo, 'renovarCodigo', { codigo: 'FT-2026-ABCD', nuevaExpira: '2027-01-01' }, admin)
    expect(renovarCodigo).toHaveBeenCalledWith('FT-2026-ABCD', '2027-01-01')

    await route(repo, 'deleteCodigo', 'FT-2026-ABCD', admin)
    expect(deleteCodigo).toHaveBeenCalledWith('FT-2026-ABCD')
  })

  it('getReportes pasa el mes como string', async () => {
    const getReportes = vi.fn(async (mes: string) => ({ kpis: {} as Kpis, categorias: [], top: [] }))
    const repo = fakeRepo({ getReportes })
    const p = permsFor('user@ft.com', OWNER, usuario({ rol: 'ver_reportes', modulos_ver: 'reportes', modulos_editar: '' }))
    const res = await route(repo, 'getReportes', '2026-08', p)
    expect(getReportes).toHaveBeenCalledWith('2026-08')
    expect(res).toEqual({ kpis: {}, categorias: [], top: [] })
  })

  it('getReportes denegado sin permisos de reportes ni dashboard', async () => {
    const p = permsFor('user@ft.com', OWNER, usuario({ rol: 'personalizado', modulos_ver: '', modulos_editar: '' }))
    await expect(route(fakeRepo(), 'getReportes', '2026-08', p)).rejects.toThrow('No tienes permiso')
  })

  it('listPagos con solo facturas devuelve únicamente cobros', async () => {
    const pagos = [
      { payment_id: 'p1', tipo: 'cobro', origin_id: 'f1' },
      { payment_id: 'p2', tipo: 'abono', origin_id: 'c1' }
    ]
    const repo = fakeRepo({ listPagos: async () => pagos as never })
    const p = permsFor('user@ft.com', OWNER, usuario({ rol: 'ver_facturas', modulos_ver: 'facturas', modulos_editar: '' }))
    const res = await route(repo, 'listPagos', null, p) as { tipo: string }[]
    expect(res).toHaveLength(1)
    expect(res[0].tipo).toBe('cobro')
  })

  it('acción desconocida → error', async () => {
    const p = permsFor(OWNER, OWNER, null)
    await expect(route(fakeRepo(), 'noExiste', {}, p)).rejects.toThrow('No tienes permiso')
  })

  it('uploadImagen logo (configuracion) solo admin', async () => {
    const uploadImagen = vi.fn(async () => 'https://drive.url')
    const repo = fakeRepo({ uploadImagen })
    const input = { nombre: 'logo.png', mimeType: 'image/png', base64: 'abc', modulo: 'configuracion' }

    await expect(route(repo, 'uploadImagen', input, permsFor('user@ft.com', OWNER, usuario({ rol: 'asistente', modulos_ver: '', modulos_editar: '' })))).rejects.toThrow('No tienes permiso')

    const res = await route(repo, 'uploadImagen', input, permsFor(OWNER, OWNER, null))
    expect(res).toBe('https://drive.url')
    expect(uploadImagen).toHaveBeenCalledWith({ nombre: 'logo.png', mimeType: 'image/png', base64: 'abc' })
  })

  it('uploadImagen producto (inventario) con canEdit(inventario)', async () => {
    const uploadImagen = vi.fn(async () => 'https://drive.url')
    const repo = fakeRepo({ uploadImagen })
    const input = { nombre: 'p.png', mimeType: 'image/png', base64: 'xyz', modulo: 'inventario' }

    await expect(route(repo, 'uploadImagen', input, permsFor('user@ft.com', OWNER, usuario({ rol: 'personalizado', modulos_ver: 'inventario', modulos_editar: '' })))).rejects.toThrow('No tienes permiso')

    const ok = permsFor('user@ft.com', OWNER, usuario({ rol: 'asistente', modulos_ver: 'inventario', modulos_editar: 'inventario' }))
    const res = await route(repo, 'uploadImagen', input, ok)
    expect(res).toBe('https://drive.url')
    expect(uploadImagen).toHaveBeenCalledWith({ nombre: 'p.png', mimeType: 'image/png', base64: 'xyz' })
  })

  it('uploadImagen módulo desconocido → denegado', async () => {
    const p = permsFor(OWNER, OWNER, null)
    await expect(route(fakeRepo(), 'uploadImagen', { nombre: 'x', mimeType: 'image/png', base64: 'a', modulo: 'gastos' }, p)).rejects.toThrow('No tienes permiso')
  })
})