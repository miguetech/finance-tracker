import React, { useEffect, useState } from 'react'
import { Dialog, Button, Input, Select } from '../../ui/components'
import { useConfig } from '../../store/queries'
import { CurrencySelect } from '../../ui/currency'
import { getDocLabel } from '../../taxid'
import { useI18n } from '../../i18n'
import type { Empleado } from '../../types/entities'

const DIAS = [
  { n: 1, key: 'empleados.lun' }, { n: 2, key: 'empleados.mar' }, { n: 3, key: 'empleados.mie' },
  { n: 4, key: 'empleados.jue' }, { n: 5, key: 'empleados.vie' }, { n: 6, key: 'empleados.sab' }, { n: 7, key: 'empleados.dom' }
] as const

export function EmpleadoFormModal({ open, onClose, initial, onSave }: { open: boolean; onClose: () => void; initial: Empleado | null; onSave: (e: Empleado) => Promise<void> | void }) {
  const { t } = useI18n()
  const { config } = useConfig()
  const docLabel = getDocLabel(config?.tipo_doc ?? 'RFC', config?.doc_type_label ?? '')
  const [form, setForm] = useState({ name: '', rfc: '', position: '', salary: '', salary_currency: '', hire_date: '', active: 'true', clock_in: '', clock_out: '', pay_schedule: 'monthly', overtime_rate: '' })
  const [dias, setDias] = useState<number[]>([1, 2, 3, 4, 5])
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  useEffect(() => {
    if (open) {
      setDias(initial?.work_days
        ? initial.work_days.split(',').map(s => Number(s.trim())).filter(n => n >= 1 && n <= 7)
        : [1, 2, 3, 4, 5])
      setForm(initial
        ? { name: initial.name, rfc: initial.rfc, position: initial.position, salary: String(initial.salary), salary_currency: initial.salary_currency, hire_date: initial.hire_date, active: initial.active, clock_in: initial.clock_in || '', clock_out: initial.clock_out || '', pay_schedule: initial.pay_schedule || 'monthly', overtime_rate: String(initial.overtime_rate ?? '') }
        : { name: '', rfc: '', position: '', salary: '', salary_currency: '', hire_date: '', active: 'true', clock_in: '', clock_out: '', pay_schedule: 'monthly', overtime_rate: '' })
    }
  }, [open, initial])
  const toggleDia = (n: number) => setDias(d => d.includes(n) ? d.filter(x => x !== n) : [...d, n].sort())
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  const submit = async () => {
    if (!form.name.trim()) return
    const salary = Number(form.salary)
    if (form.salary.trim() !== '' && Number.isNaN(salary)) return setError(t('errors.salarioInvalido'))
    if (salary < 0) return setError(t('errors.salarioNegativo'))
    if (dias.length === 0) return setError(t('errors.diasLaborales'))
    setGuardando(true)
    try {
      await onSave({ ...initial, ...form, salary: salary || 0, pay_schedule: form.pay_schedule as Empleado['pay_schedule'], overtime_rate: Number(form.overtime_rate) || 0, work_days: dias.join(',') } as Empleado)
      onClose()
    } catch {
      /* el padre muestra el error; se mantiene abierto */
    } finally {
      setGuardando(false)
    }
  }
  return (
    <Dialog open={open} onClose={onClose} title={initial ? t('empleados.editar') : t('empleados.nuevo')}
      footer={<><Button variant="outline" onClick={onClose} disabled={guardando}>{t('common.cancelar')}</Button><Button onClick={submit} disabled={guardando}>{guardando ? t('imagenes.subiendo') : t('common.guardar')}</Button></>}>
      <div className="space-y-3">
        <div><label className="text-xs text-muted-foreground">{t('common.nombre')} *</label><Input value={form.name} onChange={set('name')} /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-muted-foreground">{docLabel}</label><Input value={form.rfc} onChange={set('rfc')} /></div>
          <div><label className="text-xs text-muted-foreground">{t('empleados.puesto')}</label><Input value={form.position} onChange={set('position')} /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-muted-foreground">{t('empleados.salarioMensual')}</label><Input type="number" min={0} value={form.salary} onChange={set('salary')} /></div>
          <div><label className="text-xs text-muted-foreground">{t('empleados.fechaIngreso')}</label><Input type="date" value={form.hire_date} onChange={set('hire_date')} /></div>
        </div>
        <CurrencySelect label={t('empleados.monedaSalario')} value={form.salary_currency} onChange={v => setForm(f => ({ ...f, salary_currency: v }))} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-muted-foreground">{t('nominaAv.horaEntrada')}</label><Input type="time" value={form.clock_in} onChange={set('clock_in')} /></div>
          <div><label className="text-xs text-muted-foreground">{t('nominaAv.horaSalida')}</label><Input type="time" value={form.clock_out} onChange={set('clock_out')} /></div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">{t('empleados.diasLaborales')}</label>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {DIAS.map(d => (
              <button key={d.n} type="button" onClick={() => toggleDia(d.n)}
                className={dias.includes(d.n)
                  ? 'px-3 py-1.5 rounded-lg text-sm font-medium bg-primary-soft text-primary border border-primary/30'
                  : 'px-3 py-1.5 rounded-lg text-sm bg-muted text-gray-500 border border-gray-200'}>
                {t(d.key)}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-muted-foreground">{t('nominaAv.esquemaPago')}</label>
            <Select value={form.pay_schedule} onChange={v => setForm(f => ({ ...f, pay_schedule: v }))}
              options={[{ value: 'weekly', label: t('nominaAv.semanal') }, { value: 'biweekly', label: t('nominaAv.quincenal') }, { value: 'monthly', label: t('nominaAv.mensual') }]} />
          </div>
          <div><label className="text-xs text-muted-foreground">{t('nominaAv.tarifaHoraExtra')}</label><Input type="number" min={0} step="any" value={form.overtime_rate} onChange={set('overtime_rate')} placeholder="0" /></div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">{t('common.estado')}</label>
          <Select value={form.active} onChange={v => setForm(f => ({ ...f, active: v }))} options={[{ value: 'true', label: t('empleados.activo') }, { value: 'false', label: t('empleados.inactivo') }]} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Dialog>
  )
}
