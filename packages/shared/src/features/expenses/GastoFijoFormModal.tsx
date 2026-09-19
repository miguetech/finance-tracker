import React, { useEffect, useState } from 'react'
import { todayLocal } from '../../lib/date'
import { Dialog, Button, Input, Select, Textarea } from '../../ui/components'
import { useGastosFijos, useCategorias, useMetodosPago, useConfig, useProveedores } from '../../store/queries'
import { useToast } from '../../ui/components'
import { CurrencySelect } from '../../ui/currency'
import { useI18n } from '../../i18n'
import type { GastoFijo } from '../../types/entities'
import { uid } from '../../lib/uid'
import { SearchSelect } from '../../ui/components'

/** Modal de gasto fijo recurrente (renta, internet…) con día de vencimiento y enlace de pago. */
export function GastoFijoFormModal({ open, onClose, initial }: { open: boolean; onClose: () => void; initial: GastoFijo | null }) {
  const { t } = useI18n()
  const { saveFixedExpense } = useGastosFijos()
  const { data: categorias = [] } = useCategorias('expenses')
  const metodos = useMetodosPago()
  void metodos
  const { config } = useConfig()
  const { suppliers } = useProveedores()
  const toast = useToast()
  const [form, setForm] = useState({ description: '', category: '', amount: '', currency: '', due_day: '1', supplier_id: '', payment_link: '', notes: '', active: 'true' })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (open) setForm(initial
      ? {
        description: initial.description,
        category: initial.category,
        amount: String(initial.amount),
        currency: initial.currency || '',
        due_day: String(initial.due_day || 1),
        supplier_id: initial.supplier_id || '',
        payment_link: initial.payment_link || '',
        notes: initial.notes || '',
        active: initial.active || 'true'
      }
      : { description: '', category: categorias[0] ?? 'Renta', amount: '', currency: config?.currency ?? '', due_day: '1', supplier_id: '', payment_link: '', notes: '', active: 'true' })
  }, [open, initial])

  const submit = async () => {
    setError('')
    if (!form.description.trim()) { setError(t('gastos.llenaDescripcion')); return }
    if (!Number(form.amount) || Number(form.amount) <= 0) { setError(t('errors.montoMayorCero')); return }
    const dia = Math.max(1, Math.min(31, Number(form.due_day) || 1))
    setGuardando(true)
    try {
      const prov = suppliers.find(p => p.supplier_id === form.supplier_id)
      await saveFixedExpense.mutateAsync({
        ...(initial ?? {}),
        fixed_expense_id: initial?.fixed_expense_id || uid('gfx_'),
        description: form.description.trim(),
        category: form.category,
        amount: Number(form.amount),
        currency: form.currency || config?.currency || '',
        due_day: dia,
        supplier_id: form.supplier_id,
        supplier_name: prov?.name || initial?.supplier_name || '',
        payment_link: form.payment_link.trim(),
        notes: form.notes,
        active: form.active
      } as GastoFijo)
      toast(t('gastosFijos.guardado'))
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={initial ? t('common.editar') : t('gastosFijos.nuevo')}
      footer={<><Button variant="outline" onClick={onClose} disabled={guardando}>{t('common.cancelar')}</Button>
        <Button onClick={submit} disabled={guardando}>{guardando ? t('imagenes.subiendo') : t('common.guardar')}</Button></>}>
      <div className="space-y-3">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div><label className="text-xs text-gray-500">{t('gastosFijos.descripcion')} *</label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Ej. Renta local" autoFocus /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">{t('common.categoria')}</label>
            <Select value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))} options={categorias.map(c => ({ value: c, label: c }))} />
          </div>
          <div><label className="text-xs text-gray-500">{t('gastosFijos.monto')} *</label><Input type="number" min={0} step="any" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">{t('gastosFijos.diaVencimiento')}</label><Input type="number" min={1} max={31} value={form.due_day} onChange={e => setForm(f => ({ ...f, due_day: e.target.value }))} /></div>
          <CurrencySelect label={t('gastos.monedaGasto')} value={form.currency} onChange={v => setForm(f => ({ ...f, currency: v }))} />
        </div>
        <div>
          <label className="text-xs text-gray-500">{t('gastosFijos.vinculoProveedor')}</label>
          <SearchSelect value={form.supplier_id} onChange={v => setForm(f => ({ ...f, supplier_id: v }))}
            options={suppliers.map(p => ({ value: p.supplier_id, label: p.name }))}
            placeholder={t('inventario.sinProveedor')} />
        </div>
        <div><label className="text-xs text-gray-500">{t('gastosFijos.enlacePago')}</label><Input type="url" value={form.payment_link} onChange={e => setForm(f => ({ ...f, payment_link: e.target.value }))} placeholder="https://…" /></div>
        <div><label className="text-xs text-gray-500">{t('common.notas')}</label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
        <div><label className="text-xs text-gray-500">{t('common.estado')}</label>
          <Select value={form.active} onChange={v => setForm(f => ({ ...f, active: v }))}
            options={[{ value: 'true', label: t('gastosFijos.activo') }, { value: 'false', label: t('gastosFijos.inactivo') }]} />
        </div>
      </div>
    </Dialog>
  )
}

/** Registra el pago del mes de un gasto fijo como gasto normal (sale del bolsillo). */
export async function marcarPagado(gf: GastoFijo, saveExpense: (g: unknown) => Promise<unknown>, monedaBase: string): Promise<void> {
  await saveExpense({
    expense_id: undefined,
    date: todayLocal(),
    category: gf.category || 'Servicios',
    description: `${gf.description} (${todayLocal().slice(0, 7)})`,
    amount: Number(gf.amount),
    payment_method: 'Efectivo',
    supplier: gf.supplier_name || '',
    currency: gf.currency || monedaBase,
    exchange_rate: 0
  })
}
