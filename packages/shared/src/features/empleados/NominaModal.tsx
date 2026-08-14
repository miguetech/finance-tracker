import React, { useEffect, useState } from 'react'
import { Dialog, Button, Input, Select } from '../../ui/components'
import type { Empleado } from '../../types/entities'

export function NominaModal({ empleado, onClose, onSave }: { empleado: Empleado; onClose: () => void; onSave: (i: { mes: string; monto: number; metodo_pago: string; fecha: string; notas: string }) => void }) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({ mes: hoy.slice(0, 7), monto: String(empleado.salario), metodo_pago: 'Transferencia', fecha: hoy, notas: '' })
  useEffect(() => { setForm({ mes: hoy.slice(0, 7), monto: String(empleado.salario), metodo_pago: 'Transferencia', fecha: hoy, notas: '' }) }, [empleado])
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  const submit = () => {
    if (!form.mes || Number(form.monto) <= 0) return
    onSave({ mes: form.mes, monto: Number(form.monto), metodo_pago: form.metodo_pago, fecha: form.fecha, notas: form.notas })
    onClose()
  }
  return (
    <Dialog open onClose={onClose} title={`Nómina — ${empleado.nombre}`}
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit}>Registrar pago</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-muted-foreground">Mes *</label><Input type="month" value={form.mes} onChange={set('mes')} /></div>
          <div><label className="text-xs text-muted-foreground">Monto *</label><Input type="number" min={0} value={form.monto} onChange={set('monto')} /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-muted-foreground">Método</label>
            <Select value={form.metodo_pago} onChange={v => setForm(f => ({ ...f, metodo_pago: v }))} options={['Efectivo', 'Transferencia', 'Tarjeta'].map(v => ({ value: v, label: v }))} />
          </div>
          <div><label className="text-xs text-muted-foreground">Fecha</label><Input type="date" value={form.fecha} onChange={set('fecha')} /></div>
        </div>
        <div><label className="text-xs text-muted-foreground">Notas</label><Input value={form.notas} onChange={set('notas')} /></div>
        <p className="text-xs text-muted-foreground">Este pago se registra como un gasto con categoría "Nómina".</p>
      </div>
    </Dialog>
  )
}
