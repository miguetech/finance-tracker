import { z } from 'zod'
import { todayLocal } from '../lib/date'

export const DEFAULT_METODOS_PAGO = 'Efectivo,Transferencia,Tarjeta'

export const MetodoPagoSchema = z.string().default('Efectivo')

export const ClienteSchema = z.object({
  id_cliente: z.string().optional(),
  nombre: z.string().min(1, 'Nombre obligatorio'),
  alias: z.string().default(''),
  rfc: z.string().default(''),
  email: z.string().default(''),
  telefono: z.string().default(''),
  direccion: z.string().default(''),
  direccion_pais: z.string().default(''),
  direccion_estado: z.string().default(''),
  direccion_cp: z.string().default(''),
  fecha_registro: z.string().default('')
})

export const FacturaItemSchema = z.object({
  descripcion: z.string().min(1, 'Descripción obligatoria'),
  cantidad: z.number().positive('Cantidad > 0'),
  precio_unitario: z.number().nonnegative('Precio >= 0'),
  importe: z.number().optional(),
  id_producto: z.string().optional()
})

export const FacturaInputSchema = z.object({
  id_cliente: z.string().min(1, 'Cliente obligatorio'),
  fecha_emision: z.string().default(() => todayLocal()),
  fecha_vencimiento: z.string().default(''),
  notas: z.string().default(''),
  moneda: z.string().default(''),
  items: z.array(FacturaItemSchema).min(1, 'Mínimo 1 concepto')
})

export const GastoSchema = z.object({
  id_gasto: z.string().optional(),
  fecha: z.string().min(1),
  categoria: z.string().min(1, 'Categoría obligatoria'),
  descripcion: z.string().min(1, 'Descripción obligatoria'),
  monto: z.number().nonnegative('Monto >= 0'),
  metodo_pago: MetodoPagoSchema.default('Efectivo'),
  proveedor: z.string().default(''),
  moneda: z.string().default(''),
  tipo_cambio: z.number().default(1)
})

export const ProveedorSchema = z.object({
  id_proveedor: z.string().optional(),
  nombre: z.string().min(1, 'Nombre obligatorio'),
  rfc: z.string().default(''),
  email: z.string().default(''),
  telefono: z.string().default(''),
  direccion: z.string().default(''),
  fecha_registro: z.string().default('')
})

export const EmpleadoSchema = z.object({
  id_empleado: z.string().optional(),
  nombre: z.string().min(1, 'Nombre obligatorio'),
  rfc: z.string().default(''),
  puesto: z.string().default(''),
  salario: z.number().nonnegative('Salario >= 0').default(0),
  salario_moneda: z.string().default(''),
  fecha_ingreso: z.string().default(''),
  activo: z.string().default('true'),
  hora_entrada: z.string().default(''),
  hora_salida: z.string().default(''),
  esquema_pago: z.enum(['semanal', 'quincenal', 'mensual']).or(z.literal('')).default('mensual'),
  tarifa_hora_extra: z.number().nonnegative().default(0),
  /** Días laborales semanales: números ISO separados por coma (1=Lun … 7=Dom) */
  dias_laborales: z.string().default('')
})

export const AsistenciaSchema = z.object({
  id_asistencia: z.string().optional(),
  id_empleado: z.string().min(1, 'Empleado obligatorio'),
  nombre_empleado: z.string().default(''),
  fecha: z.string().min(1, 'Fecha obligatoria'),
  hora_entrada: z.string().default(''),
  hora_salida: z.string().default(''),
  notas: z.string().default('')
})

export const NominaInputSchema = z.object({
  id_empleado: z.string().min(1, 'Empleado obligatorio'),
  mes: z.string().regex(/^\d{4}-\d{2}$/, 'Mes con formato YYYY-MM'),
  monto: z.number().positive('Monto > 0'),
  metodo_pago: MetodoPagoSchema.default('Transferencia'),
  fecha: z.string().default(() => todayLocal()),
  notas: z.string().default(''),
  moneda: z.string().default('')
})

export const NominaDetalleInputSchema = NominaInputSchema.extend({
  sueldo_base: z.number().nonnegative().default(0),
  horas_extra: z.number().nonnegative().default(0),
  tarifa_hora_extra: z.number().nonnegative().default(0),
  bonos: z.number().nonnegative().default(0),
  comisiones: z.number().nonnegative().default(0),
  pagos_divididos: z.array(z.object({ metodo_pago: z.string(), moneda: z.string(), monto: z.number().positive() })).default([])
})

export const CxpInputSchema = z.object({
  id_proveedor: z.string().min(1, 'Proveedor obligatorio'),
  folio_documento: z.string().default(''),
  categoria: z.string().default(''),
  descripcion: z.string().min(1, 'Descripción obligatoria'),
  fecha_emision: z.string().default(() => todayLocal()),
  fecha_vencimiento: z.string().min(1, 'Fecha vencimiento obligatoria'),
  monto_total: z.number().positive('Monto > 0'),
  notas: z.string().default(''),
  moneda: z.string().default('')
})

export const ProductoSchema = z.object({
  id_producto: z.string().optional(),
  nombre: z.string().min(1, 'Nombre obligatorio'),
  categoria: z.string().default(''),
  unidad: z.string().default('pieza'),
  stock: z.number().nonnegative('Stock >= 0').default(0),
  stock_minimo: z.number().nonnegative('Stock mínimo >= 0').default(0),
  moneda: z.string().default(''),
  precio_costo: z.number().nonnegative('Costo >= 0').default(0),
  precio_venta: z.number().nonnegative('Precio >= 0').default(0),
  id_proveedor: z.string().default(''),
  nombre_proveedor: z.string().default(''),
  imagen: z.string().default(''),
  notas: z.string().default(''),
  activo: z.string().default('true'),
  fecha_registro: z.string().default('')
})

export const MovimientoStockSchema = z.object({
  id_producto: z.string().min(1, 'Producto obligatorio'),
  tipo: z.enum(['entrada', 'salida', 'ajuste']),
  cantidad: z.number().positive('Cantidad > 0'),
  motivo: z.string().default(''),
  id_proveedor: z.string().default(''),
  fecha: z.string().default(() => todayLocal())
})

export const GastoFijoSchema = z.object({
  id_gasto_fijo: z.string().optional(),
  descripcion: z.string().min(1, 'Descripción obligatoria'),
  categoria: z.string().default(''),
  monto: z.number().positive('Monto > 0'),
  moneda: z.string().default(''),
  dia_vencimiento: z.number().int().min(1).max(31).default(1),
  id_proveedor: z.string().default(''),
  nombre_proveedor: z.string().default(''),
  enlace_pago: z.string().default(''),
  notas: z.string().default(''),
  activo: z.string().default('true')
})

export const TasaHistorialSchema = z.object({
  id_tasa: z.string().optional(),
  fecha: z.string().min(1),
  base: z.string().min(1),
  moneda: z.string().min(1),
  tasa: z.number().positive('Tasa > 0'),
  fuente: z.string().default('')
})

export const PagoInputSchema = z.object({
  tipo: z.enum(['cobro', 'abono']),
  id_origen: z.string().min(1),
  fecha: z.string().min(1),
  monto: z.number().positive('Monto > 0'),
  metodo_pago: MetodoPagoSchema.default('Efectivo'),
  notas: z.string().default(''),
  /** Moneda en la que se efectúa el pago; por defecto la del documento origen */
  moneda: z.string().optional()
})

export const ConfigSchema = z.object({
  empresa_nombre: z.string().min(1, 'Nombre obligatorio'),
  empresa_rfc: z.string().default(''),
  empresa_direccion: z.string().default(''),
  empresa_telefono: z.string().default(''),
  empresa_email: z.string().default(''),
  empresa_logo: z.string().default(''),
  empresa_cp: z.string().default(''),
  empresa_ciudad: z.string().default(''),
  empresa_pais: z.string().default(''),
  prefijo_folio: z.string().min(1, 'Prefijo obligatorio'),
  contador_folio: z.number().int('Contador entero').default(1),
  moneda: z.string().min(1).default('USD'),
  iva_porcentaje: z.number().default(16),
  categorias_gastos: z.string().default('Renta,Internet,Papelería,Servicios'),
  categorias_cxp: z.string().default('Materiales,Servicios,Impuestos,Otros'),
  categorias_inventario: z.string().default('Frutas,Verduras,Materiales,Limpieza'),
  monedas_activas: z.string().default(''),
  monedas_custom: z.string().default(''),
  tasas_cambio: z.string().default(''),
  metodos_pago: z.string().default(DEFAULT_METODOS_PAGO),
  tipo_doc: z.enum(['RFC', 'NIF', 'Cedula', 'Otro']).default('RFC'),
  tipo_doc_etiqueta: z.string().default(''),
  share_backend_url: z.string().default(''),
  metas_mensuales: z.string().default(''),
  comisiones_transaccion: z.string().default(''),
  comisiones_metodos: z.string().default(''),
  tasa_dia_activa: z.string().default(''),
  google_permisos: z.string().default(''),
  notif_gastos_activa: z.string().default(''),
  notif_cxc_activa: z.string().default(''),
  unidades_medida: z.string().default('pieza,kg,gr,litro,ml,caja,saco,docena,metro'),
  nombreBaseHoja: z.string().default('FinanceTracker')
}).passthrough()

export type MetodoPagoValue = z.infer<typeof MetodoPagoSchema>

export const UsuarioSchema = z.object({
  email: z.string().min(1, 'Email obligatorio'),
  rol: z.enum(['asistente', 'solo_lectura', 'ver_facturas', 'ver_reportes', 'ver_gastos', 'ver_empleados', 'ver_cuentas', 'personalizado']),
  modulos_ver: z.string().default(''),
  modulos_editar: z.string().default('')
})
