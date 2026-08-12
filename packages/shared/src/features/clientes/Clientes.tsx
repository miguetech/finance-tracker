import React, { useState } from 'react'
import { useClientes } from '../../store/queries'
import { Table, Button, Input, Dialog, ConfirmDialog } from '../../ui/components'
import { useToast } from '../../ui/components'
import { ClienteFormModal } from './ClienteFormModal'
import type { Cliente } from '../../types/entities'

export function Clientes() {
  const { clientes, saveCliente, deleteCliente } = useClientes()
  const toast = useToast()
  const [busqueda, setBusqueda] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editando, setEditando] = useState<Cliente | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const filtrados = clientes.filter(c => !busqueda || c.nombre.toLowerCase().includes(busqueda.toLowerCase()) || c.rfc.toLowerCase().includes(busqueda.toLowerCase()))

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl font-bold">Clientes</h1>
        <div className="flex gap-2">
          <Input placeholder="Buscar nombre o RFC…" value={busqueda} onChange={e => setBusqueda(e.target.value)} className="sm:w-64" />
          <Button onClick={() => { setEditando(null); setFormOpen(true) }}>+ Nuevo cliente</Button>
        </div>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <Table
          columns={[
            { key: 'nombre', header: 'Nombre', render: c => String(c.nombre) },
            { key: 'rfc', header: 'RFC', render: c => String(c.rfc) },
            { key: 'email', header: 'Email', render: c => String(c.email) },
            { key: 'telefono', header: 'Teléfono', render: c => String(c.telefono) },
            { key: 'acciones', header: '', render: c => (
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => { setEditando(c as unknown as Cliente); setFormOpen(true) }}>Editar</Button>
                <Button variant="danger" onClick={() => setDeleteId((c as unknown as Cliente).id_cliente)}>Eliminar</Button>
              </div>
            ) }
          ]}
          rows={filtrados as unknown as Record<string, unknown>[]}
        />
        {filtrados.length === 0 && <p className="p-4 text-sm text-gray-500">Sin clientes</p>}
      </div>
      <ClienteFormModal open={formOpen} onClose={() => setFormOpen(false)} initial={editando}
        onSave={async c => {
          try { await saveCliente.mutateAsync(c); toast('Cliente guardado') } catch (e) { toast((e as Error).message, 'error') }
        }} />
      <ConfirmDialog open={deleteId !== null} title="Eliminar cliente" message="¿Eliminar este cliente? Bloqueado si tiene facturas."
        onConfirm={async () => {
          if (!deleteId) return
          try { await deleteCliente.mutateAsync(deleteId); toast('Cliente eliminado') } catch (e) { toast((e as Error).message, 'error') }
          setDeleteId(null)
        }} onClose={() => setDeleteId(null)} />
    </div>
  )
}
