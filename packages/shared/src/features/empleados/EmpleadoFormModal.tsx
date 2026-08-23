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
  const docLabel = getDocLabel(config?.tipo_doc ?? 'RFC', config?.tipo_doc_etiqueta ?? '')
  const [form, setForm] = useState({ nombre: '', rfc: '', puesto: '', salario: '', salario_moneda: '', fecha_ingreso: '', activo: 'true', hora_entrada: '', hora_salida: '', esquema_pago: 'mensual', tarifa_hora_extra: '' })
  const [dias, setDias] = useState<number[]>([1, 2, 3, 4, 5])
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  useEffect(() => {
    if (open) {
      setDias(initial?.dias_laborales
        ? initial.dias_laborales.split(',').map(s => Number(s.trim())).filter(n => n >= 1 && n <= 7)
        : [1, 2, 3, 4, 5])
      setForm(initial
        ? { nombre: initial.nombre, rfc: initial.rfc, puesto: initial.puesto, salario: String(initial.salario), salario_moneda: initial.salario_moneda, fecha_ingreso: initial.fecha_ingreso, activo: initial.activo, hora_entrada: initial.hora_entrada || '', hora_salida: initial.hora_salida || '', esquema_pago: initial.esquema_pago || 'mensual', tarifa_hora_extra: String(initial.tarifa_hora_extra ?? '') }
        : { nombre: '', rfc: '', puesto: '', salario: '', salario_moneda: '', fecha_ingreso: '', activo: 'true', hora_entrada: '', hora_salida: '', esquema_pago: 'mensual', tarifa_hora_extra: '' })
    }
  }, [open, initial])
  const toggleDia = (n: number) => setDias(d => d.includes(n) ? d.filter(x => x !== n) : [...d, n].sort())
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  const submit = async () => {
    if (!form.nombre.trim()) return
    const salario = Number(form.salario)
    if (form.salario.trim() !== '' && Number.isNaN(salario)) return setError(t('errors.salarioInvalido'))
    if (salario < 0) return setError(t('errors.salarioNegativo'))
    if (dias.length === 0) return setError(t('errors.diasLaborales'))
    setGuardando(true)
    try {
      await onSave({ ...initial, ...form, salario: salario || 0, esquema_pago: form.esquema_pago as Empleado['esquema_pago'], tarifa_hora_extra: Number(form.tarifa_hora_extra) || 0, dias_laborales: dias.join(',') } as Empleado)
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-muted-foreground">{t('nominaAv.horaEntrada')}</label><Input type="time" value={form.hora_entrada} onChange={set('hora_entrada')} /></div>
          <div><label className="text-xs text-muted-foreground">{t('nominaAv.horaSalida')}</label><Input type="time" value={form.hora_salida} onChange={set('hora_salida')} /></div>
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
            <Select value={form.esquema_pago} onChange={v => setForm(f => ({ ...f, esquema_pago: v }))}
              options={[{ value: 'semanal', label: t('nominaAv.semanal') }, { value: 'quincenal', label: t('nominaAv.quincenal') }, { value: 'mensual', label: t('nominaAv.mensual') }]} />
          </div>
          <div><label className="text-xs text-muted-foreground">{t('nominaAv.tarifaHoraExtra')}</label><Input type="number" min={0} step="any" value={form.tarifa_hora_extra} onChange={set('tarifa_hora_extra')} placeholder="0" /></div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">{t('common.estado')}</label>
          <Select value={form.activo} onChange={v => setForm(f => ({ ...f, activo: v }))} options={[{ value: 'true', label: t('empleados.activo') }, { value: 'false', label: t('empleados.inactivo') }]} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Dialog>
  )
}
