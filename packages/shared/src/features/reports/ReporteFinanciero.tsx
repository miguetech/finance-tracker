import React, { useMemo, useState } from 'react'
import { useConfig, useReporteFinanciero } from '../../store/queries'
import { useI18n } from '../../i18n'
import { Card, StatCard, Button, Badge } from '../../ui/components'
import { BarChart, HBarChart, Gauge, DonutChart } from '../../ui/charts'
import { formatMoney } from '../../currency'
import { convertirFinData } from '../../reports/financieros'
import { exportCSV, exportPDF } from '../../export/export'

type FinData = NonNullable<ReturnType<typeof useReporteFinanciero>['data']>

/** Tabs financieros: P&L, punto de equilibrio, reconversión monetaria y flujo de caja.
 *  `monedaVista` permite visualizar el reporte en una currency distinta a la base. */
export function ReporteFinanciero({ desde, hasta, data, isLoading, monedaVista }: {
  desde: string
  hasta: string
  data?: FinData
  isLoading: boolean
  monedaVista?: string
}) {
  const { t } = useI18n()
  const { config } = useConfig()
  const currency = config?.currency ?? 'USD'
  const empresa = config?.company_name ?? ''
  const [tab, setTab] = useState<'pl' | 'equilibrio' | 'reconversion' | 'flujo'>('pl')
  const vista = monedaVista || currency

  // Convierte todo el reporte a la currency de visualización en un solo punto.
  const dataVista = useMemo(
    () => (data ? convertirFinData(data, currency, vista, config) : undefined),
    [data, currency, vista, config]
  )

  const tabs = [
    { id: 'pl', label: t('reportesFin.tabPL') },
    { id: 'equilibrio', label: t('reportesFin.tabEquilibrio') },
    { id: 'reconversion', label: t('reportesFin.tabReconversion') },
    { id: 'flujo', label: t('reportesFin.tabFlujo') }
  ] as const

  if (isLoading || !dataVista) return <div className="p-8 text-gray-500">{t('common.cargando')}</div>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-1 border-b border-gray-200 flex-wrap">
          {tabs.map(x => (
            <button key={x.id} onClick={() => setTab(x.id)}
              className={`px-3 py-2 text-sm border-b-2 ${tab === x.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>
              {x.label}
            </button>
          ))}
        </div>
        <ExportButtonsFin data={dataVista} desde={desde} hasta={hasta} currency={vista} empresa={empresa} titulo={tabs.find(x => x.id === tab)?.label ?? ''} />
      </div>
      {vista !== currency && (
        <p className="text-xs text-muted-foreground">{t('reportesFin.monedaVista')} ({currency} → {vista})</p>
      )}
      {tab === 'pl' && <TabPL data={dataVista} currency={vista} />}
      {tab === 'equilibrio' && <TabEquilibrio data={dataVista} currency={vista} />}
      {tab === 'reconversion' && <TabReconversion data={dataVista} currency={vista} desde={desde} hasta={hasta} empresa={empresa} />}
      {tab === 'flujo' && <TabFlujo data={dataVista} currency={vista} desde={desde} hasta={hasta} empresa={empresa} />}
    </div>
  )
}

function ExportButtonsFin({ data, desde, hasta, currency, empresa, titulo }: { data: FinData; desde: string; hasta: string; currency: string; empresa: string; titulo: string }) {
  const { t } = useI18n()
  const name = `${titulo || 'reporte'}_${desde}_${hasta}`.replace(/\s+/g, '_')
  const subtitulo = `${desde}${hasta ? ` → ${hasta}` : ''}`

  const csvPL = () => exportCSV(name, [
    { c: t('reportesFin.ingresosTotales'), m: data.pl.ingresos_totales },
    { c: t('reportesFin.costoMercancia'), m: data.pl.costo_mercancia },
    { c: t('reportesFin.gastosFijosLbl'), m: data.pl.gastos_fijos },
    { c: t('reportesFin.gastosVariables'), m: data.pl.gastos_variables },
    { c: t('reportesFin.utilidadNeta'), m: data.pl.utilidad_neta },
    { c: t('reportesFin.margenNeto'), m: `${data.pl.margen_neto_pct}%` }
  ], [
    { key: 'c', header: 'Concepto' },
    { key: 'm', header: `Monto (${currency})` }
  ])

  const pdfAll = () => exportPDF(titulo || t('reportes.title'), {
    empresa,
    subtitulo,
    cards: [
      { label: t('reportesFin.ingresosTotales'), value: formatMoney(data.pl.ingresos_totales, currency) },
      { label: t('reportesFin.utilidadNeta'), value: formatMoney(data.pl.utilidad_neta, currency), tone: data.pl.utilidad_neta >= 0 ? 'pos' : 'neg' },
      { label: t('reportesFin.puntoEquilibrio'), value: data.equilibrio.punto_equilibrio < 0 ? '∞' : formatMoney(data.equilibrio.punto_equilibrio, currency) }
    ],
    tablas: [
      {
        titulo: t('reportesFin.tabPL'),
        columnas: ['Concepto', `Monto (${currency})`],
        numericas: [1],
        filas: [
          [t('reportesFin.ingresosTotales'), data.pl.ingresos_totales],
          [t('reportesFin.costoMercancia'), -data.pl.costo_mercancia],
          [t('reportesFin.gastosFijosLbl'), -data.pl.gastos_fijos],
          [t('reportesFin.gastosVariables'), -data.pl.gastos_variables],
          [t('reportesFin.utilidadNeta'), data.pl.utilidad_neta]
        ]
      },
      ...(data.reconversion.variaciones.length > 0 ? [{
        titulo: t('reportesFin.variacionPorRegistro'),
        columnas: [t('common.fecha'), t('reportesFin.diferencia')],
        numericas: [1],
        filas: data.reconversion.variaciones.map(v => [v.date, v.description, `${v.currency} ${v.monto_currency}`, v.exchange_rate_registro, v.exchange_rate_actual, v.valor_base_registro, v.valor_base_actual, v.diferencia] as (string | number)[]).map(f => f.slice(0, 2))
      }] : []),
      {
        titulo: t('reportesFin.porMoneda'),
        columnas: ['Moneda', t('reportesFin.entradas'), t('reportesFin.salidas'), t('reportesFin.balance')],
        numericas: [1, 2, 3],
        filas: data.flujo.porMoneda.map(m => [m.currency, m.entradas, m.salidas, m.balance])
      }
    ]
  })

  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={pdfAll}>{t('reportesFin.exportarPDF')}</Button>
      <Button size="sm" variant="outline" onClick={csvPL}>{t('reportesFin.exportarCSV')}</Button>
    </div>
  )
}

function TabPL({ data, currency }: { data: FinData; currency: string }) {
  const { t } = useI18n()
  const pl = data.pl
  if (pl.ingresos_totales === 0 && pl.gastos_fijos === 0 && pl.gastos_variables === 0)
    return <p className="p-6 text-sm text-gray-500">{t('reportesFin.sinDatosRango')}</p>
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label={t('reportesFin.ingresosTotales')} value={formatMoney(pl.ingresos_totales, currency)} tone="positive" />
        <StatCard label={t('reportesFin.costoMercancia')} value={formatMoney(pl.costo_mercancia, currency)} tone="negative" />
        <StatCard label={t('reportesFin.gastosFijosLbl')} value={formatMoney(pl.gastos_fijos, currency)} tone="negative" />
        <StatCard label={t('reportesFin.gastosVariables')} value={formatMoney(pl.gastos_variables, currency)} tone="negative" />
        <StatCard label={`${t('reportesFin.utilidadNeta')} (${pl.margen_neto_pct}%)`} value={formatMoney(pl.utilidad_neta, currency)} tone={pl.utilidad_neta >= 0 ? 'positive' : 'negative'} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title={t('reportesFin.lineasCostos')}>
          <HBarChart data={pl.lineas_costos.slice(0, 10).map(l => ({ label: l.concepto, value: l.amount }))} format={(n) => formatMoney(n, currency)} color="#ef4444" />
        </Card>
        <Card title={t('dashboard.facturado')}>
          <DonutChart data={pl.lineas_ingresos.map(l => ({ label: l.concepto, value: l.amount }))} format={(n) => formatMoney(n, currency)} />
        </Card>
      </div>
    </div>
  )
}

function TabEquilibrio({ data, currency }: { data: FinData; currency: string }) {
  const { t } = useI18n()
  const eq = data.equilibrio
  const faltante = Number.isFinite(eq.punto_equilibrio) ? Math.max(0, eq.punto_equilibrio - eq.ingresos) : Math.max(0, eq.costos_fijos - eq.ingresos)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <Card title={t('reportesFin.cobertura')}>
          <Gauge pct={eq.cobertura_pct} label={`${Math.min(999, Math.round(eq.cobertura_pct))}%`} sublabel={eq.rentable ? t('reportesFin.rentable') : t('reportesFin.noRentable', { faltante: formatMoney(faltante, currency) })} />
        </Card>
        <Card title={t('reportesFin.tabEquilibrio')}>
          <dl className="space-y-2 text-sm">
            <Row label={t('reportesFin.costosFijos')} value={formatMoney(eq.costos_fijos, currency)} />
            <Row label={t('reportesFin.costosVariables')} value={formatMoney(eq.costos_variables, currency)} />
            <Row label={t('reportesFin.ingresosTotales')} value={formatMoney(eq.ingresos, currency)} />
            <Row label={t('reportesFin.margenContribucion')} value={`${eq.margen_contribucion_pct}%`} />
            <div className="border-t pt-2"><Row strong label={t('reportesFin.puntoEquilibrio')} value={Number.isFinite(eq.punto_equilibrio) ? formatMoney(eq.punto_equilibrio, currency) : '∞'} /></div>
          </dl>
        </Card>
        <Card title={t('reportesFin.perdidasVsGanancias')}>
          <BarChart height={180}
            data={[
              { label: t('reportesFin.ingresosTotales'), value: eq.ingresos },
              { label: t('reportesFin.puntoEquilibrio'), value: Number.isFinite(eq.punto_equilibrio) ? eq.punto_equilibrio : 0 },
              { label: t('reportesFin.utilidadNeta'), value: data.pl.utilidad_neta }
            ]}
            format={(n) => formatMoney(n, currency)} color="#10b981"
          />
          <div className="mt-3">
            <Badge tone={eq.rentable ? 'green' : 'red'}>{eq.rentable ? '✓ Rentable' : '✗ Bajo el mínimo operativo'}</Badge>
          </div>
        </Card>
      </div>
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? 'font-semibold' : ''}`}>
      <dt className="text-muted-foreground">{label}</dt><dd className="tabular-nums">{value}</dd>
    </div>
  )
}

function TabReconversion({ data, currency, desde, hasta, empresa }: { data: FinData; currency: string; desde: string; hasta: string; empresa: string }) {
  const { t } = useI18n()
  const r = data.reconversion
  const cols = useMemo(() => [
    { key: 'fecha', header: t('common.fecha') },
    { key: 'descripcion', header: t('facturas.descripcion') },
    { key: 'tipo', header: 'Tipo' },
    { key: 'moneda', header: 'Mon.' },
    { key: 'monto_moneda', header: t('common.monto'), render: (row: Record<string, unknown>) => String(row.monto_currency) },
    { key: 'tc_reg', header: t('reportesFin.tipoCambioRegistro') },
    { key: 'tc_act', header: t('reportesFin.tipoCambioActual') },
    { key: 'valor_base_registro', header: t('reportesFin.valorRegistro') },
    { key: 'valor_base_actual', header: t('reportesFin.valorActual') },
    { key: 'diferencia', header: t('reportesFin.diferencia') }
  ], [t])

  const rows = r.variaciones.map(v => ({
    date: v.date,
    description: v.description,
    type: v.type,
    currency: v.currency,
    monto_currency: v.monto_currency.toLocaleString(),
    tc_reg: v.exchange_rate_registro,
    tc_act: v.exchange_rate_actual,
    valor_base_registro: v.valor_base_registro.toLocaleString(),
    valor_base_actual: v.valor_base_actual.toLocaleString(),
    diferencia: v.diferencia
  })) as unknown as Record<string, unknown>[]

  const exportCSVRecon = () => exportCSV(`reconversion_${desde}_${hasta}`, r.variaciones, [
    { key: 'fecha', header: 'Fecha' },
    { key: 'descripcion', header: 'Descripción' },
    { key: 'tipo', header: 'Tipo' },
    { key: 'moneda', header: 'Moneda' },
    { key: 'monto_moneda', header: 'Monto' },
    { key: 'exchange_rate_registro', header: 'T.C. registro' },
    { key: 'exchange_rate_actual', header: 'T.C. actual' },
    { key: 'valor_base_registro', header: 'Valor al registrar' },
    { key: 'valor_base_actual', header: 'Valor actual' },
    { key: 'diferencia', header: 'Diferencia' }
  ])

  const pdfRecon = () => exportPDF(t('reportesFin.tabReconversion'), {
    empresa,
    subtitulo: `${desde} → ${hasta}`,
    cards: [
      { label: t('reportesFin.perdidaTotal'), value: formatMoney(r.perdida_total, currency), tone: 'neg' },
      { label: t('reportesFin.gananciaTotal'), value: formatMoney(r.ganancia_total, currency), tone: 'pos' },
      { label: t('reportesFin.impactoNeto'), value: formatMoney(r.neto, currency), tone: r.neto >= 0 ? 'pos' : 'neg' }
    ],
    tablas: [{
      columnas: cols.map(c => c.header),
      numericas: [4, 7, 8, 9],
      filas: r.variaciones.map(v => [v.date, v.description, v.type, v.currency, v.monto_currency, v.exchange_rate_registro, v.exchange_rate_actual, v.valor_base_registro, v.valor_base_actual, v.diferencia] as (string | number)[])
    }]
  })

  if (r.variaciones.length === 0) return (
    <div className="space-y-4">
      <p className="p-6 text-sm text-gray-500">{t('reportesFin.sinDatosRango')}</p>
      <div className="flex justify-end"><Button size="sm" variant="outline" onClick={exportCSVRecon}>{t('reportesFin.exportarCSV')}</Button></div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label={t('reportesFin.perdidaTotal')} value={formatMoney(r.perdida_total, currency)} tone="negative" />
        <StatCard label={t('reportesFin.gananciaTotal')} value={formatMoney(r.ganancia_total, currency)} tone="positive" />
        <StatCard label={t('reportesFin.impactoNeto')} value={formatMoney(r.neto, currency)} tone={r.neto >= 0 ? 'positive' : 'negative'} />
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-card">
        <table className="min-w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>{cols.map(c => <th key={c.key} className="px-4 py-3 whitespace-nowrap">{c.header}</th>)}</tr>
          </thead>
          <tbody>
            {(rows as Record<string, unknown>[]).map((v, i) => (
              <tr key={i} className="border-t border-gray-100 hover:bg-muted/50">
                <td className="px-4 py-2 whitespace-nowrap">{String(v.date)}</td>
                <td className="px-4 py-2 max-w-56 truncate" title={String(v.description)}>{String(v.description)}</td>
                <td className="px-4 py-2"><Badge tone="gray">{String(v.type)}</Badge></td>
                <td className="px-4 py-2">{String(v.currency)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{String(v.monto_currency)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{String(v.tc_reg)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{String(v.tc_act)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{String(v.valor_base_registro)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{String(v.valor_base_actual)}</td>
                <td className={`px-4 py-2 text-right tabular-nums font-medium ${(v.diferencia as number) < 0 ? 'text-danger' : 'text-success'}`}>{(v.diferencia as number) > 0 ? '+' : ''}{String(v.diferencia)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={pdfRecon}>{t('reportesFin.exportarPDF')}</Button>
        <Button size="sm" variant="outline" onClick={exportCSVRecon}>{t('reportesFin.exportarCSV')}</Button>
      </div>
    </div>
  )
}

function TabFlujo({ data, currency, desde, hasta, empresa }: { data: FinData; currency: string; desde: string; hasta: string; empresa: string }) {
  const { t } = useI18n()
  const f = data.flujo
  const exportCSVFlujo = () => {
    const rows = [
      ...f.porMoneda.map(m => ({ seccion: 'moneda', clave: m.currency, entradas: m.entradas, salidas: m.salidas, fees: 0, balance: m.balance })),
      ...f.porMetodo.map(m => ({ seccion: 'metodo', clave: `${m.payment_method} (${m.currency})`, entradas: m.entradas, salidas: m.salidas, fees: m.fees, balance: m.entradas - m.salidas }))
    ]
    exportCSV(`flujo_caja_${desde}_${hasta}`, rows, [
      { key: 'seccion', header: 'Sección' },
      { key: 'clave', header: 'Clave' },
      { key: 'entradas', header: 'Entradas' },
      { key: 'salidas', header: 'Salidas' },
      { key: 'comisiones', header: 'Comisiones' },
      { key: 'balance', header: 'Balance' }
    ])
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard label={t('reportesFin.totalEntradas')} value={formatMoney(f.totalEntradasBase, currency)} tone="positive" />
        <StatCard label={t('reportesFin.totalSalidas')} value={formatMoney(f.totalSalidasBase, currency)} tone="negative" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title={t('reportesFin.porMoneda')} footer={<div className="flex justify-end"><Button size="sm" variant="outline" onClick={exportCSVFlujo}>{t('reportesFin.exportarCSV')}</Button></div>}>
          <table className="w-full text-sm">
            <thead><tr className="text-xs uppercase text-muted-foreground text-left"><th className="py-2">Moneda</th><th className="py-2 text-right">{t('reportesFin.entradas')}</th><th className="py-2 text-right">{t('reportesFin.salidas')}</th><th className="py-2 text-right">{t('reportesFin.balance')}</th></tr></thead>
            <tbody>
              {f.porMoneda.map(m => (
                <tr key={m.currency} className="border-t border-gray-50">
                  <td className="py-2 font-medium">{m.currency}</td>
                  <td className="py-2 text-right tabular-nums text-emerald-700">{m.entradas.toLocaleString()}</td>
                  <td className="py-2 text-right tabular-nums text-red-700">{m.salidas.toLocaleString()}</td>
                  <td className={`py-2 text-right tabular-nums font-medium ${m.balance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{m.balance.toLocaleString()}</td>
                </tr>
              ))}
              {f.porMoneda.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-gray-500">{t('reportesFin.sinDatosRango')}</td></tr>}
            </tbody>
          </table>
        </Card>
        <Card title={t('reportesFin.porMetodo')}>
          <HBarChart
            data={f.porMetodo.map(m => ({ label: `${m.payment_method} · ${m.currency}`, value: m.entradas - m.salidas }))}
            format={(n) => n.toLocaleString()} color="#6366f1" />
          {f.porMetodo.some(m => m.fees > 0) && (
            <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
              {f.porMetodo.filter(m => m.fees > 0).map((m, i) => (
                <li key={i}>Comisión {m.payment_method}: {m.fees.toLocaleString()} {m.currency}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => exportPDF(t('reportesFin.tabFlujo'), { empresa, subtitulo: `${desde} → ${hasta}`, tablas: [{ titulo: t('reportesFin.porMetodo'), columnas: ['Método', 'Moneda', t('reportesFin.entradas'), t('reportesFin.salidas'), t('reportesFin.comisionesCol')], numericas: [2, 3, 4], filas: f.porMetodo.map(m => [m.payment_method, m.currency, m.entradas, m.salidas, m.fees] as (string | number)[]) }] })}>{t('reportesFin.exportarPDF')}</Button></div>
    </div>
  )
}
