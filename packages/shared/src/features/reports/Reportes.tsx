import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useReportes, useConfig, useReporteFinanciero, useReportesInventario, useRepo } from '../../store/queries'
import { StatCard, Card, Input } from '../../ui/components'
import { GroupedBarChart } from '../../ui/charts'
import { formatMoney, convert } from '../../currency'
import { CurrencySelect } from '../../ui/currency'
import { useI18n } from '../../i18n'
import { ReporteFinanciero } from './ReporteFinanciero'
import { ReporteInventario } from './ReporteInventario'
import { ReporteNomina, ReporteGastosFijos } from './ReporteNomina'
import { parseMetas } from '../../reports/metas'

export function Reportes({ mes, setMes }: { mes: string; setMes: (m: string) => void }) {
  const { t } = useI18n()
  const { data: reportes, isLoading } = useReportes(mes)
  const { config } = useConfig()
  const currency = config?.currency ?? 'USD'
  const [tab, setTab] = useState<'resumen' | 'financiero' | 'inventory' | 'payroll' | 'gastosFijos'>('resumen')

  // Rango por defecto: el mes seleccionado. Editable para reportes financieros.
  const desdeDef = `${mes}-01`
  const hastaDef = `${mes}-${new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate()}`
  const [desde, setDesde] = useState(desdeDef)
  const [hasta, setHasta] = useState(hastaDef)
  // Al cambiar de mes se resetea el rango.
  const [mesPrev, setMesPrev] = useState(mes)
  if (mes !== mesPrev) {
    setMesPrev(mes)
    setDesde(desdeDef)
    setHasta(hastaDef)
  }

  const fin = useReporteFinanciero(desde, hasta)
  const inv = useReportesInventario(desde, hasta)

  // Moneda de visualización de reportes (por defecto la base).
  const [vista, setVista] = useState('')
  const monedaVista = vista || currency

  const tabs = [
    { id: 'resumen', label: t('reportesFin.tabResumen') },
    { id: 'financiero', label: t('reportesFin.tabPL') },
    { id: 'inventory', label: t('reportesFin.tabInventario') },
    { id: 'payroll', label: t('reportesFin.tabNomina') },
    { id: 'gastosFijos', label: t('reportesFin.tabGastosFijos') }
  ] as const

  // Convierte el resumen a la currency de visualización en un solo punto.
  const resumenVista = useMemo(() => {
    if (!reportes || monedaVista === currency) return reportes
    const c = (n: number) => convert(n, currency, monedaVista, config)
    return {
      ...reportes,
      kpis: Object.fromEntries(Object.entries(reportes.kpis).map(([k, v]) => [k, c(Number(v))])),
      categorias: reportes.categorias.map(x => ({ ...x, total: c(x.total) })),
      top: reportes.top.map(x => ({ ...x, total: c(x.total) }))
    } as ReportesData
  }, [reportes, monedaVista, currency, config])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{t('reportes.title')}</h1>
        <div className="flex gap-2 items-center flex-wrap">
          <CurrencySelect value={monedaVista} onChange={setVista} label={t('reportesFin.monedaVista')} />
          <Input type="month" value={mes} onChange={e => setMes(e.target.value)} />
          {(tab === 'financiero' || tab === 'inventory') && (
            <>
              <Input type="date" value={desde} onChange={e => setDesde(e.target.value)} title={t('reportesFin.desde')} />
              <Input type="date" value={hasta} onChange={e => setHasta(e.target.value)} title={t('reportesFin.hasta')} />
            </>
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200 flex-wrap">
        {tabs.map(x => (
          <button key={x.id} onClick={() => setTab(x.id)}
            className={`px-3 py-2 text-sm border-b-2 ${tab === x.id ? 'border-primary text-primary font-medium' : 'border-transparent text-muted-foreground'}`}>
            {x.label}
          </button>
        ))}
      </div>

      {tab === 'resumen' && <TabResumen mes={mes} isLoading={isLoading} reports={resumenVista} currency={monedaVista} />}
      {tab === 'financiero' && <ReporteFinanciero desde={desde} hasta={hasta} data={fin.data} isLoading={fin.isLoading} monedaVista={monedaVista} />}
      {tab === 'inventory' && <ReporteInventario desde={desde} hasta={hasta} data={inv.data} isLoading={inv.isLoading} />}
      {tab === 'payroll' && <ReporteNomina mes={mes} />}
      {tab === 'gastosFijos' && <GastosFijosProyeccion mes={mes} />}
    </div>
  )
}

interface ReportesData {
  kpis: { facturado: number; cobrado: number; pending: number; expenses: number; utilidad: number; porPagar: number; vencidas: number; porVencer: number }
  categorias: { category: string; total: number }[]
  top: { name: string; total: number }[]
}

function TabResumen({ mes, isLoading, reports, currency }: { mes: string; isLoading: boolean; reports?: ReportesData; currency: string }) {
  const { t } = useI18n()
  if (isLoading || !reports) return <div className="p-8 text-gray-500">{t('common.cargando')}</div>
  const { kpis, categorias, top } = reports
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t('reportes.facturado')} value={formatMoney(kpis.facturado, currency)} />
        <StatCard label={t('reportes.cobrado')} value={formatMoney(kpis.cobrado, currency)} tone="positive" />
        <StatCard label={t('reportes.pendiente')} value={formatMoney(kpis.pending, currency)} tone="negative" />
        <StatCard label={t('reportes.gastos')} value={formatMoney(kpis.expenses, currency)} tone="negative" />
        <StatCard label={t('reportes.utilidad')} value={formatMoney(kpis.utilidad, currency)} tone={kpis.utilidad < 0 ? 'negative' : 'positive'} />
        <StatCard label={t('reportes.porPagar')} value={formatMoney(kpis.porPagar, currency)} tone="negative" />
        <StatCard label={t('states.vencidas')} value={formatMoney(kpis.vencidas, currency)} tone="negative" />
        <StatCard label={t('states.porVencer')} value={formatMoney(kpis.porVencer, currency)} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title={t('reportes.gastosPorCategoria')}>
          {categorias.length === 0 && <p className="text-sm text-gray-500">{t('common.sinDatos')}</p>}
          {categorias.map(c => (
            <div key={c.category} className="flex justify-between py-1 text-sm border-b border-gray-50">
              <span>{c.category}</span><span>{formatMoney(c.total, currency)}</span>
            </div>
          ))}
        </Card>
        <Card title={t('reportes.top5Clientes')}>
          {top.length === 0 && <p className="text-sm text-gray-500">{t('common.sinDatos')}</p>}
          {top.map((c, i) => (
            <div key={i} className="flex justify-between py-1 text-sm border-b border-gray-50">
              <span>{i + 1}. {c.name}</span><span>{formatMoney(c.total, currency)}</span>
            </div>
          ))}
        </Card>
      </div>
      <MetasChart meses={[mes]} />
    </div>
  )
}

/** Metas mensuales vs logros reales (facturación). */
export function MetasChart({ meses }: { meses: string[] }) {
  const { config } = useConfig()
  const currency = config?.currency ?? 'USD'
  const metas = parseMetas(config?.monthly_goals ?? '')
  const activos = meses.filter(m => metas[m] > 0)
  return <MetasChartInner meses={[...new Set(activos.length ? activos : meses)].sort()} currency={currency} />
}

function MetasChartInner({ meses, currency }: { meses: string[]; currency: string }) {
  const { t } = useI18n()
  const { data } = useReportesMetaLogros(meses)
  if (!data || data.every(d => d.meta === 0 && d.logro === 0)) return null
  return (
    <Card title={`${t('dashboard.metasVsLogros')} — ${data[0]?.mes}${data.length > 1 ? ` → ${data[data.length - 1].mes}` : ''}`}>
      <GroupedBarChart
        labels={data.map(d => d.mes)}
        series={[
          { name: t('reportesFin.meta'), values: data.map(d => d.meta) },
          { name: t('reportesFin.logro'), values: data.map(d => d.logro) }
        ]}
        format={(n) => formatMoney(n, currency)} />
      <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
        {data.filter(d => d.meta > 0).map(d => (
          <li key={d.mes}>{d.mes}: {d.avance_pct}% {d.diferencia >= 0 ? `✓ (+${formatMoney(d.diferencia, currency)})` : `(${formatMoney(d.diferencia, currency)})`}</li>
        ))}
      </ul>
    </Card>
  )
}

function useReportesMetaLogros(meses: string[]) {
  const repo = useRepo()
  return useQuery({ queryKey: ['metasVsLogros', meses.join(',')], queryFn: () => repo.getGoalsVsAchievements(meses), enabled: meses.length > 0 })
}

function GastosFijosProyeccion({ mes }: { mes: string }) {
  // Mes seleccionado y los 2 siguientes (año correcto al cruzar diciembre).
  const meses = useMemo(() => {
    const base = new Date(`${mes}-15T00:00:00`)
    return [0, 1, 2].map(i => {
      const d = new Date(base.getFullYear(), base.getMonth() + i, 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })
  }, [mes])
  return <ReporteGastosFijos meses={meses} />
}
