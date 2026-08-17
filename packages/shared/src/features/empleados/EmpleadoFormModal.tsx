import React, { useEffect, useState } from 'react'
import { Dialog, Button, Input, Select } from '../../ui/components'
import { useConfig } from '../../store/queries'
import { CurrencySelect } from '../../ui/currency'
import { getDocLabel } from '../../taxid'
import { useI18n } from '../../i18n'
import type { Empleado } from '../../types/entities'

export function EmpleadoFormModal({ open, onClose, initial, onSave }: { open: boolean; onClose: () => void; initial: Empleado | null; onSave: (e: Empleado) => Promise<void> | void }) {
  const { t } = useI18n()
  const { config } = useConfig()
  const docLabel = getDocLabel(config?.tipo_doc ?? 'RFC', config?.tipo_doc_etiqueta ?? '')
  const [form, setForm] = useState({ nombre: '', rfc: '', puesto: '', salario: '', salario_moneda: '', fecha_ingreso: '', activo: 'true' })
  const [error, setError] = useState('')
  useEffect(() => {
    if (open) setForm(initial
      ? { nombre: initial.nombre, rfc: initial.rfc, puesto: initial.puesto, salario: String(initial.salario), salario_moneda: initial.salario_moneda, fecha_ingreso: initial.fecha_ingreso, activo: initial.activo }
      : { nombre: '', rfc: '', puesto: '', salario: '', salario_moneda: '', fecha_ingreso: '', activo: 'true' })
  }, [open, initial])
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  const submit = async () => {
    if (!form.nombre.trim()) return
    const salario = Number(form.salario)
    if (form.salario.trim() !== '' && Number.isNaN(salario)) return setError(t('errors.salarioInvalido'))
    if (salario < 0) return setError(t('errors.salarioNegativo'))
    try {
      await onSave({ ...initial, ...form, salario: salario || 0 } as Empleado)
      onClose()
    } catch {
      /* el padre muestra el error; se mantiene abierto */
    }
  }
  return (
    <Dialog open={open} onClose={onClose} title={initial ? t('empleados.editar') : t('empleados.nuevo')}
      footer={<><Button variant="outline" onClick={onClose}>{t('common.cancelar')}</Button><Button onClick={submit}>{t('common.guardar')}</Button></>}>
      <div className="space-y-3">
        <div><label className="text-xs text-muted-foreground">{t('common.nombre')} *</label><Input value={form.nombre} onChange={set('nombre')} /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-muted-foreground">{docLabel}</label><Input value={form.rfc} onChange={set('rfc')} /></div>
          <div><label className="text-xs text-muted-foreground">{t('empleados.puesto')}</label><Input value={form.puesto} onChange={set('puesto')} /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-muted-foreground">{t('empleados.salarioMensual')}</label><Input type="number" min={0} value={form.salario} onChange={set('salario')} /></div>
          <div><label className="text-xs text-muted-foreground">{t('empleados.fechaIngreso')}</label><Input type="date" value={form.fecha_ingreso} onChange={set('fecha_ingreso')} /></div>
        </div>
        <CurrencySelect label={t('empleados.monedaSalario')} value={form.salario_moneda} onChange={v => setForm(f => ({ ...f, salario_moneda: v }))} />
        <div>
          <label className="text-xs text-muted-foreground">{t('common.estado')}</label>
          <Select value={form.activo} onChange={v => setForm(f => ({ ...f, activo: v }))} options={[{ value: 'true', label: t('empleados.activo') }, { value: 'false', label: t('empleados.inactivo') }]} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Dialog>
  )
}
