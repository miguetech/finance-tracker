import React, { useEffect, useState } from 'react'
import { Dialog, Button, Input, Select } from '../../ui/components'
import { useConfig } from '../../store/queries'
import { getDocLabel } from '../../taxid'
import type { Empleado } from '../../types/entities'

export function EmpleadoFormModal({ open, onClose, initial, onSave }: { open: boolean; onClose: () => void; initial: Empleado | null; onSave: (e: Empleado) => void }) {
  const { config } = useConfig()
  const docLabel = getDocLabel(config?.tipo_doc ?? 'RFC', config?.tipo_doc_etiqueta ?? '')
  const [form, setForm] = useState({ nombre: '', rfc: '', puesto: '', salario: '', fecha_ingreso: '', activo: 'true' })
  useEffect(() => {
    if (open) setForm(initial
      ? { nombre: initial.nombre, rfc: initial.rfc, puesto: initial.puesto, salario: String(initial.salario), fecha_ingreso: initial.fecha_ingreso, activo: initial.activo }
      : { nombre: '', rfc: '', puesto: '', salario: '', fecha_ingreso: '', activo: 'true' })
  }, [open, initial])
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  const submit = () => {
    if (!form.nombre.trim()) return
    onSave({ ...initial, ...form, salario: Number(form.salario) || 0 } as Empleado)
    onClose()
  }
  return (
    <Dialog open={open} onClose={onClose} title={initial ? 'Editar empleado' : 'Nuevo empleado'}
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit}>Guardar</Button></>}>
      <div className="space-y-3">
        <div><label className="text-xs text-muted-foreground">Nombre *</label><Input value={form.nombre} onChange={set('nombre')} /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-muted-foreground">{docLabel}</label><Input value={form.rfc} onChange={set('rfc')} /></div>
          <div><label className="text-xs text-muted-foreground">Puesto</label><Input value={form.puesto} onChange={set('puesto')} /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-muted-foreground">Salario mensual</label><Input type="number" min={0} value={form.salario} onChange={set('salario')} /></div>
          <div><label className="text-xs text-muted-foreground">Fecha ingreso</label><Input type="date" value={form.fecha_ingreso} onChange={set('fecha_ingreso')} /></div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Estado</label>
          <Select value={form.activo} onChange={v => setForm(f => ({ ...f, activo: v }))} options={[{ value: 'true', label: 'Activo' }, { value: 'false', label: 'Inactivo' }]} />
        </div>
      </div>
    </Dialog>
  )
}
