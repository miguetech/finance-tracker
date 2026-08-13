import React, { useEffect, useState } from 'react'
import { Dialog, Button, Input, Select } from '../../ui/components'
import { useGastos, useCategorias } from '../../store/queries'
import { useToast } from '../../ui/components'
import type { Gasto } from '../../types/entities'

export function GastoFormModal({ open, onClose, initial }: { open: boolean; onClose: () => void; initial: Gasto | null }) {
  const { saveGasto } = useGastos()
  const { data: categorias = [] } = useCategorias('gastos')
  const toast = useToast()
  const [form, setForm] = useState({ fecha: new Date().toISOString().slice(0, 10), categoria: '', descripcion: '', monto: '', metodo_pago: 'Efectivo', proveedor: '' })
  useEffect(() => {
    if (open) setForm(initial ? { ...initial, monto: String(initial.monto) } : { fecha: new Date().toISOString().slice(0, 10), categoria: '', descripcion: '', monto: '', metodo_pago: 'Efectivo', proveedor: '' })
  }, [open, initial])
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  const submit = async () => {
    if (!form.descripcion.trim() || Number(form.monto) <= 0) return
    try {
      await saveGasto.mutateAsync({ ...initial, ...form, monto: Number(form.monto) } as never)
      toast('Gasto guardado')
      onClose()
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }
  return (
    <Dialog open={open} onClose={onClose} title={initial ? 'Editar gasto' : 'Registrar gasto'}
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit}>Guardar</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">Fecha</label><Input type="date" value={form.fecha} onChange={set('fecha')} /></div>
          <div><label className="text-xs text-gray-500">Categoría</label>
            <Select value={form.categoria} onChange={v => setForm(f => ({ ...f, categoria: v }))} options={categorias.map(c => ({ value: c, label: c }))} />
          </div>
        </div>
        <div><label className="text-xs text-gray-500">Descripción *</label><Input value={form.descripcion} onChange={set('descripcion')} /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">Monto *</label><Input type="number" value={form.monto} onChange={set('monto')} /></div>
          <div><label className="text-xs text-gray-500">Método</label>
            <Select value={form.metodo_pago} onChange={v => setForm(f => ({ ...f, metodo_pago: v }))} options={['Efectivo', 'Transferencia', 'Tarjeta'].map(v => ({ value: v, label: v }))} />
          </div>
        </div>
        <div><label className="text-xs text-gray-500">Proveedor</label><Input value={form.proveedor} onChange={set('proveedor')} /></div>
      </div>
    </Dialog>
  )
}
