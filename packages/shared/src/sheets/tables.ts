export type TableName = 'Config' | 'Clientes' | 'Facturas' | 'Factura_Items' | 'Gastos' | 'Proveedores' | 'Cuentas_Pagar' | 'Pagos' | 'Metas'

export interface ColumnSpec {
  key: string
  header: string
  type?: 'string' | 'number' | 'date'
}

const S = 'string'
const N = 'number'
const D = 'date'

export const TABLES: Record<TableName, ColumnSpec[]> = {
  Config: [
    { key: 'clave', header: 'clave', type: S },
    { key: 'valor', header: 'valor', type: S }
  ],
  Clientes: [
    { key: 'id_cliente', header: 'id_cliente', type: S },
    { key: 'nombre', header: 'nombre', type: S },
    { key: 'rfc', header: 'rfc', type: S },
    { key: 'email', header: 'email', type: S },
    { key: 'telefono', header: 'telefono', type: S },
    { key: 'direccion', header: 'direccion', type: S },
    { key: 'fecha_registro', header: 'fecha_registro', type: D }
  ],
  Facturas: [
    { key: 'id_factura', header: 'id_factura', type: S },
    { key: 'folio', header: 'folio', type: S },
    { key: 'id_cliente', header: 'id_cliente', type: S },
    { key: 'nombre_cliente', header: 'nombre_cliente', type: S },
    { key: 'fecha_emision', header: 'fecha_emision', type: D },
    { key: 'fecha_vencimiento', header: 'fecha_vencimiento', type: D },
    { key: 'subtotal', header: 'subtotal', type: N },
    { key: 'iva', header: 'iva', type: N },
    { key: 'total', header: 'total', type: N },
    { key: 'saldo', header: 'saldo', type: N },
    { key: 'fecha_pago', header: 'fecha_pago', type: D },
    { key: 'notas', header: 'notas', type: S }
  ],
  Factura_Items: [
    { key: 'id_factura', header: 'id_factura', type: S },
    { key: 'descripcion', header: 'descripcion', type: S },
    { key: 'cantidad', header: 'cantidad', type: N },
    { key: 'precio_unitario', header: 'precio_unitario', type: N },
    { key: 'importe', header: 'importe', type: N }
  ],
  Gastos: [
    { key: 'id_gasto', header: 'id_gasto', type: S },
    { key: 'fecha', header: 'fecha', type: D },
    { key: 'categoria', header: 'categoria', type: S },
    { key: 'descripcion', header: 'descripcion', type: S },
    { key: 'monto', header: 'monto', type: N },
    { key: 'metodo_pago', header: 'metodo_pago', type: S },
    { key: 'proveedor', header: 'proveedor', type: S }
  ],
  Proveedores: [
    { key: 'id_proveedor', header: 'id_proveedor', type: S },
    { key: 'nombre', header: 'nombre', type: S },
    { key: 'rfc', header: 'rfc', type: S },
    { key: 'email', header: 'email', type: S },
    { key: 'telefono', header: 'telefono', type: S },
    { key: 'direccion', header: 'direccion', type: S },
    { key: 'fecha_registro', header: 'fecha_registro', type: D }
  ],
  Cuentas_Pagar: [
    { key: 'id_cxp', header: 'id_cxp', type: S },
    { key: 'id_proveedor', header: 'id_proveedor', type: S },
    { key: 'nombre_proveedor', header: 'nombre_proveedor', type: S },
    { key: 'folio_documento', header: 'folio_documento', type: S },
    { key: 'categoria', header: 'categoria', type: S },
    { key: 'descripcion', header: 'descripcion', type: S },
    { key: 'fecha_emision', header: 'fecha_emision', type: D },
    { key: 'fecha_vencimiento', header: 'fecha_vencimiento', type: D },
    { key: 'monto_total', header: 'monto_total', type: N },
    { key: 'saldo', header: 'saldo', type: N },
    { key: 'estado', header: 'estado', type: S },
    { key: 'notas', header: 'notas', type: S }
  ],
  Pagos: [
    { key: 'id_pago', header: 'id_pago', type: S },
    { key: 'tipo', header: 'tipo', type: S },
    { key: 'id_origen', header: 'id_origen', type: S },
    { key: 'fecha', header: 'fecha', type: D },
    { key: 'monto', header: 'monto', type: N },
    { key: 'metodo_pago', header: 'metodo_pago', type: S },
    { key: 'notas', header: 'notas', type: S }
  ],
  Metas: [{ key: 'placeholder', header: 'placeholder', type: S }]
}

export function sheetName(t: TableName): string {
  return t
}

export function HEADER_ROWS(t: TableName): number {
  return t === 'Config' ? 0 : 1
}
