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

interface ItemForm { id_producto: string; descripcion: string; cantidad: string; precio_unitario: string }

export function FacturaFormModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n()
  const { clientes, saveCliente } = useClientes()
  const { createFactura } = useFacturas()
  const registerPago = useRegisterPago()
  const { config } = useConfig()
  const { productos } = useProductos()
  const { isAdmin } = usePerms()
  const { guardando, guardar } = useSaveGuard()
  const [id_cliente, setIdCliente] = useState('')
  const [clienteRapido, setClienteRapido] = useState('')
  const [fecha_vencimiento, setVencimiento] = useState('')
  const [pagado, setPagado] = useState(false)
  const [notas, setNotas] = useState('')
  const [moneda, setMoneda] = useState('')
  const [items, setItems] = useState<ItemForm[]>([{ id_producto: '', descripcion: '', cantidad: '1', precio_unitario: '' }])
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setIdCliente('')
      setItems([{ id_producto: '', descripcion: '', cantidad: '1', precio_unitario: '' }])
      setError(''); setPagado(false); setMoneda('')
    }
  }, [open])

  const setItem = (i: number, k: keyof ItemForm, v: string) => setItems(list => list.map((it, idx) => idx === i ? { ...it, [k]: v } : it))

  // Selección de producto del inventario: rellena concepto y precio de venta.
  // Si el producto está cotizado en otra moneda, se convierte a la moneda de la factura.
  const elegirProducto = (i: number, idProducto: string) => {
    setItems(list => list.map((it, idx) => {
      if (idx !== i) return it
      if (!idProducto) return { ...it, id_producto: '' }
      const p = productos.find(pr => pr.id_producto === idProducto)
      if (!p) return { ...it, id_producto: idProducto }
      const monedaProd = p.moneda || config?.moneda || monedaSel
      const precioVenta = monedaProd !== monedaSel
        ? convert(Number(p.precio_venta) || 0, monedaProd, monedaSel, config)
        : Number(p.precio_venta) || 0
      return {
        ...it,
        id_producto: idProducto,
        descripcion: it.descripcion.trim() === '' ? p.nombre : it.descripcion,
        precio_unitario: String(precioVenta || it.precio_unitario)
      }
    }))
  }

  const parsedItems = items.map(it => ({ descripcion: it.descripcion, cantidad: Number(it.cantidad) || 0, precio_unitario: Number(it.precio_unitario) || 0, ...(it.id_producto ? { id_producto: it.id_producto } : {}) }))
  const validos = parsedItems.filter(it => it.descripcion && it.cantidad > 0 && it.precio_unitario >= 0)
  const monedaSel = moneda || config?.moneda || 'USD'
  const { totals } = buildFactura(validos, config?.iva_porcentaje ?? 16, getCurrency(monedaSel).decimals)

  const submit = () => guardar(async () => {
    let clienteId = id_cliente
    if (!clienteId && clienteRapido.trim()) {
      const nuevo = await saveCliente.mutateAsync({ id_cliente: uid('cli_'), nombre: clienteRapido.trim(), rfc: '', email: '', telefono: '', direccion: '', fecha_registro: todayLocal() })
      clienteId = nuevo.id_cliente
    }
    if (!clienteId) throw new Error(t('facturas.seleccionaCliente'))
    if (validos.length === 0) throw new Error(t('facturas.minConcepto'))
    const factura = await createFactura.mutateAsync({ id_cliente: clienteId, items: validos, fecha_emision: todayLocal(), fecha_vencimiento, notas, moneda: monedaSel })
    if (pagado && isAdmin) {
      await registerPago.mutateAsync({ tipo: 'cobro', id_origen: factura.id_factura, fecha: todayLocal(), monto: factura.total, metodo_pago: 'Efectivo', notas: t('facturas.pagoContado') })
    }
    onSaved()
    onClose()
  }, {
    dedupeKey: clienteRapido.trim(),
    clavesExistentes: clientes.map(c => c.nombre),
    mensajeDuplicado: t('errors.seleccionaCliente')
  }).catch(e => setError(e instanceof Error ? e.message : String(e)))

  return (
    <Dialog open={open} onClose={onClose} title={t('facturas.nueva')}
      footer={<><Button variant="outline" onClick={onClose} disabled={guardando}>{t('common.cancelar')}</Button>
        <Button onClick={submit} disabled={guardando}>{guardando ? t('imagenes.subiendo') : t('facturas.guardarFactura')}</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">{t('facturas.cliente')}</label>
            <Select value={id_cliente} onChange={setIdCliente} options={clientes.map(c => ({ value: c.id_cliente, label: c.nombre }))} placeholder={t('common.seleccionar')} />
          </div>
          <div><label className="text-xs text-gray-500">{t('facturas.clienteRapido')}</label><Input value={clienteRapido} onChange={e => setClienteRapido(e.target.value)} placeholder={`${t('common.nombre')}…`} /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">{t('facturas.vencimiento')}</label><Input type="date" value={fecha_vencimiento} onChange={e => setVencimiento(e.target.value)} /></div>
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
            const prod = productos.find(p => p.id_producto === it.id_producto)
            const importe = (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0)
            return (
              <div key={i} className="rounded-xl border border-gray-100 p-2 space-y-2 bg-muted/20">
                {/* Selector de producto con búsqueda integrada */}
                <div className="flex items-center gap-2">
                  <SearchSelect className="flex-1"
                    value={it.id_producto}
                    onChange={v => elegirProducto(i, v)}
                    options={productos.filter(p => p.activo !== 'false').map(p => ({ value: p.id_producto, label: `${p.nombre}${p.unidad ? ` (${p.stock} ${p.unidad})` : ''}` }))}
                    placeholder={t('facturas.buscarProducto')} />
                  {prod && <Badge tone={Number(prod.stock) >= Number(it.cantidad || 0) ? 'green' : 'red'}>{prod.stock} en stock</Badge>}
                  <button className="inline-flex items-center justify-center text-red-500 hover:text-red-700 w-7 h-7 rounded-lg hover:bg-red-50" aria-label={t('facturas.eliminarConcepto')} onClick={() => setItems(l => l.filter((_, idx) => idx !== i))}><IconX /></button>
                </div>
                <div className="grid grid-cols-12 gap-2 items-center">
                  <Input className="col-span-6" placeholder={t('facturas.descripcion')} value={it.descripcion} onChange={e => setItem(i, 'descripcion', e.target.value)} />
                  <Input className="col-span-2" type="number" min={0} step="any" placeholder={t('facturas.cant')} title={t('facturas.cant')} value={it.cantidad} onChange={e => setItem(i, 'cantidad', e.target.value)} />
                  <Input className="col-span-4" type="number" min={0} step="any" placeholder={`${t('facturas.precio')} (${getCurrency(monedaSel).symbol})`} title={t('facturas.precio')} value={it.precio_unitario} onChange={e => setItem(i, 'precio_unitario', e.target.value)} />
                </div>
                {importe > 0 && (
                  <p className="text-right text-xs tabular-nums text-muted-foreground px-1">{t('facturas.importe')}: <b>{formatMoney(importe, monedaSel)}</b></p>
                )}
              </div>
            )
          })}
          <Button variant="outline" onClick={() => setItems(l => [...l, { id_producto: '', descripcion: '', cantidad: '1', precio_unitario: '' }])}>+ {t('facturas.agregarConcepto')}</Button>
          <p className="text-xs text-muted-foreground">{t('facturas.stockDescuenta')}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-6 text-sm border-t border-gray-100 pt-3">
          <div>{t('facturas.subtotal')}: <b>{formatMoney(totals.subtotal, monedaSel)}</b></div>
          <div>{t('facturas.iva')} ({config?.iva_porcentaje ?? 16}%): <b>{formatMoney(totals.iva, monedaSel)}</b></div>
          <div>{t('facturas.total')}: <b>{formatMoney(totals.total, monedaSel)}</b></div>
        </div>
        {monedaSel !== (config?.moneda || 'USD') && totals.total > 0 && (
          <p className="text-right text-xs text-emerald-700">
            ≈ {formatMoney(convert(totals.total, monedaSel, config?.moneda || 'USD', config), config?.moneda || 'USD')} {t('facturas.equivalenciaBase')}
          </p>
        )}
        <div><label className="text-xs text-gray-500">{t('common.notas')}</label>
          <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={3}
            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-surface resize-y min-h-16 focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/25" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Dialog>
  )
}
