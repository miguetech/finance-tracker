import type { TipoDoc } from '../taxid'

export type MetodoPago = 'Efectivo' | 'Transferencia' | 'Tarjeta'
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
}

export interface Gasto {
  id_gasto: string
  fecha: string
  categoria: string
  descripcion: string
  monto: number
  metodo_pago: MetodoPago
  proveedor: string
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
}

export interface Pago {
  id_pago: string
  tipo: TipoPago
  id_origen: string
  fecha: string
  monto: number
  metodo_pago: MetodoPago
  notas: string
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
  tipo_doc: TipoDoc
  tipo_doc_etiqueta: string
}

export interface InvoiceTotals {
  subtotal: number
  iva: number
  total: number
}
