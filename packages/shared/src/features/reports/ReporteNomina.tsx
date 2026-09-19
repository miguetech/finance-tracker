import React, { useMemo } from 'react'
import { useConfig, useEmpleados, useNominaDetalles, useGastos, useGastosFijos } from '../../store/queries'
import { useI18n } from '../../i18n'
import { Card, StatCard, Button, Badge } from '../../ui/components'
import { HBarChart } from '../../ui/charts'
import { formatMoney } from '../../currency'
import { exportCSV, exportPDF } from '../../export/export'
import { consolidadoNomina } from '../../reports/payroll'
import { proyeccionGastosFijos, type VencimientoGastoFijo } from '../../reports/gastosFijos'

/** Consolidado de nómina: liquidación individual con horas extra, bonos y comisiones. */
export function ReporteNomina({ mes }: { mes: string }) {
  const { t } = useI18n()
  const { config } = useConfig()
  const currency = config?.currency ?? 'USD'
  const empresa = config?.company_name ?? ''
  const { employees } = useEmpleados()
  const { detalles } = useNominaDetalles()
  const { expenses } = useGastos({ mes })

  const resumen = useMemo(() => consolidadoNomina(employees, detalles, expenses, mes), [employees, detalles, expenses, mes])

  const filas = resumen.lineas.map(l => ({
    empleado: l.empleado.name,
    position: l.empleado.position,
    base_salary: l.detail?.base_salary ?? (Number(l.empleado.salary) || 0),
    horas_extra: l.detail?.horas_extra ?? 0,
    monto_he: l.detail?.overtime_amount ?? 0,
    bonos: l.detail?.bonos ?? 0,
    fees: l.detail?.fees ?? 0,
    total: l.detail?.total ?? (Number(l.empleado.salary) || 0),
    metodo: l.gasto ? `${l.gasto.payment_method} (${l.gasto.currency})` : '—'
  }))

  const exportCSVNom = () => exportCSV(`nomina_${mes}`, filas, [
    { key: 'empleado', header: 'Empleado' },
    { key: 'puesto', header: 'Puesto' },
    { key: 'base_salary', header: 'Sueldo base' },
    { key: 'horas_extra', header: 'Horas extra' },
    { key: 'monto_he', header: 'Monto horas extra' },
    { key: 'bonos', header: 'Bonos' },
    { key: 'comisiones', header: 'Comisiones' },
    { key: 'total', header: 'Total liquidación' },
    { key: 'metodo', header: 'Método / moneda' }
  ])

  const pdfNom = () => exportPDF(`${t('reportesFin.tabNomina')} ${mes}`, {
    empresa,
    cards: [
      { label: t('reportesFin.totalNominaMes'), value: formatMoney(resumen.totalNominaMes, currency) },
      { label: t('reportesFin.horasExtra'), value: formatMoney(resumen.totalHorasExtra, currency) },
      { label: t('reportesFin.bonos'), value: formatMoney(resumen.totalBonos, currency) },
      { label: t('reportesFin.comisionesCol'), value: formatMoney(resumen.totalComisiones, currency) }
    ],
    tablas: [{
      columnas: ['Empleado', 'Sueldo base', 'H. extra', 'Monto H.E.', 'Bonos', 'Comisiones', 'Total', 'Método / moneda'],
      numericas: [1, 3, 4, 5, 6],
      filas: filas.map(f => [f.empleado, f.base_salary, f.horas_extra, f.monto_he, f.bonos, f.fees, f.total, f.metodo] as (string | number)[])
    }]
  })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t('reportesFin.totalNominaMes')} value={formatMoney(resumen.totalNominaMes, currency)} tone="negative" />
        <StatCard label={t('reportesFin.horasExtra')} value={formatMoney(resumen.totalHorasExtra, currency)} />
        <StatCard label={t('reportesFin.bonos')} value={formatMoney(resumen.totalBonos, currency)} />
        <StatCard label={t('reportesFin.comisionesCol')} value={formatMoney(resumen.totalComisiones, currency)} tone="positive" />
      </div>
      <Card title={`${t('reportesFin.tabNomina')} — ${mes}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-xs uppercase text-muted-foreground text-left">
              <th className="py-2 pr-4">{t('reportesFin.empleadoCol')}</th>
              <th className="py-2 pr-4 text-right">{t('reportesFin.sueldoBase')}</th>
              <th className="py-2 pr-4 text-right">{t('nominaAv.horasExtraTrab')}</th>
              <th className="py-2 pr-4 text-right">{t('nominaAv.montoHorasExtra')}</th>
              <th className="py-2 pr-4 text-right">{t('reportesFin.bonos')}</th>
              <th className="py-2 pr-4 text-right">{t('reportesFin.comisionesCol')}</th>
              <th className="py-2 pr-4 text-right">{t('reportesFin.totalLiquidacion')}</th>
              <th className="py-2">{t('reportesFin.metodoPagoCol')}</th>
            </tr></thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={i} className="border-t border-gray-50">
                  <td className="py-2 font-medium"><div>{f.empleado}</div>{f.position && <div className="text-xs text-muted-foreground">{f.position}</div>}</td>
                  <td className="py-2 text-right tabular-nums">{formatMoney(f.base_salary, currency)}</td>
                  <td className="py-2 text-right tabular-nums">{f.horas_extra || '—'}</td>
                  <td className="py-2 text-right tabular-nums">{f.monto_he ? formatMoney(f.monto_he, currency) : '—'}</td>
                  <td className="py-2 text-right tabular-nums">{f.bonos ? formatMoney(f.bonos, currency) : '—'}</td>
                  <td className="py-2 text-right tabular-nums">{f.fees ? formatMoney(f.fees, currency) : '—'}</td>
                  <td className="py-2 text-right tabular-nums font-semibold">{formatMoney(f.total, currency)}</td>
                  <td className="py-2 text-xs text-muted-foreground max-w-48 truncate" title={f.metodo}>{f.metodo}</td>
                </tr>
              ))}
              {filas.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-gray-500">{t('common.sinDatos')}</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      {resumen.lineas.some(l => l.detail && Number(l.detail.total) > 0) && (
        <Card title={t('dashboard.utilidad')}>
          <HBarChart data={filas.filter(f => f.total > 0).map(f => ({ label: f.empleado, value: f.total }))} format={(n) => formatMoney(n, currency)} color="#ef4444" />
        </Card>
      )}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={pdfNom}>{t('reportesFin.exportarPDF')}</Button>
        <Button size="sm" variant="outline" onClick={exportCSVNom}>{t('reportesFin.exportarCSV')}</Button>
      </div>
    </div>
  )
}

type EstadoT = (k: 'reportesFin.pagadoEstado' | 'reportesFin.vencidoEstado' | 'reportesFin.porVencerEstado') => string
function estadoBadge(status: VencimientoGastoFijo['status'], t: EstadoT) {
  if (status === 'pagado') return <Badge tone="green">{t('reportesFin.pagadoEstado')}</Badge>
  if (status === 'vencido') return <Badge tone="red">{t('reportesFin.vencidoEstado')}</Badge>
  return <Badge tone="yellow">{t('reportesFin.porVencerEstado')}</Badge>
}

/** Proyección de expenses fijos: calendario de vencimientos con estado de pago. */
export function ReporteGastosFijos({ meses }: { meses: string[] }) {
  const { t } = useI18n()
  const { config } = useConfig()
  const currency = config?.currency ?? 'USD'
  const empresa = config?.company_name ?? ''
  const { gastosFijos } = useGastosFijos()
  const { expenses } = useGastos({})

  const proyeccion = useMemo(() => proyeccionGastosFijos(gastosFijos, expenses.map(g => ({ category: g.category, description: g.description, date: g.date, amount: Number(g.amount) })), meses), [gastosFijos, expenses, meses])

  const exportCSVProy = () => exportCSV(`proyeccion_gastos_fijos_${meses[0]}`, proyeccion, [
    { key: 'due_date', header: 'Vencimiento' },
    { key: 'descripcion', header: 'Descripción' },
    { key: 'monto', header: 'Monto', value: (r: typeof proyeccion[number]) => r.gasto_fijo.amount },
    { key: 'moneda', header: 'Moneda', value: (r: typeof proyeccion[number]) => r.gasto_fijo.currency },
    { key: 'estado', header: 'Estado', value: (r: typeof proyeccion[number]) => r.status }
  ])

  if (gastosFijos.length === 0) return (
    <p className="p-6 text-sm text-gray-500">{t('gastosFijos.sinGastosFijos')}</p>
  )

  return (
    <div className="space-y-4">
      <Card title={t('reportesFin.proyeccionTitulo')}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-xs uppercase text-muted-foreground text-left">
              <th className="py-2 pr-4">{t('reportesFin.vencimiento')}</th>
              <th className="py-2 pr-4">{t('gastosFijos.descripcion')}</th>
              <th className="py-2 pr-4 text-right">{t('common.monto')}</th>
              <th className="py-2 pr-4 text-right">{t('reportesFin.diasRestantes')}</th>
              <th className="py-2 pr-4">{t('reportesFin.estadoPago')}</th>
              <th className="py-2"></th>
            </tr></thead>
            <tbody>
              {proyeccion.map((v, i) => (
                <tr key={`${v.gasto_fijo.fixed_expense_id}-${i}`} className="border-t border-gray-50">
                  <td className="py-2 whitespace-nowrap">{v.due_date}</td>
                  <td className="py-2"><div className="font-medium">{v.gasto_fijo.description}</div>{v.gasto_fijo.category && <div className="text-xs text-muted-foreground">{v.gasto_fijo.category}{v.gasto_fijo.supplier_name ? ` · ${v.gasto_fijo.supplier_name}` : ''}</div>}</td>
                  <td className="py-2 text-right tabular-nums">{formatMoney(Number(v.gasto_fijo.amount), v.gasto_fijo.currency || currency)}</td>
                  <td className={`py-2 text-right tabular-nums ${v.dias_restantes <= 0 && v.status !== 'pagado' ? 'text-danger font-medium' : ''}`}>{v.status === 'pagado' ? '—' : v.dias_restantes}</td>
                  <td className="py-2">{estadoBadge(v.status, t)}</td>
                  <td className="py-2">
                    {v.gasto_fijo.payment_link && (
                      <a href={v.gasto_fijo.payment_link} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">{t('reportesFin.enlacePago')}</a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => exportPDF(t('reportesFin.proyeccionTitulo'), {
          empresa,
          subtitulo: meses.join(', '),
          tablas: [{
            columnas: ['Vencimiento', 'Descripción', 'Monto', 'Moneda', 'Estado'],
            numericas: [],
            filas: proyeccion.map(v => [v.due_date, v.gasto_fijo.description, v.gasto_fijo.amount, v.gasto_fijo.currency, v.status] as (string | number)[])
          }]
        })}>{t('reportesFin.exportarPDF')}</Button>
        <Button size="sm" variant="outline" onClick={exportCSVProy}>{t('reportesFin.exportarCSV')}</Button>
      </div>
    </div>
  )
}
