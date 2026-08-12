import React, { useEffect, useState } from 'react'
import { Dialog, Button, Input } from '../../ui/components'
import type { Proveedor } from '../../types/entities'

export function ProveedorFormModal({ open, onClose, initial, onSave }: { open: boolean; onClose: () => void; initial: Proveedor | null; onSave: (p: Proveedor) => void }) {
  const [form, setForm] = useState({ nombre: '', rfc: '', email: '', telefono: '', direccion: '' })
  useEffect(() => {
    if (open) setForm(initial ? { nombre: initial.nombre, rfc: initial.rfc, email: initial.email, telefono: initial.telefono, direccion: initial.direccion } : { nombre: '', rfc: '', email: '', telefono: '', direccion: '' })
  }, [open, initial])
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  const submit = () => { if (!form.nombre.trim()) return; onSave({ ...initial, ...form } as Proveedor); onClose() }
  return (
    <Dialog open={open} onClose={onClose} title={initial ? 'Editar proveedor' : 'Nuevo proveedor'}
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit}>Guardar</Button></>}>
      <div className="space-y-3">
        <div><label className="text-xs text-gray-500">Nombre *</label><Input value={form.nombre} onChange={set('nombre')} /></div>
        <div><label className="text-xs text-gray-500">RFC</label><Input value={form.rfc} onChange={set('rfc')} /></div>
        <div><label className="text-xs text-gray-500">Email</label><Input value={form.email} onChange={set('email')} /></div>
        <div><label className="text-xs text-gray-500">Teléfono</label><Input value={form.telefono} onChange={set('telefono')} /></div>
        <div><label className="text-xs text-gray-500">Dirección</label><Input value={form.direccion} onChange={set('direccion')} /></div>
      </div>
    </Dialog>
  )
}
