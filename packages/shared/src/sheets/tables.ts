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
    { key: 'customer_id', header: 'customer_id', type: S },
    { key: 'nombre', header: 'nombre', type: S },
    { key: 'rfc', header: 'rfc', type: S },
    { key: 'email', header: 'email', type: S },
    { key: 'telefono', header: 'telefono', type: S },
    { key: 'direccion', header: 'direccion', type: S },
    { key: 'created_at', header: 'created_at', type: D },
    { key: 'alias', header: 'alias', type: S },
    { key: 'address_country', header: 'address_country', type: S },
    { key: 'address_state', header: 'address_state', type: S },
    { key: 'address_zip', header: 'address_zip', type: S }
  ],
  Empleados: [
    { key: 'employee_id', header: 'employee_id', type: S },
    { key: 'nombre', header: 'nombre', type: S },
    { key: 'rfc', header: 'rfc', type: S },
    { key: 'puesto', header: 'puesto', type: S },
    { key: 'salario', header: 'salario', type: N },
    { key: 'salary_currency', header: 'salary_currency', type: S },
    { key: 'hire_date', header: 'hire_date', type: D },
    { key: 'activo', header: 'activo', type: S },
    { key: 'clock_in', header: 'clock_in', type: S },
    { key: 'clock_out', header: 'clock_out', type: S },
    { key: 'pay_schedule', header: 'pay_schedule', type: S },
    { key: 'overtime_rate', header: 'overtime_rate', type: N }
  ],
  Facturas: [
    { key: 'invoice_id', header: 'invoice_id', type: S },
    { key: 'folio', header: 'folio', type: S },
    { key: 'customer_id', header: 'customer_id', type: S },
    { key: 'customer_name', header: 'customer_name', type: S },
    { key: 'issue_date', header: 'issue_date', type: D },
    { key: 'due_date', header: 'due_date', type: D },
    { key: 'subtotal', header: 'subtotal', type: N },
    { key: 'iva', header: 'iva', type: N },
    { key: 'total', header: 'total', type: N },
    { key: 'saldo', header: 'saldo', type: N },
    { key: 'paid_at', header: 'paid_at', type: D },
    { key: 'notas', header: 'notas', type: S },
    { key: 'moneda', header: 'moneda', type: S },
    { key: 'exchange_rate', header: 'exchange_rate', type: N },
    { key: 'editada', header: 'editada', type: S },
    { key: 'edited_at', header: 'edited_at', type: D }
  ],
  Factura_Items: [
    { key: 'invoice_id', header: 'invoice_id', type: S },
    { key: 'linea', header: 'linea', type: N },
    { key: 'descripcion', header: 'descripcion', type: S },
    { key: 'cantidad', header: 'cantidad', type: N },
    { key: 'unit_price', header: 'unit_price', type: N },
    { key: 'importe', header: 'importe', type: N },
    { key: 'product_id', header: 'product_id', type: S }
  ],
  Gastos: [
    { key: 'expense_id', header: 'expense_id', type: S },
    { key: 'fecha', header: 'fecha', type: D },
    { key: 'categoria', header: 'categoria', type: S },
    { key: 'descripcion', header: 'descripcion', type: S },
    { key: 'monto', header: 'monto', type: N },
    { key: 'payment_method', header: 'payment_method', type: S },
    { key: 'proveedor', header: 'proveedor', type: S },
    { key: 'moneda', header: 'moneda', type: S },
    { key: 'exchange_rate', header: 'exchange_rate', type: N }
  ],
  Proveedores: [
    { key: 'supplier_id', header: 'supplier_id', type: S },
    { key: 'nombre', header: 'nombre', type: S },
    { key: 'rfc', header: 'rfc', type: S },
    { key: 'email', header: 'email', type: S },
    { key: 'telefono', header: 'telefono', type: S },
    { key: 'direccion', header: 'direccion', type: S },
    { key: 'created_at', header: 'created_at', type: D }
  ],
  Cuentas_Pagar: [
    { key: 'ap_id', header: 'ap_id', type: S },
    { key: 'supplier_id', header: 'supplier_id', type: S },
    { key: 'supplier_name', header: 'supplier_name', type: S },
    { key: 'document_serial', header: 'document_serial', type: S },
    { key: 'categoria', header: 'categoria', type: S },
    { key: 'descripcion', header: 'descripcion', type: S },
    { key: 'issue_date', header: 'issue_date', type: D },
    { key: 'due_date', header: 'due_date', type: D },
    { key: 'total_amount', header: 'total_amount', type: N },
    { key: 'saldo', header: 'saldo', type: N },
    { key: 'estado', header: 'estado', type: S },
    { key: 'notas', header: 'notas', type: S },
    { key: 'moneda', header: 'moneda', type: S },
    { key: 'exchange_rate', header: 'exchange_rate', type: N }
  ],
  Pagos: [
    { key: 'payment_id', header: 'payment_id', type: S },
    { key: 'tipo', header: 'tipo', type: S },
    { key: 'origin_id', header: 'origin_id', type: S },
    { key: 'fecha', header: 'fecha', type: D },
    { key: 'monto', header: 'monto', type: N },
    { key: 'payment_method', header: 'payment_method', type: S },
    { key: 'notas', header: 'notas', type: S },
    { key: 'moneda', header: 'moneda', type: S },
    { key: 'exchange_rate', header: 'exchange_rate', type: N }
  ],
  Usuarios: [
    { key: 'email', header: 'email', type: S },
    { key: 'rol', header: 'rol', type: S },
    { key: 'modulos_ver', header: 'modulos_ver', type: S },
    { key: 'modulos_editar', header: 'modulos_editar', type: S }
  ],
  Productos: [
    { key: 'product_id', header: 'product_id', type: S },
    { key: 'nombre', header: 'nombre', type: S },
    { key: 'categoria', header: 'categoria', type: S },
    { key: 'unidad', header: 'unidad', type: S },
    { key: 'stock', header: 'stock', type: N },
    { key: 'minimum_stock', header: 'minimum_stock', type: N },
    { key: 'cost_price', header: 'cost_price', type: N },
    { key: 'sale_price', header: 'sale_price', type: N },
    { key: 'supplier_id', header: 'supplier_id', type: S },
    { key: 'supplier_name', header: 'supplier_name', type: S },
    { key: 'imagen', header: 'imagen', type: S },
    { key: 'notas', header: 'notas', type: S },
    { key: 'activo', header: 'activo', type: S },
    { key: 'created_at', header: 'created_at', type: D },
    { key: 'moneda', header: 'moneda', type: S }
  ],
  Movimientos_Stock: [
    { key: 'movement_id', header: 'movement_id', type: S },
    { key: 'product_id', header: 'product_id', type: S },
    { key: 'tipo', header: 'tipo', type: S },
    { key: 'cantidad', header: 'cantidad', type: N },
    { key: 'motivo', header: 'motivo', type: S },
    { key: 'supplier_id', header: 'supplier_id', type: S },
    { key: 'fecha', header: 'fecha', type: D }
  ],
  Codigos_Acceso: [
    { key: 'codigo', header: 'codigo', type: S },
    { key: 'rol', header: 'rol', type: S },
    { key: 'modulos_ver', header: 'modulos_ver', type: S },
    { key: 'modulos_editar', header: 'modulos_editar', type: S },
    { key: 'expires_at', header: 'expires_at', type: S },
    { key: 'max_uses', header: 'max_uses', type: S },
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
    { key: 'registered_at', header: 'registered_at', type: S }
  ],
  Gastos_Fijos: [
    { key: 'fixed_expense_id', header: 'fixed_expense_id', type: S },
    { key: 'descripcion', header: 'descripcion', type: S },
    { key: 'categoria', header: 'categoria', type: S },
    { key: 'monto', header: 'monto', type: N },
    { key: 'moneda', header: 'moneda', type: S },
    { key: 'due_day', header: 'due_day', type: N },
    { key: 'supplier_id', header: 'supplier_id', type: S },
    { key: 'supplier_name', header: 'supplier_name', type: S },
    { key: 'payment_link', header: 'payment_link', type: S },
    { key: 'notas', header: 'notas', type: S },
    { key: 'activo', header: 'activo', type: S }
  ],
  Tasas_Historial: [
    { key: 'rate_id', header: 'rate_id', type: S },
    { key: 'fecha', header: 'fecha', type: D },
    { key: 'base', header: 'base', type: S },
    { key: 'moneda', header: 'moneda', type: S },
    { key: 'tasa', header: 'tasa', type: N },
    { key: 'fuente', header: 'fuente', type: S }
  ],
  Nomina_Detalles: [
    { key: 'id_detalle', header: 'id_detalle', type: S },
    { key: 'employee_id', header: 'employee_id', type: S },
    { key: 'mes', header: 'mes', type: S },
    { key: 'base_salary', header: 'base_salary', type: N },
    { key: 'horas_extra', header: 'horas_extra', type: N },
    { key: 'overtime_rate', header: 'overtime_rate', type: N },
    { key: 'overtime_amount', header: 'overtime_amount', type: N },
    { key: 'bonos', header: 'bonos', type: N },
    { key: 'comisiones', header: 'comisiones', type: N },
    { key: 'total', header: 'total', type: N },
    { key: 'moneda', header: 'moneda', type: S },
    { key: 'payment_method', header: 'payment_method', type: S },
    { key: 'split_payments', header: 'split_payments', type: S },
    { key: 'fecha', header: 'fecha', type: D },
    { key: 'expense_id', header: 'expense_id', type: S }
  ],
  Asistencias: [
    { key: 'attendance_id', header: 'attendance_id', type: S },
    { key: 'employee_id', header: 'employee_id', type: S },
    { key: 'employee_name', header: 'employee_name', type: S },
    { key: 'fecha', header: 'fecha', type: D },
    { key: 'clock_in', header: 'clock_in', type: S },
    { key: 'clock_out', header: 'clock_out', type: S },
    { key: 'notas', header: 'notas', type: S }
  ]
}

export function sheetName(t: TableName): string {
  return t
}

export function HEADER_ROWS(t: TableName): number {
  return t === 'Config' ? 0 : 1
}
