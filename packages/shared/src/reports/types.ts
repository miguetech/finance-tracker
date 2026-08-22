/** Tipos compartidos del motor de reportes. Cálculos puros, sin dependencias de UI ni red. */


export interface RangoFecha {
  desde: string
  hasta: string
}

export interface LineaPL {
  concepto: string
  monto: number
}

export interface ResultadoPL {
  ingresos_totales: number
  costo_mercancia: number
  gastos_fijos: number
  gastos_variables: number
  utilidad_neta: number
  margen_neto_pct: number
  lineas_ingresos: LineaPL[]
  lineas_costos: LineaPL[]
}

export interface PuntoEquilibrio {
  costos_fijos: number
  costos_variables: number
  ingresos: number
  margen_contribucion_pct: number
  punto_equilibrio: number
  cobertura_pct: number
  rentable: boolean
}

export interface VariacionCambiaria {
  fecha: string
  descripcion: string
  tipo: 'factura' | 'gasto' | 'cxp' | 'pago'
  moneda: string
  monto_moneda: number
  tipo_cambio_registro: number
  tipo_cambio_actual: number
  valor_base_registro: number
  valor_base_actual: number
  diferencia: number
}

export interface ResumenReconversion {
  variaciones: VariacionCambiaria[]
  perdida_total: number
  ganancia_total: number
  neto: number
}

export interface FlujoMoneda {
  moneda: string
  entradas: number
  salidas: number
  balance: number
}

export interface FlujoMetodo {
  metodo_pago: string
  moneda: string
  entradas: number
  salidas: number
  comisiones: number
}

export interface ResultadoFlujoCaja {
  porMoneda: FlujoMoneda[]
  porMetodo: FlujoMetodo[]
  totalEntradasBase: number
  totalSalidasBase: number
}

export interface ProductoBajoStock {
  id_producto: string
  nombre: string
  categoria: string
  unidad: string
  stock: number
  stock_minimo: number
  faltante: number
  nombre_proveedor: string
}

export interface MovimientosMes {
  mes: string
  entradas: number
  salidas: number
}

export interface StatsProducto {
  id_producto: string
  nombre: string
  categoria: string
  unidad: string
  unidades_vendidas: number
  ingresos: number
  margen_unitario: number
  margen_pct: number
  rotacion: number
  contribucion_pct: number
  velocidad_salida: number
}
