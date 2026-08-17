import { describe, expect, it, vi } from 'vitest'
import { permsFor, MODULE_KEYS, type Repository, type Usuario, type Gasto, type Config, type Kpis } from '@ft/shared'
import { route } from '../src/actions'

const OWNER = 'owner@ft.com'

const defaultConfig: Config = {
  empresa_nombre: 'X',
  empresa_rfc: '',
  empresa_direccion: '',
  empresa_telefono: '',
  empresa_email: '',
  empresa_logo: '',
  empresa_cp: '',
  empresa_ciudad: '',
  empresa_pais: '',
  prefijo_folio: 'FAC-',
  contador_folio: 1,
  moneda: 'MXN',
  iva_porcentaje: 16,
  categorias_gastos: 'Renta,Sueldos',
  categorias_cxp: '',
  categorias_inventario: '',
  monedas_activas: 'MXN',
  monedas_custom: '',
  tasas_cambio: '',
  metodos_pago: '',
  tipo_doc: 'RFC',
  tipo_doc_etiqueta: 'RFC',
  share_backend_url: ''
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
    expect(full.contador_folio).toBe(1)
    expect(full.prefijo_folio).toBe('FAC-')
    const sanitized = await route(fakeRepo(), 'getConfig', {}, permsFor('user@ft.com', OWNER, usuario())) as Record<string, unknown>
    expect(sanitized).not.toHaveProperty('contador_folio')
    expect(sanitized).not.toHaveProperty('prefijo_folio')
    expect(sanitized.empresa_nombre).toBe('X')
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
      { id_pago: 'p1', tipo: 'cobro', id_origen: 'f1' },
      { id_pago: 'p2', tipo: 'abono', id_origen: 'c1' }
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
})