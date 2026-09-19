import React, { useEffect, useState } from 'react'
import { todayLocal } from '../../lib/date'
import { Dialog, Button, Input, Select, SearchSelect } from '../../ui/components'
import { useClientes, useFacturas, useRegisterPago, useProductos, useMetodosPago, useConfig } from '../../store/queries'
import { useToast } from '../../ui/components'
import { CurrencySelect } from '../../ui/currency'
import { formatMoney, getCurrency, convert } from '../../currency'
import { buildFactura } from '../../calc/invoice'
import { useI18n } from '../../i18n'

export function VentaRapidaModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n()
  const { saveCustomer } = useClientes()
  const { createInvoice } = useFacturas()
  const registerPayment = useRegisterPago()
  const { products } = useProductos()
  const metodos = useMetodosPago()
  const { config } = useConfig()
  const toast = useToast()
  const [product_id, setIdProducto] = useState('')
  const [description, setDescripcion] = useState('')
  const [quantity, setCantidad] = useState('1')
  const [precio, setPrecio] = useState('')
  const [currency, setMoneda] = useState('')
  const [metodo, setMetodo] = useState('')
  const [notes, setNotas] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) { setIdProducto(''); setDescripcion(''); setCantidad('1'); setPrecio(''); setMoneda(''); setMetodo(metodos[0] ?? 'Efectivo'); setNotas(''); setError('') }
     
  }, [open])

  const monedaSel = currency || config?.currency || 'USD'
  const n = Number(quantity) || 0
  const p = Number(precio) || 0
  const { totals } = buildFactura([{ description, quantity: n, unit_price: p }].filter(i => i.description), config?.vat_percent ?? 16, getCurrency(monedaSel).decimals)

  const onProducto = (id: string) => {
    setIdProducto(id)
    const prod = products.find(x => x.product_id === id)
    if (prod) {
      setDescripcion(prod.name)
      // Producto cotizado en otra currency: se convierte a la currency de la venta.
      const monedaProd = prod.currency || config?.currency || monedaSel
      const precioVenta = monedaProd !== monedaSel
        ? convert(Number(prod.sale_price) || 0, monedaProd, monedaSel, config)
        : Number(prod.sale_price) || 0
      setPrecio(String(precioVenta))
    }
  }

  const submit = async () => {
    setError('')
    if (!description.trim()) { setError(t('facturas.describeVenta')); return }
    if (!n || n <= 0) { setError(t('facturas.cantidadMayor')); return }
    if (p < 0) { setError(t('facturas.precioInvalido')); return }
    try {
      await saveCustomer.mutateAsync({ customer_id: 'cli_mostrador', name: t('facturas.ventaMostrador'), rfc: '', email: '', phone: '', address: '', created_at: todayLocal() })
      const factura = await createInvoice.mutateAsync({
        customer_id: 'cli_mostrador',
        items: [{ description: description.trim(), quantity: n, unit_price: p, ...(product_id ? { product_id } : {}) }],
        issue_date: todayLocal(),
        due_date: '',
        notes: notes || t('facturas.ventaRapida'),
        currency: monedaSel
      })
      await registerPayment.mutateAsync({ type: 'payment', origin_id: factura.invoice_id, date: todayLocal(), amount: factura.total, payment_method: metodo || 'Efectivo', notes: t('facturas.pagoVentaRapida') })
      toast(`${t('facturas.ventaRegistrada')} — ${factura.serial}`)
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
          <SearchSelect value={product_id} onChange={onProducto}
            options={products.filter(p => String(p.active) !== 'false').map(p => ({ value: p.product_id, label: `${p.name} — ${p.sale_price} (${t('facturas.stockLabel')}: ${p.stock} ${p.unit || 'pieza'})` }))}
            placeholder={t('facturas.oEscribir')} />
        </div>
        <div><label className="text-xs text-gray-500">{t('facturas.conceptos')} *</label><Input value={description} onChange={e => setDescripcion(e.target.value)} placeholder={t('facturas.ejConcepto')} /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">{t('facturas.cantidad')} *</label><Input type="number" min={0} step="any" value={quantity} onChange={e => setCantidad(e.target.value)} /></div>
          <div><label className="text-xs text-gray-500">{t('facturas.precioUnitario')}</label><Input type="number" min={0} step="any" value={precio} onChange={e => setPrecio(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CurrencySelect label={t('facturas.moneda')} value={monedaSel} onChange={setMoneda} />
          <div><label className="text-xs text-gray-500">{t('facturas.metodoPago')}</label>
            <Select value={metodo} onChange={setMetodo} options={metodos.map(v => ({ value: v, label: v }))} />
          </div>
        </div>
        <div><label className="text-xs text-gray-500">{t('common.notas')}</label><Input value={notes} onChange={e => setNotas(e.target.value)} /></div>
        <div className="rounded-lg bg-muted/60 p-3 text-sm flex justify-between">
          <span>{t('facturas.totalIva', { vat: config?.vat_percent ?? 16 })}</span>
          <b>{formatMoney(totals.total, monedaSel)}</b>
        </div>
        {monedaSel !== (config?.currency || 'USD') && totals.total > 0 && (
          <p className="text-right text-xs text-emerald-700">
            ≈ {formatMoney(convert(totals.total, monedaSel, config?.currency || 'USD', config), config?.currency || 'USD')} {t('facturas.equivalenciaBase')}
          </p>
        )}
        <p className="text-xs text-muted-foreground">{t('facturas.ventaInfo')} {product_id ? t('facturas.stockDescuenta') : ''}</p>
      </div>
    </Dialog>
  )
}
