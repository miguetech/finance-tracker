import React, { useEffect, useState } from 'react'
import { todayLocal } from '../../lib/date'
import { Dialog, Button, Input, Select, Textarea } from '../../ui/components'
import { useToast } from '../../ui/components'
import { CategoriaQuickSelect } from '../../ui/CategoriaSelect'
import { useProveedores, useCxp } from '../../store/queries'
import { CurrencySelect } from '../../ui/currency'
import { IconPlus } from '../../ui/icons'
import { useI18n } from '../../i18n'
import { useSaveGuard } from '../../ui/hooks'
import { ProveedorFormModal } from '../proveedores/ProveedorFormModal'
import type { Proveedor } from '../../types/entities'

export function CxpFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const { proveedores, saveProveedor } = useProveedores()
  const { createCxp } = useCxp()
  const toast = useToast()
  const [form, setForm] = useState({ supplier_id: '', document_serial: '', categoria: '', descripcion: '', due_date: '', total_amount: '', moneda: '', notas: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [nuevoProv, setNuevoProv] = useState(false)
  const { guardando, guardar } = useSaveGuard()
  useEffect(() => {
    if (open) {
      setForm({ supplier_id: '', document_serial: '', categoria: '', descripcion: '', due_date: '', total_amount: '', moneda: '', notas: '' })
      setErrors({})
    }
  }, [open])
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  const submit = () => guardar(async () => {
    const errs: Record<string, string> = {}
    if (!form.supplier_id) errs.proveedor = t('errors.proveedorRequerido')
    if (!form.descripcion.trim()) errs.descripcion = t('errors.descripcionObligatoria')
    if (!form.due_date) errs.fecha = t('errors.fechaVencimientoObligatoria')
    if (!form.total_amount || Number(form.total_amount) <= 0) errs.monto = t('errors.montoMayorCero')
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    try {
      await createCxp.mutateAsync({ ...form, issue_date: todayLocal(), total_amount: Number(form.total_amount) })
      toast(t('cuentas.creada'))
      onClose()
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  })
  const onProveedorCreado = (p: Proveedor) => {
    setForm(f => ({ ...f, supplier_id: p.supplier_id }))
    setNuevoProv(false)
    setErrors(e => ({ ...e, proveedor: '' }))
    toast(t('proveedores.creadoSeleccionado'))
  }
  return (
    <Dialog open={open} onClose={onClose} title={t('cuentas.nuevaPorPagar')}
      footer={<><Button variant="outline" onClick={onClose}>{t('common.cancelar')}</Button><Button onClick={submit} disabled={guardando}>{guardando ? t('imagenes.subiendo') : t('common.guardar')}</Button></>}>
      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-500">{t('cuentas.proveedor')} *</label>
            <button type="button" onClick={() => setNuevoProv(true)} className="inline-flex items-center gap-0.5 text-xs text-primary underline decoration-dotted underline-offset-2 hover:text-primary-hover">
              <IconPlus className="w-3.5 h-3.5" /> {t('proveedores.nuevo')}
            </button>
          </div>
          <Select value={form.supplier_id} onChange={v => { setForm(f => ({ ...f, supplier_id: v })); setErrors(e => ({ ...e, proveedor: '' })) }}
            options={proveedores.map(p => ({ value: p.supplier_id, label: p.nombre }))} placeholder={t('common.seleccionar')} error={errors.proveedor} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">{t('cuentas.folioDoc')}</label><Input value={form.document_serial} onChange={set('document_serial')} /></div>
          <div><label className="text-xs text-gray-500">{t('common.categoria')}</label>
            <CategoriaQuickSelect configKey="ap_categories" value={form.categoria} onChange={v => setForm(f => ({ ...f, categoria: v }))} />
          </div>
        </div>
        <div><label className="text-xs text-gray-500">{t('cuentas.descripcion')} *</label><Input value={form.descripcion} onChange={set('descripcion')} error={errors.descripcion} /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">{t('cuentas.fechaVencimiento')} *</label><Input type="date" value={form.due_date} onChange={set('due_date')} error={errors.fecha} /></div>
          <div><label className="text-xs text-gray-500">{t('cuentas.montoTotal')} *</label><Input type="number" value={form.total_amount} onChange={set('total_amount')} error={errors.monto} /></div>
        </div>
        <div><label className="text-xs text-gray-500">{t('cuentas.monedaDeuda')}</label><CurrencySelect value={form.moneda} onChange={v => setForm(f => ({ ...f, moneda: v }))} /></div>
        <div><label className="text-xs text-gray-500">{t('common.notas')}</label><Textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} rows={3} /></div>
      </div>
      {nuevoProv && <ProveedorFormModal open onClose={() => setNuevoProv(false)} initial={null}
        onSave={async p => { try { await saveProveedor.mutateAsync(p); onProveedorCreado(p) } catch (e) { throw e instanceof Error ? e : new Error('Error al guardar proveedor') } }} />}
    </Dialog>
  )
}
