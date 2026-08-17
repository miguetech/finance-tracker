import React, { useEffect, useState } from 'react'
import { todayLocal } from '../../lib/date'
import { Dialog, Button, Input, Select } from '../../ui/components'
import { IconX } from '../../ui/icons'
import { useFactura, useClientes, useFacturas, useConfig } from '../../store/queries'
import { buildFactura } from '../../calc/invoice'
import { formatMoney, getCurrency } from '../../currency'
import { CurrencySelect } from '../../ui/currency'
import { useI18n } from '../../i18n'
import type { Factura } from '../../types/entities'

interface ItemForm { descripcion: string; cantidad: string; precio_unitario: string }

export function FacturaEditModal({ factura, onClose }: { factura: Factura; onClose: () => void }) {
  const { t } = useI18n()
  const { data: det } = useFactura(factura.id_factura)
  const { clientes, saveCliente } = useClientes()
  const { updateFactura } = useFacturas()
  const { config } = useConfig()
  const [id_cliente, setIdCliente] = useState(factura.id_cliente)
  const [clienteRapido, setClienteRapido] = useState('')
  const [fecha_emision, setEmision] = useState(factura.fecha_emision)
  const [fecha_vencimiento, setVencimiento] = useState(factura.fecha_vencimiento)
  const [notas, setNotas] = useState(factura.notas)
  const [moneda, setMoneda] = useState(factura.moneda || '')
  const [items, setItems] = useState<ItemForm[]>([{ descripcion: '', cantidad: '1', precio_unitario: '' }])
  const [error, setError] = useState('')

  useEffect(() => {
    if (det && det.items.length > 0) {
      setIdCliente(det.factura.id_cliente)
      setItems(det.items.map(i => ({ descripcion: i.descripcion, cantidad: String(i.cantidad), precio_unitario: String(i.precio_unitario) })))
      setEmision(det.factura.fecha_emision)
      setVencimiento(det.factura.fecha_vencimiento)
      setNotas(det.factura.notas)
      setMoneda(det.factura.moneda || '')
    }
     
  }, [det])

  const setItem = (i: number, k: keyof ItemForm, v: string) => setItems(list => list.map((it, idx) => idx === i ? { ...it, [k]: v } : it))
  const parsedItems = items.map(it => ({ descripcion: it.descripcion, cantidad: Number(it.cantidad) || 0, precio_unitario: Number(it.precio_unitario) || 0 }))
  const validos = parsedItems.filter(it => it.descripcion && it.cantidad > 0 && it.precio_unitario >= 0)
  const monedaSel = moneda || config?.moneda || 'USD'
  const { totals } = buildFactura(validos, config?.iva_porcentaje ?? 16, getCurrency(monedaSel).decimals)

  const submit = async () => {
    try {
      let clienteId = id_cliente
      if (!clienteId && clienteRapido.trim()) {
        const nuevo = await saveCliente.mutateAsync({ id_cliente: '', nombre: clienteRapido.trim(), rfc: '', email: '', telefono: '', direccion: '', fecha_registro: todayLocal() })
        clienteId = nuevo.id_cliente
      }
      if (!clienteId) return setError(t('facturas.seleccionaCliente'))
      if (validos.length === 0) return setError(t('facturas.minConcepto'))
      await updateFactura.mutateAsync({ id: factura.id_factura, data: { id_cliente: clienteId, items: validos, fecha_emision, fecha_vencimiento, notas, moneda: monedaSel } })
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Dialog open onClose={onClose} title={t('facturas.editarTitulo', { folio: factura.folio })}
      footer={<><Button variant="outline" onClick={onClose}>{t('common.cancelar')}</Button><Button onClick={submit}>{t('facturas.guardarCambios')}</Button></>}>
      <div className="space-y-3">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">{t('facturas.cliente')}</label>
            <Select value={id_cliente} onChange={setIdCliente} options={clientes.map(c => ({ value: c.id_cliente, label: c.nombre }))} placeholder={t('common.seleccionar')} />
          </div>
          <div><label className="text-xs text-gray-500">{t('facturas.clienteRapido')}</label><Input value={clienteRapido} onChange={e => setClienteRapido(e.target.value)} placeholder={`${t('common.nombre')}…`} /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div><label className="text-xs text-gray-500">{t('facturas.fechaEmision')}</label><Input type="date" value={fecha_emision} onChange={e => setEmision(e.target.value)} /></div>
          <div><label className="text-xs text-gray-500">{t('facturas.vencimiento')}</label><Input type="date" value={fecha_vencimiento} onChange={e => setVencimiento(e.target.value)} /></div>
          <CurrencySelect label={t('facturas.moneda')} value={monedaSel} onChange={setMoneda} />
        </div>
        <div className="space-y-2">
          <div className="text-xs text-gray-500">{t('facturas.conceptos')}</div>
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-12 gap-2">
              <Input className="col-span-6" placeholder={t('facturas.descripcion')} value={it.descripcion} onChange={e => setItem(i, 'descripcion', e.target.value)} />
              <Input className="col-span-2" type="number" placeholder={t('facturas.cant')} value={it.cantidad} onChange={e => setItem(i, 'cantidad', e.target.value)} />
              <Input className="col-span-3" type="number" placeholder={t('facturas.precio')} value={it.precio_unitario} onChange={e => setItem(i, 'precio_unitario', e.target.value)} />
              <button className="col-span-1 inline-flex items-center justify-center text-red-500 hover:text-red-700" aria-label={t('facturas.eliminarConcepto')} onClick={() => setItems(l => l.filter((_, idx) => idx !== i))}><IconX /></button>
            </div>
          ))}
          <Button variant="outline" onClick={() => setItems(l => [...l, { descripcion: '', cantidad: '1', precio_unitario: '' }])}>{t('facturas.agregarConcepto')}</Button>
        </div>
        <div className="flex justify-end gap-6 text-sm border-t border-gray-100 pt-3">
          <div>{t('facturas.subtotal')}: <b>{formatMoney(totals.subtotal, monedaSel)}</b></div>
          <div>{t('facturas.iva')} ({config?.iva_porcentaje ?? 16}%): <b>{formatMoney(totals.iva, monedaSel)}</b></div>
          <div>{t('facturas.total')}: <b>{formatMoney(totals.total, monedaSel)}</b></div>
        </div>
        <div><label className="text-xs text-gray-500">{t('common.notas')}</label><Input value={notas} onChange={e => setNotas(e.target.value)} /></div>
        <p className="text-xs text-muted-foreground">{t('facturas.editarInfo')}</p>
      </div>
    </Dialog>
  )
}
