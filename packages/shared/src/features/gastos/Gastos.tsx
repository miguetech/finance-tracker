import React, { useState } from 'react'
import { useGastos, useConfig, useCategorias } from '../../store/queries'
import { Table, Button, Select, Input, ConfirmDialog } from '../../ui/components'
import { useToast } from '../../ui/components'
import { formatMoney } from '../../currency'
import { GastoFormModal } from './GastoFormModal'
import type { Gasto } from '../../types/entities'

export function Gastos() {
  const { gastos, deleteGasto } = useGastos({})
  const { config } = useConfig()
  const { data: categorias = [] } = useCategorias('gastos')
  const toast = useToast()
  const [mes, setMes] = useState('')
  const [categoria, setCategoria] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editando, setEditando] = useState<Gasto | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const moneda = config?.moneda ?? 'USD'

  const filtrados = gastos.filter(g => (!mes || g.fecha.slice(0, 7) === mes) && (!categoria || g.categoria === categoria))

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl font-bold">Gastos</h1>
        <div className="flex gap-2">
          <Input type="month" value={mes} onChange={e => setMes(e.target.value)} />
          <Select value={categoria} onChange={setCategoria} options={categorias.map(c => ({ value: c, label: c }))} placeholder="Categoría" />
          <Button onClick={() => { setEditando(null); setFormOpen(true) }}>+ Registrar gasto</Button>
        </div>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl shadow-card overflow-hidden">
        <Table columns={[
          { key: 'fecha', header: 'Fecha', render: r => String(r.fecha) },
          { key: 'categoria', header: 'Categoría', render: r => String(r.categoria) },
          { key: 'descripcion', header: 'Descripción', render: r => String(r.descripcion) },
          { key: 'monto', header: 'Monto', render: r => formatMoney(Number(r.monto), moneda) },
          { key: 'metodo_pago', header: 'Método', render: r => String(r.metodo_pago) },
          { key: 'acciones', header: '', render: r => (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => { setEditando(r as unknown as Gasto); setFormOpen(true) }}>Editar</Button>
              <Button variant="danger" onClick={() => setDeleteId(String(r.id_gasto))}>Eliminar</Button>
            </div>
          ) }
        ]} rows={filtrados as unknown as Record<string, unknown>[]} />
        {filtrados.length === 0 && <p className="p-4 text-sm text-gray-500">Sin gastos</p>}
      </div>
      <GastoFormModal open={formOpen} onClose={() => setFormOpen(false)} initial={editando} />
      <ConfirmDialog open={deleteId !== null} title="Eliminar gasto" message="¿Eliminar este gasto?"
        onConfirm={async () => { if (deleteId) { await deleteGasto.mutateAsync(deleteId); toast('Gasto eliminado') } setDeleteId(null) }} onClose={() => setDeleteId(null)} />
    </div>
  )
}
