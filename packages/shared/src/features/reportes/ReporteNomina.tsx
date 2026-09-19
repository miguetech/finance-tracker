import React, { useMemo } from 'react'
import { useConfig, useEmpleados, useNominaDetalles, useGastos, useGastosFijos } from '../../store/queries'
import { useI18n } from '../../i18n'
import { Card, StatCard, Button, Badge } from '../../ui/components'
import { HBarChart } from '../../ui/charts'
import { formatMoney } from '../../currency'
import { exportCSV, exportPDF } from '../../export/export'
import { consolidadoNomina } from '../../reports/nomina'
import { proyeccionGastosFijos, type VencimientoGastoFijo } from '../../reports/gastosFijos'

/** Consolidado de nómina: liquidación individual con horas extra, bonos y comisiones. */
export function ReporteNomina({ mes }: { mes: string }) {
  const { t } = useI18n()
  const { config } = useConfig()
  const moneda = config?.moneda ?? 'USD'
  const empresa = config?.company_name ?? ''
  const { empleados } = useEmpleados()
  const { detalles } = useNominaDetalles()
  const { gastos } = useGastos({ mes })

  const resumen = useMemo(() => consolidadoNomina(empleados, detalles, gastos, mes), [empleados, detalles, gastos, mes])

  const filas = resumen.lineas.map(l => ({
    empleado: l.empleado.nombre,
    puesto: l.empleado.puesto,
    base_salary: l.detalle?.base_salary ?? (Number(l.empleado.salario) || 0),
    horas_extra: l.detalle?.horas_extra ?? 0,
    monto_he: l.detalle?.overtime_amount ?? 0,
    bonos: l.detalle?.bonos ?? 0,
    comisiones: l.detalle?.comisiones ?? 0,
    total: l.detalle?.total ?? (Number(l.empleado.salario) || 0),
    metodo: l.gasto ? `${l.gasto.payment_method} (${l.gasto.moneda})` : '—'
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
      { label: t('reportesFin.totalNominaMes'), value: formatMoney(resumen.totalNominaMes, moneda) },
      { label: t('reportesFin.horasExtra'), value: formatMoney(resumen.totalHorasExtra, moneda) },
      { label: t('reportesFin.bonos'), value: formatMoney(resumen.totalBonos, moneda) },
      { label: t('reportesFin.comisionesCol'), value: formatMoney(resumen.totalComisiones, moneda) }
    ],
    tablas: [{
      columnas: ['Empleado', 'Sueldo base', 'H. extra', 'Monto H.E.', 'Bonos', 'Comisiones', 'Total', 'Método / moneda'],
      numericas: [1, 3, 4, 5, 6],
      filas: filas.map(f => [f.empleado, f.base_salary, f.horas_extra, f.monto_he, f.bonos, f.comisiones, f.total, f.metodo] as (string | number)[])
    }]
  })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t('reportesFin.totalNominaMes')} value={formatMoney(resumen.totalNominaMes, moneda)} tone="negative" />
        <StatCard label={t('reportesFin.horasExtra')} value={formatMoney(resumen.totalHorasExtra, moneda)} />
        <StatCard label={t('reportesFin.bonos')} value={formatMoney(resumen.totalBonos, moneda)} />
        <StatCard label={t('reportesFin.comisionesCol')} value={formatMoney(resumen.totalComisiones, moneda)} tone="positive" />
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
                  <td className="py-2 font-medium"><div>{f.empleado}</div>{f.puesto && <div className="text-xs text-muted-foreground">{f.puesto}</div>}</td>
                  <td className="py-2 text-right tabular-nums">{formatMoney(f.base_salary, moneda)}</td>
                  <td className="py-2 text-right tabular-nums">{f.horas_extra || '—'}</td>
                  <td className="py-2 text-right tabular-nums">{f.monto_he ? formatMoney(f.monto_he, moneda) : '—'}</td>
                  <td className="py-2 text-right tabular-nums">{f.bonos ? formatMoney(f.bonos, moneda) : '—'}</td>
                  <td className="py-2 text-right tabular-nums">{f.comisiones ? formatMoney(f.comisiones, moneda) : '—'}</td>
                  <td className="py-2 text-right tabular-nums font-semibold">{formatMoney(f.total, moneda)}</td>
                  <td className="py-2 text-xs text-muted-foreground max-w-48 truncate" title={f.metodo}>{f.metodo}</td>
                </tr>
              ))}
              {filas.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-gray-500">{t('common.sinDatos')}</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      {resumen.lineas.some(l => l.detalle && Number(l.detalle.total) > 0) && (
        <Card title={t('dashboard.utilidad')}>
          <HBarChart data={filas.filter(f => f.total > 0).map(f => ({ label: f.empleado, value: f.total }))} format={(n) => formatMoney(n, moneda)} color="#ef4444" />
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
function estadoBadge(estado: VencimientoGastoFijo['estado'], t: EstadoT) {
  if (estado === 'pagado') return <Badge tone="green">{t('reportesFin.pagadoEstado')}</Badge>
  if (estado === 'vencido') return <Badge tone="red">{t('reportesFin.vencidoEstado')}</Badge>
  return <Badge tone="yellow">{t('reportesFin.porVencerEstado')}</Badge>
}

/** Proyección de gastos fijos: calendario de vencimientos con estado de pago. */
export function ReporteGastosFijos({ meses }: { meses: string[] }) {
  const { t } = useI18n()
  const { config } = useConfig()
  const moneda = config?.moneda ?? 'USD'
  const empresa = config?.company_name ?? ''
  const { gastosFijos } = useGastosFijos()
  const { gastos } = useGastos({})

  const proyeccion = useMemo(() => proyeccionGastosFijos(gastosFijos, gastos.map(g => ({ categoria: g.categoria, descripcion: g.descripcion, fecha: g.fecha, monto: Number(g.monto) })), meses), [gastosFijos, gastos, meses])

  const exportCSVProy = () => exportCSV(`proyeccion_gastos_fijos_${meses[0]}`, proyeccion, [
    { key: 'due_date', header: 'Vencimiento' },
    { key: 'descripcion', header: 'Descripción' },
    { key: 'monto', header: 'Monto', value: (r: typeof proyeccion[number]) => r.gasto_fijo.monto },
    { key: 'moneda', header: 'Moneda', value: (r: typeof proyeccion[number]) => r.gasto_fijo.moneda },
    { key: 'estado', header: 'Estado', value: (r: typeof proyeccion[number]) => r.estado }
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
                  <td className="py-2"><div className="font-medium">{v.gasto_fijo.descripcion}</div>{v.gasto_fijo.categoria && <div className="text-xs text-muted-foreground">{v.gasto_fijo.categoria}{v.gasto_fijo.supplier_name ? ` · ${v.gasto_fijo.supplier_name}` : ''}</div>}</td>
                  <td className="py-2 text-right tabular-nums">{formatMoney(Number(v.gasto_fijo.monto), v.gasto_fijo.moneda || moneda)}</td>
                  <td className={`py-2 text-right tabular-nums ${v.dias_restantes <= 0 && v.estado !== 'pagado' ? 'text-danger font-medium' : ''}`}>{v.estado === 'pagado' ? '—' : v.dias_restantes}</td>
                  <td className="py-2">{estadoBadge(v.estado, t)}</td>
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
            filas: proyeccion.map(v => [v.due_date, v.gasto_fijo.descripcion, v.gasto_fijo.monto, v.gasto_fijo.moneda, v.estado] as (string | number)[])
          }]
        })}>{t('reportesFin.exportarPDF')}</Button>
        <Button size="sm" variant="outline" onClick={exportCSVProy}>{t('reportesFin.exportarCSV')}</Button>
      </div>
    </div>
  )
}
