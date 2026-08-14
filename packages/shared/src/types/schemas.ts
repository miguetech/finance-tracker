import { z } from 'zod'
import type { MetodoPago } from './entities'

export const MetodoPagoSchema = z.enum(['Efectivo', 'Transferencia', 'Tarjeta'])

export const ClienteSchema = z.object({
  id_cliente: z.string().optional(),
  nombre: z.string().min(1, 'Nombre obligatorio'),
  rfc: z.string().default(''),
  email: z.string().default(''),
  telefono: z.string().default(''),
  direccion: z.string().default(''),
  fecha_registro: z.string().default('')
})

export const FacturaItemSchema = z.object({
  descripcion: z.string().min(1, 'Descripción obligatoria'),
  cantidad: z.number().positive('Cantidad > 0'),
  precio_unitario: z.number().nonnegative('Precio >= 0'),
  importe: z.number().optional()
})

export const FacturaInputSchema = z.object({
  id_cliente: z.string().min(1, 'Cliente obligatorio'),
  fecha_emision: z.string().default(() => new Date().toISOString().slice(0, 10)),
  fecha_vencimiento: z.string().default(''),
  notas: z.string().default(''),
  items: z.array(FacturaItemSchema).min(1, 'Mínimo 1 concepto')
})

export const GastoSchema = z.object({
  id_gasto: z.string().optional(),
  fecha: z.string().min(1),
  categoria: z.string().min(1, 'Categoría obligatoria'),
  descripcion: z.string().min(1, 'Descripción obligatoria'),
  monto: z.number().nonnegative('Monto >= 0'),
  metodo_pago: MetodoPagoSchema.default('Efectivo'),
  proveedor: z.string().default('')
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

export const CxpInputSchema = z.object({
  id_proveedor: z.string().min(1, 'Proveedor obligatorio'),
  folio_documento: z.string().default(''),
  categoria: z.string().default(''),
  descripcion: z.string().min(1, 'Descripción obligatoria'),
  fecha_emision: z.string().default(() => new Date().toISOString().slice(0, 10)),
  fecha_vencimiento: z.string().min(1, 'Fecha vencimiento obligatoria'),
  monto_total: z.number().positive('Monto > 0'),
  notas: z.string().default('')
})

export const PagoInputSchema = z.object({
  tipo: z.enum(['cobro', 'abono']),
  id_origen: z.string().min(1),
  fecha: z.string().min(1),
  monto: z.number().positive('Monto > 0'),
  metodo_pago: MetodoPagoSchema.default('Efectivo'),
  notas: z.string().default('')
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
  tipo_doc: z.enum(['RFC', 'NIF', 'Cedula', 'Otro']).default('RFC'),
  tipo_doc_etiqueta: z.string().default('')
})

export type MetodoPagoValue = z.infer<typeof MetodoPagoSchema>
