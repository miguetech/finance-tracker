import React, { useEffect, useState } from 'react'
import { todayLocal } from '../../lib/date'
import { Dialog, Button, Input, Select  } from '../../ui/components'
import { useGastos, useMetodosPago } from '../../store/queries'
import { useToast } from '../../ui/components'
import { CategoriaQuickSelect } from '../../ui/CategoriaSelect'
import { CurrencySelect } from '../../ui/currency'
import { useI18n } from '../../i18n'
import type { Gasto } from '../../types/entities'

export function GastoFormModal({ open, onClose, initial }: { open: boolean; onClose: () => void; initial: Gasto | null }) {
  const { t } = useI18n()
  const { saveExpense } = useGastos()
  const metodos = useMetodosPago()
  const toast = useToast()
  const [form, setForm] = useState({ date: todayLocal(), category: '', description: '', amount: '', payment_method: 'Efectivo', supplier: '', currency: '' })
  useEffect(() => {
    if (open) setForm(initial ? { ...initial, amount: String(initial.amount) } : { date: todayLocal(), category: '', description: '', amount: '', payment_method: 'Efectivo', supplier: '', currency: '' })
  }, [open, initial])
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  const setCategoria = (v: string) => setForm(f => ({
    ...f,
    category: v,
    // Si solo se eligió la categoría (ej. "Renta"), la descripción se rellena sola.
    description: f.description.trim() === '' ? v : f.description
  }))
  const submit = async () => {
    if (!form.category.trim()) { toast(t('gastos.seleccionaCategoria'), 'error'); return }
    if (!form.description.trim()) { toast(t('gastos.llenaDescripcion'), 'error'); return }
    const montoNum = Number(form.amount)
    if (!Number.isFinite(montoNum) || montoNum <= 0) { toast(t('errors.montoMayorCero'), 'error'); return }
    try {
      await saveExpense.mutateAsync({ ...(initial ?? {}), ...form, amount: montoNum } as Gasto)
      toast(t('gastos.guardado'))
      onClose()
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }
  return (
    <Dialog open={open} onClose={onClose} title={initial ? t('gastos.editar') : t('gastos.nuevo')}
      footer={<><Button variant="outline" onClick={onClose}>{t('common.cancelar')}</Button><Button onClick={submit}>{t('common.guardar')}</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">{t('common.fecha')}</label><Input type="date" value={form.date} onChange={set('date')} /></div>
          <div><label className="text-xs text-gray-500">{t('common.categoria')}</label>
            <CategoriaQuickSelect configKey="expense_categories" value={form.category} onChange={setCategoria} />
          </div>
        </div>
        <div><label className="text-xs text-gray-500">{t('gastos.descripcion')} *</label><Input value={form.description} onChange={set('description')} /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">{t('common.monto')} *</label><Input type="number" value={form.amount} onChange={set('monto')} /></div>
          <div><label className="text-xs text-gray-500">{t('common.metodo')}</label>
            <Select value={form.payment_method} onChange={v => setForm(f => ({ ...f, payment_method: v }))} options={metodos.map(v => ({ value: v, label: v }))} />
          </div>
        </div>
        <CurrencySelect label={t('gastos.monedaGasto')} value={form.currency} onChange={v => setForm(f => ({ ...f, currency: v }))} />
        <div><label className="text-xs text-gray-500">{t('gastos.proveedor')}</label><Input value={form.supplier} onChange={set('supplier')} /></div>
      </div>
    </Dialog>
  )
}
