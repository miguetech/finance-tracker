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
  const { proveedores, saveProveedor } = useProveedores()
  const { saveProducto } = useProductos()
  const repo = useRepo()
  const toast = useToast()
  const [form, setForm] = useState({ nombre: '', categoria: '', unidad: 'pieza', stock: '', stock_minimo: '', moneda: '', precio_costo: '', precio_venta: '', id_proveedor: '', imagen: '', notas: '' })
  const [gananciaModo, setGananciaModo] = useState<'precio' | 'pct'>('pct')
  const [imagenFile, setImagenFile] = useState<File | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [nuevoProveedor, setNuevoProveedor] = useState(false)
  const [error, setError] = useState('')

  const unidades = (config?.unidades_medida ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const listaUnidades = unidades.length > 0 ? unidades : UNIDADES_DEFAULT
  const monedas = activeCurrencies(config)
  const monedaProducto = form.moneda || config?.moneda || 'USD'

  useEffect(() => {
    if (open) {
      setImagenFile(null)
      setNuevoProveedor(false)
      setForm(initial
        ? { nombre: initial.nombre, categoria: initial.categoria, unidad: initial.unidad || 'pieza', stock: String(initial.stock), stock_minimo: String(initial.stock_minimo), moneda: initial.moneda || config?.moneda || '', precio_costo: String(initial.precio_costo), precio_venta: String(initial.precio_venta), id_proveedor: initial.id_proveedor, imagen: initial.imagen, notas: initial.notas }
        : { nombre: '', categoria: '', unidad: listaUnidades[0] ?? 'pieza', stock: '0', stock_minimo: '', moneda: config?.moneda || '', precio_costo: '', precio_venta: '', id_proveedor: '', imagen: '', notas: '' })
    }
  }, [open, initial])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }))

  // Cálculo automático del precio o % de ganancia según la moneda seleccionada.
  const costo = Number(form.precio_costo) || 0
  const venta = Number(form.precio_venta) || 0
  const aplicarGananciaPct = (pct: number) => {
    const dec = getCurrency(monedaProducto).decimals
    const f = Math.pow(10, dec)
    const precio = Math.round(costo * (1 + pct / 100) * f) / f
    setForm(fm => ({ ...fm, precio_venta: String(precio) }))
    setGananciaModo('precio')
  }

  const submit = async () => {
    setError('')
    if (!form.nombre.trim()) { setError(t('errors.nombreObligatorio')); return }
    if (form.precio_costo.trim() !== '' && Number.isNaN(Number(form.precio_costo))) { setError(t('errors.costoInvalido')); return }
    if (form.precio_venta.trim() !== '' && Number.isNaN(Number(form.precio_venta))) { setError(t('errors.precioInvalido')); return }
    setSubiendo(true)
    try {
      let imagenUrl = form.imagen
      if (imagenFile) {
        const { base64, mimeType } = await optimizeImage(imagenFile)
        try {
          imagenUrl = await repo.uploadImagen({ nombre: `producto_${initial?.id_producto || uid('prod_')}.${mimeType.split('/')[1] || 'png'}`, mimeType, base64, modulo: 'inventario' })
        } catch {
          // Resiliencia: si Drive falla (permisos o sin conexión), se guarda la
          // imagen optimizada embebida para no perder el registro.
          imagenUrl = `data:${mimeType};base64,${base64}`
          toast(t('imagenes.subiendo') + ': local', 'error')
        }
      }
      const prov = proveedores.find(p => p.id_proveedor === form.id_proveedor)
      await saveProducto.mutateAsync({
        ...(initial as Producto | undefined),
        id_producto: initial?.id_producto || uid('prod_'),
        nombre: form.nombre.trim(),
        categoria: form.categoria,
        unidad: form.unidad,
        stock: Number(form.stock) || 0,
        stock_minimo: Number(form.stock_minimo) || 0,
        moneda: monedaProducto,
        precio_costo: form.precio_costo.trim() === '' ? 0 : Number(form.precio_costo),
        precio_venta: form.precio_venta.trim() === '' ? 0 : Number(form.precio_venta),
        id_proveedor: form.id_proveedor,
        nombre_proveedor: prov?.nombre || '',
        imagen: imagenUrl,
        notas: form.notas,
        activo: initial?.activo || 'true',
        fecha_registro: initial?.fecha_registro || todayLocal()
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
            <ImageUploader value={form.imagen} onChange={f => setImagenFile(f)} disabled={subiendo} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><label className="text-xs text-gray-500">{t('common.nombre')} *</label><Input value={form.nombre} onChange={set('nombre')} placeholder={t('inventario.ejNombre')} /></div>
          <div>
            <label className="text-xs text-gray-500">{t('common.categoria')}</label>
            <CategoriaQuickSelect configKey="categorias_inventario" value={form.categoria} onChange={v => setForm(f => ({ ...f, categoria: v }))} />
          </div>
          <div>
            <label className="text-xs text-gray-500">{t('inventario.unidad')}</label>
            <Select value={form.unidad} onChange={v => setForm(f => ({ ...f, unidad: v }))}
              options={[...new Set([...listaUnidades, form.unidad].filter(Boolean))].map(u => ({ value: u, label: u }))} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">{t('inventario.stockActual')}</label><Input type="number" min={0} value={form.stock} onChange={set('stock')} /></div>
          <div><label className="text-xs text-gray-500">{t('inventario.stockMinimoAlerta')}</label><Input type="number" min={0} value={form.stock_minimo} onChange={set('stock_minimo')} placeholder={t('inventario.ej5')} /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500">{t('inventario.monedaCotizacion')}</label>
            <Select value={monedaProducto} onChange={v => setForm(f => ({ ...f, moneda: v }))}
              options={[...new Set([config?.moneda || 'USD', ...monedas.map(c => c.code), monedaProducto].filter(Boolean))].map(c => {
                const cur = getCurrency(c)
                return { value: c, label: `${cur.code} · ${cur.symbol}` }
              })} />
          </div>
          <div className="sm:self-end"><label className="text-xs text-gray-500 opacity-0 select-none">.</label>
            <p className="text-xs text-muted-foreground -mt-1">{t('inventario.monedaCotizacionAyuda')}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">{t('inventario.costoCompra')} ({getCurrency(monedaProducto).symbol})</label><Input type="number" min={0} step="any" value={form.precio_costo} onChange={set('precio_costo')} placeholder={t('inventario.ejCosto')} /></div>
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
                  <Input type="number" min={0} step="any" value={form.precio_venta}
                    onChange={e => setForm(f => ({ ...f, precio_venta: e.target.value }))}
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
              <Input type="number" min={0} step="any" value={form.precio_venta} onChange={set('precio_venta')}
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
            <QuickProveedor onCreated={(id) => { setForm(f => ({ ...f, id_proveedor: id })); setNuevoProveedor(false) }} onCancel={() => setNuevoProveedor(false)}
              guardar={saveProveedor.mutateAsync.bind(saveProveedor)} />
          ) : (
            <SearchSelect value={form.id_proveedor} onChange={v => setForm(f => ({ ...f, id_proveedor: v }))}
              options={proveedores.map(p => ({ value: p.id_proveedor, label: p.nombre }))}
              placeholder={t('inventario.sinProveedor')} />
          )}
        </div>
        <div><label className="text-xs text-gray-500">{t('common.notas')}</label><Textarea value={form.notas} onChange={set('notas')} rows={3} /></div>
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
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [err, setErr] = useState('')
  const [guardando, setGuardando] = useState(false)
  const submit = async () => {
    setErr('')
    if (!nombre.trim()) { setErr(t('errors.nombreObligatorio')); return }
    setGuardando(true)
    try {
      const saved = await guardar({ id_proveedor: uid('prov_'), nombre: nombre.trim(), rfc: '', email: '', telefono: telefono.trim(), direccion: '', fecha_registro: todayLocal() })
      toast(t('proveedores.creadoSeleccionado'))
      onCreated(saved.id_proveedor)
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
      <Input value={nombre} onChange={e => setNombre(e.target.value)} placeholder={`${t('common.nombre')} *`} autoFocus />
      <Input value={telefono} onChange={e => setTelefono(e.target.value)} placeholder={t('inventario.telefonoContactar')} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={guardando}>{t('common.cancelar')}</Button>
        <Button size="sm" onClick={submit} disabled={guardando}>{guardando ? t('imagenes.subiendo') : t('proveedores.guardar')}</Button>
      </div>
    </div>
  )
}

interface ProveedorInput {
  id_proveedor: string
  nombre: string
  rfc: string
  email: string
  telefono: string
  direccion: string
  fecha_registro: string
}
