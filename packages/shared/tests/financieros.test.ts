import { describe, expect, it } from 'vitest'
import { estadoResultados, reconversionMonetaria } from '../src/reports/financieros'
import { convert, rateFor } from '../src/currency/rates'
import { TABLES } from '../src/sheets/tables'
import type { Config, Factura } from '../src/types/entities'

const cfg: Config = {
  empresa_nombre: 'Test', empresa_rfc: '', empresa_direccion: '', empresa_telefono: '',
  empresa_email: '', empresa_logo: '', empresa_cp: '', empresa_ciudad: '', empresa_pais: '',
  prefijo_folio: 'F-', contador_folio: 1,
  moneda: 'USD',
  iva_porcentaje: 16,
  categorias_gastos: '', categorias_cxp: '', categorias_inventario: '',
  monedas_activas: 'USD,VES,EUR', monedas_custom: '',
  tasas_cambio: JSON.stringify({ base: 'USD', fecha: '2026-01-01', rates: { VES: 100, EUR: 0.9 } }),
  metodos_pago: '', tipo_doc: 'factura', tipo_doc_etiqueta: 'Factura',
  share_backend_url: '', metas_mensuales: '', comisiones_transaccion: '', comisiones_metodos: '',
  tasa_dia_activa: 'false', google_permisos: '', notif_gastos_activa: '', notif_cxc_activa: '', unidades_medida: ''
} as unknown as Config

const fac = (over: Partial<Factura>): Factura => ({
  id_factura: 'fac_1', folio: 'F-001', id_cliente: 'c1', nombre_cliente: 'Cliente',
  fecha_emision: '2026-01-15', fecha_vencimiento: '2026-02-15',
  subtotal: 1000, iva: 0, total: 1000, saldo: 1000, fecha_pago: '', notas: '',
  moneda: 'USD', tipo_cambio: 1, editada: '', fecha_edicion: '',
  ...over
})

describe('conversión multimoneda en P&L (Ventas y Pérdidas)', () => {
  it('1 USD = 100 VES según tasas configuradas', () => {
    expect(rateFor(cfg, 'VES', 'USD')).toBeCloseTo(0.01, 6)
    expect(convert(50000, 'VES', 'USD', cfg)).toBe(500)
  })

  it('COGS de producto cotizado en VES se convierte a USD (base)', () => {
    const facturas = [fac({})]
    const productosCosto = { p1: 50000 }
    const productosMoneda = { p1: 'VES' }
    const itemsPorFactura = { fac_1: [{ cantidad: 1, id_producto: 'p1' }] }
    const pl = estadoResultados(facturas, [], cfg, productosCosto, productosMoneda, itemsPorFactura, { desde: '2026-01-01', hasta: '2026-12-31' })
    expect(pl.costo_mercancia).toBe(500)
    expect(pl.utilidad_neta).toBe(500)
  })

  it('producto sin moneda se trata como moneda base (retrocompatible)', () => {
    const pl = estadoResultados([fac({})], [], cfg, { p1: 200 }, { p1: '' }, { fac_1: [{ cantidad: 1, id_producto: 'p1' }] }, { desde: '', hasta: '' })
    expect(pl.costo_mercancia).toBe(200)
    expect(pl.utilidad_neta).toBe(800)
  })

  it('factura en VES usa su tipo_cambio guardado para convertir a base', () => {
    const pl = estadoResultados(
      [fac({ moneda: 'VES', total: 72000, subtotal: 72000, tipo_cambio: 100 })],
      [], cfg, {}, {}, {},
      { desde: '2026-01-01', hasta: '2026-12-31' }
    )
    expect(pl.ingresos_totales).toBe(720)
  })
})

describe('reconversionMonetaria con tasas en otra base', () => {
  it('tasa actual para factura VES no cae a 1 cuando rates.base != cfg.moneda', () => {
    const cfgOtraBase = { ...cfg, tasas_cambio: JSON.stringify({ base: 'EUR', fecha: '2026-01-01', rates: { VES: 111, USD: 1.1 } }) } as Config
    const r = reconversionMonetaria(cfgOtraBase, {
      facturas: [fac({ moneda: 'VES', total: 72000, subtotal: 72000, tipo_cambio: 100 })]
    }, { desde: '2026-01-01', hasta: '2026-12-31' })
    expect(r.variaciones).toHaveLength(1)
    // 72000 VES a tasa actual: 1 EUR = 111 VES ⇒ 1 VES = 1/111 EUR; 1 USD = 1.1 EUR ⇒ 72000/111*1.1 ≈ 713.51 USD
    expect(r.variaciones[0].valor_base_actual).toBeGreaterThan(700)
  })
})

describe('migración columna moneda en Productos', () => {
  it('moneda es la ÚLTIMA columna del spec (ensureColumns solo añade al final)', async () => {
    const { TABLES } = await import('../src/sheets/tables')
    const keys = TABLES.Productos.map(c => c.key)
    expect(keys[keys.length - 1]).toBe('moneda')
    expect(keys.filter(k => k === 'moneda')).toHaveLength(1)
  })

  it('fila legacy sin moneda se lee con moneda vacía', async () => {
    const { deserializeRow } = await import('../src/sheets/rows')
    const row = ['prod_1', 'Tomate', '', 'kg', 1, 5, 1, 3, 'prov_1', '', '', 'true', '2026-08-01']
    const obj = deserializeRow(TABLES.Productos, row)
    expect(obj.moneda).toBe('')
    expect(obj.precio_costo).toBe(1)
  })
})

describe('convertirFinData (moneda de visualización de reportes)', () => {
  it('convierte P&L, equilibrio, reconversión y totales de flujo; deja filas por-moneda nativas', async () => {
    const { convertirFinData } = await import('../src/reports/financieros')
    const data = {
      pl: { ingresos_totales: 1000, costo_mercancia: 500, gastos_fijos: 100, gastos_variables: 50, utilidad_neta: 350, margen_neto_pct: 35, lineas_ingresos: [{ concepto: 'USD', monto: 1000 }], lineas_costos: [{ concepto: 'Renta', monto: 100 }] },
      equilibrio: { costos_fijos: 100, costos_variables: 550, ingresos: 1000, margen_contribucion_pct: 45, punto_equilibrio: 222.22, cobertura_pct: 450, rentable: true },
      reconversion: { variaciones: [{ fecha: '2026-01-01', descripcion: 'x', tipo: 'factura' as const, moneda: 'VES', monto_moneda: 72000, tipo_cambio_registro: 72, tipo_cambio_actual: 100, valor_base_registro: 1000, valor_base_actual: 720, diferencia: -280 }], perdida_total: -280, ganancia_total: 0, neto: -280 },
      flujo: { porMoneda: [{ moneda: 'VES', entradas: 72000, salidas: 0, balance: 72000 }], porMetodo: [{ metodo_pago: 'Efectivo', moneda: 'VES', entradas: 72000, salidas: 0, comisiones: 0 }], totalEntradasBase: 1000, totalSalidasBase: 200 }
    }
    const out = convertirFinData(data, 'USD', 'VES', cfg)
    expect(out.pl.ingresos_totales).toBe(100000)
    expect(out.pl.utilidad_neta).toBe(35000)
    expect(out.equilibrio.punto_equilibrio).toBe(22222)
    expect(out.reconversion.variaciones[0].valor_base_registro).toBe(100000)
    // Filas nativas sin conversión
    expect(out.flujo.porMoneda[0].entradas).toBe(72000)
    expect(out.flujo.totalEntradasBase).toBe(100000)
    // Misma moneda ⇒ identidad
    expect(convertirFinData(data, 'USD', 'USD', cfg)).toBe(data)
  })
})
