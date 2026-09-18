import { z } from 'zod'
import { todayLocal } from '../lib/date'

export const DEFAULT_METODOS_PAGO = 'Efectivo,Transferencia,Tarjeta'

export const MetodoPagoSchema = z.string().default('Efectivo')

export const ClienteSchema = z.object({
  customer_id: z.string().optional(),
  nombre: z.string().min(1, 'Nombre obligatorio'),
  alias: z.string().default(''),
  rfc: z.string().default(''),
  email: z.string().default(''),
  telefono: z.string().default(''),
  direccion: z.string().default(''),
  address_country: z.string().default(''),
  address_state: z.string().default(''),
  address_zip: z.string().default(''),
  created_at: z.string().default('')
})

export const FacturaItemSchema = z.object({
  descripcion: z.string().min(1, 'Descripción obligatoria'),
  cantidad: z.number().positive('Cantidad > 0'),
  unit_price: z.number().nonnegative('Precio >= 0'),
  importe: z.number().optional(),
  product_id: z.string().optional()
})

export const FacturaInputSchema = z.object({
  customer_id: z.string().min(1, 'Cliente obligatorio'),
  issue_date: z.string().default(() => todayLocal()),
  due_date: z.string().default(''),
  notas: z.string().default(''),
  moneda: z.string().default(''),
  items: z.array(FacturaItemSchema).min(1, 'Mínimo 1 concepto')
})

export const GastoSchema = z.object({
  expense_id: z.string().optional(),
  fecha: z.string().min(1),
  categoria: z.string().min(1, 'Categoría obligatoria'),
  descripcion: z.string().min(1, 'Descripción obligatoria'),
  monto: z.number().nonnegative('Monto >= 0'),
  payment_method: MetodoPagoSchema.default('Efectivo'),
  proveedor: z.string().default(''),
  moneda: z.string().default(''),
  exchange_rate: z.number().default(1)
})

export const ProveedorSchema = z.object({
  supplier_id: z.string().optional(),
  nombre: z.string().min(1, 'Nombre obligatorio'),
  rfc: z.string().default(''),
  email: z.string().default(''),
  telefono: z.string().default(''),
  direccion: z.string().default(''),
  created_at: z.string().default('')
})

export const EmpleadoSchema = z.object({
  employee_id: z.string().optional(),
  nombre: z.string().min(1, 'Nombre obligatorio'),
  rfc: z.string().default(''),
  puesto: z.string().default(''),
  salario: z.number().nonnegative('Salario >= 0').default(0),
  salary_currency: z.string().default(''),
  hire_date: z.string().default(''),
  activo: z.string().default('true'),
  clock_in: z.string().default(''),
  clock_out: z.string().default(''),
  pay_schedule: z.enum(['semanal', 'quincenal', 'mensual']).or(z.literal('')).default('mensual'),
  overtime_rate: z.number().nonnegative().default(0),
  /** Días laborales semanales: números ISO separados por coma (1=Lun … 7=Dom) */
  work_days: z.string().default('')
})

export const AsistenciaSchema = z.object({
  attendance_id: z.string().optional(),
  employee_id: z.string().min(1, 'Empleado obligatorio'),
  employee_name: z.string().default(''),
  fecha: z.string().min(1, 'Fecha obligatoria'),
  clock_in: z.string().default(''),
  clock_out: z.string().default(''),
  notas: z.string().default('')
})

export const NominaInputSchema = z.object({
  employee_id: z.string().min(1, 'Empleado obligatorio'),
  mes: z.string().regex(/^\d{4}-\d{2}$/, 'Mes con formato YYYY-MM'),
  monto: z.number().positive('Monto > 0'),
  payment_method: MetodoPagoSchema.default('Transferencia'),
  fecha: z.string().default(() => todayLocal()),
  notas: z.string().default(''),
  moneda: z.string().default('')
})

export const NominaDetalleInputSchema = NominaInputSchema.extend({
  base_salary: z.number().nonnegative().default(0),
  horas_extra: z.number().nonnegative().default(0),
  overtime_rate: z.number().nonnegative().default(0),
  bonos: z.number().nonnegative().default(0),
  comisiones: z.number().nonnegative().default(0),
  split_payments: z.array(z.object({ payment_method: z.string(), moneda: z.string(), monto: z.number().positive() })).default([])
})

export const CxpInputSchema = z.object({
  supplier_id: z.string().min(1, 'Proveedor obligatorio'),
  document_serial: z.string().default(''),
  categoria: z.string().default(''),
  descripcion: z.string().min(1, 'Descripción obligatoria'),
  issue_date: z.string().default(() => todayLocal()),
  due_date: z.string().min(1, 'Fecha vencimiento obligatoria'),
  total_amount: z.number().positive('Monto > 0'),
  notas: z.string().default(''),
  moneda: z.string().default('')
})

export const ProductoSchema = z.object({
  product_id: z.string().optional(),
  nombre: z.string().min(1, 'Nombre obligatorio'),
  categoria: z.string().default(''),
  unidad: z.string().default('pieza'),
  stock: z.number().nonnegative('Stock >= 0').default(0),
  minimum_stock: z.number().nonnegative('Stock mínimo >= 0').default(0),
  moneda: z.string().default(''),
  cost_price: z.number().nonnegative('Costo >= 0').default(0),
  sale_price: z.number().nonnegative('Precio >= 0').default(0),
  supplier_id: z.string().default(''),
  supplier_name: z.string().default(''),
  imagen: z.string().default(''),
  notas: z.string().default(''),
  activo: z.string().default('true'),
  created_at: z.string().default('')
})

export const MovimientoStockSchema = z.object({
  product_id: z.string().min(1, 'Producto obligatorio'),
  tipo: z.enum(['entrada', 'salida', 'ajuste']),
  cantidad: z.number().positive('Cantidad > 0'),
  motivo: z.string().default(''),
  supplier_id: z.string().default(''),
  fecha: z.string().default(() => todayLocal())
})

export const GastoFijoSchema = z.object({
  fixed_expense_id: z.string().optional(),
  descripcion: z.string().min(1, 'Descripción obligatoria'),
  categoria: z.string().default(''),
  monto: z.number().positive('Monto > 0'),
  moneda: z.string().default(''),
  due_day: z.number().int().min(1).max(31).default(1),
  supplier_id: z.string().default(''),
  supplier_name: z.string().default(''),
  payment_link: z.string().default(''),
  notas: z.string().default(''),
  activo: z.string().default('true')
})

export const TasaHistorialSchema = z.object({
  rate_id: z.string().optional(),
  fecha: z.string().min(1),
  base: z.string().min(1),
  moneda: z.string().min(1),
  tasa: z.number().positive('Tasa > 0'),
  fuente: z.string().default('')
})

export const PagoInputSchema = z.object({
  tipo: z.enum(['cobro', 'abono']),
  origin_id: z.string().min(1),
  fecha: z.string().min(1),
  monto: z.number().positive('Monto > 0'),
  payment_method: MetodoPagoSchema.default('Efectivo'),
  notas: z.string().default(''),
  /** Moneda en la que se efectúa el pago; por defecto la del documento origen */
  moneda: z.string().optional()
})

export const ConfigSchema = z.object({
  company_name: z.string().min(1, 'Nombre obligatorio'),
  company_tax_id: z.string().default(''),
  company_address: z.string().default(''),
  company_phone: z.string().default(''),
  company_email: z.string().default(''),
  company_logo: z.string().default(''),
  company_zip: z.string().default(''),
  company_city: z.string().default(''),
  company_country: z.string().default(''),
  serial_prefix: z.string().min(1, 'Prefijo obligatorio'),
  serial_counter: z.number().int('Contador entero').default(1),
  moneda: z.string().min(1).default('USD'),
  vat_percent: z.number().default(16),
  expense_categories: z.string().default('Renta,Internet,Papelería,Servicios'),
  ap_categories: z.string().default('Materiales,Servicios,Impuestos,Otros'),
  inventory_categories: z.string().default('Frutas,Verduras,Materiales,Limpieza'),
  active_currencies: z.string().default(''),
  custom_currencies: z.string().default(''),
  exchange_rates: z.string().default(''),
  payment_methods: z.string().default(DEFAULT_METODOS_PAGO),
  tipo_doc: z.enum(['RFC', 'NIF', 'Cedula', 'Otro']).default('RFC'),
  doc_type_label: z.string().default(''),
  share_backend_url: z.string().default(''),
  monthly_goals: z.string().default(''),
  transaction_fees: z.string().default(''),
  method_fees: z.string().default(''),
  daily_rate_active: z.string().default(''),
  google_permissions: z.string().default(''),
  notifications_expense_active: z.string().default(''),
  notifications_ar_active: z.string().default(''),
  measure_units: z.string().default('pieza,kg,gr,litro,ml,caja,saco,docena,metro'),
  baseSheetName: z.string().default('FinanceTracker')
}).passthrough()

export type MetodoPagoValue = z.infer<typeof MetodoPagoSchema>

export const UsuarioSchema = z.object({
  email: z.string().min(1, 'Email obligatorio'),
  rol: z.enum(['asistente', 'solo_lectura', 'ver_facturas', 'ver_reportes', 'ver_gastos', 'ver_empleados', 'ver_cuentas', 'personalizado']),
  modulos_ver: z.string().default(''),
  modulos_editar: z.string().default('')
})
