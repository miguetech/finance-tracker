import React from 'react'
import { useReportes, useConfig } from '../../store/queries'
import { StatCard, Card, Input } from '../../ui/components'
import { formatMoney } from '../../currency'

export function Reportes({ mes, setMes }: { mes: string; setMes: (m: string) => void }) {
  const { data: reportes, isLoading } = useReportes(mes)
  const { config } = useConfig()
  const moneda = config?.moneda ?? 'USD'
  if (isLoading || !reportes) return <div className="p-8 text-gray-500">Cargando…</div>
  const { kpis, categorias, top } = reportes
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Reportes</h1>
        <Input type="month" value={mes} onChange={e => setMes(e.target.value)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Facturado" value={formatMoney(kpis.facturado, moneda)} />
        <StatCard label="Cobrado" value={formatMoney(kpis.cobrado, moneda)} tone="positive" />
        <StatCard label="Pendiente" value={formatMoney(kpis.pendiente, moneda)} tone="negative" />
        <StatCard label="Gastos" value={formatMoney(kpis.gastos, moneda)} tone="negative" />
        <StatCard label="Utilidad" value={formatMoney(kpis.utilidad, moneda)} tone={kpis.utilidad < 0 ? 'negative' : 'positive'} />
        <StatCard label="Por pagar" value={formatMoney(kpis.porPagar, moneda)} tone="negative" />
        <StatCard label="Vencidas" value={formatMoney(kpis.vencidas, moneda)} tone="negative" />
        <StatCard label="Por vencer" value={formatMoney(kpis.porVencer, moneda)} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Gastos por categoría">
          {categorias.length === 0 && <p className="text-sm text-gray-500">Sin datos</p>}
          {categorias.map(c => (
            <div key={c.categoria} className="flex justify-between py-1 text-sm border-b border-gray-50">
              <span>{c.categoria}</span><span>{formatMoney(c.total, moneda)}</span>
            </div>
          ))}
        </Card>
        <Card title="Top 5 clientes">
          {top.length === 0 && <p className="text-sm text-gray-500">Sin datos</p>}
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
