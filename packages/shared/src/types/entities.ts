import type { TipoDoc } from '../taxid'
import type { UserRole } from '../roles/roles'

export type MetodoPago = string
export type TipoPago = 'cobro' | 'abono'
export type EstadoFactura = 'pendiente' | 'parcial' | 'pagada'

export interface Cliente {
  customer_id: string
  nombre: string
  /** Alias comercial de uso interno (búsquedas rápidas; no se imprime en factura) */
  alias?: string
  rfc: string
  email: string
  telefono: string
  /** Dirección exacta: calle, número, referencias */
  direccion: string
  address_country?: string
  address_state?: string
  address_zip?: string
  created_at: string
}

export interface FacturaItem {
  descripcion: string
  cantidad: number
  unit_price: number
  importe: number
  product_id?: string
}

export interface Factura {
  invoice_id: string
  folio: string
  customer_id: string
  customer_name: string
  issue_date: string
  due_date: string
  subtotal: number
  iva: number
  total: number
  saldo: number
  paid_at: string
  notas: string
  moneda: string
  exchange_rate: number
  editada: string
  edited_at: string
}

export interface Empleado {
  employee_id: string
  nombre: string
  rfc: string
  puesto: string
  salario: number
  salary_currency: string
  hire_date: string
  activo: string
  clock_in: string
  clock_out: string
  pay_schedule: 'semanal' | 'quincenal' | 'mensual' | ''
  overtime_rate: number
  /** Días laborales semanales: números ISO separados por coma (1=Lun … 7=Dom) */
  work_days?: string
}

/** Registro diario de asistencia de un empleado. */
export interface Asistencia {
  attendance_id: string
  employee_id: string
  employee_name: string
  fecha: string
  clock_in: string
  clock_out: string
  notas: string
}

export interface GastoFijo {
  fixed_expense_id: string
  descripcion: string
  categoria: string
  monto: number
  moneda: string
  due_day: number
  supplier_id: string
  supplier_name: string
  payment_link: string
  notas: string
  activo: string
}

export interface TasaHistorial {
  rate_id: string
  fecha: string
  base: string
  moneda: string
  tasa: number
  fuente: string
}

export interface Gasto {
  expense_id: string
  fecha: string
  categoria: string
  descripcion: string
  monto: number
  payment_method: MetodoPago
  proveedor: string
  moneda: string
  exchange_rate: number
}

export interface Proveedor {
  supplier_id: string
  nombre: string
  rfc: string
  email: string
  telefono: string
  direccion: string
  created_at: string
}

export interface CuentaPagar {
  ap_id: string
  supplier_id: string
  supplier_name: string
  document_serial: string
  categoria: string
  descripcion: string
  issue_date: string
  due_date: string
  total_amount: number
  saldo: number
  estado: EstadoFactura
  notas: string
  moneda: string
  exchange_rate: number
}

export interface Pago {
  payment_id: string
  tipo: TipoPago
  origin_id: string
  fecha: string
  monto: number
  payment_method: MetodoPago
  notas: string
  moneda: string
  exchange_rate: number
}

export interface Producto {
  product_id: string
  nombre: string
  categoria: string
  unidad: string
  stock: number
  minimum_stock: number
  /** Moneda en la que están cotizados precio_costo y precio_venta */
  moneda: string
  cost_price: number
  sale_price: number
  supplier_id: string
  supplier_name: string
  imagen: string
  notas: string
  activo: string
  created_at: string
}

export type TipoMovimiento = 'entrada' | 'salida' | 'ajuste'

export interface MovimientoStock {
  movement_id: string
  product_id: string
  tipo: TipoMovimiento
  cantidad: number
  motivo: string
  supplier_id: string
  fecha: string
}

export interface Config {
  company_name: string
  company_tax_id: string
  company_address: string
  company_phone: string
  company_email: string
  company_logo: string
  company_zip: string
  company_city: string
  company_country: string
  serial_prefix: string
  serial_counter: number
  moneda: string
  vat_percent: number
  expense_categories: string
  ap_categories: string
  inventory_categories: string
  active_currencies: string
  custom_currencies: string
  exchange_rates: string
  payment_methods: string
  tipo_doc: TipoDoc
  doc_type_label: string
  share_backend_url: string
  /** Metas de venta mensuales: JSON { "YYYY-MM": monto } */
  monthly_goals: string
  /** Comisiones por transacción: JSON { metodos: { [metodo]: % }, gastos: %, cxp: %, nomina: % } */
  transaction_fees: string
  /** Comisiones avanzadas por método de pago: JSON { [metodo]: { pct?: number, minimo_fijo?: number } } */
  method_fees: string
  /** Registro automático de la tasa del día activado */
  daily_rate_active: string
  /** Permisos otorgados a Google: JSON { scope: 'granted' | 'revoked' } */
  google_permissions: string
  /** Recordatorios de pago por notificación del navegador */
  notifications_expense_active: string
  /** Recordatorios de vencimientos de cobro (CxC) por notificación del navegador */
  notifications_ar_active: string
  /** Unidades de medida del inventario separadas por coma */
  measure_units: string
  /** Nombre base para spreadsheets de años (estable, no cambia con empresa_nombre) */
  baseSheetName: string
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
  expires_at: string
  max_uses: string
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
  registered_at: string
}
