import React from 'react'
import { useReportes, useConfig } from '../../store/queries'
import { StatCard, Card, Input } from '../../ui/components'
import { formatMoney } from '../../currency'
import { useI18n } from '../../i18n'

export function Reportes({ mes, setMes }: { mes: string; setMes: (m: string) => void }) {
  const { t } = useI18n()
  const { data: reportes, isLoading } = useReportes(mes)
  const { config } = useConfig()
  const moneda = config?.moneda ?? 'USD'
  if (isLoading || !reportes) return <div className="p-8 text-gray-500">{t('common.cargando')}</div>
  const { kpis, categorias, top } = reportes
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t('reportes.title')}</h1>
        <Input type="month" value={mes} onChange={e => setMes(e.target.value)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t('reportes.facturado')} value={formatMoney(kpis.facturado, moneda)} />
        <StatCard label={t('reportes.cobrado')} value={formatMoney(kpis.cobrado, moneda)} tone="positive" />
        <StatCard label={t('reportes.pendiente')} value={formatMoney(kpis.pendiente, moneda)} tone="negative" />
        <StatCard label={t('reportes.gastos')} value={formatMoney(kpis.gastos, moneda)} tone="negative" />
        <StatCard label={t('reportes.utilidad')} value={formatMoney(kpis.utilidad, moneda)} tone={kpis.utilidad < 0 ? 'negative' : 'positive'} />
        <StatCard label={t('reportes.porPagar')} value={formatMoney(kpis.porPagar, moneda)} tone="negative" />
        <StatCard label={t('states.vencidas')} value={formatMoney(kpis.vencidas, moneda)} tone="negative" />
        <StatCard label={t('states.porVencer')} value={formatMoney(kpis.porVencer, moneda)} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title={t('reportes.gastosPorCategoria')}>
          {categorias.length === 0 && <p className="text-sm text-gray-500">{t('common.sinDatos')}</p>}
          {categorias.map(c => (
            <div key={c.categoria} className="flex justify-between py-1 text-sm border-b border-gray-50">
              <span>{c.categoria}</span><span>{formatMoney(c.total, moneda)}</span>
            </div>
          ))}
        </Card>
        <Card title={t('reportes.top5Clientes')}>
          {top.length === 0 && <p className="text-sm text-gray-500">{t('common.sinDatos')}</p>}
          {top.map((c, i) => (
            <div key={i} className="flex justify-between py-1 text-sm border-b border-gray-50">
              <span>{i + 1}. {c.nombre}</span><span>{formatMoney(c.total, moneda)}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}
