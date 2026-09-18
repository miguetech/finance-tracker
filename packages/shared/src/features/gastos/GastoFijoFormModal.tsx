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
  const { saveGastoFijo } = useGastosFijos()
  const { data: categorias = [] } = useCategorias('gastos')
  const metodos = useMetodosPago()
  void metodos
  const { config } = useConfig()
  const { proveedores } = useProveedores()
  const toast = useToast()
  const [form, setForm] = useState({ descripcion: '', categoria: '', monto: '', moneda: '', due_day: '1', supplier_id: '', payment_link: '', notas: '', activo: 'true' })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (open) setForm(initial
      ? {
        descripcion: initial.descripcion,
        categoria: initial.categoria,
        monto: String(initial.monto),
        moneda: initial.moneda || '',
        due_day: String(initial.due_day || 1),
        supplier_id: initial.supplier_id || '',
        payment_link: initial.payment_link || '',
        notas: initial.notas || '',
        activo: initial.activo || 'true'
      }
      : { descripcion: '', categoria: categorias[0] ?? 'Renta', monto: '', moneda: config?.moneda ?? '', due_day: '1', supplier_id: '', payment_link: '', notas: '', activo: 'true' })
  }, [open, initial])

  const submit = async () => {
    setError('')
    if (!form.descripcion.trim()) { setError(t('gastos.llenaDescripcion')); return }
    if (!Number(form.monto) || Number(form.monto) <= 0) { setError(t('errors.montoMayorCero')); return }
    const dia = Math.max(1, Math.min(31, Number(form.due_day) || 1))
    setGuardando(true)
    try {
      const prov = proveedores.find(p => p.supplier_id === form.supplier_id)
      await saveGastoFijo.mutateAsync({
        ...(initial ?? {}),
        fixed_expense_id: initial?.fixed_expense_id || uid('gfx_'),
        descripcion: form.descripcion.trim(),
        categoria: form.categoria,
        monto: Number(form.monto),
        moneda: form.moneda || config?.moneda || '',
        due_day: dia,
        supplier_id: form.supplier_id,
        supplier_name: prov?.nombre || initial?.supplier_name || '',
        payment_link: form.payment_link.trim(),
        notas: form.notas,
        activo: form.activo
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
        <div><label className="text-xs text-gray-500">{t('gastosFijos.descripcion')} *</label><Input value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Ej. Renta local" autoFocus /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">{t('common.categoria')}</label>
            <Select value={form.categoria} onChange={v => setForm(f => ({ ...f, categoria: v }))} options={categorias.map(c => ({ value: c, label: c }))} />
          </div>
          <div><label className="text-xs text-gray-500">{t('gastosFijos.monto')} *</label><Input type="number" min={0} step="any" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">{t('gastosFijos.diaVencimiento')}</label><Input type="number" min={1} max={31} value={form.due_day} onChange={e => setForm(f => ({ ...f, due_day: e.target.value }))} /></div>
          <CurrencySelect label={t('gastos.monedaGasto')} value={form.moneda} onChange={v => setForm(f => ({ ...f, moneda: v }))} />
        </div>
        <div>
          <label className="text-xs text-gray-500">{t('gastosFijos.vinculoProveedor')}</label>
          <SearchSelect value={form.supplier_id} onChange={v => setForm(f => ({ ...f, supplier_id: v }))}
            options={proveedores.map(p => ({ value: p.supplier_id, label: p.nombre }))}
            placeholder={t('inventario.sinProveedor')} />
        </div>
        <div><label className="text-xs text-gray-500">{t('gastosFijos.enlacePago')}</label><Input type="url" value={form.payment_link} onChange={e => setForm(f => ({ ...f, payment_link: e.target.value }))} placeholder="https://…" /></div>
        <div><label className="text-xs text-gray-500">{t('common.notas')}</label><Textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} rows={2} /></div>
        <div><label className="text-xs text-gray-500">{t('common.estado')}</label>
          <Select value={form.activo} onChange={v => setForm(f => ({ ...f, activo: v }))}
            options={[{ value: 'true', label: t('gastosFijos.activo') }, { value: 'false', label: t('gastosFijos.inactivo') }]} />
        </div>
      </div>
    </Dialog>
  )
}

/** Registra el pago del mes de un gasto fijo como gasto normal (sale del bolsillo). */
export async function marcarPagado(gf: GastoFijo, saveGasto: (g: unknown) => Promise<unknown>, monedaBase: string): Promise<void> {
  await saveGasto({
    expense_id: undefined,
    fecha: todayLocal(),
    categoria: gf.categoria || 'Servicios',
    descripcion: `${gf.descripcion} (${todayLocal().slice(0, 7)})`,
    monto: Number(gf.monto),
    payment_method: 'Efectivo',
    proveedor: gf.supplier_name || '',
    moneda: gf.moneda || monedaBase,
    exchange_rate: 0
  })
}
