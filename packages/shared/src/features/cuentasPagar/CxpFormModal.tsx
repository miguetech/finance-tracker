import React, { useEffect, useState } from 'react'
import { Dialog, Button, Input, Select } from '../../ui/components'
import { useProveedores, useCxp, useCategorias } from '../../store/queries'

export function CxpFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { proveedores } = useProveedores()
  const { data: categorias = [] } = useCategorias('cxp')
  const { createCxp } = useCxp()
  const [form, setForm] = useState({ id_proveedor: '', folio_documento: '', categoria: '', descripcion: '', fecha_vencimiento: '', monto_total: '', notas: '' })
  useEffect(() => { if (open) setForm({ id_proveedor: '', folio_documento: '', categoria: '', descripcion: '', fecha_vencimiento: '', monto_total: '', notas: '' }) }, [open])
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  const submit = async () => {
    if (!form.id_proveedor || !form.descripcion.trim() || !form.fecha_vencimiento || Number(form.monto_total) <= 0) return
    await createCxp.mutateAsync({ ...form, fecha_emision: new Date().toISOString().slice(0, 10), monto_total: Number(form.monto_total) })
    onClose()
  }
  return (
    <Dialog open={open} onClose={onClose} title="Nueva cuenta por pagar"
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit}>Guardar</Button></>}>
      <div className="space-y-3">
        <div><label className="text-xs text-gray-500">Proveedor *</label>
          <Select value={form.id_proveedor} onChange={v => setForm(f => ({ ...f, id_proveedor: v }))} options={proveedores.map(p => ({ value: p.id_proveedor, label: p.nombre }))} placeholder="Seleccionar…" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">Folio documento</label><Input value={form.folio_documento} onChange={set('folio_documento')} /></div>
          <div><label className="text-xs text-gray-500">Categoría</label>
            <Select value={form.categoria} onChange={v => setForm(f => ({ ...f, categoria: v }))} options={categorias.map(c => ({ value: c, label: c }))} />
          </div>
        </div>
        <div><label className="text-xs text-gray-500">Descripción *</label><Input value={form.descripcion} onChange={set('descripcion')} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">Fecha vencimiento *</label><Input type="date" value={form.fecha_vencimiento} onChange={set('fecha_vencimiento')} /></div>
          <div><label className="text-xs text-gray-500">Monto total *</label><Input type="number" value={form.monto_total} onChange={set('monto_total')} /></div>
        </div>
        <div><label className="text-xs text-gray-500">Notas</label><Input value={form.notas} onChange={set('notas')} /></div>
      </div>
    </Dialog>
  )
}
