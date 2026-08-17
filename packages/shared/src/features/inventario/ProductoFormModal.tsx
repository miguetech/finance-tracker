import React, { useEffect, useState } from 'react'
import { todayLocal } from '../../lib/date'
import { Dialog, Button, Input, Select } from '../../ui/components'
import { useToast } from '../../ui/components'
import { useConfig, useProveedores, useProductos } from '../../store/queries'
import { IconPlus } from '../../ui/icons'
import { useI18n } from '../../i18n'
import type { Producto } from '../../types/entities'
import { uid } from '../../lib/uid'

const UNIDADES = ['pieza', 'kg', 'gr', 'litro', 'ml', 'caja', 'saco', 'docena', 'metro']

export function ProductoFormModal({ open, onClose, initial, onSaved }: { open: boolean; onClose: () => void; initial: Producto | null; onSaved?: () => void }) {
  const { t } = useI18n()
  const { config } = useConfig()
  const { proveedores } = useProveedores()
  const { saveProducto } = useProductos()
  const toast = useToast()
  const [form, setForm] = useState({ nombre: '', categoria: '', unidad: 'pieza', stock: '', stock_minimo: '', precio_costo: '', precio_venta: '', id_proveedor: '', notas: '' })
  const [nuevoProveedor, setNuevoProveedor] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) setForm(initial
      ? { nombre: initial.nombre, categoria: initial.categoria, unidad: initial.unidad || 'pieza', stock: String(initial.stock), stock_minimo: String(initial.stock_minimo), precio_costo: String(initial.precio_costo), precio_venta: String(initial.precio_venta), id_proveedor: initial.id_proveedor, notas: initial.notas }
      : { nombre: '', categoria: '', unidad: 'pieza', stock: '0', stock_minimo: '', precio_costo: '', precio_venta: '', id_proveedor: '', notas: '' })
  }, [open, initial])

  const categorias = (config?.categorias_inventario ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = async () => {
    setError('')
    if (!form.nombre.trim()) { setError(t('errors.nombreObligatorio')); return }
    if (form.precio_costo.trim() !== '' && Number.isNaN(Number(form.precio_costo))) { setError(t('errors.costoInvalido')); return }
    if (form.precio_venta.trim() !== '' && Number.isNaN(Number(form.precio_venta))) { setError(t('errors.precioInvalido')); return }
    try {
      const prov = proveedores.find(p => p.id_proveedor === form.id_proveedor)
      await saveProducto.mutateAsync({
        ...(initial as Producto | undefined),
        id_producto: initial?.id_producto || uid('prod_'),
        nombre: form.nombre.trim(),
        categoria: form.categoria,
        unidad: form.unidad,
        stock: Number(form.stock) || 0,
        stock_minimo: Number(form.stock_minimo) || 0,
        precio_costo: form.precio_costo.trim() === '' ? 0 : Number(form.precio_costo),
        precio_venta: form.precio_venta.trim() === '' ? 0 : Number(form.precio_venta),
        id_proveedor: form.id_proveedor,
        nombre_proveedor: prov?.nombre || '',
        notas: form.notas,
        activo: initial?.activo || 'true',
        fecha_registro: initial?.fecha_registro || todayLocal()
      } as Producto)
      toast(initial ? t('inventario.guardado') : t('inventario.registrado'))
      onSaved?.()
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={initial ? t('inventario.editar') : t('inventario.nuevo')}
      footer={<><Button variant="outline" onClick={onClose}>{t('common.cancelar')}</Button><Button onClick={submit}>{t('common.guardar')}</Button></>}>
      <div className="space-y-3">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><label className="text-xs text-gray-500">{t('common.nombre')} *</label><Input value={form.nombre} onChange={set('nombre')} placeholder={t('inventario.ejNombre')} /></div>
          <div>
            <label className="text-xs text-gray-500">{t('common.categoria')}</label>
            <Select value={form.categoria} onChange={v => setForm(f => ({ ...f, categoria: v }))}
              options={[{ value: '', label: t('inventario.sinCategoria') }, ...categorias.map(c => ({ value: c, label: c }))]} />
          </div>
          <div>
            <label className="text-xs text-gray-500">{t('inventario.unidad')}</label>
            <Select value={form.unidad} onChange={v => setForm(f => ({ ...f, unidad: v }))}
              options={UNIDADES.map(u => ({ value: u, label: u }))} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">{t('inventario.stockActual')}</label><Input type="number" min={0} value={form.stock} onChange={set('stock')} /></div>
          <div><label className="text-xs text-gray-500">{t('inventario.stockMinimoAlerta')}</label><Input type="number" min={0} value={form.stock_minimo} onChange={set('stock_minimo')} placeholder={t('inventario.ej5')} /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">{t('inventario.costoCompra')}</label><Input type="number" min={0} value={form.precio_costo} onChange={set('precio_costo')} placeholder={t('inventario.ejCosto')} /></div>
          <div><label className="text-xs text-gray-500">{t('inventario.precioVentaLabel')}</label><Input type="number" min={0} value={form.precio_venta} onChange={set('precio_venta')} placeholder={t('inventario.ejVenta')} /></div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-500">{t('inventario.proveedorPedir')}</label>
            {!nuevoProveedor && (
              <button type="button" onClick={() => setNuevoProveedor(true)} className="inline-flex items-center gap-0.5 text-xs text-primary underline decoration-dotted underline-offset-2 hover:text-primary-hover">
                <IconPlus className="w-3.5 h-3.5" /> {t('proveedores.nuevo')}
              </button>
            )}
          </div>
          {nuevoProveedor ? (
            <QuickProveedor onDone={() => setNuevoProveedor(false)} />
          ) : (
            <Select value={form.id_proveedor} onChange={v => setForm(f => ({ ...f, id_proveedor: v }))}
              options={proveedores.map(p => ({ value: p.id_proveedor, label: p.nombre }))} placeholder={t('inventario.sinProveedor')} />
          )}
        </div>
        <div><label className="text-xs text-gray-500">{t('common.notas')}</label><Input value={form.notas} onChange={set('notas')} /></div>
      </div>
    </Dialog>
  )
}

function QuickProveedor({ onDone }: { onDone: () => void }) {
  const { t } = useI18n()
  const { saveProveedor } = useProveedores()
  const toast = useToast()
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [err, setErr] = useState('')
  const submit = async () => {
    setErr('')
    if (!nombre.trim()) { setErr(t('errors.nombreObligatorio')); return }
    try {
      await saveProveedor.mutateAsync({ id_proveedor: uid('prov_'), nombre: nombre.trim(), rfc: '', email: '', telefono: telefono.trim(), direccion: '', fecha_registro: todayLocal() })
      toast(t('proveedores.creado'))
      onDone()
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  return (
    <div className="space-y-2 rounded-lg border border-primary/20 bg-primary-soft/30 p-3">
      <div className="text-xs font-medium text-primary">{t('proveedores.proveedorNuevo')}</div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <Input value={nombre} onChange={e => setNombre(e.target.value)} placeholder={`${t('common.nombre')} *`} autoFocus />
      <Input value={telefono} onChange={e => setTelefono(e.target.value)} placeholder={t('inventario.telefonoContactar')} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone}>{t('common.cancelar')}</Button>
        <Button size="sm" onClick={submit}>{t('proveedores.guardar')}</Button>
      </div>
    </div>
  )
}
