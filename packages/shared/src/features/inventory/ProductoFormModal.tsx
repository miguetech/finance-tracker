import React, { useEffect, useState } from 'react'
import { todayLocal } from '../../lib/date'
import { Dialog, Button, Input, Select, SearchSelect, Textarea, Badge } from '../../ui/components'
import { useToast } from '../../ui/components'
import { CategoriaQuickSelect } from '../../ui/CategoriaSelect'
import { useConfig, useProveedores, useProductos, useRepo } from '../../store/queries'
import { ImageUploader } from '../../ui/ImageUploader'
import { IconPlus } from '../../ui/icons'
import { useI18n } from '../../i18n'
import { optimizeImage } from '../../lib/image'
import type { Producto } from '../../types/entities'
import { uid } from '../../lib/uid'
import { getCurrency, activeCurrencies } from '../../currency'

const UNIDADES_DEFAULT = ['pieza', 'kg', 'gr', 'litro', 'ml', 'caja', 'saco', 'docena', 'metro']

export function ProductoFormModal({ open, onClose, initial, onSaved }: { open: boolean; onClose: () => void; initial: Producto | null; onSaved?: () => void }) {
  const { t } = useI18n()
  const { config } = useConfig()
  const { suppliers, saveSupplier } = useProveedores()
  const { saveProduct } = useProductos()
  const repo = useRepo()
  const toast = useToast()
  const [form, setForm] = useState({ name: '', category: '', unit: 'pieza', stock: '', minimum_stock: '', currency: '', cost_price: '', sale_price: '', supplier_id: '', image: '', notes: '' })
  const [gananciaModo, setGananciaModo] = useState<'precio' | 'pct'>('pct')
  const [imagenFile, setImagenFile] = useState<File | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [nuevoProveedor, setNuevoProveedor] = useState(false)
  const [error, setError] = useState('')

  const unidades = (config?.measure_units ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const listaUnidades = unidades.length > 0 ? unidades : UNIDADES_DEFAULT
  const monedas = activeCurrencies(config)
  const monedaProducto = form.currency || config?.currency || 'USD'

  useEffect(() => {
    if (open) {
      setImagenFile(null)
      setNuevoProveedor(false)
      setForm(initial
        ? { name: initial.name, category: initial.category, unit: initial.unit || 'pieza', stock: String(initial.stock), minimum_stock: String(initial.minimum_stock), currency: initial.currency || config?.currency || '', cost_price: String(initial.cost_price), sale_price: String(initial.sale_price), supplier_id: initial.supplier_id, image: initial.image, notes: initial.notes }
        : { name: '', category: '', unit: listaUnidades[0] ?? 'pieza', stock: '0', minimum_stock: '', currency: config?.currency || '', cost_price: '', sale_price: '', supplier_id: '', image: '', notes: '' })
    }
  }, [open, initial])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }))

  // Cálculo automático del precio o % de ganancia según la currency seleccionada.
  const costo = Number(form.cost_price) || 0
  const venta = Number(form.sale_price) || 0
  const aplicarGananciaPct = (pct: number) => {
    const dec = getCurrency(monedaProducto).decimals
    const f = Math.pow(10, dec)
    const precio = Math.round(costo * (1 + pct / 100) * f) / f
    setForm(fm => ({ ...fm, sale_price: String(precio) }))
    setGananciaModo('precio')
  }

  const submit = async () => {
    setError('')
    if (!form.name.trim()) { setError(t('errors.nombreObligatorio')); return }
    if (form.cost_price.trim() !== '' && Number.isNaN(Number(form.cost_price))) { setError(t('errors.costoInvalido')); return }
    if (form.sale_price.trim() !== '' && Number.isNaN(Number(form.sale_price))) { setError(t('errors.precioInvalido')); return }
    setSubiendo(true)
    try {
      let imagenUrl = form.image
      if (imagenFile) {
        const { base64, mimeType } = await optimizeImage(imagenFile)
        try {
          imagenUrl = await repo.uploadImage({ name: `producto_${initial?.product_id || uid('prod_')}.${mimeType.split('/')[1] || 'png'}`, mimeType, base64, modulo: 'inventory' })
        } catch {
          // Resiliencia: si Drive falla (permisos o sin conexión), se guarda la
          // image optimizada embebida para no perder el registro.
          imagenUrl = `data:${mimeType};base64,${base64}`
          toast(t('imagenes.subiendo') + ': local', 'error')
        }
      }
      const prov = suppliers.find(p => p.supplier_id === form.supplier_id)
      await saveProduct.mutateAsync({
        ...(initial as Producto | undefined),
        product_id: initial?.product_id || uid('prod_'),
        name: form.name.trim(),
        category: form.category,
        unit: form.unit,
        stock: Number(form.stock) || 0,
        minimum_stock: Number(form.minimum_stock) || 0,
        currency: monedaProducto,
        cost_price: form.cost_price.trim() === '' ? 0 : Number(form.cost_price),
        sale_price: form.sale_price.trim() === '' ? 0 : Number(form.sale_price),
        supplier_id: form.supplier_id,
        supplier_name: prov?.name || '',
        image: imagenUrl,
        notes: form.notes,
        active: initial?.active || 'true',
        created_at: initial?.created_at || todayLocal()
      } as Producto)
      toast(initial ? t('inventario.guardado') : t('inventario.registrado'))
      onSaved?.()
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={initial ? t('inventario.editar') : t('inventario.nuevo')}
      footer={<><Button variant="outline" onClick={onClose} disabled={subiendo}>{t('common.cancelar')}</Button>
        <Button onClick={submit} disabled={subiendo}>{subiendo ? t('imagenes.subiendo') : t('common.guardar')}</Button></>}>
      <div className="space-y-3">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div>
          <label className="text-xs text-gray-500">{t('inventario.imagen')}</label>
          <div className="mt-1">
            <ImageUploader value={form.image} onChange={f => setImagenFile(f)} disabled={subiendo} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><label className="text-xs text-gray-500">{t('common.nombre')} *</label><Input value={form.name} onChange={set('nombre')} placeholder={t('inventario.ejNombre')} /></div>
          <div>
            <label className="text-xs text-gray-500">{t('common.categoria')}</label>
            <CategoriaQuickSelect configKey="inventory_categories" value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))} />
          </div>
          <div>
            <label className="text-xs text-gray-500">{t('inventario.unidad')}</label>
            <Select value={form.unit} onChange={v => setForm(f => ({ ...f, unit: v }))}
              options={[...new Set([...listaUnidades, form.unit].filter(Boolean))].map(u => ({ value: u, label: u }))} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">{t('inventario.stockActual')}</label><Input type="number" min={0} value={form.stock} onChange={set('stock')} /></div>
          <div><label className="text-xs text-gray-500">{t('inventario.stockMinimoAlerta')}</label><Input type="number" min={0} value={form.minimum_stock} onChange={set('minimum_stock')} placeholder={t('inventario.ej5')} /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500">{t('inventario.monedaCotizacion')}</label>
            <Select value={monedaProducto} onChange={v => setForm(f => ({ ...f, currency: v }))}
              options={[...new Set([config?.currency || 'USD', ...monedas.map(c => c.code), monedaProducto].filter(Boolean))].map(c => {
                const cur = getCurrency(c)
                return { value: c, label: `${cur.code} · ${cur.symbol}` }
              })} />
          </div>
          <div className="sm:self-end"><label className="text-xs text-gray-500 opacity-0 select-none">.</label>
            <p className="text-xs text-muted-foreground -mt-1">{t('inventario.monedaCotizacionAyuda')}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">{t('inventario.costoCompra')} ({getCurrency(monedaProducto).symbol})</label><Input type="number" min={0} step="any" value={form.cost_price} onChange={set('cost_price')} placeholder={t('inventario.ejCosto')} /></div>
          <div>
            <label className="text-xs text-gray-500 flex items-center justify-between">
              <span>{t('inventario.precioVentaLabel')}</span>
              <button type="button" onClick={() => setGananciaModo(m => m === 'pct' ? 'precio' : 'pct')}
                className="text-primary underline decoration-dotted underline-offset-2">
                {gananciaModo === 'pct' ? '% →' + monedaProducto : monedaProducto + ' → %'}
              </button>
            </label>
            {gananciaModo === 'pct' ? (
              <div className="flex gap-1.5 items-center">
                <div className="relative flex-1">
                  <Input type="number" min={0} step="any" value={form.sale_price}
                    onChange={e => setForm(f => ({ ...f, sale_price: e.target.value }))}
                    placeholder={`${t('inventario.ejVenta')} (${monedaProducto})`} />
                </div>
                {costo > 0 && (
                  <>
                    <button type="button" onClick={() => aplicarGananciaPct(30)} title="+30%">
                      <Badge tone="blue">+30%</Badge>
                    </button>
                    <button type="button" onClick={() => aplicarGananciaPct(50)} title="+50%">
                      <Badge tone="green">+50%</Badge>
                    </button>
                  </>
                )}
              </div>
            ) : (
              <Input type="number" min={0} step="any" value={form.sale_price} onChange={set('sale_price')}
                placeholder={`${t('inventario.ejVenta')} (${monedaProducto})`} />
            )}
            {costo > 0 && venta > 0 && (
              <p className={`mt-1 text-xs ${venta >= costo ? 'text-emerald-700' : 'text-danger'}`}>
                {t('inventario.ganancia')}: {(venta - costo).toLocaleString()} {monedaProducto}
                {costo > 0 && ` · ${Math.round(((venta - costo) / costo) * 1000) / 10}%`}
              </p>
            )}
          </div>
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
            <QuickProveedor onCreated={(id) => { setForm(f => ({ ...f, supplier_id: id })); setNuevoProveedor(false) }} onCancel={() => setNuevoProveedor(false)}
              guardar={saveSupplier.mutateAsync.bind(saveSupplier)} />
          ) : (
            <SearchSelect value={form.supplier_id} onChange={v => setForm(f => ({ ...f, supplier_id: v }))}
              options={suppliers.map(p => ({ value: p.supplier_id, label: p.name }))}
              placeholder={t('inventario.sinProveedor')} />
          )}
        </div>
        <div><label className="text-xs text-gray-500">{t('common.notas')}</label><Textarea value={form.notes} onChange={set('notas')} rows={3} /></div>
      </div>
    </Dialog>
  )
}

/** Alta rápida de proveedor desde el selector; al crear queda seleccionado por defecto. */
function QuickProveedor({ onCreated, onCancel, guardar }: {
  onCreated: (id: string) => void
  onCancel: () => void
  guardar: (p: ProveedorInput) => Promise<ProveedorInput>
}) {
  const { t } = useI18n()
  const toast = useToast()
  const [name, setNombre] = useState('')
  const [phone, setTelefono] = useState('')
  const [err, setErr] = useState('')
  const [guardando, setGuardando] = useState(false)
  const submit = async () => {
    setErr('')
    if (!name.trim()) { setErr(t('errors.nombreObligatorio')); return }
    setGuardando(true)
    try {
      const saved = await guardar({ supplier_id: uid('prov_'), name: name.trim(), rfc: '', email: '', phone: phone.trim(), address: '', created_at: todayLocal() })
      toast(t('proveedores.creadoSeleccionado'))
      onCreated(saved.supplier_id)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }
  return (
    <div className="space-y-2 rounded-lg border border-primary/20 bg-primary-soft/30 p-3">
      <div className="text-xs font-medium text-primary">{t('proveedores.proveedorNuevo')}</div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <Input value={name} onChange={e => setNombre(e.target.value)} placeholder={`${t('common.nombre')} *`} autoFocus />
      <Input value={phone} onChange={e => setTelefono(e.target.value)} placeholder={t('inventario.telefonoContactar')} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={guardando}>{t('common.cancelar')}</Button>
        <Button size="sm" onClick={submit} disabled={guardando}>{guardando ? t('imagenes.subiendo') : t('proveedores.guardar')}</Button>
      </div>
    </div>
  )
}

interface ProveedorInput {
  supplier_id: string
  name: string
  rfc: string
  email: string
  phone: string
  address: string
  created_at: string
}
