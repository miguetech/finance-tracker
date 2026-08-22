import React, { useEffect, useState } from 'react'
import { todayLocal } from '../../lib/date'
import { Dialog, Button, Input, Select } from '../../ui/components'
import { useClientes, useFacturas, useRegisterPago, useProductos, useMetodosPago, useConfig } from '../../store/queries'
import { useToast } from '../../ui/components'
import { CurrencySelect } from '../../ui/currency'
import { formatMoney, getCurrency } from '../../currency'
import { buildFactura } from '../../calc/invoice'
import { useI18n } from '../../i18n'

export function VentaRapidaModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n()
  const { saveCliente } = useClientes()
  const { createFactura } = useFacturas()
  const registerPago = useRegisterPago()
  const { productos } = useProductos()
  const metodos = useMetodosPago()
  const { config } = useConfig()
  const toast = useToast()
  const [id_producto, setIdProducto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [precio, setPrecio] = useState('')
  const [moneda, setMoneda] = useState('')
  const [metodo, setMetodo] = useState('')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) { setIdProducto(''); setDescripcion(''); setCantidad('1'); setPrecio(''); setMoneda(''); setMetodo(metodos[0] ?? 'Efectivo'); setNotas(''); setError('') }
     
  }, [open])

  const monedaSel = moneda || config?.moneda || 'USD'
  const n = Number(cantidad) || 0
  const p = Number(precio) || 0
  const { totals } = buildFactura([{ descripcion, cantidad: n, precio_unitario: p }].filter(i => i.descripcion), config?.iva_porcentaje ?? 16, getCurrency(monedaSel).decimals)

  const onProducto = (id: string) => {
    setIdProducto(id)
    const prod = productos.find(x => x.id_producto === id)
    if (prod) {
      setDescripcion(prod.nombre)
      setPrecio(String(prod.precio_venta))
    }
  }

  const submit = async () => {
    setError('')
    if (!descripcion.trim()) { setError(t('facturas.describeVenta')); return }
    if (!n || n <= 0) { setError(t('facturas.cantidadMayor')); return }
    if (p < 0) { setError(t('facturas.precioInvalido')); return }
    try {
      await saveCliente.mutateAsync({ id_cliente: 'cli_mostrador', nombre: t('facturas.ventaMostrador'), rfc: '', email: '', telefono: '', direccion: '', fecha_registro: todayLocal() })
      const factura = await createFactura.mutateAsync({
        id_cliente: 'cli_mostrador',
        items: [{ descripcion: descripcion.trim(), cantidad: n, precio_unitario: p, ...(id_producto ? { id_producto } : {}) }],
        fecha_emision: todayLocal(),
        fecha_vencimiento: '',
        notas: notas || t('facturas.ventaRapida'),
        moneda: monedaSel
      })
      await registerPago.mutateAsync({ tipo: 'cobro', id_origen: factura.id_factura, fecha: todayLocal(), monto: factura.total, metodo_pago: metodo || 'Efectivo', notas: t('facturas.pagoVentaRapida') })
      toast(`${t('facturas.ventaRegistrada')} — ${factura.folio}`)
      onSaved()
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('facturas.ventaRapida')}
      footer={<><Button variant="outline" onClick={onClose}>{t('common.cancelar')}</Button><Button onClick={submit}>{t('facturas.registrarVenta')}</Button></>}>
      <div className="space-y-3">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div>
          <label className="text-xs text-gray-500">{t('facturas.productoInventario')}</label>
          <Select value={id_producto} onChange={onProducto}
            options={productos.filter(p => String(p.activo) !== 'false').map(p => ({ value: p.id_producto, label: `${p.nombre} — ${p.precio_venta} (${t('facturas.stockLabel')}: ${p.stock} ${p.unidad || 'pieza'})` }))}
            placeholder={t('facturas.oEscribir')} />
        </div>
        <div><label className="text-xs text-gray-500">{t('facturas.conceptos')} *</label><Input value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder={t('facturas.ejConcepto')} /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">{t('facturas.cantidad')} *</label><Input type="number" min={0} step="any" value={cantidad} onChange={e => setCantidad(e.target.value)} /></div>
          <div><label className="text-xs text-gray-500">{t('facturas.precioUnitario')}</label><Input type="number" min={0} step="any" value={precio} onChange={e => setPrecio(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CurrencySelect label={t('facturas.moneda')} value={monedaSel} onChange={setMoneda} />
          <div><label className="text-xs text-gray-500">{t('facturas.metodoPago')}</label>
            <Select value={metodo} onChange={setMetodo} options={metodos.map(v => ({ value: v, label: v }))} />
          </div>
        </div>
        <div><label className="text-xs text-gray-500">{t('common.notas')}</label><Input value={notas} onChange={e => setNotas(e.target.value)} /></div>
        <div className="rounded-lg bg-muted/60 p-3 text-sm flex justify-between">
          <span>{t('facturas.totalIva', { iva: config?.iva_porcentaje ?? 16 })}</span>
          <b>{formatMoney(totals.total, monedaSel)}</b>
        </div>
        <p className="text-xs text-muted-foreground">{t('facturas.ventaInfo')} {id_producto ? t('facturas.stockDescuenta') : ''}</p>
      </div>
    </Dialog>
  )
}
