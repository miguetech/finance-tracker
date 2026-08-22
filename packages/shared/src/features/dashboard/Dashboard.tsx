import React, { useState } from 'react'
import { todayLocal } from '../../lib/date'
import { useFacturas, useGastos, useCxp, useReportes, useProductos, useProveedores, useReporteFinanciero, useReportesInventario } from '../../store/queries'
import { formatMoney, formatMoneyConverted } from '../../currency'
import { useAppStore } from '../../store/appStore'
import { usePerms } from '../../store/perms'
import { useI18n } from '../../i18n'
import { StockBadge, stockLevel } from '../../ui/StockBadge'
import { StatCard, Button, Card, Badge } from '../../ui/components'
import { Gauge, GroupedBarChart } from '../../ui/charts'
import { IconCoins } from '../../ui/icons'
import { VentaRapidaModal } from '../facturas/VentaRapidaModal'
import { MetasChart } from '../reportes/Reportes'
import type { NavKey } from '../../ui/layout/Layout'

export function Dashboard({ mes, onNavigate }: { mes: string; onNavigate: (k: NavKey) => void }) {
  const { t } = useI18n()
  const config = useAppStore(s => s.config)
  const { canView, canEdit } = usePerms()
  const moneda = config?.moneda ?? 'USD'
  const [ventaRapida, setVentaRapida] = useState(false)
  const { data: reportes, isLoading } = useReportes(mes)
  const { facturas } = useFacturas()
  const { gastos } = useGastos({ mes })
  const { cxps } = useCxp()
  const { productos } = useProductos()
  const { proveedores } = useProveedores()

  // Rango del mes para gráficas globales.
  const desdeMes = `${mes}-01`
  const hastaMes = `${mes}-${new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate()}`
  const fin = useReporteFinanciero(desdeMes, hastaMes)
  const inv = useReportesInventario(desdeMes, hastaMes)

  if (isLoading && !reportes) return <div className="p-8 text-gray-500">{t('common.cargando')}</div>
  const k = reportes?.kpis
  const pendientes = facturas.filter(f => f.saldo > 0).sort((a, b) => (a.fecha_vencimiento || '9999').localeCompare(b.fecha_vencimiento || '9999'))
  const vencidas = cxps.filter(c => c.saldo > 0 && c.fecha_vencimiento < todayLocal())
  const alertas = productos
    .filter(p => stockLevel(Number(p.stock), Number(p.stock_minimo)) !== 'ok' && String(p.activo) !== 'false')
    .sort((a, b) => Number(a.stock) / Math.max(1, Number(a.stock_minimo)) - Number(b.stock) / Math.max(1, Number(b.stock_minimo)))
    .slice(0, 5)
  const provMap = new Map(proveedores.map(p => [p.id_proveedor, p]))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        {canEdit('facturas') && <Button onClick={() => onNavigate('facturas')}>+ {t('dashboard.nuevos')}</Button>}
        {canEdit('facturas') && <Button variant="success" icon={<IconCoins className="w-4 h-4" />} onClick={() => setVentaRapida(true)}>{t('facturas.ventaRapida')}</Button>}
        {canView('gastos') && <Button variant="outline" onClick={() => onNavigate('gastos')}>+ {t('gastos.nuevo')}</Button>}
        {canView('cuentas') && <Button variant="outline" onClick={() => onNavigate('cuentas')}>+ {t('facturas.registrarPago')}</Button>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label={t('dashboard.facturado')} value={k ? formatMoney(k.facturado, moneda) : '—'} />
        <StatCard label={t('dashboard.cobrado')} value={k ? formatMoney(k.cobrado, moneda) : '—'} tone="positive" />
        <StatCard label={t('dashboard.pendiente')} value={k ? formatMoney(k.pendiente, moneda) : '—'} tone="negative" />
        <StatCard label={t('dashboard.gastos')} value={k ? formatMoney(k.gastos, moneda) : '—'} tone="negative" />
        <StatCard label={t('dashboard.utilidad')} value={k ? formatMoney(k.utilidad, moneda) : '—'} tone={k && k.utilidad < 0 ? 'negative' : 'positive'} />
        <StatCard label={t('states.porVencer')} value={k ? formatMoney(k.porPagar, moneda) : '—'} tone="negative" />
        <StatCard label={t('dashboard.vencidas')} value={k ? formatMoney(k.vencidas, moneda) : '—'} tone="negative" />
        <StatCard label={t('dashboard.porVencerCxp')} value={k ? formatMoney(k.porVencer, moneda) : '—'} />
      </div>
      <GraficasGlobales fin={fin.data} inv={inv.data} moneda={moneda} />
      {canView('reportes') && <MetasChart meses={[mes, ...ultimosMeses(mes, 2)]} />}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl shadow-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold">{t('dashboard.pendientesCobro')}</div>
            {canView('cxc') && <Button variant="ghost" size="sm" onClick={() => onNavigate('cxc')}>{t('dashboard.verCxc')}</Button>}
          </div>
          {pendientes.length === 0 && <p className="text-sm text-gray-500">{t('dashboard.sinFacturasPendientes')}</p>}
          {pendientes.map(f => (
            <div key={f.id_factura} className="flex justify-between py-1 text-sm border-b border-gray-50">
              <span>{f.folio} · {f.nombre_cliente}</span><span>{formatMoneyConverted(f.saldo, f.moneda, moneda, config)}</span>
            </div>
          ))}
        </div>
        <div className="bg-white border border-gray-200 rounded-xl shadow-card p-4">
          <div className="font-semibold mb-3">{t('dashboard.cxpVencidas')}</div>
          {vencidas.length === 0 && <p className="text-sm text-gray-500">{t('dashboard.sinCuentasVencidas')}</p>}
          {vencidas.map(c => (
            <div key={c.id_cxp} className="flex justify-between py-1 text-sm border-b border-gray-50">
              <span>{c.nombre_proveedor} · {c.folio_documento || c.descripcion}</span><span>{formatMoneyConverted(c.saldo, c.moneda, moneda, config)}</span>
            </div>
          ))}
        </div>
      </div>
      {canView('inventario') && alertas.length > 0 && (
        <div className="bg-white border border-red-200 rounded-xl shadow-card p-4">
          <div className="font-semibold mb-3 flex items-center gap-2 text-red-700">{t('dashboard.stockBajo')}
            <Button variant="ghost" size="sm" onClick={() => onNavigate('inventario')}>{t('dashboard.verInventario')}</Button>
          </div>
          {alertas.map(p => {
            const prov = provMap.get(String(p.id_proveedor))
            return (
              <div key={p.id_producto} className="flex justify-between items-center py-1 text-sm border-b border-gray-50">
                <span>{p.nombre} <StockBadge stock={Number(p.stock)} minimo={Number(p.stock_minimo)} /></span>
                <span className="text-xs text-gray-500">{t('dashboard.quedan')} {p.stock} {p.unidad || 'pieza'}{prov ? ` · ${prov.nombre}` : ''}</span>
              </div>
            )
          })}
        </div>
      )}
      <div className="text-sm text-gray-500">{t('dashboard.gastosMes')}: {gastos.length} {t('dashboard.registros')}</div>
      {ventaRapida && <VentaRapidaModal open onClose={() => setVentaRapida(false)} onSaved={() => setVentaRapida(false)} />}
    </div>
  )
}

function ultimosMeses(mes: string, n: number): string[] {
  const base = new Date(`${mes}-15T00:00:00`)
  const out: string[] = []
  for (let i = 1; i <= n; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return out.reverse()
}

/** Gráficas comparativas globales: pérdidas vs ganancias y picos de inventario. */
function GraficasGlobales({ fin, inv, moneda }: {
  fin?: NonNullable<ReturnType<typeof useReporteFinanciero>['data']>
  inv?: NonNullable<ReturnType<typeof useReportesInventario>['data']>
  moneda: string
}) {
  const { t } = useI18n()
  if (!fin) return null
  const eq = fin.equilibrio
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card title={t('reportesFin.perdidasVsGanancias')}>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <Gauge pct={eq.cobertura_pct} label={`${Math.min(999, Math.round(eq.cobertura_pct))}%`} />
          <div className="space-y-1.5 text-sm flex-1 w-full">
            <div className="flex justify-between"><span className="text-muted-foreground">{t('dashboard.facturado')}</span><b>{formatMoney(fin.pl.ingresos_totales, moneda)}</b></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{t('reportesFin.costosFijos')}</span><span>{formatMoney(eq.costos_fijos, moneda)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{t('reportesFin.costosVariables')}</span><span>{formatMoney(eq.costos_variables, moneda)}</span></div>
            <div className="flex justify-between border-t pt-1.5"><span className="text-muted-foreground">{t('dashboard.utilidad')}</span><b className={fin.pl.utilidad_neta >= 0 ? 'text-success' : 'text-danger'}>{formatMoney(fin.pl.utilidad_neta, moneda)}</b></div>
            <Badge tone={eq.rentable ? 'green' : 'red'}>{eq.rentable ? `✓ ${t('states.pagado') === 'Pagado' ? 'Rentable' : 'Rentable'}` : '✗ Bajo el mínimo operativo'}</Badge>
          </div>
        </div>
      </Card>
      {inv && inv.movimientosMensuales.length > 0 && (
        <Card title={t('reportesFin.picosInventario')}>
          <GroupedBarChart
            labels={inv.movimientosMensuales.map(m => m.mes)}
            series={[
              { name: t('reportesFin.entradas'), values: inv.movimientosMensuales.map(m => m.entradas) },
              { name: t('reportesFin.salidas'), values: inv.movimientosMensuales.map(m => m.salidas) }
            ]}
            format={(n) => n.toLocaleString()} height={190} />
        </Card>
      )}
    </div>
  )
}
