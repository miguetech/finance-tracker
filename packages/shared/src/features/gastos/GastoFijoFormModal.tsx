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
  const [form, setForm] = useState({ descripcion: '', categoria: '', monto: '', moneda: '', dia_vencimiento: '1', id_proveedor: '', enlace_pago: '', notas: '', activo: 'true' })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (open) setForm(initial
      ? {
        descripcion: initial.descripcion,
        categoria: initial.categoria,
        monto: String(initial.monto),
        moneda: initial.moneda || '',
        dia_vencimiento: String(initial.dia_vencimiento || 1),
        id_proveedor: initial.id_proveedor || '',
        enlace_pago: initial.enlace_pago || '',
        notas: initial.notas || '',
        activo: initial.activo || 'true'
      }
      : { descripcion: '', categoria: categorias[0] ?? 'Renta', monto: '', moneda: config?.moneda ?? '', dia_vencimiento: '1', id_proveedor: '', enlace_pago: '', notas: '', activo: 'true' })
  }, [open, initial])

  const submit = async () => {
    setError('')
    if (!form.descripcion.trim()) { setError(t('gastos.llenaDescripcion')); return }
    if (!Number(form.monto) || Number(form.monto) <= 0) { setError(t('errors.montoMayorCero')); return }
    const dia = Math.max(1, Math.min(31, Number(form.dia_vencimiento) || 1))
    setGuardando(true)
    try {
      const prov = proveedores.find(p => p.id_proveedor === form.id_proveedor)
      await saveGastoFijo.mutateAsync({
        ...(initial ?? {}),
        id_gasto_fijo: initial?.id_gasto_fijo || uid('gfx_'),
        descripcion: form.descripcion.trim(),
        categoria: form.categoria,
        monto: Number(form.monto),
        moneda: form.moneda || config?.moneda || '',
        dia_vencimiento: dia,
        id_proveedor: form.id_proveedor,
        nombre_proveedor: prov?.nombre || initial?.nombre_proveedor || '',
        enlace_pago: form.enlace_pago.trim(),
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
          <div><label className="text-xs text-gray-500">{t('gastosFijos.diaVencimiento')}</label><Input type="number" min={1} max={31} value={form.dia_vencimiento} onChange={e => setForm(f => ({ ...f, dia_vencimiento: e.target.value }))} /></div>
          <CurrencySelect label={t('gastos.monedaGasto')} value={form.moneda} onChange={v => setForm(f => ({ ...f, moneda: v }))} />
        </div>
        <div>
          <label className="text-xs text-gray-500">{t('gastosFijos.vinculoProveedor')}</label>
          <SearchSelect value={form.id_proveedor} onChange={v => setForm(f => ({ ...f, id_proveedor: v }))}
            options={proveedores.map(p => ({ value: p.id_proveedor, label: p.nombre }))}
            placeholder={t('inventario.sinProveedor')} />
        </div>
        <div><label className="text-xs text-gray-500">{t('gastosFijos.enlacePago')}</label><Input type="url" value={form.enlace_pago} onChange={e => setForm(f => ({ ...f, enlace_pago: e.target.value }))} placeholder="https://…" /></div>
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
    id_gasto: undefined,
    fecha: todayLocal(),
    categoria: gf.categoria || 'Servicios',
    descripcion: `${gf.descripcion} (${todayLocal().slice(0, 7)})`,
    monto: Number(gf.monto),
    metodo_pago: 'Efectivo',
    proveedor: gf.nombre_proveedor || '',
    moneda: gf.moneda || monedaBase,
    tipo_cambio: 0
  })
}
