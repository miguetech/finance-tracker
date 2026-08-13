import React, { useState } from 'react'
import { useFacturas, useConfig } from '../../store/queries'
import { Table, Button, Select, ConfirmDialog, Badge, Input } from '../../ui/components'
import { useToast } from '../../ui/components'
import { formatMoney } from '../../currency'
import { FacturaFormModal } from './FacturaFormModal'
import { FacturaDetail } from './FacturaDetail'

function estadoDe(f: { saldo: number; fecha_pago: string }): { label: string; tone: 'green' | 'yellow' | 'red' } {
  if (f.saldo <= 0) return { label: 'Pagada', tone: 'green' }
  if (f.fecha_pago) return { label: 'Parcial', tone: 'yellow' }
  return { label: 'Pendiente', tone: 'red' }
}

export function Facturas() {
  const { facturas, createFactura, deleteFactura } = useFacturas({})
  const { config } = useConfig()
  const toast = useToast()
  const [estado, setEstado] = useState('')
  const [mes, setMes] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [detalleId, setDetalleId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const moneda = config?.moneda ?? 'USD'

  const filtradas = facturas.filter(f => (!estado || estadoDe(f).label === estado) && (!mes || f.fecha_emision.slice(0, 7) === mes))

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl font-bold">Facturas</h1>
        <div className="flex gap-2">
          <Select value={estado} onChange={setEstado} options={[{ value: 'Pendiente', label: 'Pendiente' }, { value: 'Parcial', label: 'Parcial' }, { value: 'Pagada', label: 'Pagada' }]} placeholder="Estado" />
          <Input type="month" value={mes} onChange={e => setMes(e.target.value)} />
          <Button onClick={() => setFormOpen(true)}>+ Nueva factura</Button>
        </div>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl shadow-card overflow-hidden">
        <Table columns={[
          { key: 'folio', header: 'Folio', render: r => String(r.folio) },
          { key: 'cliente', header: 'Cliente', render: r => String(r.nombre_cliente) },
          { key: 'emision', header: 'Emisión', render: r => String(r.fecha_emision) },
          { key: 'total', header: 'Total', render: r => formatMoney(Number(r.total), moneda) },
          { key: 'saldo', header: 'Saldo', render: r => formatMoney(Number(r.saldo), moneda) },
          { key: 'estado', header: 'Estado', render: r => { const e = estadoDe(r as { saldo: number; fecha_pago: string }); return <Badge tone={e.tone}>{e.label}</Badge> } },
          { key: 'acciones', header: '', render: r => (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setDetalleId(String(r.id_factura))}>Ver</Button>
              <Button variant="danger" onClick={() => setDeleteId(String(r.id_factura))}>Eliminar</Button>
            </div>
          ) }
        ]} rows={filtradas as unknown as Record<string, unknown>[]} />
        {filtradas.length === 0 && <p className="p-4 text-sm text-gray-500">Sin facturas</p>}
      </div>
      <FacturaFormModal open={formOpen} onClose={() => setFormOpen(false)} onSaved={() => toast('Factura creada')} />
      {detalleId && <FacturaDetail id={detalleId} onClose={() => setDetalleId(null)} />}
      <ConfirmDialog open={deleteId !== null} title="Eliminar factura" message="Se eliminará la factura, sus conceptos y pagos. ¿Continuar?"
        onConfirm={async () => { if (deleteId) { try { await deleteFactura.mutateAsync(deleteId); toast('Factura eliminada') } catch (e) { toast((e as Error).message, 'error') } } setDeleteId(null) }}
        onClose={() => setDeleteId(null)} />
    </div>
  )
}
