import React, { useEffect, useMemo, useState } from 'react'
import { todayLocal } from '../../lib/date'
import { Dialog, Button, Input, Select, Badge } from '../../ui/components'
import { CurrencySelect } from '../../ui/currency'
import { useMetodosPago } from '../../store/queries'
import { useI18n } from '../../i18n'
import { formatMoney, getCurrency } from '../../currency'
import { tarifaHoraExtra } from '../../reports/payroll'
import type { Empleado, MetodoPago } from '../../types/entities'

export interface NominaAvanzadaForm {
  mes: string
  amount: number
  payment_method: MetodoPago
  date: string
  notes: string
  currency: string
  base_salary: number
  horas_extra: number
  overtime_rate: number
  bonos: number
  fees: number
  split_payments: { payment_method: string; currency: string; amount: number }[]
}

interface PagoDiv { payment_method: string; currency: string; amount: string }

export function NominaModal({ empleado, onClose, onSave }: { empleado: Empleado; onClose: () => void; onSave: (i: NominaAvanzadaForm) => void }) {
  const { t } = useI18n()
  const hoy = todayLocal()
  const metodos = useMetodosPago()
  const [form, setForm] = useState({
    mes: hoy.slice(0, 7),
    amount: String(empleado.salary || ''),
    payment_method: metodos[0] ?? 'Transferencia',
    date: hoy,
    notes: '',
    currency: empleado.salary_currency || '',
    horas_extra: '0',
    overtime_rate: String(empleado.overtime_rate || tarifaHoraExtra(Number(empleado.salary) || 0)),
    bonos: '',
    fees: ''
  })
  const [pagosDiv, setPagosDiv] = useState<PagoDiv[]>([])
  const [usarDividido, setUsarDividido] = useState(false)
  const [error, setError] = useState('')
  const monedaSel = form.currency || empleado.salary_currency || 'USD'

  useEffect(() => {
    setForm({
      mes: hoy.slice(0, 7),
      amount: String(empleado.salary || ''),
      payment_method: metodos[0] ?? 'Transferencia',
      date: hoy,
      notes: '',
      currency: empleado.salary_currency || '',
      horas_extra: '0',
      overtime_rate: String(empleado.overtime_rate || tarifaHoraExtra(Number(empleado.salary) || 0)),
      bonos: '',
      fees: ''
    })
    setPagosDiv([])
    setUsarDividido(false)
    setError('')
  }, [empleado])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  const dec = getCurrency(monedaSel).decimals

  const num = (v: string) => Number(v) || 0
  const sueldoBase = num(form.amount)
  const heMonto = useMemo(() => Math.round(num(form.horas_extra) * num(form.overtime_rate) * Math.pow(10, dec)) / Math.pow(10, dec), [form.horas_extra, form.overtime_rate, dec])
  const totalNomina = useMemo(() =>
    Math.round((sueldoBase + heMonto + num(form.bonos) + num(form.fees)) * Math.pow(10, dec)) / Math.pow(10, dec),
    [sueldoBase, heMonto, form.bonos, form.fees, dec])

  const sumaPagos = pagosDiv.reduce((s, p) => s + (Number(p.amount) || 0), 0)

  const submit = () => {
    if (!form.mes) { setError(t('errors.seleccionaMes')); return }
    if (!sueldoBase || sueldoBase <= 0) { setError(t('errors.montoMayorCero')); return }
    if (usarDividido) {
      if (pagosDiv.length === 0) { setError(t('nominaAv.agregarPago')); return }
      if (Math.abs(sumaPagos - totalNomina) > 0.01) { setError(t('nominaAv.sumaCoincide')); return }
    }
    onSave({
      mes: form.mes,
      amount: totalNomina,
      payment_method: form.payment_method as MetodoPago,
      date: form.date,
      notes: form.notes,
      currency: form.currency,
      base_salary: sueldoBase,
      horas_extra: num(form.horas_extra),
      overtime_rate: num(form.overtime_rate),
      bonos: num(form.bonos),
      fees: num(form.fees),
      split_payments: usarDividido ? pagosDiv.map(p => ({ payment_method: p.payment_method, currency: p.currency, amount: Number(p.amount) })) : []
    })
    onClose()
  }

  return (
    <Dialog open onClose={onClose} title={`${t('empleados.nomina')} — ${empleado.name}`}
      footer={<><Button variant="outline" onClick={onClose}>{t('common.cancelar')}</Button><Button onClick={submit}>{t('facturas.registrarPago')}</Button></>}>
      <div className="space-y-3">
        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* Esquema de pago y horario del empleado */}
        <div className="rounded-xl border border-gray-100 bg-muted/40 p-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground">{t('nominaAv.titulo')}</div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div><span className="block text-muted-foreground">{t('nominaAv.esquemaPago')}</span>
              <b>{{ weekly: t('nominaAv.semanal'), biweekly: t('nominaAv.quincenal'), monthly: t('nominaAv.mensual'), '': t('nominaAv.mensual') }[empleado.pay_schedule ?? 'monthly']}</b></div>
            <div><span className="block text-muted-foreground">{t('nominaAv.horario')}</span>
              <b>{empleado.clock_in || '--:--'} → {empleado.clock_out || '--:--'}</b></div>
            <div><span className="block text-muted-foreground">{t('nominaAv.tarifaHoraExtra')}</span>
              <b>{formatMoney(num(form.overtime_rate), monedaSel)}</b></div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-muted-foreground">{t('empleados.mes')} *</label><Input type="month" value={form.mes} onChange={set('mes')} /></div>
          <div><label className="text-xs text-muted-foreground">{t('reportesFin.sueldoBase')} *</label><Input type="number" min={0} step="any" value={form.amount} onChange={set('amount')} /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground flex justify-between">
              <span>{t('nominaAv.horasExtraTrab')}</span>
              <button type="button" onClick={() => {
                // Sugerencia: 1.5× sobre jornada estándar de 40h/sem.
                const sugerida = tarifaHoraExtra(sueldoBase)
                setForm(f => ({ ...f, overtime_rate: String(sugerida) }))
              }} className="text-primary underline decoration-dotted underline-offset-2" title={t('nominaAv.tarifaSugerida', { tarifa: tarifaHoraExtra(sueldoBase) })}>
                1.5×
              </button>
            </label>
            <div className="flex gap-1.5 items-center">
              <Input type="number" min={0} step="any" value={form.horas_extra} onChange={set('horas_extra')} />
              <Input type="number" min={0} step="any" title={t('nominaAv.tarifaHoraExtra')} value={form.overtime_rate} onChange={set('overtime_rate')} />
            </div>
          </div>
          <div className="space-y-2">
            <div><label className="text-xs text-muted-foreground">{t('nominaAv.bonificaciones')}</label><Input type="number" min={0} step="any" value={form.bonos} onChange={set('bonos')} placeholder="0" /></div>
            <div><label className="text-xs text-muted-foreground">{t('nominaAv.comisionesVenta')}</label><Input type="number" min={0} step="any" value={form.fees} onChange={set('fees')} placeholder="0" /></div>
          </div>
        </div>

        {/* Resumen de liquidación */}
        <div className="rounded-xl border border-primary/20 bg-primary-soft/30 p-3 text-sm space-y-1">
          <div className="text-xs font-medium text-primary mb-1.5">{t('nominaAv.resumenLiquidacion')}</div>
          <div className="flex justify-between"><span>{t('reportesFin.sueldoBase')}</span><b>{formatMoney(sueldoBase, monedaSel)}</b></div>
          <div className="flex justify-between"><span>{t('nominaAv.montoHorasExtra')}</span><b>{formatMoney(heMonto, monedaSel)}</b></div>
          <div className="flex justify-between"><span>{t('nominaAv.bonificaciones')}</span><b>{formatMoney(num(form.bonos), monedaSel)}</b></div>
          <div className="flex justify-between"><span>{t('nominaAv.comisionesVenta')}</span><b>{formatMoney(num(form.fees), monedaSel)}</b></div>
          <div className="flex justify-between border-t border-primary/20 pt-1.5"><span>{t('reportesFin.totalLiquidacion')}</span><b className="text-primary text-base">{formatMoney(totalNomina, monedaSel)}</b></div>
        </div>

        {/* Pagos divididos */}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={usarDividido} onChange={e => setUsarDividido(e.target.checked)} />
          {t('nominaAv.pagosDivididos')}
        </label>
        {usarDividido && (
          <div className="space-y-2">
            {pagosDiv.map((p, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <Select className="col-span-4" value={p.payment_method} onChange={v => setPagosDiv(l => l.map((x, idx) => idx === i ? { ...x, payment_method: v } : x))}
                  options={metodos.map(m => ({ value: m, label: m }))} placeholder={t('common.metodo')} />
                <div className="col-span-3"><CurrencySelect value={p.currency} onChange={v => setPagosDiv(l => l.map((x, idx) => idx === i ? { ...x, currency: v } : x))} /></div>
                <Input className="col-span-4" type="number" min={0} step="any" value={p.amount}
                  onChange={e => setPagosDiv(l => l.map((x, idx) => idx === i ? { ...x, amount: e.target.value } : x))}
                  placeholder={t('common.monto')} />
                <button className="col-span-1 text-red-500 hover:text-red-700" onClick={() => setPagosDiv(l => l.filter((_, idx) => idx !== i))}>×</button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button size="sm" variant="outline" onClick={() => setPagosDiv(l => [...l, { payment_method: metodos[0] ?? 'Efectivo', currency: monedaSel, amount: '' }])}>{t('nominaAv.agregarPago')}</Button>
              <Badge tone={Math.abs(sumaPagos - totalNomina) <= 0.01 ? 'green' : 'yellow'}>{t('nominaAv.sumaPagos', { suma: formatMoney(sumaPagos, monedaSel) })}</Badge>
            </div>
          </div>
        )}

        {!usarDividido && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="text-xs text-muted-foreground">{t('common.metodo')}</label>
              <Select value={form.payment_method} onChange={v => setForm(f => ({ ...f, payment_method: v }))} options={metodos.map(v => ({ value: v, label: v }))} />
            </div>
            <CurrencySelect label={t('empleados.monedaPago')} value={form.currency} onChange={v => setForm(f => ({ ...f, currency: v }))} />
          </div>
        )}
        <div><label className="text-xs text-muted-foreground">{t('common.fecha')}</label><Input type="date" value={form.date} onChange={set('fecha')} /></div>
        <div><label className="text-xs text-muted-foreground">{t('common.notas')}</label>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-surface resize-y focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/25" />
        </div>
        <p className="text-xs text-muted-foreground">{t('empleados.nominaInfo')}</p>
      </div>
    </Dialog>
  )
}
