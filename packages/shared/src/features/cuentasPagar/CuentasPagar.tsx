import React, { useState } from 'react'
import { useCxp, useConfig } from '../../store/queries'
import { Table, Button, Select, ConfirmDialog, Badge } from '../../ui/components'
import { useToast } from '../../ui/components'
import { formatMoney } from '../../currency'
import { CxpFormModal } from './CxpFormModal'
import { CxpDetail } from './CxpDetail'

export function CuentasPagar() {
  const { cxps, deleteCxp } = useCxp()
  const { config } = useConfig()
  const toast = useToast()
  const [estado, setEstado] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [detalleId, setDetalleId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const moneda = config?.moneda ?? 'USD'
  const filtrados = cxps.filter(c => !estado || c.estado === estado)
  const tone = (c: { saldo: number; estado: string }) => c.saldo <= 0 ? 'green' as const : c.estado === 'pendiente' ? 'red' as const : 'yellow' as const

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl font-bold">Cuentas por Pagar</h1>
        <div className="flex gap-2">
          <Select value={estado} onChange={setEstado} options={[{ value: 'pendiente', label: 'Pendiente' }, { value: 'parcial', label: 'Parcial' }, { value: 'pagada', label: 'Pagada' }]} placeholder="Estado" />
          <Button onClick={() => setFormOpen(true)}>+ Nueva CXP</Button>
        </div>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <Table columns={[
          { key: 'prov', header: 'Proveedor', render: r => String(r.nombre_proveedor) },
          { key: 'desc', header: 'Descripción', render: r => String(r.descripcion) },
          { key: 'venc', header: 'Vence', render: r => String(r.fecha_vencimiento) },
          { key: 'total', header: 'Total', render: r => formatMoney(Number(r.monto_total), moneda) },
          { key: 'saldo', header: 'Saldo', render: r => formatMoney(Number(r.saldo), moneda) },
          { key: 'estado', header: 'Estado', render: r => { const t = tone(r as { saldo: number; estado: string }); return <Badge tone={t}>{String(r.estado)}</Badge> } },
          { key: 'acciones', header: '', render: r => (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setDetalleId(String(r.id_cxp))}>Ver</Button>
              <Button variant="danger" onClick={() => setDeleteId(String(r.id_cxp))}>Eliminar</Button>
            </div>
          ) }
        ]} rows={filtrados as unknown as Record<string, unknown>[]} />
        {filtrados.length === 0 && <p className="p-4 text-sm text-gray-500">Sin CXP registradas</p>}
      </div>
      <CxpFormModal open={formOpen} onClose={() => setFormOpen(false)} />
      {detalleId && <CxpDetail id={detalleId} onClose={() => setDetalleId(null)} />}
      <ConfirmDialog open={deleteId !== null} title="Eliminar CXP" message="Se eliminará la cuenta y sus abonos. ¿Continuar?"
        onConfirm={async () => { if (deleteId) { await deleteCxp.mutateAsync(deleteId); toast('CXP eliminada') } setDeleteId(null) }} onClose={() => setDeleteId(null)} />
    </div>
  )
}
