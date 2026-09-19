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
import { ProveedorFormModal } from '../suppliers/ProveedorFormModal'
import type { Proveedor } from '../../types/entities'

export function CxpFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const { suppliers, saveSupplier } = useProveedores()
  const { createPayable } = useCxp()
  const toast = useToast()
  const [form, setForm] = useState({ supplier_id: '', document_serial: '', category: '', description: '', due_date: '', total_amount: '', currency: '', notes: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [nuevoProv, setNuevoProv] = useState(false)
  const { guardando, guardar } = useSaveGuard()
  useEffect(() => {
    if (open) {
      setForm({ supplier_id: '', document_serial: '', category: '', description: '', due_date: '', total_amount: '', currency: '', notes: '' })
      setErrors({})
    }
  }, [open])
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  const submit = () => guardar(async () => {
    const errs: Record<string, string> = {}
    if (!form.supplier_id) errs.supplier = t('errors.proveedorRequerido')
    if (!form.description.trim()) errs.description = t('errors.descripcionObligatoria')
    if (!form.due_date) errs.date = t('errors.fechaVencimientoObligatoria')
    if (!form.total_amount || Number(form.total_amount) <= 0) errs.amount = t('errors.montoMayorCero')
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    try {
      await createPayable.mutateAsync({ ...form, issue_date: todayLocal(), total_amount: Number(form.total_amount) })
      toast(t('cuentas.creada'))
      onClose()
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  })
  const onProveedorCreado = (p: Proveedor) => {
    setForm(f => ({ ...f, supplier_id: p.supplier_id }))
    setNuevoProv(false)
    setErrors(e => ({ ...e, supplier: '' }))
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
          <Select value={form.supplier_id} onChange={v => { setForm(f => ({ ...f, supplier_id: v })); setErrors(e => ({ ...e, supplier: '' })) }}
            options={suppliers.map(p => ({ value: p.supplier_id, label: p.name }))} placeholder={t('common.seleccionar')} error={errors.supplier} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">{t('cuentas.folioDoc')}</label><Input value={form.document_serial} onChange={set('document_serial')} /></div>
          <div><label className="text-xs text-gray-500">{t('common.categoria')}</label>
            <CategoriaQuickSelect configKey="ap_categories" value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))} />
          </div>
        </div>
        <div><label className="text-xs text-gray-500">{t('cuentas.descripcion')} *</label><Input value={form.description} onChange={set('description')} error={errors.description} /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">{t('cuentas.fechaVencimiento')} *</label><Input type="date" value={form.due_date} onChange={set('due_date')} error={errors.date} /></div>
          <div><label className="text-xs text-gray-500">{t('cuentas.montoTotal')} *</label><Input type="number" value={form.total_amount} onChange={set('total_amount')} error={errors.amount} /></div>
        </div>
        <div><label className="text-xs text-gray-500">{t('cuentas.monedaDeuda')}</label><CurrencySelect value={form.currency} onChange={v => setForm(f => ({ ...f, currency: v }))} /></div>
        <div><label className="text-xs text-gray-500">{t('common.notas')}</label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} /></div>
      </div>
      {nuevoProv && <ProveedorFormModal open onClose={() => setNuevoProv(false)} initial={null}
        onSave={async p => { try { await saveSupplier.mutateAsync(p); onProveedorCreado(p) } catch (e) { throw e instanceof Error ? e : new Error('Error al guardar proveedor') } }} />}
    </Dialog>
  )
}
