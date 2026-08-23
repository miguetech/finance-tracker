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
  const { saveGasto } = useGastos()
  const metodos = useMetodosPago()
  const toast = useToast()
  const [form, setForm] = useState({ fecha: todayLocal(), categoria: '', descripcion: '', monto: '', metodo_pago: 'Efectivo', proveedor: '', moneda: '' })
  useEffect(() => {
    if (open) setForm(initial ? { ...initial, monto: String(initial.monto) } : { fecha: todayLocal(), categoria: '', descripcion: '', monto: '', metodo_pago: 'Efectivo', proveedor: '', moneda: '' })
  }, [open, initial])
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  const setCategoria = (v: string) => setForm(f => ({
    ...f,
    categoria: v,
    // Si solo se eligió la categoría (ej. "Renta"), la descripción se rellena sola.
    descripcion: f.descripcion.trim() === '' ? v : f.descripcion
  }))
  const submit = async () => {
    if (!form.categoria.trim()) { toast(t('gastos.seleccionaCategoria'), 'error'); return }
    if (!form.descripcion.trim()) { toast(t('gastos.llenaDescripcion'), 'error'); return }
    const montoNum = Number(form.monto)
    if (!Number.isFinite(montoNum) || montoNum <= 0) { toast(t('errors.montoMayorCero'), 'error'); return }
    try {
      await saveGasto.mutateAsync({ ...(initial ?? {}), ...form, monto: montoNum } as Gasto)
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
          <div><label className="text-xs text-gray-500">{t('common.fecha')}</label><Input type="date" value={form.fecha} onChange={set('fecha')} /></div>
          <div><label className="text-xs text-gray-500">{t('common.categoria')}</label>
            <CategoriaQuickSelect configKey="categorias_gastos" value={form.categoria} onChange={setCategoria} />
          </div>
        </div>
        <div><label className="text-xs text-gray-500">{t('gastos.descripcion')} *</label><Input value={form.descripcion} onChange={set('descripcion')} /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">{t('common.monto')} *</label><Input type="number" value={form.monto} onChange={set('monto')} /></div>
          <div><label className="text-xs text-gray-500">{t('common.metodo')}</label>
            <Select value={form.metodo_pago} onChange={v => setForm(f => ({ ...f, metodo_pago: v }))} options={metodos.map(v => ({ value: v, label: v }))} />
          </div>
        </div>
        <CurrencySelect label={t('gastos.monedaGasto')} value={form.moneda} onChange={v => setForm(f => ({ ...f, moneda: v }))} />
        <div><label className="text-xs text-gray-500">{t('gastos.proveedor')}</label><Input value={form.proveedor} onChange={set('proveedor')} /></div>
      </div>
    </Dialog>
  )
}
