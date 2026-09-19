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
  const { proveedores } = useProveedores()
  const toast = useToast()
  const [tipo, setTipo] = useState<TipoMovimiento>('entrada')
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const [supplier_id, setIdProveedor] = useState(producto.supplier_id || '')
  const [error, setError] = useState('')

  useEffect(() => { setCantidad(''); setMotivo(''); setError(''); setTipo('entrada'); setIdProveedor(producto.supplier_id || '') }, [producto])

  const submit = async () => {
    setError('')
    const n = Number(cantidad)
    if (!n || n <= 0) { setError(t('errors.cantidadMayorCero')); return }
    if (tipo === 'salida' && n > Number(producto.stock)) { setError(t('errors.soloHay', { cantidad: String(producto.stock) })); return }
    try {
      await registrar.mutateAsync({ product_id: producto.product_id, tipo, cantidad: n, motivo: motivo.trim(), supplier_id: tipo === 'entrada' ? supplier_id : '', fecha: todayLocal() })
      toast(t('inventario.movimientoRegistrado'))
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const signo = tipo === 'entrada' ? '+' : tipo === 'salida' ? '−' : '='
  const nuevoStock = tipo === 'entrada' ? Number(producto.stock) + (Number(cantidad) || 0)
    : tipo === 'salida' ? Number(producto.stock) - (Number(cantidad) || 0)
    : (Number(cantidad) || 0)

  return (
    <Dialog open onClose={onClose} title={`${t('inventario.movimiento')} — ${producto.nombre}`}
      footer={<><Button variant="outline" onClick={onClose}>{t('common.cancelar')}</Button><Button onClick={submit}>{t('common.registrar')}</Button></>}>
      <div className="space-y-3">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div><label className="text-xs text-gray-500">{t('inventario.tipoMovimiento')}</label>
          <Select value={tipo} onChange={v => setTipo(v as TipoMovimiento)}
            options={[
              { value: 'entrada', label: t('inventario.tipoEntradaProveedor') },
              { value: 'salida', label: t('inventario.tipoSalidaVenta') },
              { value: 'ajuste', label: t('inventario.tipoAjusteMerma') }
            ]} />
        </div>
        <div><label className="text-xs text-gray-500">{t('facturas.cantidad')} ({producto.unidad || 'pieza'}) *</label><Input type="number" min={0} step="any" value={cantidad} onChange={e => setCantidad(e.target.value)} autoFocus /></div>
        {tipo === 'entrada' && (
          <div><label className="text-xs text-gray-500">{t('inventario.proveedor')}</label>
            <Select value={supplier_id} onChange={setIdProveedor}
              options={proveedores.map(p => ({ value: p.supplier_id, label: p.nombre }))} placeholder={t('inventario.sinProveedor')} />
          </div>
        )}
        {tipo !== 'ajuste' && <div><label className="text-xs text-gray-500">{t('inventario.motivoReferencia')}</label><Input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder={t('inventario.ejCompra')} /></div>}
        {tipo === 'ajuste' && <div><label className="text-xs text-gray-500">{t('inventario.motivoAjuste')}</label><Input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder={t('inventario.ejAjuste')} /></div>}
        <div className="rounded-lg bg-muted/60 p-3 text-sm">
          {t('inventario.stockActual')}: <b>{producto.stock} {producto.unidad || 'pieza'}</b><br />
          {t('inventario.resultado')}: <b className={nuevoStock < 0 ? 'text-red-600' : 'text-emerald-700'}>{signo} {nuevoStock} {producto.unidad || 'pieza'}</b>
        </div>
      </div>
    </Dialog>
  )
}
