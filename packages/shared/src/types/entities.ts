import type { TipoDoc } from '../taxid'
import type { UserRole } from '../roles/roles'

export type MetodoPago = string
export type TipoPago = 'cobro' | 'abono'
export type EstadoFactura = 'pendiente' | 'parcial' | 'pagada'

export interface Cliente {
  id_cliente: string
  nombre: string
  /** Alias comercial de uso interno (búsquedas rápidas; no se imprime en factura) */
  alias?: string
  rfc: string
  email: string
  telefono: string
  /** Dirección exacta: calle, número, referencias */
  direccion: string
  direccion_pais?: string
  direccion_estado?: string
  direccion_cp?: string
  fecha_registro: string
}

export interface FacturaItem {
  descripcion: string
  cantidad: number
  precio_unitario: number
  importe: number
  id_producto?: string
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
  hora_entrada: string
  hora_salida: string
  esquema_pago: 'semanal' | 'quincenal' | 'mensual' | ''
  tarifa_hora_extra: number
  /** Días laborales semanales: números ISO separados por coma (1=Lun … 7=Dom) */
  dias_laborales?: string
}

/** Registro diario de asistencia de un empleado. */
export interface Asistencia {
  id_asistencia: string
  id_empleado: string
  nombre_empleado: string
  fecha: string
  hora_entrada: string
  hora_salida: string
  notas: string
}

export interface GastoFijo {
  id_gasto_fijo: string
  descripcion: string
  categoria: string
  monto: number
  moneda: string
  dia_vencimiento: number
  id_proveedor: string
  nombre_proveedor: string
  enlace_pago: string
  notas: string
  activo: string
}

export interface TasaHistorial {
  id_tasa: string
  fecha: string
  base: string
  moneda: string
  tasa: number
  fuente: string
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
  /** Moneda en la que están cotizados precio_costo y precio_venta */
  moneda: string
  precio_costo: number
  precio_venta: number
  id_proveedor: string
  nombre_proveedor: string
  imagen: string
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
  /** Metas de venta mensuales: JSON { "YYYY-MM": monto } */
  metas_mensuales: string
  /** Comisiones por transacción: JSON { metodos: { [metodo]: % }, gastos: %, cxp: %, nomina: % } */
  comisiones_transaccion: string
  /** Comisiones avanzadas por método de pago: JSON { [metodo]: { pct?: number, minimo_fijo?: number } } */
  comisiones_metodos: string
  /** Registro automático de la tasa del día activado */
  tasa_dia_activa: string
  /** Permisos otorgados a Google: JSON { scope: 'granted' | 'revoked' } */
  google_permisos: string
  /** Recordatorios de pago por notificación del navegador */
  notif_gastos_activa: string
  /** Recordatorios de vencimientos de cobro (CxC) por notificación del navegador */
  notif_cxc_activa: string
  /** Unidades de medida del inventario separadas por coma */
  unidades_medida: string
}

export interface InvoiceTotals {
  subtotal: number
  iva: number
  total: number
}

export interface CodigoAcceso {
  codigo: string
  rol: UserRole
  modulos_ver: string
  modulos_editar: string
  expira_en: string
  usos_max: string
  usos: string
  responsable: string
  email: string
  creado: string
  activo: string
}

export interface Dispositivo {
  codigo: string
  dispositivo: string
  ip_info: string
  registrado_en: string
}
