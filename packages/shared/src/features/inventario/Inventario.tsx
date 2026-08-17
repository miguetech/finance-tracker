import React, { useMemo, useState } from 'react'
import { useProductos, useProveedores, useConfig, useMovimientos } from '../../store/queries'
import { Table, Button, Badge, ConfirmDialog, Dialog, Input } from '../../ui/components'
import { useToast } from '../../ui/components'
import { usePerms } from '../../store/perms'
import { formatMoney } from '../../currency'
import { stockLevel, StockBadge } from '../../ui/StockBadge'
import { useI18n } from '../../i18n'
import { IconPlus, IconEdit, IconTrash, IconPhone, IconHistory, IconBox, IconSearch } from '../../ui/icons'
import { ProductoFormModal } from './ProductoFormModal'
import { MovimientoModal } from './MovimientoModal'
import type { Producto } from '../../types/entities'
import type { MessageKey } from '../../i18n/locales/types'

const TIPO_KEY: Record<string, MessageKey> = { entrada: 'inventario.tipoEntrada', salida: 'inventario.tipoSalida', ajuste: 'inventario.tipoAjuste' }
const TIPO_TONE: Record<string, 'green' | 'red' | 'yellow'> = { entrada: 'green', salida: 'red', ajuste: 'yellow' }

export function Inventario() {
  const { t } = useI18n()
  const { productos, deleteProducto } = useProductos()
  const { proveedores } = useProveedores()
  const { config } = useConfig()
  const { canEdit, isAdmin } = usePerms()
  const toast = useToast()
  const [formOpen, setFormOpen] = useState(false)
  const [editando, setEditando] = useState<Producto | null>(null)
  const [movimientoDe, setMovimientoDe] = useState<Producto | null>(null)
  const [movimientosDe, setMovimientosDe] = useState<Producto | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [soloAlertas, setSoloAlertas] = useState(false)

  const moneda = config?.moneda ?? 'USD'
  const provMap = useMemo(() => new Map(proveedores.map(p => [p.id_proveedor, p])), [proveedores])

  const filtr = productos.filter(p => {
    if (String(p.activo) === 'false' && soloAlertas) return false
    const matches = !busqueda.trim() || p.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()) || p.categoria.toLowerCase().includes(busqueda.trim().toLowerCase())
    if (!matches) return false
    if (soloAlertas) return stockLevel(Number(p.stock), Number(p.stock_minimo)) !== 'ok'
    return true
  })

  const alertas = productos.filter(p => stockLevel(Number(p.stock), Number(p.stock_minimo)) !== 'ok' && String(p.activo) !== 'false')

  const llamarProveedor = (idProveedor: string) => {
    const prov = provMap.get(idProveedor)
    const tel = (prov?.telefono ?? '').replace(/\s+/g, '')
    if (!tel) { toast(t('inventario.proveedorSinTelefono'), 'error'); return }
    if (navigator.clipboard) navigator.clipboard.writeText(tel)
    toast(t('inventario.telefonoCon', { telefono: prov?.telefono ?? '' }))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{t('inventario.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('inventario.subtitulo')}</p>
        </div>
        <div className="flex gap-2">
          {canEdit('inventario') && <Button icon={<IconPlus className="w-4 h-4" />} onClick={() => { setEditando(null); setFormOpen(true) }}>{t('inventario.nuevo')}</Button>}
        </div>
      </div>

      {alertas.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="font-semibold text-red-700 mb-2 flex items-center gap-2"><IconBox className="w-4 h-4" /> {alertas.length} {t('dashboard.conStockBajo')}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {alertas.map(p => {
              const prov = provMap.get(String(p.id_proveedor))
              return (
                <div key={p.id_producto} className="flex items-center justify-between gap-2 rounded-lg bg-white border border-red-100 px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium">{p.nombre} <StockBadge stock={Number(p.stock)} minimo={Number(p.stock_minimo)} /></div>
                    <div className="text-xs text-gray-500">{t('dashboard.quedan')} {p.stock} {p.unidad || 'pieza'} · {t('inventario.minimo')} {p.stock_minimo}</div>
                    {prov && <div className="text-xs text-gray-500">{prov.nombre}</div>}
                  </div>
                  {prov && (
                    <Button size="sm" icon={<IconPhone className="w-4 h-4" />} onClick={() => llamarProveedor(String(p.id_proveedor))}>{t('inventario.pedir')}</Button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder={t('inventario.buscarPlaceholder')} />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><IconSearch className="w-4 h-4" /></span>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={soloAlertas} onChange={e => setSoloAlertas(e.target.checked)} />
          {t('inventario.soloAlertas')}
        </label>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-card overflow-hidden">
        <Table columns={[
          { key: 'nombre', header: t('inventario.producto'), render: r => (
            <div>
              <div className="font-medium">{String(r.nombre)}</div>
              <div className="text-xs text-gray-500">{[String(r.categoria), String(r.unidad)].filter(Boolean).join(' · ')}</div>
            </div>
          ) },
          { key: 'stock', header: t('inventario.stock'), render: r => <span className="inline-flex items-center gap-2"><b>{String(r.stock)}</b> <StockBadge stock={Number(r.stock)} minimo={Number(r.stock_minimo)} /></span> },
          { key: 'costo', header: t('inventario.precioCosto'), render: r => formatMoney(Number(r.precio_costo), moneda) },
          { key: 'venta', header: t('inventario.precioVenta'), render: r => formatMoney(Number(r.precio_venta), moneda) },
          { key: 'gan', header: t('inventario.ganancia'), render: r => {
            const g = Number(r.precio_venta) - Number(r.precio_costo)
            return <span className={g < 0 ? 'text-red-600' : 'text-emerald-700'}>{formatMoney(g, moneda)}</span>
          } },
          { key: 'prov', header: t('inventario.proveedor'), render: r => {
            const prov = provMap.get(String(r.id_proveedor))
            return prov ? (
              <div className="flex items-center gap-2">
                <span>{prov.nombre}</span>
                {prov.telefono && (
                  <button onClick={() => llamarProveedor(String(r.id_proveedor))} title={t('inventario.copiarTelefono')} aria-label={t('inventario.copiarTelefono')}
                    className="p-1.5 rounded-lg text-primary hover:bg-primary-soft">
                    <IconPhone className="w-4 h-4" />
                  </button>
                )}
              </div>
            ) : <span className="text-gray-400">—</span>
          } },
          { key: 'acciones', header: '', render: r => (
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" icon={<IconHistory className="w-4 h-4" />} onClick={() => setMovimientosDe(r as unknown as Producto)}>{t('inventario.historial')}</Button>
              {canEdit('inventario') && <Button variant="outline" size="sm" onClick={() => setMovimientoDe(r as unknown as Producto)}>{t('inventario.entradaSalida')}</Button>}
              {isAdmin && <Button variant="ghost" size="sm" icon={<IconEdit className="w-4 h-4" />} onClick={() => { setEditando(r as unknown as Producto); setFormOpen(true) }}>{t('common.editar')}</Button>}
              {isAdmin && <Button variant="ghost" size="sm" icon={<IconTrash className="w-4 h-4" />} onClick={() => setDeleteId(String(r.id_producto))} />}
            </div>
          ) }
        ]} rows={filtr as unknown as Record<string, unknown>[]} />
        {filtr.length === 0 && <p className="p-4 text-sm text-gray-500">{productos.length === 0 ? t('inventario.sinProductos') : t('common.sinResultados')}</p>}
      </div>

      <ProductoFormModal open={formOpen} onClose={() => setFormOpen(false)} initial={editando} />
      {movimientoDe && <MovimientoModal producto={movimientoDe} onClose={() => setMovimientoDe(null)} />}
      {movimientosDe && <HistorialMovimientos producto={movimientosDe} onClose={() => setMovimientosDe(null)} />}
      <ConfirmDialog open={deleteId !== null} title={t('inventario.eliminarTitulo')} message={t('inventario.eliminarMensaje')}
        onConfirm={async () => { if (deleteId) { try { await deleteProducto.mutateAsync(deleteId); toast(t('inventario.eliminado')) } catch (e) { toast((e as Error).message, 'error') } } setDeleteId(null) }}
        onClose={() => setDeleteId(null)} />
    </div>
  )
}

function HistorialMovimientos({ producto, onClose }: { producto: Producto; onClose: () => void }) {
  const { t } = useI18n()
  const { data: movs = [] } = useMovimientos(producto.id_producto)
  return (
    <Dialog open onClose={onClose} title={`${t('inventario.historial')} — ${producto.nombre}`}
      footer={<Button variant="outline" onClick={onClose}>{t('common.cerrar')}</Button>}>
      <div className="space-y-2 max-h-96 overflow-auto">
        {movs.length === 0 && <p className="text-sm text-gray-500">{t('inventario.sinMovimientos')}</p>}
        {movs.map(m => (
          <div key={m.id_movimiento} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm">
            <div>
              <span className="inline-flex items-center gap-2"><Badge tone={TIPO_TONE[m.tipo]}>{t(TIPO_KEY[m.tipo])}</Badge> <b>{m.tipo === 'salida' ? '−' : m.tipo === 'entrada' ? '+' : ''}{m.cantidad}</b></span>
              <div className="text-xs text-gray-500">{m.fecha}{m.motivo ? ` · ${m.motivo}` : ''}</div>
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  )
}
