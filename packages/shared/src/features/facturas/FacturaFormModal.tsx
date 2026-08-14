import React, { useEffect, useState } from 'react'
import { Dialog, Button, Input, Select } from '../../ui/components'
import { IconX } from '../../ui/icons'
import { useClientes, useFacturas, useConfig, useRegisterPago } from '../../store/queries'
import { buildFactura } from '../../calc/invoice'
import { formatMoney, getCurrency } from '../../currency'
import { uid } from '../../lib/uid'

interface ItemForm { descripcion: string; cantidad: string; precio_unitario: string }

export function FacturaFormModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { clientes, saveCliente } = useClientes()
  const { createFactura } = useFacturas()
  const registerPago = useRegisterPago()
  const { config } = useConfig()
  const [id_cliente, setIdCliente] = useState('')
  const [clienteRapido, setClienteRapido] = useState('')
  const [fecha_vencimiento, setVencimiento] = useState('')
  const [pagado, setPagado] = useState(false)
  const [notas, setNotas] = useState('')
  const [items, setItems] = useState<ItemForm[]>([{ descripcion: '', cantidad: '1', precio_unitario: '' }])
  const [error, setError] = useState('')
  const moneda = config?.moneda ?? 'USD'

  useEffect(() => { if (open) { setIdCliente(''); setItems([{ descripcion: '', cantidad: '1', precio_unitario: '' }]); setError(''); setPagado(false) } }, [open])

  const setItem = (i: number, k: keyof ItemForm, v: string) => setItems(list => list.map((it, idx) => idx === i ? { ...it, [k]: v } : it))
  const parsedItems = items.map(it => ({ descripcion: it.descripcion, cantidad: Number(it.cantidad) || 0, precio_unitario: Number(it.precio_unitario) || 0 }))
  const validos = parsedItems.filter(it => it.descripcion && it.cantidad > 0 && it.precio_unitario >= 0)
  const { totals } = buildFactura(validos, config?.iva_porcentaje ?? 16, getCurrency(moneda).decimals)

  const submit = async () => {
    try {
      let clienteId = id_cliente
      if (!clienteId && clienteRapido.trim()) {
        const nuevo = await saveCliente.mutateAsync({ id_cliente: uid('cli_'), nombre: clienteRapido.trim(), rfc: '', email: '', telefono: '', direccion: '', fecha_registro: new Date().toISOString().slice(0, 10) })
        clienteId = nuevo.id_cliente
      }
      if (!clienteId) return setError('Selecciona o crea un cliente')
      if (validos.length === 0) return setError('Agrega al menos 1 concepto completo')
      const factura = await createFactura.mutateAsync({ id_cliente: clienteId, items: validos, fecha_emision: new Date().toISOString().slice(0, 10), fecha_vencimiento, notas })
      if (pagado) {
        await registerPago.mutateAsync({ tipo: 'cobro', id_origen: factura.id_factura, fecha: new Date().toISOString().slice(0, 10), monto: factura.total, metodo_pago: 'Efectivo', notas: 'Pago al contado' })
      }
      onSaved()
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Nueva factura"
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit}>Guardar factura</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">Cliente</label>
            <Select value={id_cliente} onChange={setIdCliente} options={clientes.map(c => ({ value: c.id_cliente, label: c.nombre }))} placeholder="Seleccionar…" />
          </div>
          <div><label className="text-xs text-gray-500">Cliente rápido (nuevo)</label><Input value={clienteRapido} onChange={e => setClienteRapido(e.target.value)} placeholder="Nombre…" /></div>
        </div>
        <div><label className="text-xs text-gray-500">Fecha vencimiento</label><Input type="date" value={fecha_vencimiento} onChange={e => setVencimiento(e.target.value)} /></div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={pagado} onChange={e => setPagado(e.target.checked)} />
          Ya me pagó (registrar cobro total)
        </label>
        <div className="space-y-2">
          <div className="text-xs text-gray-500">Conceptos</div>
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-12 gap-2">
              <Input className="col-span-6" placeholder="Descripción" value={it.descripcion} onChange={e => setItem(i, 'descripcion', e.target.value)} />
              <Input className="col-span-2" type="number" placeholder="Cant" value={it.cantidad} onChange={e => setItem(i, 'cantidad', e.target.value)} />
              <Input className="col-span-3" type="number" placeholder="Precio" value={it.precio_unitario} onChange={e => setItem(i, 'precio_unitario', e.target.value)} />
              <button className="col-span-1 inline-flex items-center justify-center text-red-500 hover:text-red-700" aria-label="Eliminar concepto" onClick={() => setItems(l => l.filter((_, idx) => idx !== i))}><IconX /></button>
            </div>
          ))}
          <Button variant="outline" onClick={() => setItems(l => [...l, { descripcion: '', cantidad: '1', precio_unitario: '' }])}>+ Agregar concepto</Button>
        </div>
        <div className="flex justify-end gap-6 text-sm border-t border-gray-100 pt-3">
          <div>Subtotal: <b>{formatMoney(totals.subtotal, moneda)}</b></div>
          <div>IVA ({config?.iva_porcentaje ?? 16}%): <b>{formatMoney(totals.iva, moneda)}</b></div>
          <div>Total: <b>{formatMoney(totals.total, moneda)}</b></div>
        </div>
        <div><label className="text-xs text-gray-500">Notas</label><Input value={notas} onChange={e => setNotas(e.target.value)} /></div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Dialog>
  )
}
