import React, { useEffect, useState } from 'react'
import { todayLocal } from '../../lib/date'
import { Dialog, Button, Input, Select } from '../../ui/components'
import { CurrencySelect } from '../../ui/currency'
import { useMetodosPago } from '../../store/queries'
import { useI18n } from '../../i18n'
import type { Empleado, MetodoPago } from '../../types/entities'

export function NominaModal({ empleado, onClose, onSave }: { empleado: Empleado; onClose: () => void; onSave: (i: { mes: string; monto: number; metodo_pago: MetodoPago; fecha: string; notas: string; moneda: string }) => void }) {
  const { t } = useI18n()
  const hoy = todayLocal()
  const metodos = useMetodosPago()
  const [form, setForm] = useState({ mes: hoy.slice(0, 7), monto: String(empleado.salario), metodo_pago: metodos[0] ?? 'Transferencia', fecha: hoy, notas: '', moneda: empleado.salario_moneda || '' })
  const [error, setError] = useState('')
  useEffect(() => { setForm({ mes: hoy.slice(0, 7), monto: String(empleado.salario), metodo_pago: metodos[0] ?? 'Transferencia', fecha: hoy, notas: '', moneda: empleado.salario_moneda || '' }); setError('') }, [empleado])
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  const submit = () => {
    const monto = Number(form.monto)
    if (!form.mes) { setError(t('errors.seleccionaMes')); return }
    if (!monto || monto <= 0) { setError(t('errors.montoMayorCero')); return }
    onSave({ mes: form.mes, monto, metodo_pago: form.metodo_pago as MetodoPago, fecha: form.fecha, notas: form.notas, moneda: form.moneda })
    onClose()
  }
  return (
    <Dialog open onClose={onClose} title={`${t('empleados.nomina')} — ${empleado.nombre}`}
      footer={<><Button variant="outline" onClick={onClose}>{t('common.cancelar')}</Button><Button onClick={submit}>{t('facturas.registrarPago')}</Button></>}>
      <div className="space-y-3">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-muted-foreground">{t('empleados.mes')} *</label><Input type="month" value={form.mes} onChange={set('mes')} /></div>
          <div><label className="text-xs text-muted-foreground">{t('common.monto')} *</label><Input type="number" min={0} value={form.monto} onChange={set('monto')} /></div>
        </div>
        <CurrencySelect label={t('empleados.monedaPago')} value={form.moneda} onChange={v => setForm(f => ({ ...f, moneda: v }))} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-muted-foreground">{t('common.metodo')}</label>
            <Select value={form.metodo_pago} onChange={v => setForm(f => ({ ...f, metodo_pago: v }))} options={metodos.map(v => ({ value: v, label: v }))} />
          </div>
          <div><label className="text-xs text-muted-foreground">{t('common.fecha')}</label><Input type="date" value={form.fecha} onChange={set('fecha')} /></div>
        </div>
        <div><label className="text-xs text-muted-foreground">{t('common.notas')}</label><Input value={form.notas} onChange={set('notas')} /></div>
        <p className="text-xs text-muted-foreground">{t('empleados.nominaInfo')}</p>
      </div>
    </Dialog>
  )
}
