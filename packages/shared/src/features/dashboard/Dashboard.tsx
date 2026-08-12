import React from 'react'
import { useFacturas, useGastos, useCxp, useReportes } from '../../store/queries'
import { formatMoney } from '../../currency'
import { useAppStore } from '../../store/appStore'
import { StatCard, Button } from '../../ui/components'
import type { NavKey } from '../../ui/layout/Layout'

export function Dashboard({ mes, onNavigate }: { mes: string; onNavigate: (k: NavKey) => void }) {
  const config = useAppStore(s => s.config)
  const moneda = config?.moneda ?? 'USD'
  const { data: reportes, isLoading } = useReportes(mes)
  const { facturas } = useFacturas({ mes })
  const { gastos } = useGastos({ mes })
  const { cxps } = useCxp()

  if (isLoading && !reportes) return <div className="p-8 text-gray-500">Cargando…</div>
  const k = reportes?.kpis
  const pendientes = facturas.filter(f => f.saldo > 0)
  const vencidas = cxps.filter(c => c.saldo > 0 && c.fecha_vencimiento < new Date().toISOString().slice(0, 10))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => onNavigate('facturas')}>+ Nueva factura</Button>
        <Button variant="outline" onClick={() => onNavigate('gastos')}>+ Registrar gasto</Button>
        <Button variant="outline" onClick={() => onNavigate('cuentas')}>+ Registrar pago</Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Facturado" value={k ? formatMoney(k.facturado, moneda) : '—'} />
        <StatCard label="Cobrado" value={k ? formatMoney(k.cobrado, moneda) : '—'} tone="positive" />
        <StatCard label="Pendiente de cobro" value={k ? formatMoney(k.pendiente, moneda) : '—'} tone="negative" />
        <StatCard label="Gastos" value={k ? formatMoney(k.gastos, moneda) : '—'} tone="negative" />
        <StatCard label="Utilidad" value={k ? formatMoney(k.utilidad, moneda) : '—'} tone={k && k.utilidad < 0 ? 'negative' : 'positive'} />
        <StatCard label="Por pagar" value={k ? formatMoney(k.porPagar, moneda) : '—'} tone="negative" />
        <StatCard label="CXP vencidas" value={k ? formatMoney(k.vencidas, moneda) : '—'} tone="negative" />
        <StatCard label="CXP por vencer" value={k ? formatMoney(k.porVencer, moneda) : '—'} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="font-semibold mb-3">Pendientes de cobro</div>
          {pendientes.length === 0 && <p className="text-sm text-gray-500">Sin facturas pendientes</p>}
          {pendientes.map(f => (
            <div key={f.id_factura} className="flex justify-between py-1 text-sm border-b border-gray-50">
              <span>{f.folio} · {f.nombre_cliente}</span><span>{formatMoney(f.saldo, moneda)}</span>
            </div>
          ))}
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="font-semibold mb-3">CXP vencidas</div>
          {vencidas.length === 0 && <p className="text-sm text-gray-500">Sin cuentas vencidas</p>}
          {vencidas.map(c => (
            <div key={c.id_cxp} className="flex justify-between py-1 text-sm border-b border-gray-50">
              <span>{c.nombre_proveedor} · {c.folio_documento || c.descripcion}</span><span>{formatMoney(c.saldo, moneda)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="text-sm text-gray-500">Gastos del mes: {gastos.length} registros</div>
    </div>
  )
}
