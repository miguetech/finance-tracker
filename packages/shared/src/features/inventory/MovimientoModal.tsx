import React, { useEffect, useState } from 'react'
import { todayLocal } from '../../lib/date'
import { Dialog, Button, Input, Select } from '../../ui/components'
import { useToast } from '../../ui/components'
import { useRegistrarMovimiento, useProveedores } from '../../store/queries'
import { useI18n } from '../../i18n'
import type { Producto, TipoMovimiento } from '../../types/entities'

export function MovimientoModal({ producto, onClose }: { producto: Producto; onClose: () => void }) {
  const { t } = useI18n()
  const registrar = useRegistrarMovimiento()
  const { suppliers } = useProveedores()
  const toast = useToast()
  const [type, setTipo] = useState<TipoMovimiento>('in')
  const [quantity, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const [supplier_id, setIdProveedor] = useState(producto.supplier_id || '')
  const [error, setError] = useState('')

  useEffect(() => { setCantidad(''); setMotivo(''); setError(''); setTipo('in'); setIdProveedor(producto.supplier_id || '') }, [producto])

  const submit = async () => {
    setError('')
    const n = Number(quantity)
    if (!n || n <= 0) { setError(t('errors.cantidadMayorCero')); return }
    if (type === 'out' && n > Number(producto.stock)) { setError(t('errors.soloHay', { quantity: String(producto.stock) })); return }
    try {
      await registrar.mutateAsync({ product_id: producto.product_id, type, quantity: n, motivo: motivo.trim(), supplier_id: type === 'in' ? supplier_id : '', date: todayLocal() })
      toast(t('inventario.movimientoRegistrado'))
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const signo = type === 'in' ? '+' : type === 'out' ? '−' : '='
  const nuevoStock = type === 'in' ? Number(producto.stock) + (Number(quantity) || 0)
    : type === 'out' ? Number(producto.stock) - (Number(quantity) || 0)
    : (Number(quantity) || 0)

  return (
    <Dialog open onClose={onClose} title={`${t('inventario.movimiento')} — ${producto.name}`}
      footer={<><Button variant="outline" onClick={onClose}>{t('common.cancelar')}</Button><Button onClick={submit}>{t('common.registrar')}</Button></>}>
      <div className="space-y-3">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div><label className="text-xs text-gray-500">{t('inventario.tipoMovimiento')}</label>
          <Select value={type} onChange={v => setTipo(v as TipoMovimiento)}
            options={[
              { value: 'in', label: t('inventario.tipoEntradaProveedor') },
              { value: 'out', label: t('inventario.tipoSalidaVenta') },
              { value: 'adjustment', label: t('inventario.tipoAjusteMerma') }
            ]} />
        </div>
        <div><label className="text-xs text-gray-500">{t('facturas.cantidad')} ({producto.unit || 'pieza'}) *</label><Input type="number" min={0} step="any" value={quantity} onChange={e => setCantidad(e.target.value)} autoFocus /></div>
        {type === 'in' && (
          <div><label className="text-xs text-gray-500">{t('inventario.proveedor')}</label>
            <Select value={supplier_id} onChange={setIdProveedor}
              options={suppliers.map(p => ({ value: p.supplier_id, label: p.name }))} placeholder={t('inventario.sinProveedor')} />
          </div>
        )}
        {type !== 'adjustment' && <div><label className="text-xs text-gray-500">{t('inventario.motivoReferencia')}</label><Input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder={t('inventario.ejCompra')} /></div>}
        {type === 'adjustment' && <div><label className="text-xs text-gray-500">{t('inventario.motivoAjuste')}</label><Input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder={t('inventario.ejAjuste')} /></div>}
        <div className="rounded-lg bg-muted/60 p-3 text-sm">
          {t('inventario.stockActual')}: <b>{producto.stock} {producto.unit || 'pieza'}</b><br />
          {t('inventario.resultado')}: <b className={nuevoStock < 0 ? 'text-red-600' : 'text-emerald-700'}>{signo} {nuevoStock} {producto.unit || 'pieza'}</b>
        </div>
      </div>
    </Dialog>
  )
}
