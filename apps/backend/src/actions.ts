import type { Perms, Repository } from '@ft/shared'
import { permsInfo } from './roles'

type Payload = unknown

function denied(): never {
  throw new Error('No tienes permiso')
}

function sanitizeConfig(cfg: Record<string, unknown>): Record<string, unknown> {
  const { contador_folio: _c, prefijo_folio: _p, ...rest } = cfg
  return rest
}

export async function route(repo: Repository, action: string, payload: Payload, p: Perms): Promise<unknown> {
  switch (action) {
    case 'getPerms':
      return permsInfo(p)
    case 'getConfig': {
      const cfg = await repo.getConfig()
      return p.isAdmin ? cfg : sanitizeConfig(cfg as unknown as Record<string, unknown>)
    }
    case 'listClientes':
      if (!p.canView('clientes')) return denied()
      return repo.listClientes()
    case 'listFacturas':
      if (!p.canView('facturas')) return denied()
      return repo.listFacturas((payload ?? {}) as Parameters<Repository['listFacturas']>[0])
    case 'getFactura':
      if (!p.canView('facturas')) return denied()
      return repo.getFactura(String(payload))
    case 'listGastos':
      if (!p.canView('gastos')) return denied()
      return repo.listGastos((payload ?? {}) as Parameters<Repository['listGastos']>[0])
    case 'listEmpleados':
      if (!p.canView('empleados')) return denied()
      return repo.listEmpleados()
    case 'listProveedores':
      if (!p.canView('proveedores')) return denied()
      return repo.listProveedores()
    case 'listCxp':
      if (!p.canView('cuentas')) return denied()
      return repo.listCxp((payload ?? {}) as Parameters<Repository['listCxp']>[0])
    case 'listPagos': {
      if (!p.canView('cuentas') && !p.canView('facturas')) return denied()
      const all = await repo.listPagos()
      if (payload) return repo.listPagos(String(payload))
      if (p.canView('cuentas')) return all
      return all.filter(pago => pago.tipo === 'cobro')
    }
    case 'getReportes': {
      if (!p.canView('reportes') && !p.canView('dashboard')) return denied()
      return repo.getReportes(String(payload ?? ''))
    }
    case 'getCategorias': {
      const isCxp = payload === 'cxp'
      if (!p.canView(isCxp ? 'cuentas' : 'gastos')) return denied()
      return repo.getCategorias(isCxp ? 'cxp' : 'gastos')
    }
    case 'saveCliente':
      if (!p.canEdit('clientes')) return denied()
      return repo.saveCliente(payload as Parameters<Repository['saveCliente']>[0])
    case 'deleteCliente':
      if (!p.canEdit('clientes')) return denied()
      await repo.deleteCliente(String(payload))
      return { ok: true }
    case 'saveGasto':
      if (!p.canEdit('gastos')) return denied()
      return repo.saveGasto(payload as Parameters<Repository['saveGasto']>[0])
    case 'deleteGasto':
      if (!p.canEdit('gastos')) return denied()
      await repo.deleteGasto(String(payload))
      return { ok: true }
    case 'createFactura':
      if (!p.canEdit('facturas')) return denied()
      return repo.createFactura(payload as Parameters<Repository['createFactura']>[0])
    case 'updateFactura': {
      if (!p.canEdit('facturas')) return denied()
      const input = payload as { id?: string; data?: Parameters<Repository['updateFactura']>[1] } | null
      return repo.updateFactura(String(input?.id ?? ''), input?.data ?? ({} as Parameters<Repository['updateFactura']>[1]))
    }
    case 'deleteFactura':
      if (!p.canEdit('facturas')) return denied()
      await repo.deleteFactura(String(payload))
      return { ok: true }
    case 'saveProveedor':
      if (!p.canEdit('proveedores') && !p.canEdit('cuentas') && !p.canEdit('inventario')) return denied()
      return repo.saveProveedor(payload as Parameters<Repository['saveProveedor']>[0])
    case 'deleteProveedor':
      if (!p.canEdit('proveedores')) return denied()
      await repo.deleteProveedor(String(payload))
      return { ok: true }
    case 'saveEmpleado':
      if (!p.canEdit('empleados')) return denied()
      return repo.saveEmpleado(payload as Parameters<Repository['saveEmpleado']>[0])
    case 'deleteEmpleado':
      if (!p.canEdit('empleados')) return denied()
      await repo.deleteEmpleado(String(payload))
      return { ok: true }
    case 'registerNomina':
      if (!p.canEdit('empleados')) return denied()
      return repo.registerNomina(payload as Parameters<Repository['registerNomina']>[0])
    case 'createCxp':
      if (!p.canEdit('cuentas')) return denied()
      return repo.createCxp(payload as Parameters<Repository['createCxp']>[0])
    case 'deleteCxp':
      if (!p.canEdit('cuentas')) return denied()
      await repo.deleteCxp(String(payload))
      return { ok: true }
    case 'registerPago':
      if (!p.canEdit('cuentas') && !p.canEdit('facturas')) return denied()
      return repo.registerPago(payload as Parameters<Repository['registerPago']>[0])
    case 'listProductos':
      if (!p.canView('inventario')) return denied()
      return repo.listProductos()
    case 'saveProducto':
      if (!p.canEdit('inventario')) return denied()
      return repo.saveProducto(payload as Parameters<Repository['saveProducto']>[0])
    case 'deleteProducto':
      if (!p.canEdit('inventario')) return denied()
      await repo.deleteProducto(String(payload))
      return { ok: true }
    case 'listMovimientos':
      if (!p.canView('inventario')) return denied()
      return payload ? repo.listMovimientos(String(payload)) : repo.listMovimientos()
    case 'registrarMovimiento':
      if (!p.canEdit('inventario')) return denied()
      return repo.registrarMovimiento(payload as Parameters<Repository['registrarMovimiento']>[0])
    case 'listUsuarios':
      if (!p.isAdmin) return denied()
      return repo.listUsuarios()
    case 'saveUsuario':
      if (!p.isAdmin) return denied()
      await repo.saveUsuario(payload as Parameters<Repository['saveUsuario']>[0])
      return { ok: true }
    case 'deleteUsuario':
      if (!p.isAdmin) return denied()
      await repo.deleteUsuario(String(payload))
      return { ok: true }
    case 'listCodigos':
      if (!p.isAdmin) return denied()
      return repo.listCodigos()
    case 'saveCodigo':
      if (!p.isAdmin) return denied()
      return repo.saveCodigo(payload as Parameters<Repository['saveCodigo']>[0])
    case 'renovarCodigo': {
      if (!p.isAdmin) return denied()
      const input = payload as { codigo?: string; nuevaExpira?: string } | null
      return repo.renovarCodigo(String(input?.codigo ?? ''), String(input?.nuevaExpira ?? ''))
    }
    case 'deleteCodigo':
      if (!p.isAdmin) return denied()
      await repo.deleteCodigo(String(payload))
      return { ok: true }
    case 'saveConfig':
      if (!p.isAdmin) return denied()
      await repo.saveConfig(payload as Parameters<Repository['saveConfig']>[0])
      return { ok: true }
    default:
      return denied()
  }
}