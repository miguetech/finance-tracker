export type TableName = 'Config' | 'Clientes' | 'Empleados' | 'Facturas' | 'Factura_Items' | 'Gastos' | 'Proveedores' | 'Cuentas_Pagar' | 'Pagos' | 'Usuarios' | 'Productos' | 'Movimientos_Stock' | 'Codigos_Acceso' | 'Dispositivos' | 'Gastos_Fijos' | 'Tasas_Historial' | 'Nomina_Detalles' | 'Asistencias'

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
    { key: 'fecha_registro', header: 'fecha_registro', type: D },
    { key: 'alias', header: 'alias', type: S },
    { key: 'direccion_pais', header: 'direccion_pais', type: S },
    { key: 'direccion_estado', header: 'direccion_estado', type: S },
    { key: 'direccion_cp', header: 'direccion_cp', type: S }
  ],
  Empleados: [
    { key: 'id_empleado', header: 'id_empleado', type: S },
    { key: 'nombre', header: 'nombre', type: S },
    { key: 'rfc', header: 'rfc', type: S },
    { key: 'puesto', header: 'puesto', type: S },
    { key: 'salario', header: 'salario', type: N },
    { key: 'salario_moneda', header: 'salario_moneda', type: S },
    { key: 'fecha_ingreso', header: 'fecha_ingreso', type: D },
    { key: 'activo', header: 'activo', type: S },
    { key: 'hora_entrada', header: 'hora_entrada', type: S },
    { key: 'hora_salida', header: 'hora_salida', type: S },
    { key: 'esquema_pago', header: 'esquema_pago', type: S },
    { key: 'tarifa_hora_extra', header: 'tarifa_hora_extra', type: N }
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
    { key: 'notas', header: 'notas', type: S },
    { key: 'moneda', header: 'moneda', type: S },
    { key: 'tipo_cambio', header: 'tipo_cambio', type: N },
    { key: 'editada', header: 'editada', type: S },
    { key: 'fecha_edicion', header: 'fecha_edicion', type: D }
  ],
  Factura_Items: [
    { key: 'id_factura', header: 'id_factura', type: S },
    { key: 'linea', header: 'linea', type: N },
    { key: 'descripcion', header: 'descripcion', type: S },
    { key: 'cantidad', header: 'cantidad', type: N },
    { key: 'precio_unitario', header: 'precio_unitario', type: N },
    { key: 'importe', header: 'importe', type: N },
    { key: 'id_producto', header: 'id_producto', type: S }
  ],
  Gastos: [
    { key: 'id_gasto', header: 'id_gasto', type: S },
    { key: 'fecha', header: 'fecha', type: D },
    { key: 'categoria', header: 'categoria', type: S },
    { key: 'descripcion', header: 'descripcion', type: S },
    { key: 'monto', header: 'monto', type: N },
    { key: 'metodo_pago', header: 'metodo_pago', type: S },
    { key: 'proveedor', header: 'proveedor', type: S },
    { key: 'moneda', header: 'moneda', type: S },
    { key: 'tipo_cambio', header: 'tipo_cambio', type: N }
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
    { key: 'notas', header: 'notas', type: S },
    { key: 'moneda', header: 'moneda', type: S },
    { key: 'tipo_cambio', header: 'tipo_cambio', type: N }
  ],
  Pagos: [
    { key: 'id_pago', header: 'id_pago', type: S },
    { key: 'tipo', header: 'tipo', type: S },
    { key: 'id_origen', header: 'id_origen', type: S },
    { key: 'fecha', header: 'fecha', type: D },
    { key: 'monto', header: 'monto', type: N },
    { key: 'metodo_pago', header: 'metodo_pago', type: S },
    { key: 'notas', header: 'notas', type: S },
    { key: 'moneda', header: 'moneda', type: S },
    { key: 'tipo_cambio', header: 'tipo_cambio', type: N }
  ],
  Usuarios: [
    { key: 'email', header: 'email', type: S },
    { key: 'rol', header: 'rol', type: S },
    { key: 'modulos_ver', header: 'modulos_ver', type: S },
    { key: 'modulos_editar', header: 'modulos_editar', type: S }
  ],
  Productos: [
    { key: 'id_producto', header: 'id_producto', type: S },
    { key: 'nombre', header: 'nombre', type: S },
    { key: 'categoria', header: 'categoria', type: S },
    { key: 'unidad', header: 'unidad', type: S },
    { key: 'stock', header: 'stock', type: N },
    { key: 'stock_minimo', header: 'stock_minimo', type: N },
    { key: 'precio_costo', header: 'precio_costo', type: N },
    { key: 'precio_venta', header: 'precio_venta', type: N },
    { key: 'id_proveedor', header: 'id_proveedor', type: S },
    { key: 'nombre_proveedor', header: 'nombre_proveedor', type: S },
    { key: 'imagen', header: 'imagen', type: S },
    { key: 'notas', header: 'notas', type: S },
    { key: 'activo', header: 'activo', type: S },
    { key: 'fecha_registro', header: 'fecha_registro', type: D },
    { key: 'moneda', header: 'moneda', type: S }
  ],
  Movimientos_Stock: [
    { key: 'id_movimiento', header: 'id_movimiento', type: S },
    { key: 'id_producto', header: 'id_producto', type: S },
    { key: 'tipo', header: 'tipo', type: S },
    { key: 'cantidad', header: 'cantidad', type: N },
    { key: 'motivo', header: 'motivo', type: S },
    { key: 'id_proveedor', header: 'id_proveedor', type: S },
    { key: 'fecha', header: 'fecha', type: D }
  ],
  Codigos_Acceso: [
    { key: 'codigo', header: 'codigo', type: S },
    { key: 'rol', header: 'rol', type: S },
    { key: 'modulos_ver', header: 'modulos_ver', type: S },
    { key: 'modulos_editar', header: 'modulos_editar', type: S },
    { key: 'expira_en', header: 'expira_en', type: S },
    { key: 'usos_max', header: 'usos_max', type: S },
    { key: 'usos', header: 'usos', type: S },
    { key: 'responsable', header: 'responsable', type: S },
    { key: 'email', header: 'email', type: S },
    { key: 'creado', header: 'creado', type: S },
    { key: 'activo', header: 'activo', type: S }
  ],
  Dispositivos: [
    { key: 'codigo', header: 'codigo', type: S },
    { key: 'dispositivo', header: 'dispositivo', type: S },
    { key: 'ip_info', header: 'ip_info', type: S },
    { key: 'registrado_en', header: 'registrado_en', type: S }
  ],
  Gastos_Fijos: [
    { key: 'id_gasto_fijo', header: 'id_gasto_fijo', type: S },
    { key: 'descripcion', header: 'descripcion', type: S },
    { key: 'categoria', header: 'categoria', type: S },
    { key: 'monto', header: 'monto', type: N },
    { key: 'moneda', header: 'moneda', type: S },
    { key: 'dia_vencimiento', header: 'dia_vencimiento', type: N },
    { key: 'id_proveedor', header: 'id_proveedor', type: S },
    { key: 'nombre_proveedor', header: 'nombre_proveedor', type: S },
    { key: 'enlace_pago', header: 'enlace_pago', type: S },
    { key: 'notas', header: 'notas', type: S },
    { key: 'activo', header: 'activo', type: S }
  ],
  Tasas_Historial: [
    { key: 'id_tasa', header: 'id_tasa', type: S },
    { key: 'fecha', header: 'fecha', type: D },
    { key: 'base', header: 'base', type: S },
    { key: 'moneda', header: 'moneda', type: S },
    { key: 'tasa', header: 'tasa', type: N },
    { key: 'fuente', header: 'fuente', type: S }
  ],
  Nomina_Detalles: [
    { key: 'id_detalle', header: 'id_detalle', type: S },
    { key: 'id_empleado', header: 'id_empleado', type: S },
    { key: 'mes', header: 'mes', type: S },
    { key: 'sueldo_base', header: 'sueldo_base', type: N },
    { key: 'horas_extra', header: 'horas_extra', type: N },
    { key: 'tarifa_hora_extra', header: 'tarifa_hora_extra', type: N },
    { key: 'monto_horas_extra', header: 'monto_horas_extra', type: N },
    { key: 'bonos', header: 'bonos', type: N },
    { key: 'comisiones', header: 'comisiones', type: N },
    { key: 'total', header: 'total', type: N },
    { key: 'moneda', header: 'moneda', type: S },
    { key: 'metodo_pago', header: 'metodo_pago', type: S },
    { key: 'pagos_divididos', header: 'pagos_divididos', type: S },
    { key: 'fecha', header: 'fecha', type: D },
    { key: 'id_gasto', header: 'id_gasto', type: S }
  ],
  Asistencias: [
    { key: 'id_asistencia', header: 'id_asistencia', type: S },
    { key: 'id_empleado', header: 'id_empleado', type: S },
    { key: 'nombre_empleado', header: 'nombre_empleado', type: S },
    { key: 'fecha', header: 'fecha', type: D },
    { key: 'hora_entrada', header: 'hora_entrada', type: S },
    { key: 'hora_salida', header: 'hora_salida', type: S },
    { key: 'notas', header: 'notas', type: S }
  ]
}

export function sheetName(t: TableName): string {
  return t
}

export function HEADER_ROWS(t: TableName): number {
  return t === 'Config' ? 0 : 1
}
