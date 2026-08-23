import React, { useMemo, useState } from 'react'
import { useConfig, useReportesInventario, useProductos } from '../../store/queries'
import { useI18n } from '../../i18n'
import { Card, StatCard, Button, Badge, Input, SearchSelect } from '../../ui/components'
import { useVentasProducto } from '../../store/queries'
import { GroupedBarChart, HBarChart, DonutChart, CHART_COLORS } from '../../ui/charts'
import { formatMoney } from '../../currency'
import { exportCSV, exportPDF } from '../../export/export'

type InvData = NonNullable<ReturnType<typeof useReportesInventario>['data']>

/** Tabs de inventario y ventas: stock bajo, entradas/salidas y comparador multiproducto. */
export function ReporteInventario({ desde, hasta, data, isLoading }: {
  desde: string
  hasta: string
  data?: InvData
  isLoading: boolean
}) {
  const { t } = useI18n()
  const [tab, setTab] = useState<'stockBajo' | 'movimientos' | 'multiproducto' | 'producto'>('multiproducto')
  const tabs = [
    { id: 'stockBajo', label: t('reportesFin.stockBajoTitulo') },
    { id: 'movimientos', label: t('reportesFin.movimientosTitulo') },
    { id: 'multiproducto', label: t('reportesFin.tabMultiproducto') },
    { id: 'producto', label: t('reportesFin.tabProducto') }
  ] as const

  if (isLoading || !data) return <div className="p-8 text-gray-500">{t('common.cargando')}</div>

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-gray-200 flex-wrap">
        {tabs.map(x => (
          <button key={x.id} onClick={() => setTab(x.id)}
            className={`px-3 py-2 text-sm border-b-2 ${tab === x.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>
            {x.label}
          </button>
        ))}
      </div>
      {tab === 'stockBajo' && <TabStockBajo data={data} hasta={hasta} />}
      {tab === 'movimientos' && <TabMovimientos data={data} />}
      {tab === 'multiproducto' && <TabMultiproducto data={data} desde={desde} hasta={hasta} />}
      {tab === 'producto' && <TabProductoIndividual data={data} desde={desde} hasta={hasta} />}
    </div>
  )
}

/** Reporte individual por producto: métricas del período e historial de ventas. */
function TabProductoIndividual({ data, desde, hasta }: { data: InvData; desde: string; hasta: string }) {
  const { t } = useI18n()
  const { config } = useConfig()
  const moneda = config?.moneda ?? 'USD'
  const { productos } = useProductos()
  const [idProducto, setIdProducto] = useState('')
  const activos = productos.filter(p => p.activo !== 'false')
  const producto = activos.find(p => p.id_producto === idProducto)
  const stats = data.statsProductos.find(s => s.id_producto === idProducto)
  const ventasQ = useVentasProducto(idProducto || null, { desde, hasta })
  const ventas = ventasQ.data ?? []
  const totalIngresos = ventas.reduce((s, v) => s + v.importe_base, 0)
  const totalUnidades = ventas.reduce((s, v) => s + v.cantidad, 0)

  return (
    <div className="space-y-4">
      <Card title={t('reportesFin.tabProducto')}>
        <SearchSelect value={idProducto} onChange={setIdProducto}
          options={activos.map(p => ({ value: p.id_producto, label: `${p.nombre}${p.categoria ? ` · ${p.categoria}` : ''}` }))}
          placeholder={t('facturas.buscarProducto')} />
      </Card>
      {!idProducto && <p className="p-6 text-sm text-gray-500">{t('reportesFin.seleccionaProducto')}</p>}
      {idProducto && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label={t('reportesFin.stockActual')} value={`${producto ? Number(producto.stock).toLocaleString() : '—'} ${producto?.unidad ?? ''}`} />
            <StatCard label={t('reportesFin.unidadesVendidas')} value={totalUnidades.toLocaleString()} />
            <StatCard label={t('reportes.facturado')} value={formatMoney(totalIngresos, moneda)} tone="positive" />
            <StatCard label={t('reportesFin.rotacion')} value={`${stats?.rotacion ?? 0}×`} />
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-card">
            <table className="min-w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">{t('common.fecha')}</th>
                  <th className="px-4 py-3">{t('facturas.folio')}</th>
                  <th className="px-4 py-3">{t('facturas.cliente')}</th>
                  <th className="px-4 py-3 text-right">{t('facturas.cant')}</th>
                  <th className="px-4 py-3 text-right">{t('facturas.precio')}</th>
                  <th className="px-4 py-3 text-right">{t('facturas.importe')} ({moneda})</th>
                </tr>
              </thead>
              <tbody>
                {ventas.map((v, i) => (
                  <tr key={i} className="border-t border-gray-100 hover:bg-muted/50">
                    <td className="px-4 py-2 whitespace-nowrap">{v.fecha}</td>
                    <td className="px-4 py-2">{v.folio}</td>
                    <td className="px-4 py-2 max-w-40 truncate" title={v.cliente}>{v.cliente}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{v.cantidad}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatMoney(v.precio_unitario, moneda)}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">{formatMoney(v.importe_base, moneda)}</td>
                  </tr>
                ))}
                {ventas.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">{t('reportesFin.sinVentasProducto')}</td></tr>}
              </tbody>
            </table>
          </div>
          {ventas.length > 0 && (
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => exportCSV(`ventas_${producto?.nombre ?? idProducto}_${desde}_${hasta}`, ventas, [
                { key: 'fecha', header: t('common.fecha') }, { key: 'folio', header: t('facturas.folio') }, { key: 'cliente', header: t('facturas.cliente') },
                { key: 'cantidad', header: t('facturas.cant') }, { key: 'precio_unitario', header: t('facturas.precio') }, { key: 'importe_base', header: `${t('facturas.importe')} (${moneda})` }
              ])}>{t('reportesFin.exportarCSV')}</Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function TabStockBajo({ data, hasta }: { data: InvData; hasta: string }) {
  const { t } = useI18n()
  const empresa = useConfig().config?.empresa_nombre ?? ''
  const lista = data.stockBajo

  const exportCSVStock = () => exportCSV(`stock_bajo_${hasta || 'hoy'}`, lista, [
    { key: 'nombre', header: 'Producto' },
    { key: 'categoria', header: 'Categoría' },
    { key: 'stock', header: 'Stock actual' },
    { key: 'stock_minimo', header: 'Stock mínimo' },
    { key: 'faltante', header: 'Faltante' },
    { key: 'unidad', header: 'Unidad' },
    { key: 'nombre_proveedor', header: 'Proveedor' }
  ])

  const pdfStock = () => exportPDF(t('reportesFin.stockBajoTitulo'), {
    empresa,
    subtitulo: t('reportesFin.stockBajoInfo'),
    tablas: [{
      columnas: ['Producto', 'Categoría', 'Stock', 'Mínimo', 'Faltante', 'Unidad', 'Proveedor'],
      numericas: [2, 3, 4],
      filas: lista.map(p => [p.nombre, p.categoria, p.stock, p.stock_minimo, p.faltante, p.unidad, p.nombre_proveedor] as (string | number)[])
    }]
  })

  if (lista.length === 0) return (
    <p className="p-6 text-sm text-emerald-700">✓ {t('cxc.nadaPorCobrar').replace('cobrar', '')}{t('inventario.stockOk')}</p>
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard label={t('dashboard.stockBajo')} value={String(lista.length)} tone="negative" />
        <StatCard label={`${t('reportesFin.faltante')} total`} value={`${lista.reduce((s, p) => s + p.faltante, 0).toLocaleString()} ${lista[0]?.unidad ?? ''}`} />
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-card">
        <table className="min-w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr><th className="px-4 py-3">{t('reportesFin.producto')}</th><th className="px-4 py-3">{t('common.categoria')}</th><th className="px-4 py-3 text-right">{t('reportesFin.stockActual')}</th><th className="px-4 py-3 text-right">{t('reportesFin.stockMinimoCol')}</th><th className="px-4 py-3 text-right">{t('reportesFin.faltante')}</th><th className="px-4 py-3">Proveedor</th><th className="px-4 py-3"></th></tr>
          </thead>
          <tbody>
            {lista.map(p => (
              <tr key={p.id_producto} className="border-t border-gray-100 hover:bg-muted/50">
                <td className="px-4 py-2 font-medium">{p.nombre}</td>
                <td className="px-4 py-2">{p.categoria}</td>
                <td className="px-4 py-2 text-right tabular-nums">{p.stock.toLocaleString()} {p.unidad}</td>
                <td className="px-4 py-2 text-right tabular-nums">{p.stock_minimo.toLocaleString()}</td>
                <td className="px-4 py-2 text-right tabular-nums font-medium text-danger">{p.faltante.toLocaleString()}</td>
                <td className="px-4 py-2">{p.nombre_proveedor || '—'}</td>
                <td className="px-4 py-2">
                  {p.nombre_proveedor && (
                    <a className="text-xs text-emerald-700 hover:underline" target="_blank" rel="noreferrer"
                      href={`https://wa.me/?text=${encodeURIComponent(`Hola ${p.nombre_proveedor}, necesito reordenar: ${p.faltante} ${p.unidad} de ${p.nombre}. Gracias.`)}`}>
                      {t('whatsapp.abrirWhatsApp')}
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={pdfStock}>{t('reportesFin.exportarPDF')}</Button>
        <Button size="sm" variant="outline" onClick={exportCSVStock}>{t('reportesFin.exportarCSV')}</Button>
      </div>
    </div>
  )
}

function TabMovimientos({ data }: { data: InvData }) {
  const { t } = useI18n()
  const meses = data.movimientosMensuales
  if (meses.length === 0) return <p className="p-6 text-sm text-gray-500">{t('reportesFin.sinDatosRango')}</p>
  return (
    <div className="space-y-4">
      <Card title={t('reportesFin.picosInventario')}>
        <GroupedBarChart
          labels={meses.map(m => m.mes.slice(5))}
          series={[
            { name: t('reportesFin.entradas'), values: meses.map(m => m.entradas) },
            { name: t('reportesFin.salidas'), values: meses.map(m => m.salidas) }
          ]}
          format={(n) => n.toLocaleString()} />
      </Card>
      <div className="flex justify-end"><Button size="sm" variant="outline"
        onClick={() => exportCSV(`movimientos_${meses[0].mes}_${meses[meses.length - 1].mes}`, meses, [
          { key: 'mes', header: 'Mes' }, { key: 'entradas', header: 'Entradas' }, { key: 'salidas', header: 'Salidas' }
        ])}>{t('reportesFin.exportarCSV')}</Button></div>
    </div>
  )
}

function TabMultiproducto({ data, desde, hasta }: { data: InvData; desde: string; hasta: string }) {
  const { t } = useI18n()
  const { config } = useConfig()
  const moneda = config?.moneda ?? 'USD'
  const empresa = config?.empresa_nombre ?? ''
  const { productos } = useProductos()
  const [q, setQ] = useState('')
  const [ids, setIds] = useState<string[]>([])

  const filtrados = useMemo(() => {
    const base = q.trim() ? productos.filter(p => p.nombre.toLowerCase().includes(q.trim().toLowerCase()) || p.categoria.toLowerCase().includes(q.trim().toLowerCase())) : productos
    return base.filter(p => p.activo !== 'false')
  }, [productos, q])

  const toggle = (id: string) => setIds(cur => cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id])
  const stats = useMemo(() => ids.length >= 2 ? data.statsProductos.filter(s => ids.includes(s.id_producto)) : [], [data.statsProductos, ids])

  const exportStats = () => exportCSV(`comparador_productos_${desde}_${hasta}`, stats, [
    { key: 'nombre', header: 'Producto' },
    { key: 'categoria', header: 'Categoría' },
    { key: 'unidades_vendidas', header: 'Unidades vendidas' },
    { key: 'ingresos', header: `Ingresos (${moneda})` },
    { key: 'margen_unitario', header: 'Margen unitario' },
    { key: 'margen_pct', header: 'Margen %' },
    { key: 'rotacion', header: 'Rotación' },
    { key: 'velocidad_salida', header: 'Velocidad (unid/día)' },
    { key: 'contribucion_pct', header: 'Contribución %' }
  ])

  return (
    <div className="space-y-4">
      <Card title={t('reportesFin.selectorProductos')}>
        <Input placeholder={t('inventario.buscarPlaceholder')} value={q} onChange={e => setQ(e.target.value)} />
        <div className="mt-2 flex items-center justify-between">
          <Badge tone={ids.length >= 2 ? 'blue' : 'yellow'}>{t('reportesFin.seleccionados', { n: ids.length })}</Badge>
          {ids.length > 0 && <button onClick={() => setIds([])} className="text-xs text-muted-foreground underline">{t('common.cancelar')}</button>}
        </div>
        <div className="mt-2 max-h-52 overflow-auto rounded-xl border border-gray-100 divide-y divide-gray-50">
          {filtrados.map((p, i) => (
            <label key={p.id_producto} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/60 cursor-pointer text-sm">
              <input type="checkbox" checked={ids.includes(p.id_producto)} onChange={() => toggle(p.id_producto)} className="h-4 w-4" style={{ accentColor: CHART_COLORS[i % CHART_COLORS.length] }} />
              <span className="flex-1 truncate">{p.nombre}</span>
              <span className="text-xs text-muted-foreground shrink-0">{p.categoria}</span>
            </label>
          ))}
          {filtrados.length === 0 && <p className="px-3 py-6 text-sm text-center text-gray-500">{t('common.sinResultados')}</p>}
        </div>
      </Card>

      {ids.length > 0 && ids.length < 2 && <p className="text-sm text-amber-600">{t('reportesFin.minimoDos')}</p>}

      {stats.length >= 2 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-card">
            <table className="min-w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">{t('reportesFin.producto')}</th>
                  <th className="px-4 py-3 text-right">{t('reportesFin.unidadesVendidas')}</th>
                  <th className="px-4 py-3 text-right">Ingresos</th>
                  <th className="px-4 py-3 text-right">{t('reportesFin.margenUnitario')}</th>
                  <th className="px-4 py-3 text-right">{t('reportesFin.margenPct')}</th>
                  <th className="px-4 py-3 text-right">{t('reportesFin.rotacion')}</th>
                  <th className="px-4 py-3 text-right">{t('reportesFin.velocidadSalida')}</th>
                  <th className="px-4 py-3 text-right">{t('reportesFin.contribucion')}</th>
                </tr>
              </thead>
              <tbody>
                {stats.map(s => (
                  <tr key={s.id_producto} className="border-t border-gray-100 hover:bg-muted/50">
                    <td className="px-4 py-2 font-medium max-w-40 truncate" title={s.nombre}>{s.nombre}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{s.unidades_vendidas.toLocaleString()} {s.unidad}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatMoney(s.ingresos, moneda)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatMoney(s.margen_unitario, moneda)}</td>
                    <td className={`px-4 py-2 text-right tabular-nums ${s.margen_pct < 10 ? 'text-danger' : s.margen_pct >= 30 ? 'text-emerald-700' : ''}`}>{s.margen_pct}%</td>
                    <td className="px-4 py-2 text-right tabular-nums">{s.rotacion}×</td>
                    <td className="px-4 py-2 text-right tabular-nums">{s.velocidad_salida}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">{s.contribucion_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card title={t('reportesFin.contribucion')}>
              <DonutChart data={stats.map(s => ({ label: s.nombre, value: s.contribucion_pct }))} format={(n) => `${n}%`} />
            </Card>
            <Card title={t('reportesFin.margenPct')}>
              <HBarChart data={stats.map(s => ({ label: s.nombre, value: s.margen_pct }))} format={(n) => `${n}%`} color="#8b5cf6" />
            </Card>
            <Card title={t('reportesFin.velocidadSalida')}>
              <HBarChart data={stats.map(s => ({ label: s.nombre, value: s.velocidad_salida }))} format={(n) => String(n)} color="#f59e0b" />
            </Card>
          </div>

          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => exportPDF(t('reportesFin.tabMultiproducto'), {
              empresa,
              subtitulo: `${desde} → ${hasta}`,
              tablas: [{
                columnas: ['Producto', 'Unidades', 'Ingresos', 'Margen %', 'Rotación', 'Contribución %'],
                numericas: [1, 3, 4, 5],
                filas: stats.map(s => [s.nombre, s.unidades_vendidas, s.ingresos, s.margen_pct, s.rotacion, s.contribucion_pct] as (string | number)[])
              }]
            })}>{t('reportesFin.exportarPDF')}</Button>
            <Button size="sm" variant="outline" onClick={exportStats}>{t('reportesFin.exportarCSV')}</Button>
          </div>
        </>
      )}
    </div>
  )
}

/** Reporte de ventas rápidas (mayor velocidad de salida en el período). */
export function VentasRapidasCard({ data }: { data?: InvData }) {
  const { t } = useI18n()
  if (!data) return null
  const rapidas = [...data.statsProductos].filter(s => s.velocidad_salida > 0).sort((a, b) => b.velocidad_salida - a.velocidad_salida).slice(0, 10)
  if (rapidas.length === 0) return null
  return (
    <Card title={t('reportesFin.ventasRapidasTitulo')}>
      <HBarChart data={rapidas.map(s => ({ label: s.nombre, value: s.velocidad_salida }))} format={(n) => `${n}/día`} color="#06b6d4" />
    </Card>
  )
}
