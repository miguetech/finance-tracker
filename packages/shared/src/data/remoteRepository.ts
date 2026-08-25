import type { Repository } from './repository'
import type { PermsInfo } from '../roles/roles'
import type { UploadImagenInput } from '../drive/api'

export interface RemoteRepositoryCtx {
  apiUrl: string
  getIdToken: () => Promise<string>
  getSessionToken?: () => Promise<string | null>
}

export function createRemoteRepository(ctx: RemoteRepositoryCtx): Repository & { getPerms(): Promise<PermsInfo> } {
  async function call<T>(action: string, payload: unknown = {}): Promise<T> {
    const token = ctx.getSessionToken ? await ctx.getSessionToken() : null
    const qs = token
      ? new URLSearchParams({ token, action, payload: JSON.stringify(payload) })
      : new URLSearchParams({ id_token: await ctx.getIdToken(), action, payload: JSON.stringify(payload) })
    const res = await fetch(`${ctx.apiUrl}?${qs.toString()}`, { method: 'GET' })
    const data = (await res.json()) as { ok: boolean; data?: T; error?: string }
    if (!data.ok) throw new Error(data.error ?? 'Error')
    return data.data as T
  }

  async function callPost<T>(action: string, payload: unknown = {}): Promise<T> {
    const token = ctx.getSessionToken ? await ctx.getSessionToken() : null
    const body: Record<string, unknown> = { action, payload }
    if (token) body.token = token
    else body.id_token = await ctx.getIdToken()
    const res = await fetch(ctx.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = (await res.json()) as { ok: boolean; data?: T; error?: string }
    if (!data.ok) throw new Error(data.error ?? 'Error')
    return data.data as T
  }

  return {
    getPerms: () => call('getPerms'),
    getConfig: () => call('getConfig'),
    uploadImagen: (input: UploadImagenInput) => callPost('uploadImagen', input),
    // El visitante no sube imágenes propias; la migración es del dueño.
    migrarImagenesADrive: async () => ({ migradas: 0, fallidas: 0 }),
    // El visitante no crea hojas de año (su vista es de solo lectura).
    prepararAnioActual: async () => ({ ok: false, modo: 'monolítico' as const, error: 'modo visitante' }),
    estadoAlmacenamiento: async () => ({ anioActivo: '', eventos: [], baseId: '', creadoAñoActual: false }),
    // Sin alcance vivo: su fuente no es Sheets por años.
    leerVariasTablasVivas: async ts => ({ filas: Object.fromEntries(ts.map(t => [t, []])), alcance: {} }),
    // Buscador/vinculación: solo el dueño administra almacenamiento.
    listarHojasDisponibles: async () => [],
    conectarHojaPorId: async () => {},
    eliminarAño: async () => {},
    saveConfig: c => call('saveConfig', c),
    listClientes: () => call('listClientes'),
    saveCliente: c => call('saveCliente', c),
    deleteCliente: id => call('deleteCliente', id),
    createFactura: i => call('createFactura', i),
    updateFactura: (id, data) => call('updateFactura', { id, data }),
    listFacturas: f => call('listFacturas', f ?? {}),
    listFacturasItems: () => call('listFacturasItems'),
    // El visitante no usa espejo; stubs para cumplir la forma de Repository.
    leerVariasTablas: async () => ({}),
    hojaActual: async () => ({ id: '', titulo: '', url: '' }),
    conectarHojaPorNombre: async () => { throw new Error('No disponible para invitados') },
    getFactura: id => call('getFactura', id),
    deleteFactura: id => call('deleteFactura', id),
    listGastos: f => call('listGastos', f ?? {}),
    saveGasto: ga => call('saveGasto', ga),
    deleteGasto: id => call('deleteGasto', id),
    listProveedores: () => call('listProveedores'),
    saveProveedor: pr => call('saveProveedor', pr),
    deleteProveedor: id => call('deleteProveedor', id),
    listEmpleados: () => call('listEmpleados'),
    saveEmpleado: e => call('saveEmpleado', e),
    deleteEmpleado: id => call('deleteEmpleado', id),
    registerNomina: i => call('registerNomina', i),
    createCxp: i => call('createCxp', i),
    listCxp: f => call('listCxp', f ?? {}),
    deleteCxp: id => call('deleteCxp', id),
    registerPago: p => call('registerPago', p),
    listPagos: id => call('listPagos', id ?? null),
    getReportes: mes => call('getReportes', mes),
    getCategorias: kind => call('getCategorias', kind),
    listProductos: () => call('listProductos'),
    saveProducto: p => call('saveProducto', p),
    deleteProducto: id => call('deleteProducto', id),
    registrarMovimiento: m => call('registrarMovimiento', m),
    listMovimientos: id => call('listMovimientos', id ?? null),
    listGastosFijos: () => call('listGastosFijos'),
    saveGastoFijo: g => call('saveGastoFijo', g),
    deleteGastoFijo: id => call('deleteGastoFijo', id),
    listTasasHistorial: () => call('listTasasHistorial'),
    registrarTasa: t => callPost('registrarTasa', t),
    listNominaDetalles: () => call('listNominaDetalles'),
    registerNominaAvanzada: i => callPost('registerNominaAvanzada', i),
    listAsistencias: f => call('listAsistencias', f ?? {}),
    saveAsistencia: a => callPost('saveAsistencia', a),
    deleteAsistencia: id => call('deleteAsistencia', id),
    getReporteFinanciero: r => call('getReporteFinanciero', r),
    getReportesInventario: (r, ids) => call('getReportesInventario', { r, ids }),
    getVentasProducto: (id, r) => call('getVentasProducto', { id, r }),
    getMetasVsLogros: meses => call('getMetasVsLogros', meses),
    listUsuarios: () => call('listUsuarios'),
    saveUsuario: u => call('saveUsuario', u),
    deleteUsuario: email => call('deleteUsuario', email),
    listCodigos: () => call('listCodigos'),
    saveCodigo: c => call('saveCodigo', c),
    renovarCodigo: (codigo, nuevaExpira) => call('renovarCodigo', { codigo, nuevaExpira }),
    deleteCodigo: codigo => call('deleteCodigo', codigo),
    listDispositivos: () => call('listDispositivos'),
    registrarDispositivo: d => call('registrarDispositivo', d),
    removerDispositivo: dispositivo => call('removerDispositivo', dispositivo)
  }
}
