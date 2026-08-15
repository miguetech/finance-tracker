import type { Repository } from './repository'
import type { PermsInfo } from '../roles/roles'

export interface RemoteRepositoryCtx {
  apiUrl: string
  getIdToken: () => Promise<string>
}

export function createRemoteRepository(ctx: RemoteRepositoryCtx): Repository & { getPerms(): Promise<PermsInfo> } {
  async function call<T>(action: string, payload: unknown = {}): Promise<T> {
    const idToken = await ctx.getIdToken()
    const qs = new URLSearchParams({ id_token: idToken, action, payload: JSON.stringify(payload) })
    const res = await fetch(`${ctx.apiUrl}?${qs.toString()}`, { method: 'GET' })
    const data = (await res.json()) as { ok: boolean; data?: T; error?: string }
    if (!data.ok) throw new Error(data.error ?? 'Error')
    return data.data as T
  }
  return {
    getPerms: () => call('getPerms'),
    getConfig: () => call('getConfig'),
    saveConfig: c => call('saveConfig', c),
    listClientes: () => call('listClientes'),
    saveCliente: c => call('saveCliente', c),
    deleteCliente: id => call('deleteCliente', id),
    createFactura: i => call('createFactura', i),
    listFacturas: f => call('listFacturas', f ?? {}),
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
    listUsuarios: () => call('listUsuarios'),
    saveUsuario: u => call('saveUsuario', u),
    deleteUsuario: email => call('deleteUsuario', email)
  }
}
