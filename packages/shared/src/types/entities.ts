import type { TipoDoc } from '../taxid'

export type MetodoPago = string
export type TipoPago = 'cobro' | 'abono'
export type EstadoFactura = 'pendiente' | 'parcial' | 'pagada'

export interface Cliente {
  id_cliente: string
  nombre: string
  rfc: string
  email: string
  telefono: string
  direccion: string
  fecha_registro: string
}

export interface FacturaItem {
  descripcion: string
  cantidad: number
  precio_unitario: number
  importe: number
}

export interface Factura {
  id_factura: string
  folio: string
  id_cliente: string
  nombre_cliente: string
  fecha_emision: string
  fecha_vencimiento: string
  subtotal: number
  iva: number
  total: number
  saldo: number
  fecha_pago: string
  notas: string
  moneda: string
  tipo_cambio: number
  editada: string
  fecha_edicion: string
}

export interface Empleado {
  id_empleado: string
  nombre: string
  rfc: string
  puesto: string
  salario: number
  salario_moneda: string
  fecha_ingreso: string
  activo: string
}

export interface Gasto {
  id_gasto: string
  fecha: string
  categoria: string
  descripcion: string
  monto: number
  metodo_pago: MetodoPago
  proveedor: string
  moneda: string
  tipo_cambio: number
}

export interface Proveedor {
  id_proveedor: string
  nombre: string
  rfc: string
  email: string
  telefono: string
  direccion: string
  fecha_registro: string
}

export interface CuentaPagar {
  id_cxp: string
  id_proveedor: string
  nombre_proveedor: string
  folio_documento: string
  categoria: string
  descripcion: string
  fecha_emision: string
  fecha_vencimiento: string
  monto_total: number
  saldo: number
  estado: EstadoFactura
  notas: string
  moneda: string
  tipo_cambio: number
}

export interface Pago {
  id_pago: string
  tipo: TipoPago
  id_origen: string
  fecha: string
  monto: number
  metodo_pago: MetodoPago
  notas: string
  moneda: string
  tipo_cambio: number
}

export interface Producto {
  id_producto: string
  nombre: string
  categoria: string
  unidad: string
  stock: number
  stock_minimo: number
  precio_costo: number
  precio_venta: number
  id_proveedor: string
  nombre_proveedor: string
  notas: string
  activo: string
  fecha_registro: string
}

export type TipoMovimiento = 'entrada' | 'salida' | 'ajuste'

export interface MovimientoStock {
  id_movimiento: string
  id_producto: string
  tipo: TipoMovimiento
  cantidad: number
  motivo: string
  id_proveedor: string
  fecha: string
}

export interface Config {
  empresa_nombre: string
  empresa_rfc: string
  empresa_direccion: string
  empresa_telefono: string
  empresa_email: string
  empresa_logo: string
  empresa_cp: string
  empresa_ciudad: string
  empresa_pais: string
  prefijo_folio: string
  contador_folio: number
  moneda: string
  iva_porcentaje: number
  categorias_gastos: string
  categorias_cxp: string
  categorias_inventario: string
  monedas_activas: string
  monedas_custom: string
  tasas_cambio: string
  metodos_pago: string
  tipo_doc: TipoDoc
  tipo_doc_etiqueta: string
  share_backend_url: string
}

export interface InvoiceTotals {
  subtotal: number
  iva: number
  total: number
}
