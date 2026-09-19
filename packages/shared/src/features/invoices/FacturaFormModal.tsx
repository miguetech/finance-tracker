import React, { useEffect, useState } from 'react'
import { todayLocal } from '../../lib/date'
import { Dialog, Button, Input, Select, Badge, SearchSelect } from '../../ui/components'
import { IconX } from '../../ui/icons'
import { useClientes, useFacturas, useConfig, useRegisterPago, useProductos } from '../../store/queries'
import { usePerms } from '../../store/perms'
import { buildFactura } from '../../calc/invoice'
import { formatMoney, getCurrency, convert } from '../../currency'
import { CurrencySelect } from '../../ui/currency'
import { uid } from '../../lib/uid'
import { useI18n } from '../../i18n'
import { useSaveGuard } from '../../ui/hooks'

interface ItemForm { product_id: string; description: string; quantity: string; unit_price: string }

export function FacturaFormModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n()
  const { customers, saveCustomer } = useClientes()
  const { createInvoice } = useFacturas()
  const registerPayment = useRegisterPago()
  const { config } = useConfig()
  const { products } = useProductos()
  const { isAdmin } = usePerms()
  const { guardando, guardar } = useSaveGuard()
  const [customer_id, setIdCliente] = useState('')
  const [clienteRapido, setClienteRapido] = useState('')
  const [due_date, setVencimiento] = useState('')
  const [pagado, setPagado] = useState(false)
  const [notes, setNotas] = useState('')
  const [currency, setMoneda] = useState('')
  const [items, setItems] = useState<ItemForm[]>([{ product_id: '', description: '', quantity: '1', unit_price: '' }])
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setIdCliente('')
      setItems([{ product_id: '', description: '', quantity: '1', unit_price: '' }])
      setError(''); setPagado(false); setMoneda('')
    }
  }, [open])

  const setItem = (i: number, k: keyof ItemForm, v: string) => setItems(list => list.map((it, idx) => idx === i ? { ...it, [k]: v } : it))

  // Selección de producto del inventario: rellena concepto y precio de venta.
  // Si el producto está cotizado en otra currency, se convierte a la currency de la factura.
  const elegirProducto = (i: number, idProducto: string) => {
    setItems(list => list.map((it, idx) => {
      if (idx !== i) return it
      if (!idProducto) return { ...it, product_id: '' }
      const p = products.find(pr => pr.product_id === idProducto)
      if (!p) return { ...it, product_id: idProducto }
      const monedaProd = p.currency || config?.currency || monedaSel
      const precioVenta = monedaProd !== monedaSel
        ? convert(Number(p.sale_price) || 0, monedaProd, monedaSel, config)
        : Number(p.sale_price) || 0
      return {
        ...it,
        product_id: idProducto,
        description: it.description.trim() === '' ? p.name : it.description,
        unit_price: String(precioVenta || it.unit_price)
      }
    }))
  }

  const parsedItems = items.map(it => ({ description: it.description, quantity: Number(it.quantity) || 0, unit_price: Number(it.unit_price) || 0, ...(it.product_id ? { product_id: it.product_id } : {}) }))
  const validos = parsedItems.filter(it => it.description && it.quantity > 0 && it.unit_price >= 0)
  const monedaSel = currency || config?.currency || 'USD'
  const { totals } = buildFactura(validos, config?.vat_percent ?? 16, getCurrency(monedaSel).decimals)

  const submit = () => guardar(async () => {
    let clienteId = customer_id
    if (!clienteId && clienteRapido.trim()) {
      const nuevo = await saveCustomer.mutateAsync({ customer_id: uid('cli_'), name: clienteRapido.trim(), rfc: '', email: '', phone: '', address: '', created_at: todayLocal() })
      clienteId = nuevo.customer_id
    }
    if (!clienteId) throw new Error(t('facturas.seleccionaCliente'))
    if (validos.length === 0) throw new Error(t('facturas.minConcepto'))
    const factura = await createInvoice.mutateAsync({ customer_id: clienteId, items: validos, issue_date: todayLocal(), due_date, notes, currency: monedaSel })
    if (pagado && isAdmin) {
      await registerPayment.mutateAsync({ type: 'payment', origin_id: factura.invoice_id, date: todayLocal(), amount: factura.total, payment_method: 'Efectivo', notes: t('facturas.pagoContado') })
    }
    onSaved()
    onClose()
  }, {
    dedupeKey: clienteRapido.trim(),
    clavesExistentes: customers.map(c => c.name),
    mensajeDuplicado: t('errors.seleccionaCliente')
  }).catch(e => setError(e instanceof Error ? e.message : String(e)))

  return (
    <Dialog open={open} onClose={onClose} title={t('facturas.nueva')}
      footer={<><Button variant="outline" onClick={onClose} disabled={guardando}>{t('common.cancelar')}</Button>
        <Button onClick={submit} disabled={guardando}>{guardando ? t('imagenes.subiendo') : t('facturas.guardarFactura')}</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">{t('facturas.cliente')}</label>
            <Select value={customer_id} onChange={setIdCliente} options={customers.map(c => ({ value: c.customer_id, label: c.name }))} placeholder={t('common.seleccionar')} />
          </div>
          <div><label className="text-xs text-gray-500">{t('facturas.clienteRapido')}</label><Input value={clienteRapido} onChange={e => setClienteRapido(e.target.value)} placeholder={`${t('common.nombre')}…`} /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">{t('facturas.vencimiento')}</label><Input type="date" value={due_date} onChange={e => setVencimiento(e.target.value)} /></div>
          <CurrencySelect label={t('facturas.monedaFactura')} value={monedaSel} onChange={setMoneda} />
        </div>
        {isAdmin && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={pagado} onChange={e => setPagado(e.target.checked)} />
            {t('facturas.yaPago')}
          </label>
        )}
        <div className="space-y-3">
          <div className="text-xs text-gray-500">{t('facturas.conceptos')}</div>
          {items.map((it, i) => {
            const prod = products.find(p => p.product_id === it.product_id)
            const importe = (Number(it.quantity) || 0) * (Number(it.unit_price) || 0)
            return (
              <div key={i} className="rounded-xl border border-gray-100 p-2 space-y-2 bg-muted/20">
                {/* Selector de producto con búsqueda integrada */}
                <div className="flex items-center gap-2">
                  <SearchSelect className="flex-1"
                    value={it.product_id}
                    onChange={v => elegirProducto(i, v)}
                    options={products.filter(p => p.active !== 'false').map(p => ({ value: p.product_id, label: `${p.name}${p.unit ? ` (${p.stock} ${p.unit})` : ''}` }))}
                    placeholder={t('facturas.buscarProducto')} />
                  {prod && <Badge tone={Number(prod.stock) >= Number(it.quantity || 0) ? 'green' : 'red'}>{prod.stock} en stock</Badge>}
                  <button className="inline-flex items-center justify-center text-red-500 hover:text-red-700 w-7 h-7 rounded-lg hover:bg-red-50" aria-label={t('facturas.eliminarConcepto')} onClick={() => setItems(l => l.filter((_, idx) => idx !== i))}><IconX /></button>
                </div>
                <div className="grid grid-cols-12 gap-2 items-center">
                  <Input className="col-span-6" placeholder={t('facturas.descripcion')} value={it.description} onChange={e => setItem(i, 'description', e.target.value)} />
                  <Input className="col-span-2" type="number" min={0} step="any" placeholder={t('facturas.cant')} title={t('facturas.cant')} value={it.quantity} onChange={e => setItem(i, 'quantity', e.target.value)} />
                  <Input className="col-span-4" type="number" min={0} step="any" placeholder={`${t('facturas.precio')} (${getCurrency(monedaSel).symbol})`} title={t('facturas.precio')} value={it.unit_price} onChange={e => setItem(i, 'unit_price', e.target.value)} />
                </div>
                {importe > 0 && (
                  <p className="text-right text-xs tabular-nums text-muted-foreground px-1">{t('facturas.importe')}: <b>{formatMoney(importe, monedaSel)}</b></p>
                )}
              </div>
            )
          })}
          <Button variant="outline" onClick={() => setItems(l => [...l, { product_id: '', description: '', quantity: '1', unit_price: '' }])}>+ {t('facturas.agregarConcepto')}</Button>
          <p className="text-xs text-muted-foreground">{t('facturas.stockDescuenta')}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-6 text-sm border-t border-gray-100 pt-3">
          <div>{t('facturas.subtotal')}: <b>{formatMoney(totals.subtotal, monedaSel)}</b></div>
          <div>{t('facturas.iva')} ({config?.vat_percent ?? 16}%): <b>{formatMoney(totals.vat, monedaSel)}</b></div>
          <div>{t('facturas.total')}: <b>{formatMoney(totals.total, monedaSel)}</b></div>
        </div>
        {monedaSel !== (config?.currency || 'USD') && totals.total > 0 && (
          <p className="text-right text-xs text-emerald-700">
            ≈ {formatMoney(convert(totals.total, monedaSel, config?.currency || 'USD', config), config?.currency || 'USD')} {t('facturas.equivalenciaBase')}
          </p>
        )}
        <div><label className="text-xs text-gray-500">{t('common.notas')}</label>
          <textarea value={notes} onChange={e => setNotas(e.target.value)} rows={3}
            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-surface resize-y min-h-16 focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/25" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Dialog>
  )
}
