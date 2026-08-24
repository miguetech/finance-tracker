import type { crearEspejo } from '../sync/espejo'
import type { TableName } from '../sheets/tables'
import type { Cliente, Empleado, Asistencia, Factura, FacturaItem, Gasto, Pago, Producto, Proveedor } from '../types/entities'

type Espejo = ReturnType<typeof crearEspejo>

async function leer<T>(espejo: Espejo, tabla: TableName): Promise<T[]> {
  return espejo.getAllRows(tabla) as Promise<T[]>
}

export async function listClientesEspejo(e: Espejo): Promise<Cliente[]> {
  return leer<Cliente>(e, 'Clientes')
}

/** Mismo contrato que repo.listFacturas: filtro por mes y estado. */
export async function listFacturasEspejo(e: Espejo, filtro: { estado?: string; mes?: string } = {}): Promise<Factura[]> {
  let rows = await leer<Factura>(e, 'Facturas')
  if (filtro.mes) rows = rows.filter(f => String(f.fecha_emision).slice(0, 7) === filtro.mes)
  if (filtro.estado) {
    rows = rows.filter(f => {
      const saldo = Number(f.saldo)
      const total = Number(f.total)
      const est = saldo <= 0 ? 'pagada' : saldo < total ? 'parcial' : 'pendiente'
      return filtro.estado === 'pendientes' ? est !== 'pagada' : est === filtro.estado
    })
  }
  return rows
}

export async function listPagosEspejo(e: Espejo, idOrigen?: string): Promise<Pago[]> {
  let rows = await leer<Pago>(e, 'Pagos')
  if (idOrigen) rows = rows.filter(p => p.id_origen === idOrigen)
  return rows
}

/** Mismo contrato que repo.getFactura: null si no existe. */
export async function getFacturaEspejo(e: Espejo, id: string): Promise<{ factura: Factura; items: FacturaItem[] } | null> {
  const facturas = await leer<Factura>(e, 'Facturas')
  const factura = facturas.find(f => f.id_factura === id)
  if (!factura) return null
  type ItemConOrigen = FacturaItem & { id_factura: string }
  const items = await leer<ItemConOrigen>(e, 'Factura_Items')
  return { factura, items: items.filter(i => i.id_factura === id).map(i => ({
    descripcion: String(i.descripcion), cantidad: Number(i.cantidad), precio_unitario: Number(i.precio_unitario), importe: Number(i.importe),
    ...(i.id_producto ? { id_producto: String(i.id_producto) } : {})
  })) }
}

export async function listGastosEspejo(e: Espejo, filtro: { mes?: string; categoria?: string } = {}): Promise<Gasto[]> {
  let rows = await leer<Gasto>(e, 'Gastos')
  if (filtro.mes) rows = rows.filter(g => String(g.fecha).slice(0, 7) === filtro.mes)
  if (filtro.categoria) rows = rows.filter(g => g.categoria === filtro.categoria)
  return rows
}

export async function listProductosEspejo(e: Espejo): Promise<Producto[]> {
  return leer<Producto>(e, 'Productos')
}

export async function listProveedoresEspejo(e: Espejo): Promise<Proveedor[]> {
  return leer<Proveedor>(e, 'Proveedores')
}

export async function listEmpleadosEspejo(e: Espejo): Promise<Empleado[]> {
  return leer<Empleado>(e, 'Empleados')
}

/** Mismo contrato que repo.listAsistencias. */
export async function listAsistenciasEspejo(e: Espejo, filtro: { id_empleado?: string; desde?: string; hasta?: string } = {}): Promise<Asistencia[]> {
  let rows = await leer<Asistencia>(e, 'Asistencias')
  if (filtro.id_empleado) rows = rows.filter(a => a.id_empleado === filtro.id_empleado)
  if (filtro.desde) rows = rows.filter(a => a.fecha >= filtro.desde!)
  if (filtro.hasta) rows = rows.filter(a => a.fecha <= filtro.hasta!)
  return rows.sort((a, b) => b.fecha.localeCompare(a.fecha))
}
